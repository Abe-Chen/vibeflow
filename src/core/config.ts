import path from 'node:path';
import fs from 'fs-extra';
import YAML from 'yaml';
import { getVibeflowDir } from '../utils/paths.js';
import { ModelDefinition } from '../adapters/types.js';

export interface RoleConfig {
  default_model: string;
  fallback_models?: string[];
  temperature?: number;
  must_be_different_from_developer?: boolean;
  require_worktree?: boolean;
}

export interface QualityGates {
  require_requirement_confirm?: boolean;
  require_final_plan_lock?: boolean;
  require_code_review?: boolean;
  require_test_report?: boolean;
}

export interface ProjectMeta {
  name?: string;
  language?: string;
  package_manager?: string;
}

export interface VibeflowConfig {
  version: number;
  project: ProjectMeta;
  defaults: {
    workflow?: string;
    require_final_plan_lock?: boolean;
    developer_single_owner?: boolean;
  };
  models: Record<string, ModelDefinition>;
  roles: Record<string, RoleConfig>;
  quality_gates: QualityGates;
  commands: {
    test?: string[];
    build?: string[];
    lint?: string[];
  };
  /** 阶段级超时覆盖（毫秒）。键为 stage id，如 develop/fix；未配置则回退到模型级 timeout_ms */
  stage_timeouts?: Record<string, number>;
}

export async function loadConfig(projectRoot: string): Promise<VibeflowConfig> {
  const file = path.join(getVibeflowDir(projectRoot), 'config.yaml');
  if (!(await fs.pathExists(file))) {
    throw new Error(`找不到 vibeflow 配置: ${file}（请先运行 vibeflow init）`);
  }
  const raw = await fs.readFile(file, 'utf8');
  const parsed = YAML.parse(raw) as Partial<VibeflowConfig> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`配置解析失败: ${file}`);
  }

  const models = parsed.models ?? {};
  for (const [modelId, def] of Object.entries(models)) {
    (def as ModelDefinition).id = (def as ModelDefinition).id ?? modelId;
  }

  return {
    version: parsed.version ?? 1,
    project: parsed.project ?? {},
    defaults: parsed.defaults ?? {},
    models: models as Record<string, ModelDefinition>,
    roles: (parsed.roles ?? {}) as Record<string, RoleConfig>,
    quality_gates: (parsed.quality_gates ?? {}) as QualityGates,
    commands: parsed.commands ?? {},
    stage_timeouts: parsed.stage_timeouts ?? {},
  };
}

/**
 * 解析阶段级超时（毫秒）。
 * 优先级：config.stage_timeouts[stageId] > undefined（交给 adapter 用模型级 timeout_ms / 默认值）。
 */
export function resolveStageTimeout(config: VibeflowConfig, stageId: string): number | undefined {
  const v = config.stage_timeouts?.[stageId];
  return typeof v === 'number' && v > 0 ? v : undefined;
}

export function resolveModelForRole(config: VibeflowConfig, roleId: string, override?: string): string {
  if (override) return override;
  const role = config.roles[roleId];
  if (!role) throw new Error(`配置中未定义角色: ${roleId}`);
  if (!role.default_model) throw new Error(`角色 ${roleId} 没有 default_model`);
  return role.default_model;
}
