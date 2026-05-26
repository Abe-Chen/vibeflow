import path from 'node:path';
import fs from 'fs-extra';
import { getFeatureDir, getVibeflowDir } from '../utils/paths.js';
import { loadProfileForInjection } from '../utils/profile.js';
import { VibeflowConfig } from './config.js';

export interface BuildContextOptions {
  projectRoot: string;
  config: VibeflowConfig;
  featureName: string;
  stageId: string;
  /** 模型产物期望写入的绝对路径 */
  outputPath: string;
  /** 调用方传入的额外变量，会覆盖自动注入的同名变量 */
  variables?: Record<string, string>;
}

export interface BuiltContext {
  prompt: string;
  template: string;
  variables: Record<string, string>;
  referencedFiles: string[];
  missingVariables: string[];
}

/**
 * 每个阶段需要哪些上下文变量。
 * `*_file` 后缀的占位符注入相对项目根的路径（Agent 自己 cat 读）。
 * 其他占位符注入文本内容。
 */
const STAGE_CONTEXT_KEYS: Record<string, string[]> = {
  requirement: ['user_input', 'project_overview', 'product_rules', 'output_path'],
  plan: ['requirement_file', 'human_decisions_file', 'project_rules', 'related_paths', 'output_path'],
  plan_review: ['requirement_file', 'plan_file', 'project_rules', 'output_path'],
  finalize: ['requirement_file', 'plan_file', 'review_file', 'human_decisions_file', 'output_path'],
  develop: ['final_plan_file', 'human_decisions_file', 'project_rules', 'output_path'],
  code_review: ['final_plan_file', 'implementation_report_file', 'diff_summary', 'project_rules', 'output_path'],
  fix: ['final_plan_file', 'code_review_file', 'project_rules', 'output_path'],
  test: ['final_plan_file', 'implementation_report_file', 'fix_report_file', 'test_commands', 'output_path'],
  archive: ['final_plan_file', 'implementation_report_file', 'test_report_file', 'output_path'],
  handoff: ['final_plan_file', 'implementation_report_file', 'output_path'],
};

const STAGE_TO_PROMPT_FILE: Record<string, string> = {
  requirement: 'requirement.md',
  plan: 'plan.md',
  plan_review: 'plan_review.md',
  finalize: 'finalize.md',
  develop: 'develop.md',
  code_review: 'code_review.md',
  fix: 'fix.md',
  test: 'test.md',
  archive: 'archive.md',
  handoff: 'handoff.md',
};

/** 阶段产物文件名约定 */
export const STAGE_OUTPUT_FILENAME: Record<string, string> = {
  requirement: '00_requirement.md',
  plan: '01_plan_v1.md',
  plan_review: '02_plan_review.md',
  finalize: '03_final_plan.md',
  develop: '05_implementation_report.md',
  code_review: '06_code_review.md',
  fix: '07_fix_report.md',
  test: '08_test_report.md',
  archive: '09_release_note.md',
  handoff: 'handoff.md',
};

async function readIfExists(file: string): Promise<string | null> {
  if (!(await fs.pathExists(file))) return null;
  return fs.readFile(file, 'utf8');
}

/** 由 vibeflow new 生成的产物占位文件不算"真实引用"。 */
async function isPlaceholderArtifact(file: string): Promise<boolean> {
  if (!(await fs.pathExists(file))) return false;
  try {
    const content = await fs.readFile(file, 'utf8');
    return /由 vibeflow new 占位生成/.test(content);
  } catch {
    return false;
  }
}

function relFromRoot(projectRoot: string, abs: string): string {
  return path.relative(projectRoot, abs) || abs;
}

async function loadProjectOverview(config: VibeflowConfig, projectRoot: string): Promise<string> {
  const lines: string[] = [];
  if (config.project.name) lines.push(`项目: ${config.project.name}`);
  if (config.project.language) lines.push(`语言: ${config.project.language}`);
  if (config.project.package_manager) lines.push(`包管理器: ${config.project.package_manager}`);
  lines.push(`项目根目录: ${projectRoot}`);
  return lines.join('\n');
}

async function loadRules(projectRoot: string, fileName: string): Promise<{ content: string; relPath: string } | null> {
  const abs = path.join(getVibeflowDir(projectRoot), 'rules', fileName);
  const content = await readIfExists(abs);
  if (content === null) return null;
  return { content, relPath: relFromRoot(projectRoot, abs) };
}

interface AutoVar {
  value: string;
  /** 此变量引用到的文件路径（用于审计） */
  referencedFiles?: string[];
}

