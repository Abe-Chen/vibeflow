import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { ExploreState } from '../core/run.js';
import { ParallelPlanResult } from '../core/parallel-plan.js';

/**
 * plan --multi 完成后打印决策菜单。探索池人主导：只展示候选与可敲的命令，由用户自己选择，
 * 不做数字交互执行（accept 优先放最前，防拖延）。非 TTY 同样打印（纯文本提示）。
 */
export function printPlanMultiMenu(featureName: string, explore: ExploreState, result: ParallelPlanResult): void {
  const candidates = explore.artifacts.filter((a) => a.kind === 'plan' && a.status === 'ready');
  log.title(`探索池：${featureName}（${candidates.length} 个候选方案，待选定正式方案）`);
  if (result.failed.length) {
    log.warn(`${result.failed.length} 个模型失败：${result.failed.map((f) => f.model).join(', ')}（已记入 explore.failures，可补跑）`);
  }
  console.log('');
  for (const a of candidates) {
    console.log(`  ${chalk.cyan(a.id)}  ${chalk.gray(`(${a.model})`)}  ${chalk.gray(a.file)}`);
  }
  console.log('');
  log.hint('选定某方案 → plan-review：  vibeflow accept-plan <id>');
  log.hint('咨询某模型对方案的看法：    vibeflow consult --about <id> --model <model> -m "<问题>"');
  log.hint('融合多份方案：              vibeflow synthesize --base <id1>,<id2> --model <model>');
  log.hint('重出一批（保留历史）：      vibeflow plan --multi --force');
  log.hint('放弃探索、回单方案：        vibeflow plan --force');
}
