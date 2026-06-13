import path from 'node:path';
import { RunState, ExploreState, readRunState, writeRunState } from './run.js';
import { VibeflowConfig, loadConfig, resolveStageTimeout } from './config.js';
import { ensureExploreState, allocateArtifact, commitReadyArtifact, registerFailure, isFinalPlanLocked } from './explore-state.js';
import { buildAdapterMap } from '../adapters/registry.js';
import { ensureOutputWritten } from './output-artifact.js';
import { buildContext } from './context.js';
import { pickFeature } from './stage-runner.js';
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

/**
 * 解析 plan --multi 要用的模型列表（D1 决策4 + Minor3）：
 * - 传 --models：拆分、去重、必须 2-3 个、且都在 config.models 中定义；
 * - 不传：取 planner 的 default_model + fallback_models 去重后前 2-3 个，不足 2 报错。
 */
export function resolveMultiModels(config: VibeflowConfig, modelsArg?: string): string[] {
  let list: string[];
  const explicit = Boolean(modelsArg && modelsArg.trim());
  if (explicit) {
    list = modelsArg!.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const planner = config.roles['planner'];
    if (!planner) throw new Error('配置缺少 planner 角色，无法推断默认模型，请用 --models 指定');
    list = [planner.default_model, ...(planner.fallback_models ?? [])];
  }
  list = Array.from(new Set(list.filter(Boolean)));
  for (const m of list) {
    if (!config.models[m]) throw new Error(`模型未在 config.models 中定义: ${m}`);
  }
  if (explicit) {
    if (list.length < 2 || list.length > 3) {
      throw new Error(`--models 需要 2-3 个不同模型，当前 ${list.length} 个`);
    }
  } else {
    if (list.length < 2) {
      throw new Error('planner 的 default+fallback 去重后不足 2 个模型，请用 --models 显式指定 2-3 个');
    }
    list = list.slice(0, 3);
  }
  return list;
}

/**
 * plan --multi 的编排：选 feature → 校验（requirement 完成、未锁定）→ 解析模型 → 构建 plan prompt →
 * 并发出方案 → 统一写 run.json。返回结果交给 CLI 层打印决策菜单。
 */
export async function orchestratePlanMulti(params: {
  projectRoot: string;
  feature?: string;
  models?: string;
}): Promise<{ featureName: string; result: ParallelPlanResult; modelList: string[] }> {
  const { projectRoot } = params;
  const config = await loadConfig(projectRoot);
  const featureName = await pickFeature(projectRoot, params.feature);
  const state = await readRunState(projectRoot, featureName);
  if (!state) throw new Error(`找不到 run.json: ${featureName}`);

  if (isFinalPlanLocked(state)) {
    throw new Error('方案已锁定，不能再探索。如需变更请用 vibeflow change-request');
  }
  const requirement = state.stages.find((s) => s.id === 'requirement');
  if (requirement && requirement.status !== 'completed' && requirement.status !== 'skipped') {
    throw new Error('requirement 阶段尚未完成，请先运行 vibeflow requirement 并 advance');
  }
  const planStage = state.stages.find((s) => s.id === 'plan');
  if (!planStage) throw new Error('当前工作流没有 plan 阶段');

  const modelList = resolveMultiModels(config, params.models);

  const featureDir = getFeatureDir(projectRoot, featureName);
  const ctx = await buildContext({
    projectRoot,
    config,
    featureName,
    stageId: 'plan',
    outputPath: path.join(featureDir, '01_plan_v1.md'),
  });

  planStage.status = 'in_progress';
  planStage.started_at = new Date().toISOString();
  if (state.status === 'created') state.status = 'in_progress';
  state.current_stage = 'plan';

  const result = await runParallelPlan({
    projectRoot,
    featureName,
    state,
    config,
    models: modelList,
    prompt: ctx.prompt,
    timeoutMs: resolveStageTimeout(config, 'plan'),
  });

  if (result.status === 'failed') {
    planStage.status = 'failed';
    planStage.notes = '所有模型出方案失败（见 explore.failures）';
  } else {
    planStage.notes = `多模型探索：${result.succeeded.length} 成功 / ${result.failed.length} 失败，待 accept-plan 选定`;
  }
  await writeRunState(projectRoot, featureName, state);
  return { featureName, result, modelList };
}
