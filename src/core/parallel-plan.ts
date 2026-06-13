import path from 'node:path';
import { RunState, ExploreState } from './run.js';
import { VibeflowConfig, resolveStageTimeout } from './config.js';
import { ensureExploreState, allocateArtifact, commitReadyArtifact, registerFailure } from './explore-state.js';
import { buildAdapterMap } from '../adapters/registry.js';
import { ensureOutputWritten } from './output-artifact.js';
import { getFeatureDir } from '../utils/paths.js';

export interface ParallelPlanResult {
  batchId: string;
  succeeded: Array<{ model: string; id: string; file: string }>;
  failed: Array<{ model: string; error: string }>;
  status: ExploreState['status'];
}

function makeBatchId(): string {
  // batch_YYYYMMDDHHmmss
  const s = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `batch_${s}`;
}

function errText(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

/**
 * plan --multi 的并发 runner：给定模型列表，并发各出一套方案到 explore/plans/。
 *
 * 设计依据 03_final_plan.md §M3 并发纪律：
 * - artifact id / file 由本 orchestrator 启动前统一预分配（allocateArtifact）；
 * - 各模型 adapter 只写自己的产物文件 + stdout/stderr 日志，**不碰 run.json**；
 * - 仅本函数在内存里更新 state.explore，由调用方（stages.ts）统一 writeRunState 落盘；
 * - 至少 1 个成功 → explore.status=awaiting_accept；全部失败 → failed。
 *
 * 本函数不写 run.json、不设置 plan 阶段状态，交给调用方按返回结果处理。
 */
export async function runParallelPlan(params: {
  projectRoot: string;
  featureName: string;
  state: RunState;
  config: VibeflowConfig;
  models: string[];
  /** plan 阶段的完整 prompt（各模型相同） */
  prompt: string;
  timeoutMs?: number;
}): Promise<ParallelPlanResult> {
  const { projectRoot, featureName, state, config, models, prompt } = params;
  const explore = ensureExploreState(state);
  const featureDir = getFeatureDir(projectRoot, featureName);
  const adapters = buildAdapterMap(config);
  const batchId = makeBatchId();
  const timeoutMs = params.timeoutMs ?? resolveStageTimeout(config, 'plan');

  // 启动前统一预分配 id/file（消耗 next_seq），再并发调用
  const allocations = models.map((model) => ({ model, alloc: allocateArtifact(explore, 'plan', model) }));

  explore.status = 'running';
  explore.latest_batch_id = batchId;

  const settled = await Promise.allSettled(
    allocations.map(async ({ model, alloc }) => {
      const adapter = adapters.get(model);
      if (!adapter) throw new Error(`找不到模型适配器: ${model}`);
      const outputPath = path.join(featureDir, alloc.file);
      const result = await adapter.run({
        runId: state.run_id,
        featureName,
        stageId: 'plan',
        roleId: 'planner',
        modelId: adapter.id,
        projectRoot,
        prompt,
        outputPath,
        invokeMode: 'spawn',
        timeoutMs,
        writeAccess: false,
        quiet: true,
      });
      if (result.status !== 'success') {
        throw new Error(result.error ?? `调用失败（${result.status}）`);
      }
      const written = await ensureOutputWritten(outputPath, result);
      if (!written) throw new Error('模型调用成功但无产物输出');
      return { model, alloc };
    }),
  );

  const succeeded: ParallelPlanResult['succeeded'] = [];
  const failed: ParallelPlanResult['failed'] = [];

  // 结果回来后由本 orchestrator 串行登记，避免并发写冲突
  settled.forEach((s, i) => {
    const { model, alloc } = allocations[i];
    if (s.status === 'fulfilled') {
      commitReadyArtifact(explore, { id: alloc.id, kind: 'plan', model, file: alloc.file, batchId });
      succeeded.push({ model, id: alloc.id, file: alloc.file });
    } else {
      const error = errText(s.reason);
      registerFailure(explore, { kind: 'plan', model, error, batchId });
      failed.push({ model, error });
    }
  });

  explore.status = succeeded.length > 0 ? 'awaiting_accept' : 'failed';
  return { batchId, succeeded, failed, status: explore.status };
}
