import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { getVibeflowDir, getFeatureDir } from '../utils/paths.js';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed' | 'skipped';

/** 任务级状态。`delivered` 是"方案已交付（可继续开发）"的软终态，与 done 并列、但可逆。 */
export type RunStatus = 'created' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'delivered';

export interface StageState {
  id: string;
  role: string;
  status: StageStatus;
  output?: string;
  model?: string;
  human_gate?: boolean;
  locked?: boolean;
  started_at?: string;
  completed_at?: string;
  notes?: string;
}

export interface RunState {
  version: 1;
  run_id: string;
  feature_name: string;
  workflow: string;
  status: RunStatus;
  current_stage: string | null;
  created_at: string;
  updated_at: string;
  stages: StageState[];
  meta: {
    description?: string;
    created_by?: string;
    /** 方案交付时间（ISO）；vibeflow deliver 写入，续接 develop 时保留 */
    delivered_at?: string;
    /** final_plan 锁定时间（ISO）；finalize advance 锁定时写入，探索命令据此拒绝 */
    final_plan_locked_at?: string;
  };
  /** 变更请求记录：feature 完成/交付后又发现问题时，vibeflow change-request 写入 */
  change_requests?: Array<{
    id: string;
    reason: string;
    created_at: string;
    resolved_at?: string;
  }>;
  /** 多模型探索池状态（plan --multi 等）；旧任务无此字段时视为 idle。详见 docs/designs/multi-model-explore-pool/ */
  explore?: ExploreState;
}

export type ExploreStatus = 'idle' | 'running' | 'awaiting_accept' | 'accepted' | 'failed';
export type ExploreArtifactKind = 'plan' | 'consult' | 'synthesis' | 'judge';

/** 一份探索产物（候选方案 / 咨询记录 / 融合稿） */
export interface ExploreArtifact {
  id: string;
  kind: ExploreArtifactKind;
  status: 'ready' | 'failed';
  batch_id?: string;
  model: string;
  /** 相对 feature 目录的产物路径，如 explore/plans/plan_001_codex.md */
  file: string;
  title?: string;
  /** 该产物的输入来源（其他 artifact id 或文件） */
  inputs?: string[];
  created_at: string;
}

/** 一次探索调用失败记录（不影响正式 plan 状态） */
export interface ExploreFailure {
  batch_id?: string;
  kind: 'plan' | 'consult' | 'synthesis';
  model: string;
  error: string;
  stdout_file?: string;
  stderr_file?: string;
  created_at: string;
}

/** accept 历史的一条记录；accepted 指针是其末项的快照（不含 superseded_previous） */
export interface AcceptRecord {
  artifact_id: string;
  source_file: string;
  target_file: '01_plan_v1.md';
  accepted_at: string;
  superseded_previous?: boolean;
}

/** 探索池状态（挂在 RunState.explore，optional，旧任务缺失视为 idle） */
export interface ExploreState {
  version: 1;
  status: ExploreStatus;
  latest_batch_id?: string;
  /** 全局单调递增的产物序号，下一个可用值 */
  next_seq: number;
  artifacts: ExploreArtifact[];
  failures: ExploreFailure[];
  /** 当前正式方案指针；由 accept_history 末项推导，acceptArtifact() 统一更新 */
  accepted?: Omit<AcceptRecord, 'superseded_previous'>;
  accept_history: AcceptRecord[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  stages: Array<{
    id: string;
    role: string;
    output?: string;
    input?: string;
    human_gate?: boolean;
    lock_artifact?: boolean;
    requires_locked_plan?: boolean;
    policy?: string;
  }>;
}

export async function loadWorkflowTemplate(projectRoot: string, workflowId: string): Promise<WorkflowTemplate> {
  const file = path.join(getVibeflowDir(projectRoot), 'workflows', `${workflowId}.yaml`);
  if (!(await fs.pathExists(file))) {
    throw new Error(`找不到工作流模板: ${workflowId} (${file})`);
  }
  const raw = await fs.readFile(file, 'utf8');
  const parsed = YAML.parse(raw) as WorkflowTemplate;
  if (!parsed.id || !Array.isArray(parsed.stages)) {
    throw new Error(`工作流模板格式错误: ${file}`);
  }
  return parsed;
}

export function buildInitialRun(featureName: string, workflow: WorkflowTemplate, description?: string): RunState {
  const now = new Date().toISOString();
  const stages: StageState[] = workflow.stages.map((s) => ({
    id: s.id,
    role: s.role,
    status: 'pending',
    output: s.output,
    human_gate: s.human_gate,
  }));
  return {
    version: 1,
    run_id: `run_${Date.now().toString(36)}`,
    feature_name: featureName,
    workflow: workflow.id,
    status: 'created',
    current_stage: stages[0]?.id ?? null,
    created_at: now,
    updated_at: now,
    stages,
    meta: { description },
  };
}

export async function writeRunState(projectRoot: string, featureName: string, state: RunState): Promise<void> {
  state.updated_at = new Date().toISOString();
  const file = path.join(getFeatureDir(projectRoot, featureName), 'run.json');
  await fs.ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export async function readRunState(projectRoot: string, featureName: string): Promise<RunState | null> {
  const file = path.join(getFeatureDir(projectRoot, featureName), 'run.json');
  if (!(await fs.pathExists(file))) return null;
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as RunState;
}

export async function listFeatures(projectRoot: string): Promise<string[]> {
  const docsDir = path.join(projectRoot, 'docs', 'ai-workflow');
  if (!(await fs.pathExists(docsDir))) return [];
  const entries = await fs.readdir(docsDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
