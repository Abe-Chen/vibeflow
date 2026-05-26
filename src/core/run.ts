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
  };
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
