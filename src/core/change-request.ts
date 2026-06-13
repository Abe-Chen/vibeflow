import path from 'node:path';
import fs from 'fs-extra';
import { getFeatureDir } from '../utils/paths.js';
import { RunState, StageState, writeRunState } from './run.js';
import { isFinalPlanLocked } from './explore-state.js';

export const CHANGE_REQUEST_FILE = 'change_requests.md';

export interface ChangeRequestResult {
  id: string;
  reopenedStage: string;
}

/** 找到工作流里第一个开发类阶段（变更通常从这里重新开始改代码） */
function findReopenStage(state: RunState): StageState | undefined {
  return state.stages.find((s) => s.id === 'develop')
    ?? state.stages.find((s) => s.id === 'fix')
    ?? state.stages.find((s) => s.id === 'plan');
}

/**
 * 发起变更请求：对已 done / delivered 的 feature，在锁定方案不变的前提下，
 * 记录变更原因、把任务重开到开发阶段（让 develop→code-review 走轻量修订）。
 *
 * 设计原则：
 * - 只允许对"已收尾"的任务发起（done / delivered）；进行中的任务直接改即可，不需要 change-request。
 * - 不推翻已锁定的 03_final_plan（变更是在其范围内修正/补充）；如要大改方向，应另起 feature。
 * - 变更原因累积写入 change_requests.md，并进 run.json.change_requests[]，可追溯。
 */
export async function createChangeRequest(
  projectRoot: string,
  featureName: string,
  state: RunState,
  reason: string,
): Promise<ChangeRequestResult> {
  if (state.status !== 'done' && state.status !== 'delivered' && !isFinalPlanLocked(state)) {
    throw new Error(
      `change-request 用于已收尾（done / delivered）或方案已锁定的任务。当前状态为 ${state.status} 且方案未锁定，`
      + `进行中的任务直接运行对应阶段命令修改即可。`,
    );
  }

  const reopen = findReopenStage(state);
  if (!reopen) {
    throw new Error('当前工作流没有 develop/fix/plan 阶段，无法发起变更请求');
  }

  const now = new Date().toISOString();
  const id = `cr_${Date.now().toString(36)}`;

  // 1) 记录到 run.json
  state.change_requests = state.change_requests ?? [];
  state.change_requests.push({ id, reason, created_at: now });

  // 2) 把重开阶段及其之后的阶段重置为 pending（重新走开发→评审→…）
  const reopenIdx = state.stages.findIndex((s) => s.id === reopen.id);
  state.stages.slice(reopenIdx).forEach((s) => {
    s.status = 'pending';
    s.completed_at = undefined;
    s.notes = undefined;
  });
  state.current_stage = reopen.id;
  state.status = 'in_progress';

  await writeRunState(projectRoot, featureName, state);

  // 3) 变更原因累积写入 change_requests.md（develop/fix 阶段会读到，见 context 注入）
  const crFile = path.join(getFeatureDir(projectRoot, featureName), CHANGE_REQUEST_FILE);
  const header = (await fs.pathExists(crFile))
    ? ''
    : '# 变更请求记录\n\n> 本文件记录 feature 收尾后发起的变更。develop / fix 阶段须在此范围内修正，不推翻已锁定的 03_final_plan。\n';
  const entry = `\n## ${id}（${now}）\n\n${reason}\n`;
  await fs.appendFile(crFile, header + entry, 'utf8');

  return { id, reopenedStage: reopen.id };
}
