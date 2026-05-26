import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState, writeRunState } from '../../core/run.js';
import { advanceCurrentStage } from '../../core/advance.js';

interface AdvanceOptions {
  feature?: string;
  skip?: boolean;
}

async function pickFeature(projectRoot: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const features = await listFeatures(projectRoot);
  const active: string[] = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (!state) continue;
    if (state.status === 'in_progress' || state.status === 'blocked') active.push(name);
  }
  if (active.length === 1) return active[0];
  if (active.length === 0) {
    throw new Error('没有进行中的任务，无法 advance');
  }
  throw new Error(`检测到多个进行中的任务，请用 --feature 指定:\n  ${active.join(', ')}`);
}

export async function runAdvance(opts: AdvanceOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    process.exitCode = 1;
    return;
  }

  try {
    const feature = await pickFeature(projectRoot, opts.feature);
    const state = await readRunState(projectRoot, feature);
    if (!state) throw new Error(`找不到 run.json: ${feature}`);

    const outcome = advanceCurrentStage(state, { skip: opts.skip });
    await writeRunState(projectRoot, feature, state);

    log.title(`vibeflow advance: ${feature}`);
    if (outcome.completedStage) {
      const verb = outcome.completedStage.status === 'skipped' ? '已跳过' : '已完成';
      log.success(`${verb}: ${outcome.completedStage.id}`);
    }
    if (outcome.finished) {
      log.success(chalk.bold('全部阶段已完成 🎉  状态: done'));
    } else if (outcome.completedStage?.id === 'finalize') {
      // 方案锁定后给"继续开发 / 交付收尾"两条路（只判 finalize，兼容自定义工作流）
      log.success('方案已锁定。两条路任选：');
      log.hint(`→ 继续开发   ${chalk.cyan('vibeflow develop')}`);
      log.hint(`→ 交付收尾   ${chalk.cyan('vibeflow deliver')}   （只要这份方案；之后仍可随时 develop）`);
    } else if (outcome.nextStage) {
      log.step(`下一阶段: ${chalk.cyan(outcome.nextStage.id)} (role: ${outcome.nextStage.role})`);
      log.hint(`运行: vibeflow ${outcome.nextStage.id.replace(/_/g, '-')}`);
    }
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
  }
}

export function registerAdvanceCommand(program: Command): void {
  program
    .command('advance')
    .description('标记当前阶段完成并推进到下一阶段（用于 human_gate 确认）')
    .option('-f, --feature <name>', '指定任务（默认选择唯一进行中的任务）')
    .option('--skip', '跳过当前阶段，不算作完成')
    .action(async (opts: AdvanceOptions) => {
      await runAdvance(opts);
    });
}
