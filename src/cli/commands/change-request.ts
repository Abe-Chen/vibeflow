import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { listFeatures, readRunState } from '../../core/run.js';
import { createChangeRequest, CHANGE_REQUEST_FILE } from '../../core/change-request.js';

interface ChangeRequestOptions {
  feature?: string;
  message?: string;
}

/** 默认任务选择：唯一一个 done / delivered 的任务 */
async function pickClosedFeature(projectRoot: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const features = await listFeatures(projectRoot);
  const candidates: string[] = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (state && (state.status === 'done' || state.status === 'delivered')) candidates.push(name);
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error('没有已收尾（done / delivered）的任务可发起变更。进行中的任务直接运行对应阶段命令修改即可。');
  }
  throw new Error(`检测到多个已收尾任务，请用 --feature 指定其中之一:\n  ${candidates.join(', ')}`);
}

export async function runChangeRequest(opts: ChangeRequestOptions): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    process.exitCode = 1;
    return;
  }
  if (!opts.message || !opts.message.trim()) {
    log.error('请用 -m 描述变更原因，例如：vibeflow change-request -m "真机发现补拍流程重拍语义混乱"');
    process.exitCode = 1;
    return;
  }

  try {
    const feature = await pickClosedFeature(projectRoot, opts.feature);
    const state = await readRunState(projectRoot, feature);
    if (!state) throw new Error(`找不到 run.json: ${feature}`);

    const result = await createChangeRequest(projectRoot, feature, state, opts.message.trim());

    log.title(`vibeflow change-request: ${feature}`);
    log.success(`已记录变更请求 ${result.id}，任务重开到 ${chalk.cyan(result.reopenedStage)} 阶段`);
    log.step(`变更原因已写入 ${CHANGE_REQUEST_FILE}（develop/fix 阶段会读到）`);
    log.hint('接下来：');
    log.hint(`  vibeflow ${result.reopenedStage.replace(/_/g, '-')}    # 按变更请求修改（不推翻已锁定的 03_final_plan）`);
    log.hint(`  之后照常走 code-review / test / archive 收尾`);
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
  }
}

export function registerChangeRequestCommand(program: Command): void {
  program
    .command('change-request')
    .description('对已收尾（done/delivered）的任务发起变更：记录原因并重开到开发阶段，走轻量修订')
    .option('-f, --feature <name>', '指定任务（默认选择唯一已收尾的任务）')
    .option('-m, --message <text>', '变更原因（必填）')
    .action(async (opts: ChangeRequestOptions) => {
      await runChangeRequest(opts);
    });
}
