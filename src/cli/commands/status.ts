import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState } from '../../core/run.js';

interface StatusOptions {
  feature?: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: chalk.gray('○ pending'),
  in_progress: chalk.yellow('● in_progress'),
  completed: chalk.green('✓ completed'),
  blocked: chalk.red('⚠ blocked'),
  failed: chalk.red('✗ failed'),
  skipped: chalk.gray('- skipped'),
};

function badge(status: string): string {
  return STATUS_BADGE[status] ?? status;
}

// 任务级状态的友好展示（delivered 软终态需体现"可继续开发"）
const RUN_STATUS_LABEL: Record<string, string> = {
  delivered: '📦 方案已交付（可继续开发）',
};
function runStatusLabel(status: string): string {
  return RUN_STATUS_LABEL[status] ?? status;
}

export async function runStatus(opts: StatusOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();

  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    log.hint('请先运行 vibeflow init');
    process.exitCode = 1;
    return;
  }

  const features = await listFeatures(projectRoot);
  if (features.length === 0) {
    log.info('暂无任务');
    log.hint('运行 vibeflow new "<需求名>" 创建第一个任务');
    return;
  }

  const targets = opts.feature ? features.filter((f) => f === opts.feature) : features;
  if (targets.length === 0) {
    log.error(`未找到任务: ${opts.feature}`);
    log.hint(`可用任务: ${features.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  for (const feature of targets) {
    const state = await readRunState(projectRoot, feature);
    if (!state) {
      log.warn(`${feature}: 没有 run.json，跳过`);
      continue;
    }

    log.title(`${chalk.bold(feature)}  ${chalk.gray(`[${state.workflow}]`)}`);
    log.hint(`run_id: ${state.run_id}`);
    log.hint(`状态: ${runStatusLabel(state.status)}    当前阶段: ${state.current_stage ?? '-'}`);
    if (state.meta.description) log.hint(`描述: ${state.meta.description}`);

    for (const stage of state.stages) {
      const gateMark = stage.human_gate ? chalk.magenta(' [human-gate]') : '';
      const lockMark = stage.locked ? chalk.cyan(' [locked]') : '';
      const modelMark = stage.model ? chalk.gray(` (${stage.model})`) : '';
      console.log(`  ${badge(stage.status)}  ${stage.id}${modelMark}${gateMark}${lockMark}`);
    }

    if (state.explore && state.explore.status !== 'idle') {
      const e = state.explore;
      const ready = e.artifacts.filter((a) => a.status === 'ready').length;
      const acc = e.accepted ? `  已选 ${chalk.cyan(e.accepted.artifact_id)}` : '';
      log.hint(`探索池: ${e.status}  候选 ${ready}  失败 ${e.failures.length}${acc}`);
    }
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('查看任务和阶段状态')
    .option('-f, --feature <name>', '只显示某个任务')
    .action(async (opts: StatusOptions) => {
      await runStatus(opts);
    });
}
