import { Command } from 'commander';
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { getFeatureDir, isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState } from '../../core/run.js';
import { loadConfig, resolveModelForRole } from '../../core/config.js';
import { buildContext } from '../../core/context.js';
import { buildAdapterMap } from '../../adapters/registry.js';
import { InvokeMode } from '../../adapters/types.js';

interface HandoffOptions {
  feature?: string;
  model?: string;
  export?: boolean;
}

async function pickFeature(projectRoot: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const features = await listFeatures(projectRoot);
  const active: string[] = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (!state) continue;
    if (state.status !== 'done' && state.status !== 'cancelled') active.push(name);
  }
  if (active.length === 1) return active[0];
  if (active.length === 0) throw new Error('没有进行中的任务，无法生成 handoff');
  throw new Error(`检测到多个进行中的任务，请用 --feature 指定:\n  ${active.join(', ')}`);
}

export async function runHandoff(opts: HandoffOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    process.exitCode = 1;
    return;
  }

  try {
    const config = await loadConfig(projectRoot);
    const feature = await pickFeature(projectRoot, opts.feature);
    const state = await readRunState(projectRoot, feature);
    if (!state) throw new Error(`找不到 run.json: ${feature}`);

    const outputPath = path.join(getFeatureDir(projectRoot, feature), 'handoff.md');
    // handoff 用 finalizer 角色（既了解方案又了解实现进度）
    const modelId = opts.model ?? resolveModelForRole(config, 'finalizer');
    const adapters = buildAdapterMap(config);
    const adapter = adapters.get(opts.export ? 'export' : modelId) ?? adapters.get(modelId);
    if (!adapter) throw new Error(`找不到模型适配器: ${modelId}`);

    const ctx = await buildContext({
      projectRoot,
      config,
      featureName: feature,
      stageId: 'handoff',
      outputPath,
    });

    // 补充进度摘要给模型
    const progress = state.stages
      .map((s) => `- ${s.id}: ${s.status}${s.model ? ` (model: ${s.model})` : ''}${s.notes ? `  // ${s.notes}` : ''}`)
      .join('\n');
    const fullPrompt = `${ctx.prompt}\n\n---\n\n# 当前进度（run.json 摘要）\n\n${progress}\n`;

    log.title(`vibeflow handoff: ${feature}`);
    log.step(`当前阶段: ${state.current_stage ?? '(无)'}`);
    log.step(`使用模型: ${chalk.cyan(modelId)}${opts.export ? chalk.yellow(' [export]') : ''}`);
    log.step(`产物: ${path.relative(projectRoot, outputPath)}`);

    const invokeMode: InvokeMode = opts.export ? 'export' : 'spawn';
    const result = await adapter.run({
      runId: state.run_id,
      featureName: feature,
      stageId: 'handoff',
      roleId: 'finalizer',
      modelId: adapter.id,
      projectRoot,
      prompt: fullPrompt,
      outputPath,
      invokeMode,
    });

    if (result.status === 'success') {
      const existed = await fs.pathExists(outputPath);
      const meaningful = existed && (await fs.readFile(outputPath, 'utf8')).trim().length >= 20;
      if (!meaningful && result.stdoutText) {
        await fs.writeFile(outputPath, result.stdoutText.trim() + '\n', 'utf8');
      }
      log.success(`handoff 已生成: ${path.relative(projectRoot, outputPath)}`);
    } else if (result.status === 'exported') {
      log.info('已切换到 export 模式');
      if (result.hint) for (const line of result.hint.split('\n')) log.hint(line);
    } else {
      log.error(`handoff 生成失败: ${result.error ?? result.status}`);
      if (result.stderrPath) log.hint(`查看 stderr: ${path.relative(projectRoot, result.stderrPath)}`);
      process.exitCode = 1;
    }
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
  }
}

export function registerHandoffCommand(program: Command): void {
  program
    .command('handoff')
    .description('生成交接文档 handoff.md（横切命令，不修改 run.json 状态）')
    .option('-f, --feature <name>', '指定任务')
    .option('--model <id>', '指定生成模型（默认 finalizer 角色对应模型）')
    .option('--export', 'export 模式')
    .action(async (opts: HandoffOptions) => {
      await runHandoff(opts);
    });
}
