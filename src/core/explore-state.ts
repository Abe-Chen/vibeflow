import {
  RunState,
  ExploreState,
  ExploreArtifact,
  ExploreArtifactKind,
  ExploreFailure,
} from './run.js';

/**
 * 探索池状态管理（第 1 步：纯状态逻辑，不读写文件、不调模型）。
 * 设计依据：docs/designs/multi-model-explore-pool/03_final_plan.md §5（B1/B2/M5）、§6.2、§6.3、§6.6。
 */

/** kind → explore 子目录 */
const KIND_DIR: Record<ExploreArtifactKind, string> = {
  plan: 'plans',
  consult: 'consults',
  synthesis: 'syntheses',
  judge: 'judges',
};

/** kind → 文件名前缀（synthesis 缩写为 synth） */
const KIND_PREFIX: Record<ExploreArtifactKind, string> = {
  plan: 'plan',
  consult: 'consult',
  synthesis: 'synth',
  judge: 'judge',
};

/** 确保 state.explore 存在（旧任务无此字段时初始化为 idle）。仅在内存补默认，由调用方决定何时落盘。 */
export function ensureExploreState(state: RunState): ExploreState {
  if (!state.explore) {
    state.explore = {
      version: 1,
      status: 'idle',
      next_seq: 1,
      artifacts: [],
      failures: [],
      accept_history: [],
    };
  }
  return state.explore;
}

/**
 * final_plan 是否已锁定（finalize 已 advance 锁定）。锁定后探索命令一律拒绝。
 * 判据：meta.final_plan_locked_at 已写入，或 finalize 阶段已 completed 且打上 locked 标记。
 */
export function isFinalPlanLocked(state: RunState): boolean {
  if (state.meta.final_plan_locked_at) return true;
  const finalize = state.stages.find((s) => s.id === 'finalize');
  return finalize?.status === 'completed' && finalize.locked === true;
}

function seq3(n: number): string {
  return String(n).padStart(3, '0');
}

/** 探索产物相对 feature 目录的路径，如 explore/plans/plan_001_codex.md */
export function exploreArtifactRelPath(kind: ExploreArtifactKind, seq: number, model: string): string {
  return `explore/${KIND_DIR[kind]}/${KIND_PREFIX[kind]}_${seq3(seq)}_${model}.md`;
}

/**
 * 登记一份成功产物：分配全局递增 seq、稳定 id 与文件路径，追加到 artifacts。
 * 只维护 explore 元数据，不负责写产物文件内容（由 runner 落盘）。
 */
export function registerArtifact(
  explore: ExploreState,
  params: { kind: ExploreArtifactKind; model: string; title?: string; inputs?: string[]; batchId?: string },
): ExploreArtifact {
  const seq = explore.next_seq;
  explore.next_seq += 1;
  const artifact: ExploreArtifact = {
    id: `${KIND_PREFIX[params.kind]}_${seq3(seq)}`,
    kind: params.kind,
    status: 'ready',
    batch_id: params.batchId,
    model: params.model,
    file: exploreArtifactRelPath(params.kind, seq, params.model),
    title: params.title,
    inputs: params.inputs,
    created_at: new Date().toISOString(),
  };
  explore.artifacts.push(artifact);
  return artifact;
}

/** 登记一次失败（不占 seq、不影响正式 plan 状态） */
export function registerFailure(
  explore: ExploreState,
  params: {
    kind: 'plan' | 'consult' | 'synthesis';
    model: string;
    error: string;
    stdoutFile?: string;
    stderrFile?: string;
    batchId?: string;
  },
): ExploreFailure {
  const failure: ExploreFailure = {
    batch_id: params.batchId,
    kind: params.kind,
    model: params.model,
    error: params.error,
    stdout_file: params.stdoutFile,
    stderr_file: params.stderrFile,
    created_at: new Date().toISOString(),
  };
  explore.failures.push(failure);
  return failure;
}

/** 按 id 查 artifact */
export function findArtifact(explore: ExploreState, artifactId: string): ExploreArtifact | undefined {
  return explore.artifacts.find((a) => a.id === artifactId);
}

/**
 * 接受某个 artifact 为正式方案：更新 accepted 指针与 accept_history，状态置 accepted。
 * 仅校验并记录元数据；复制 source_file → 01_plan_v1.md 由调用方完成。
 * 来源必须是 ready 的 plan / synthesis（不能 accept consult / judge / failed）。
 */
export function acceptArtifact(explore: ExploreState, artifactId: string): ExploreArtifact {
  const artifact = findArtifact(explore, artifactId);
  if (!artifact) {
    throw new Error(`探索产物不存在: ${artifactId}（用 vibeflow status 或决策菜单查看可选 id）`);
  }
  if (artifact.status !== 'ready') {
    throw new Error(`探索产物 ${artifactId} 状态为 ${artifact.status}，不能 accept`);
  }
  if (artifact.kind !== 'plan' && artifact.kind !== 'synthesis') {
    throw new Error(`只能 accept plan 或 synthesis 产物，${artifactId} 的类型是 ${artifact.kind}`);
  }
  const now = new Date().toISOString();
  const hadPrevious = Boolean(explore.accepted);
  explore.accepted = {
    artifact_id: artifact.id,
    source_file: artifact.file,
    target_file: '01_plan_v1.md',
    accepted_at: now,
  };
  explore.accept_history.push({
    artifact_id: artifact.id,
    source_file: artifact.file,
    target_file: '01_plan_v1.md',
    accepted_at: now,
    superseded_previous: hadPrevious,
  });
  explore.status = 'accepted';
  return artifact;
}

/**
 * 探索专用的下游重置：当正式 plan 输入变化（plan --multi --force / 放弃探索回单方案 / accept 覆盖已有正式方案）时，
 * 把 plan 之后所有非 pending 阶段（completed / in_progress / blocked / failed / skipped）一律重置为 pending。
 *
 * 注意：这与普通 `<stage> --force`（stage-runner 里只重置下游 completed、保留 skipped）语义不同——
 * 见设计 §5 B1。本函数仅作用于内存 state，不动产物文件（文件保留，靠阶段状态标记过时）。
 * 返回被重置的阶段 id 列表。
 */
export function resetDownstreamForExplore(state: RunState): string[] {
  const planIdx = state.stages.findIndex((s) => s.id === 'plan');
  if (planIdx === -1) return [];
  const reset: string[] = [];
  for (const s of state.stages.slice(planIdx + 1)) {
    if (s.status !== 'pending') {
      s.status = 'pending';
      s.completed_at = undefined;
      s.started_at = undefined;
      s.notes = '因探索池方案变更已重置为待执行（产物文件保留但视为过时）';
      reset.push(s.id);
    }
  }
  return reset;
}
