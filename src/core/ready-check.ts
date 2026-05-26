import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import { VibeflowConfig } from './config.js';

const execFileAsync = promisify(execFile);

export interface ToolCheck {
  /** 待检测的可执行程序，如 npm / flutter / ./gradlew */
  tool: string;
  available: boolean;
  /** 该工具是从哪里推断出来的，用于提示用户 */
  source: string;
  /** 解析到的绝对路径或失败原因 */
  detail?: string;
}

/** package_manager 取值 → 其主命令行程序名 */
export const PACKAGE_MANAGER_BIN: Record<string, string> = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  flutter: 'flutter',
  poetry: 'poetry',
  cargo: 'cargo',
  go: 'go',
  gradle: 'gradle',
  maven: 'mvn',
  cocoapods: 'pod',
  spm: 'swift',
  bundler: 'bundle',
  composer: 'composer',
};

/**
 * 判断一个可执行程序是否可用。
 * - 含路径分隔符（如 ./gradlew、scripts/build.sh）→ 检查文件是否存在
 * - 否则 → 在 PATH 中查找（which）
 */
export async function commandExists(bin: string, projectRoot: string): Promise<{ ok: boolean; detail?: string }> {
  if (!bin) return { ok: false, detail: '空命令' };

  if (bin.includes('/') || bin.includes('\\')) {
    const abs = path.isAbsolute(bin) ? bin : path.join(projectRoot, bin);
    const exists = await fs.pathExists(abs);
    return exists ? { ok: true, detail: abs } : { ok: false, detail: `文件不存在: ${abs}` };
  }

  try {
    const { stdout } = await execFileAsync('which', [bin], { timeout: 5000 });
    const resolved = stdout.trim().split('\n')[0];
    return resolved ? { ok: true, detail: resolved } : { ok: false };
  } catch {
    return { ok: false, detail: '不在 PATH 中' };
  }
}

/** 取命令字符串的首个 token（可执行程序名），剥掉 env 前缀（VAR=val）等噪声 */
function firstExecutable(command: string): string | undefined {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    // 跳过形如 FOO=bar 的环境变量前缀
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue;
    return t;
  }
  return undefined;
}

/**
 * 从 config 推断需要检测的工具集合：
 * - 包管理器对应的主命令
 * - commands.test / build / lint 里每条命令的首个可执行程序
 * 去重（同名只检一次，source 合并）。
 */
export function toolchainTargets(config: VibeflowConfig): Array<{ tool: string; source: string }> {
  const map = new Map<string, Set<string>>();
  const add = (tool: string | undefined, source: string) => {
    if (!tool) return;
    if (!map.has(tool)) map.set(tool, new Set());
    map.get(tool)!.add(source);
  };

  const pm = config.project?.package_manager?.trim();
  if (pm) add(PACKAGE_MANAGER_BIN[pm] ?? pm, `package_manager: ${pm}`);

  const cmds = config.commands ?? {};
  for (const key of ['test', 'build', 'lint'] as const) {
    for (const cmd of cmds[key] ?? []) {
      add(firstExecutable(cmd), `commands.${key}`);
    }
  }

  return Array.from(map.entries()).map(([tool, sources]) => ({
    tool,
    source: Array.from(sources).join(', '),
  }));
}

/** 跑一遍工具链就绪检测 */
export async function runReadyCheck(config: VibeflowConfig, projectRoot: string): Promise<ToolCheck[]> {
  const targets = toolchainTargets(config);
  const results: ToolCheck[] = [];
  for (const { tool, source } of targets) {
    const { ok, detail } = await commandExists(tool, projectRoot);
    results.push({ tool, available: ok, source, detail });
  }
  return results;
}
