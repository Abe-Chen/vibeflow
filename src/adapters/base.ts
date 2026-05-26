import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import ora, { Ora } from 'ora';
import chalk from 'chalk';
import {
  AdapterAvailability,
  AgentRunRequest,
  AgentRunResult,
  ModelAdapter,
  ModelDefinition,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL_BYTES = 4096;

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export interface SpawnInvocation {
  command: string;
  args: string[];
  /** prompt 是否通过 stdin 输入，false 表示已经放进 args */
  promptViaStdin: boolean;
}

export abstract class SpawnAdapter implements ModelAdapter {
  constructor(public readonly definition: ModelDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  /** 子类决定如何把 prompt 与参数拼成命令行 */
  protected abstract buildInvocation(request: AgentRunRequest): SpawnInvocation;

  /** 子类决定如何探活（默认 `<cmd> --version`） */
  protected buildVersionInvocation(): { command: string; args: string[] } {
    const command = this.definition.command ?? this.id;
    return { command, args: ['--version'] };
  }

  async checkAvailability(): Promise<AdapterAvailability> {
    const { command, args } = this.buildVersionInvocation();
    try {
      const result = await runOnce({
        command,
        args,
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 10_000,
      });
      if (result.exitCode === 0) {
        const version = (result.stdout || result.stderr || '').trim().split('\n')[0];
        return { available: true, version, checkedCommand: `${command} ${args.join(' ')}` };
      }
      return {
        available: false,
        error: result.stderr.trim() || `${command} 退出码 ${result.exitCode}`,
        checkedCommand: `${command} ${args.join(' ')}`,
      };
    } catch (err) {
      return {
        available: false,
        error: (err as Error).message,
        checkedCommand: `${command} ${args.join(' ')}`,
      };
    }
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const start = Date.now();
    const invocation = this.buildInvocation(request);
    const timeoutMs = request.timeoutMs ?? this.definition.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const cwd = request.workingDirectory ?? request.projectRoot;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.definition.env,
      ...request.env,
    };

    const logDir = path.join(request.projectRoot, '.ai-dev', 'logs', request.featureName);
    await fs.ensureDir(logDir);
    const stamp = `${request.stageId}-${Date.now()}`;
    const stdoutPath = path.join(logDir, `${stamp}.stdout.log`);
    const stderrPath = path.join(logDir, `${stamp}.stderr.log`);

    // Spinner：进程跑期间显示已耗时
    // 非 TTY 环境（管道/CI）自动降级为静默——避免污染日志
    const isTTY = Boolean(process.stdout.isTTY);
    let spinner: Ora | null = null;
    let spinnerTimer: NodeJS.Timeout | null = null;
    if (isTTY) {
      const cmdLabel = `${invocation.command}${invocation.args.length ? ' ' + invocation.args.join(' ') : ''}`;
      spinner = ora({
        text: `调用 ${chalk.cyan(this.id)} 中... ${chalk.gray('(0:00)')} ${chalk.gray(`[${cmdLabel}]`)}`,
        spinner: 'dots',
      }).start();
      spinnerTimer = setInterval(() => {
        if (!spinner) return;
        const elapsed = Date.now() - start;
        const elapsedLabel = formatElapsed(elapsed);
        const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
        const timeoutHint = remaining < 60
          ? chalk.yellow(` 还剩 ${remaining}s 超时`)
          : '';
        spinner.text = `调用 ${chalk.cyan(this.id)} 中... ${chalk.gray(`(${elapsedLabel})`)}${timeoutHint} ${chalk.gray(`[${cmdLabel}]`)}`;
      }, 1000);
    }

    const stopSpinner = (label: 'success' | 'fail' | 'warn', finalText: string) => {
      if (spinnerTimer) clearInterval(spinnerTimer);
      spinnerTimer = null;
      if (spinner) {
        if (label === 'success') spinner.succeed(finalText);
        else if (label === 'fail') spinner.fail(finalText);
        else spinner.warn(finalText);
        spinner = null;
      }
    };

    try {
      const args = invocation.args.filter((a) => a !== undefined && a !== null && a !== '');
      const result = await runOnce({
        command: invocation.command,
        args,
        cwd,
        env,
        timeoutMs,
        stdinInput: invocation.promptViaStdin ? request.prompt : undefined,
      });

      await fs.writeFile(stdoutPath, result.stdout, 'utf8');
      await fs.writeFile(stderrPath, result.stderr, 'utf8');

      const stderrTail = result.stderr.length > STDERR_TAIL_BYTES
        ? '…\n' + result.stderr.slice(-STDERR_TAIL_BYTES)
        : result.stderr;

      const base = {
        modelId: this.id,
        invokeMode: 'spawn' as const,
        durationMs: Date.now() - start,
        exitCode: result.exitCode ?? undefined,
        stdoutText: result.stdout,
        stderrTail,
        stdoutPath,
        stderrPath,
        outputPath: request.outputPath,
      };

      const elapsedLabel = formatElapsed(base.durationMs);
      if (result.timedOut) {
        stopSpinner('fail', `${this.id} 调用超时 (${formatElapsed(timeoutMs)})`);
        return { ...base, status: 'timeout', error: `调用超时 (${timeoutMs}ms)` };
      }
      if (result.exitCode !== 0) {
        stopSpinner('fail', `${this.id} 调用失败 (${elapsedLabel}, exit ${result.exitCode})`);
        return { ...base, status: 'failed', error: stderrTail.trim() || `exit ${result.exitCode}` };
      }
      stopSpinner('success', `${this.id} 调用成功 (${elapsedLabel})`);
      return { ...base, status: 'success' };
    } catch (err) {
      stopSpinner('fail', `${this.id} 调用异常: ${(err as Error).message}`);
      return {
        status: 'failed',
        modelId: this.id,
        invokeMode: 'spawn',
        durationMs: Date.now() - start,
        error: (err as Error).message,
        stdoutPath,
        stderrPath,
      };
    }
  }
}

interface RunOnceParams {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  stdinInput?: string;
}

interface RunOnceResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runOnce(params: RunOnceParams): Promise<RunOnceResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: params.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 2000);
    }, params.timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });

    if (params.stdinInput !== undefined && child.stdin) {
      child.stdin.write(params.stdinInput);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}
