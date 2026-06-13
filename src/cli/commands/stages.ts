import { Command } from 'commander';
import { log } from '../../utils/logger.js';
import { runStage, pickFeature } from '../../core/stage-runner.js';
import { InvokeMode } from '../../adapters/types.js';
import { loadConfig } from '../../core/config.js';
import { readRunState, writeRunState } from '../../core/run.js';
import { ensureExploreState, abandonExploreToSingle } from '../../core/explore-state.js';
import { orchestratePlanMulti } from '../../core/parallel-plan.js';
import { printPlanMultiMenu } from '../explore-menu.js';
import { resolveProjectRoot } from '../../utils/paths.js';

interface StageCommandOptions {
  feature?: string;
  model?: string;
  message?: string;
  export?: boolean;
  yes?: boolean;
  /** commander: `--no-chain` 会生成此字段，默认 true，传 --no-chain 后为 false */
  chain?: boolean;
  /** 强制重跑已完成阶段 */
  force?: boolean;
  /** plan --multi：多模型并行出方案 */
  multi?: boolean;
  /** plan --models：指定参与 --multi 的模型（逗号分隔） */
  models?: string;
}

interface StageCommandDef {
  cli: string;            // CLI 子命令名，例如 'plan-review'
  stageId: string;        // workflow 中的 id，例如 'plan_review'
  description: string;
  /** 是否要求 final_plan 已锁定 */
  requireLockedPlan?: boolean;
  /** 是否要求评审者与开发者使用不同模型 */
  requireDifferentFromDeveloper?: boolean;
  /** 该阶段是否接受 -m message 作为 user_input（一般只有 requirement 需要） */
  acceptsMessage?: boolean;
}

const STAGE_COMMANDS: StageCommandDef[] = [
  { cli: 'plan',         stageId: 'plan',         description: '由 Planner 生成方案 v1，写入 01_plan_v1.md' },
  { cli: 'plan-review',  stageId: 'plan_review',  description: '由 Plan Reviewer 评审方案，写入 02_plan_review.md（要求与 Planner 不同模型）' },
  { cli: 'finalize',     stageId: 'finalize',     description: '吸收评审意见，输出最终方案 03_final_plan.md（human_gate）' },
  { cli: 'develop',      stageId: 'develop',      description: '按 final_plan 开发，输出 05_implementation_report.md（要求 final_plan 已锁定）', requireLockedPlan: true },
  { cli: 'code-review',  stageId: 'code_review',  description: '由 Code Reviewer 评审代码，写入 06_code_review.md（要求与 Developer 不同模型）', requireDifferentFromDeveloper: true },
  { cli: 'fix',          stageId: 'fix',          description: '按代码评审反馈修复 Blocker / 确认 Major，写入 07_fix_report.md' },
  { cli: 'test',         stageId: 'test',         description: '由 QA 生成测试验收报告，写入 08_test_report.md' },
  { cli: 'archive',      stageId: 'archive',      description: '生成上线说明 09_release_note.md' },
];

async function ensureRoleConfigured(stageId: string): Promise<void> {
  // 仅当命令运行时才校验，避免 init 之前的命令也报错
  const projectRoot = resolveProjectRoot();
  try {
    const config = await loadConfig(projectRoot);
    // role 在 runStage 内会再次校验，这里不做硬阻断
    void config;
  } catch {
    // 让 runStage 抛出更友好的错误
  }
  void stageId;
}

/** plan 命令的探索池特殊处理。返回 true 表示已处理（不再走普通 runStage）。 */
async function handlePlanCommand(opts: StageCommandOptions): Promise<boolean> {
  const projectRoot = resolveProjectRoot();

  if (opts.multi) {
    if (opts.export) {
      log.error('plan --multi 不支持 --export（探索池需真实调用多个模型 CLI）');
      process.exitCode = 1;
      return true;
    }
    const { featureName, result } = await orchestratePlanMulti({
      projectRoot,
      feature: opts.feature,
      models: opts.models,
    });
    if (result.status === 'failed') {
      log.error(`所有模型出方案失败：${result.failed.map((f) => `${f.model}: ${f.error}`).join('; ')}`);
      process.exitCode = 1;
      return true;
    }
    const state = await readRunState(projectRoot, featureName);
    if (state) printPlanMultiMenu(featureName, ensureExploreState(state), result);
    return true;
  }

  // 非 --multi：awaiting_accept 防绕过（B2 规则2）
  let featureName: string;
  try {
    featureName = await pickFeature(projectRoot, opts.feature);
  } catch {
    return false; // 选不出唯一 feature，交给 runStage 给出标准错误
  }
  const state = await readRunState(projectRoot, featureName);
  if (state?.explore?.status === 'awaiting_accept') {
    if (opts.force) {
      abandonExploreToSingle(state.explore);
      await writeRunState(projectRoot, featureName, state);
      log.info('已放弃探索池，回到单方案 plan（explore 历史保留）');
      return false; // 继续走普通 runStage 出单方案
    }
    log.error('探索池正在等待选择正式方案，不能直接跑单方案 plan');
    log.hint('选定方案： vibeflow accept-plan <id>');
    log.hint('放弃探索、回单方案： vibeflow plan --force');
    process.exitCode = 1;
    return true;
  }
  return false;
}

export function registerStageCommands(program: Command): void {
  for (const def of STAGE_COMMANDS) {
    const cmd = program
      .command(def.cli)
      .description(def.description)
      .option('-f, --feature <name>', '指定任务（默认选择唯一进行中的任务）')
      .option('--model <id>', '覆盖角色配置的默认模型')
      .option('--export', '改用 export 兜底模式：只生成 prompt 文件，不调 CLI')
      .option('-y, --yes', '完成后自动 chain 到下一阶段（不询问）')
      .option('--no-chain', '完成后既不询问也不 chain，停在当前阶段')
      .option('--force', '强制重跑已完成的阶段（会把其后已完成阶段重置为待执行）');

    if (def.acceptsMessage) {
      cmd.option('-m, --message <text>', '附加给模型的提示信息');
    }

    if (def.cli === 'plan') {
      cmd.option('--multi', '多模型并行各出一套方案到 explore/（探索池）');
      cmd.option('--models <ids>', '指定参与 --multi 的模型，逗号分隔（2-3 个），默认取 planner 的 default+fallback');
    }

    cmd.action(async (opts: StageCommandOptions) => {
      try {
        if (def.cli === 'plan') {
          const handled = await handlePlanCommand(opts);
          if (handled) return;
        }
        await ensureRoleConfigured(def.stageId);
        const invokeMode: InvokeMode | undefined = opts.export ? 'export' : undefined;
        await runStage({
          stageId: def.stageId,
          feature: opts.feature,
          modelOverride: opts.model,
          invokeMode,
          userVariables: opts.message ? { user_input: opts.message } : undefined,
          yes: opts.yes,
          noChain: opts.chain === false,
          force: opts.force,
          requireLockedPlan: def.requireLockedPlan,
          requireDifferentFromDeveloper: def.requireDifferentFromDeveloper,
        });
      } catch (err) {
        log.error((err as Error).message);
        process.exitCode = 1;
      }
    });
  }
}
