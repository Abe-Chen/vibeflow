import path from 'node:path';
import fs from 'fs-extra';
import { getFeatureDir } from '../utils/paths.js';
import { RunState, writeRunState } from './run.js';

const FINAL_PLAN_FILE = '03_final_plan.md';
const PLACEHOLDER_RE = /由 vibeflow new 占位生成/;

export type DeliverBlockReason = 'not_locked' | 'in_development';

export interface Deliverability {
  /** 当前可执行交付 */
  deliverable: boolean;
  /** 已经是 delivered（再次 deliver 视为幂等 no-op） */
  alreadyDelivered: boolean;
  reasonCode?: DeliverBlockReason;
  /** 不可交付时的用户可读原因（不带 ✗，由 log.error 统一加前缀） */
  reason?: string;
}

// 拒绝文案不带 ✗ 前缀（log.error 会加）；两类拒绝在语义上明确区分。
const REASON_TEXT: Record<DeliverBlockReason, string> = {
  not_locked: '还不能交付：方案尚未锁定。请先 vibeflow finalize 并 advance 锁定方案。',
  in_development: '该任务已进入开发阶段，不能再交付。deliver 仅用于方案锁定后、尚未开发的任务。',
};

async function isFinalPlanLocked(projectRoot: string, featureName: string): Promise<boolean> {
  const file = path.join(getFeatureDir(projectRoot, featureName), FINAL_PLAN_FILE);
  if (!(await fs.pathExists(file))) return false;
  const content = (await fs.readFile(file, 'utf8')).trim();
  if (!content || PLACEHOLDER_RE.test(content) || content.length < 50) return false;
  return true;
}

/**
 * 判定任务能否交付（deliver），或是否已交付。
 * 门禁：finalize 已完成 + 03_final_plan.md 已锁定 + develop 及之后所有阶段均为 pending。
 */
export async function getDeliverability(
  projectRoot: string,
  featureName: string,
  state: RunState,
): Promise<Deliverability> {
  if (state.status === 'delivered') {
    return { deliverable: false, alreadyDelivered: true };
  }

  const finalize = state.stages.find((s) => s.id === 'finalize');
  if (!finalize || finalize.status !== 'completed') {
    return { deliverable: false, alreadyDelivered: false, reasonCode: 'not_locked', reason: REASON_TEXT.not_locked };
  }

  if (!(await isFinalPlanLocked(projectRoot, featureName))) {
    return { deliverable: false, alreadyDelivered: false, reasonCode: 'not_locked', reason: REASON_TEXT.not_locked };
  }

  // develop 及之后所有阶段必须均未开始（pending），否则视为"已进入开发"
  const devIdx = state.stages.findIndex((s) => s.id === 'develop');
  if (devIdx !== -1) {
    const started = state.stages.slice(devIdx).some((s) => s.status !== 'pending');
    if (started) {
      return { deliverable: false, alreadyDelivered: false, reasonCode: 'in_development', reason: REASON_TEXT.in_development };
    }
  }

  return { deliverable: true, alreadyDelivered: false };
}

/** 不可交付（且未交付）时抛出清晰错误；可交付或已交付时返回判定结果。 */
export async function assertDeliverable(
  projectRoot: string,
  featureName: string,
  state: RunState,
): Promise<Deliverability> {
  const d = await getDeliverability(projectRoot, featureName, state);
  if (!d.deliverable && !d.alreadyDelivered) {
    throw new Error(d.reason ?? '当前任务不可交付');
  }
  return d;
}

export interface MarkDeliveredResult {
  /** true = 任务已是 delivered，本次为幂等 no-op（不刷新 delivered_at） */
  idempotent: boolean;
}

/**
 * 把任务标记为 delivered（软终态）。已是 delivered 时幂等 no-op，保留首次 delivered_at。
 */
export async function markDelivered(
  projectRoot: string,
  featureName: string,
  state: RunState,
): Promise<MarkDeliveredResult> {
  const d = await assertDeliverable(projectRoot, featureName, state);
  if (d.alreadyDelivered) {
    return { idempotent: true };
  }
  state.status = 'delivered';
  state.meta.delivered_at = new Date().toISOString();
  await writeRunState(projectRoot, featureName, state);
  return { idempotent: false };
}
