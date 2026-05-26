import { RunState, StageState } from './run.js';

export interface AdvanceResult {
  finished: boolean;
  completedStage?: StageState;
  nextStage?: StageState;
}

/**
 * 标记 current_stage 为 completed（或 skipped），把 current_stage 推进到下一个 pending/blocked 阶段。
 * 如果所有阶段都完成，run.status 置为 done。
 */
export function advanceCurrentStage(state: RunState, opts: { skip?: boolean } = {}): AdvanceResult {
  const idx = state.stages.findIndex((s) => s.id === state.current_stage);
  if (idx === -1) {
    throw new Error(`run.json 中没有 current_stage=${state.current_stage}`);
  }
  const current = state.stages[idx];

  if (current.status === 'completed' || current.status === 'skipped') {
    // already done, just try to advance
  } else if (opts.skip) {
    current.status = 'skipped';
    current.completed_at = new Date().toISOString();
  } else {
    if (current.status !== 'in_progress' && current.status !== 'blocked') {
      throw new Error(
        `阶段 ${current.id} 处于 ${current.status}，无法直接 advance。先用 vibeflow ${current.id.replace(/_/g, '-')} 执行该阶段，或加 --skip 跳过`,
      );
    }
    current.status = 'completed';
    current.completed_at = new Date().toISOString();
  }

  // 找下一个未完成阶段
  const next = state.stages.slice(idx + 1).find((s) => s.status !== 'completed' && s.status !== 'skipped');
  if (next) {
    state.current_stage = next.id;
    state.status = 'in_progress';
    return { finished: false, completedStage: current, nextStage: next };
  }

  state.current_stage = null;
  state.status = 'done';
  return { finished: true, completedStage: current };
}