async function buildAutoVariables(opts: BuildContextOptions): Promise<Record<string, AutoVar>> {
  const { projectRoot, config, featureName, outputPath } = opts;
  const featureDir = getFeatureDir(projectRoot, featureName);
  const result: Record<string, AutoVar> = {};

  // 1) 项目概述（文本）
  result.project_overview = { value: await loadProjectOverview(config, projectRoot) };

  // 2) 各类规则（文本注入）
  const projectRules = await loadRules(projectRoot, 'project_rules.md');
  const codingRules = await loadRules(projectRoot, 'coding_rules.md');
  const productRules = await loadRules(projectRoot, 'product_rules.md');

  const combinedRules = [projectRules, codingRules, productRules]
    .filter(Boolean)
    .map((r) => `## ${r!.relPath}\n\n${r!.content}`)
    .join('\n\n---\n\n');
  result.project_rules = {
    value: combinedRules || '(no project_rules.md / coding_rules.md / product_rules.md)',
    referencedFiles: [projectRules?.relPath, codingRules?.relPath, productRules?.relPath].filter(Boolean) as string[],
  };
  result.product_rules = {
    value: productRules?.content ?? '(no product_rules.md)',
    referencedFiles: productRules ? [productRules.relPath] : [],
  };
  result.coding_rules = {
    value: codingRules?.content ?? '(no coding_rules.md)',
    referencedFiles: codingRules ? [codingRules.relPath] : [],
  };

  // 3) 阶段产物的相对路径（让 Agent 自己读）
  const fileVars: Array<[string, string]> = [
    ['requirement_file', '00_requirement.md'],
    ['plan_file', '01_plan_v1.md'],
    ['review_file', '02_plan_review.md'],
    ['final_plan_file', '03_final_plan.md'],
    ['human_decisions_file', '04_human_decisions.md'],
    ['implementation_report_file', '05_implementation_report.md'],
    ['code_review_file', '06_code_review.md'],
    ['fix_report_file', '07_fix_report.md'],
    ['test_report_file', '08_test_report.md'],
  ];
  for (const [key, fileName] of fileVars) {
    const abs = path.join(featureDir, fileName);
    const exists = await fs.pathExists(abs);
    if (!exists) {
      result[key] = { value: `(${fileName} 尚未生成)`, referencedFiles: [] };
      continue;
    }
    const rel = relFromRoot(projectRoot, abs);
    const placeholder = await isPlaceholderArtifact(abs);
    if (placeholder) {
      result[key] = { value: `(${fileName} 尚未生成)`, referencedFiles: [] };
    } else {
      result[key] = { value: rel, referencedFiles: [rel] };
    }
  }

  // 4) 输出路径
  result.output_path = { value: relFromRoot(projectRoot, outputPath) };

  // 5) 相关目录与 diff（MVP 占位，后续由 Git Manager / Path Resolver 完善）
  result.related_paths = { value: '(尚未实现：后续将由 Path Resolver 自动列出相关代码目录)' };
  result.diff_summary = { value: '(尚未实现：后续将由 Git Manager 注入 diff)' };

  // 6) 测试命令
  result.test_commands = {
    value: (config.commands.test ?? []).join('\n') || '(config.yaml 中未配置 commands.test)',
  };

  return result;
}

function substitute(
  template: string,
  vars: Record<string, string>,
): { output: string; missing: string[] } {
  const missing: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const output = template.replace(re, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name];
    }
    missing.push(name);
    return `{{${name}}}`;
  });
  return { output, missing: Array.from(new Set(missing)) };
}

export async function buildContext(opts: BuildContextOptions): Promise<BuiltContext> {
  const promptFile = STAGE_TO_PROMPT_FILE[opts.stageId];
  if (!promptFile) {
    throw new Error(`未知阶段，无法构建上下文: ${opts.stageId}`);
  }

  const promptPath = path.join(getVibeflowDir(opts.projectRoot), 'prompts', promptFile);
  if (!(await fs.pathExists(promptPath))) {
    throw new Error(`找不到 prompt 模板: ${promptPath}（请重新运行 vibeflow init）`);
  }
  const template = await fs.readFile(promptPath, 'utf8');

  const autoVars = await buildAutoVariables(opts);

  const merged: Record<string, string> = {};
  const referencedFiles = new Set<string>();
  for (const [key, av] of Object.entries(autoVars)) {
    merged[key] = av.value;
    av.referencedFiles?.forEach((f) => referencedFiles.add(f));
  }
  if (opts.variables) {
    for (const [k, v] of Object.entries(opts.variables)) {
      merged[k] = v;
    }
  }

  const stageKeys = STAGE_CONTEXT_KEYS[opts.stageId] ?? [];
  for (const key of stageKeys) {
    if (!(key in merged)) {
      merged[key] = `{{${key}}}`;
    }
  }

  const { output, missing } = substitute(template, merged);

  // 全局用户偏好注入到 prompt 顶部（如果存在且非占位）
  const profileBlock = await loadProfileForInjection();
  const finalPrompt = profileBlock
    ? `${profileBlock}\n\n---\n\n${output}`
    : output;

  return {
    prompt: finalPrompt,
    template,
    variables: merged,
    referencedFiles: Array.from(referencedFiles),
    missingVariables: missing,
  };
}
