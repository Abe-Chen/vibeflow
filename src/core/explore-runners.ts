import path from 'node:path';
import fs from 'fs-extra';
import { readRunState, writeRunState } from './run.js';
import { loadConfig, resolveStageTimeout } from './config.js';
import { pickFeature } from './stage-runner.js';
import {
  ensureExploreState,
  isFinalPlanLocked,
  allocateArtifact,
  commitReadyArtifact,
  registerFailure,
} from './explore-state.js';
import { resolveInputs, ResolvedInput } from './explore-input.js';
import { buildAdapterMap } from '../adapters/registry.js';
import { ensureOutputWritten } from './output-artifact.js';
import { getFeatureDir } from '../utils/paths.js';

async function readRequirement(featureDir: string): Promise<string> {
  try {
    return (await fs.readFile(path.join(featureDir, '00_requirement.md'), 'utf8')).trim();
  } catch {
    return '';
  }
}

function formatInputs(resolved: ResolvedInput[]): string {
  return resolved.map((r) => `### ${r.label}\n\`\`\`\n${r.content}\n\`\`\``).join('\n\n');
}

const CONSULT_PROMPT = (req: string, inputs: string, question: string): string =>
  `你是资深技术评审专家。请基于需求与给定材料，回答用户的问题，给出专业、具体、可执行的看法。用中文，直接输出分析与建议，不要客套前言。

## 需求
${req || '(无)'}

## 待咨询材料
${inputs}

## 用户问题
${question}
`;

const SYNTHESIS_PROMPT = (req: string, inputs: string, preference: string): string =>
  `你是资深方案架构师。请把下面多份方案融合为一版更完整的技术方案：吸收各自优点、消除冲突、补齐缺口，保持可据以编码。用中文，直接输出融合后的完整方案（Markdown），不要客套前言。

## 需求
${req || '(无)'}

## 待融合方案
${inputs}

## 用户偏好
${preference || '(无特别偏好)'}
`;

interface SingleExploreParams {
  projectRoot: string;
  feature?: string;
  model: string;
  kind: 'consult' | 'synthesis';
  inputs: string[];
  buildPrompt: (req: string, inputsText: string) => string;
}

/**
 * consult / synthesize 共享的单模型探索 runner：
 * 校验未锁定 → 安全解析输入（脱敏）→ 内置模板拼 prompt → 单模型调用 → 产物落 explore/ → 登记。
 * 失败只写 explore.failures、不影响正式 plan 状态（设计 §M1）。
 */
async function runSingleExplore(p: SingleExploreParams): Promise<{ featureName: string; artifactId: string; file: string }> {
  const config = await loadConfig(p.projectRoot);
  if (!config.models[p.model]) throw new Error(`模型未在 config.models 中定义: ${p.model}`);
  const featureName = await pickFeature(p.projectRoot, p.feature);
  const state = await readRunState(p.projectRoot, featureName);
  if (!state) throw new Error(`找不到 run.json: ${featureName}`);
  if (isFinalPlanLocked(state)) {
    throw new Error('方案已锁定，探索命令不可用。如需变更请用 vibeflow change-request');
  }
  const explore = ensureExploreState(state);
  const featureDir = getFeatureDir(p.projectRoot, featureName);

  const resolved = await resolveInputs(p.inputs, { projectRoot: p.projectRoot, featureDir, explore });
  const req = await readRequirement(featureDir);
  const prompt = p.buildPrompt(req, formatInputs(resolved));

  const adapter = buildAdapterMap(config).get(p.model);
  if (!adapter) throw new Error(`找不到模型适配器: ${p.model}`);

  const alloc = allocateArtifact(explore, p.kind, p.model);
  const outputPath = path.join(featureDir, alloc.file);

  let ok = false;
  let errMsg = '';
  try {
    const result = await adapter.run({
      runId: state.run_id,
      featureName,
      stageId: p.kind,
      roleId: p.kind,
      modelId: adapter.id,
      projectRoot: p.projectRoot,
      prompt,
      outputPath,
      invokeMode: 'spawn',
      timeoutMs: resolveStageTimeout(config, 'plan'),
      writeAccess: false,
    });
    if (result.status !== 'success') throw new Error(result.error ?? `调用失败（${result.status}）`);
    ok = await ensureOutputWritten(outputPath, result);
    if (!ok) throw new Error('模型调用成功但无产物输出');
  } catch (e) {
    errMsg = (e as Error).message;
  }

  if (ok) {
    commitReadyArtifact(explore, { id: alloc.id, kind: p.kind, model: p.model, file: alloc.file, inputs: p.inputs });
    await writeRunState(p.projectRoot, featureName, state);
    return { featureName, artifactId: alloc.id, file: alloc.file };
  }
  registerFailure(explore, { kind: p.kind, model: p.model, error: errMsg });
  await writeRunState(p.projectRoot, featureName, state);
  throw new Error(`${p.kind} 失败：${errMsg}`);
}

export function runConsult(opts: {
  projectRoot: string;
  feature?: string;
  model: string;
  about: string[];
  question: string;
}): Promise<{ featureName: string; artifactId: string; file: string }> {
  return runSingleExplore({
    projectRoot: opts.projectRoot,
    feature: opts.feature,
    model: opts.model,
    kind: 'consult',
    inputs: opts.about,
    buildPrompt: (req, inputs) => CONSULT_PROMPT(req, inputs, opts.question),
  });
}

export function runSynthesize(opts: {
  projectRoot: string;
  feature?: string;
  model: string;
  base: string[];
  preference?: string;
}): Promise<{ featureName: string; artifactId: string; file: string }> {
  return runSingleExplore({
    projectRoot: opts.projectRoot,
    feature: opts.feature,
    model: opts.model,
    kind: 'synthesis',
    inputs: opts.base,
    buildPrompt: (req, inputs) => SYNTHESIS_PROMPT(req, inputs, opts.preference ?? ''),
  });
}
