import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState, RunState } from '../../core/run.js';
import { adviseNext } from '../../core/next-advisor.js';

interface NextOptions {
  feature?: string;
}

/** 紧凑单行进度条：✓plan › ●plan-review › ○finalize ... */
function progressBar(state: RunState): string {
  return state.stages
    .map((s) => {
      const name = s.id.replace(/_/g, '-');
      switch (s.status) {
        case 'completed': return chalk.green(`✓${name}`);
        case 'in_progress': return chalk.yellow(`●${name}`);
        case 'blocked': return chalk.red(`⚠${name}`);
        case 'failed': return chalk.red(`✗${name}`);
        case 'skipped': return chalk.gray(`-${name}`);
        default: return chalk.gray(`○${name}`);
      }
    })
    .join(chalk.gray(' › '));
}

function printAdvice(feature: string, state: RunState): void {
  const advice = adviseNext(state);
  log.title(`${chalk.bold(feature)}  ${chalk.gray(`[${state.workflow}]`)}`);
  console.log('  ' + progressBar(state));
  console.log('');
  log.info(advice.headline);
  for (const cmd of advice.commands) {
    console.log('  ' + chalk.cyan(cmd));
  }
  log.hint(advice.reason);
}

export async function runNext(opts: NextOptions = {}): Promise<void> {
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

  // 指定了 --feature
  if (opts.feature) {
    if (!features.includes(opts.feature)) {
      log.error(`未找到任务: ${opts.feature}`);
      log.hint(`可用任务: ${features.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const state = await readRunState(projectRoot, opts.feature);
    if (!state) {
      log.error(`${opts.feature} 没有 run.json`);
      process.exitCode = 1;
      return;
    }
    printAdvice(opts.feature, state);
    return;
  }

  // 收集任务，分进行中 / 已收尾
  const active: Array<{ name: string; state: RunState }> = [];
  const finished: Array<{ name: string; state: RunState }> = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (!state) continue;
    if (state.status === 'created' || state.status === 'in_progress' || state.status === 'blocked') {
      active.push({ name, state });
    } else if (state.status === 'done' || state.status === 'delivered') {
      finished.push({ name, state });
    }
  }

  if (active.length === 0) {
    log.info('没有进行中的任务');
    if (finished.length) {
      log.hint('已收尾的任务：');
      for (const { name, state } of finished) {
        const tag = state.status === 'delivered' ? chalk.gray('📦 已交付') : chalk.gray('✓ 已完成');
        console.log('  ' + chalk.bold(name) + '  ' + tag);
      }
      log.hint('看后续选项：vibeflow next -f <任务名>（done → change-request；delivered → develop 续接）');
    } else {
      log.hint('用 vibeflow new 创建新任务');
    }
    return;
  }

  if (active.length === 1) {
    printAdvice(active[0].name, active[0].state);
    return;
  }

  // 多个进行中：逐个给一行下一步，详情让用户 -f 钻取
  log.title(`有 ${active.length} 个进行中的任务：`);
  for (const { name, state } of active) {
    const advice = adviseNext(state);
    console.log('');
    console.log('  ' + chalk.bold(name) + chalk.gray(`  [${state.workflow}]`));
    log.hint('  ' + advice.headline);
    if (advice.commands[0]) console.log('    → ' + chalk.cyan(advice.commands[0]));
  }
  log.hint('\n看某个任务的完整下一步：vibeflow next -f <任务名>');
}

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('看当前任务卡在哪、下一步该跑什么命令')
    .option('-f, --feature <name>', '指定任务（默认看进行中的任务）')
    .action(async (opts: NextOptions) => {
      await runNext(opts);
    });
}
