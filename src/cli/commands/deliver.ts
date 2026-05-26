import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState } from '../../core/run.js';
import { getDeliverability, markDelivered } from '../../core/deliver.js';

interface DeliverOptions {
  feature?: string;
}

const SUCCESS_LINES = [
  chalk.green('📦 方案已交付。') + '交付物：03_final_plan.md',
  chalk.gray('   状态：方案已交付（可继续开发）。继续请运行 ') + chalk.cyan('vibeflow develop'),
];
const IDEMPOTENT_LINES = [
  chalk.green('📦 该任务已是方案已交付状态。') + '交付物：03_final_plan.md',
  chalk.gray('   状态：方案已交付（可继续开发）。继续请运行 ') + chalk.cyan('vibeflow develop'),
];

/** 默认任务选择：唯一"可交付或已交付"的任务；0/多个时报错。 */
async function pickDeliverableFeature(projectRoot: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const features = await listFeatures(projectRoot);
  const candidates: string[] = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (!state) continue;
    const d = await getDeliverability(projectRoot, name, state);
    if (d.deliverable || d.alreadyDelivered) candidates.push(name);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error('没有可交付的任务（需先 finalize 锁定方案，且尚未进入开发）。用 vibeflow status 查看。');
  }
  throw new Error(`检测到多个可交付任务，请用 --feature 指定其中之一:\n  ${candidates.join(', ')}`);
}

export async function runDeliver(opts: DeliverOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    process.exitCode = 1;
    return;
  }

  try {
    const feature = await pickDeliverableFeature(projectRoot, opts.feature);
    const state = await readRunState(projectRoot, feature);
    if (!state) throw new Error(`找不到 run.json: ${feature}`);

    const result = await markDelivered(projectRoot, feature, state);

    log.title(`vibeflow deliver: ${feature}`);
    for (const line of result.idempotent ? IDEMPOTENT_LINES : SUCCESS_LINES) {
      console.log(line);
    }
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
  }
}

export function registerDeliverCommand(program: Command): void {
  program
    .command('deliver')
    .description('方案锁定后交付收尾：把任务标记为"方案已交付（可继续开发）"，可随时再 develop')
    .option('-f, --feature <name>', '指定任务（默认选择唯一可交付任务）')
    .action(async (opts: DeliverOptions) => {
      await runDeliver(opts);
    });
}
