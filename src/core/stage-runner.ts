import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { log } from '../utils/logger.js';
import { getFeatureDir, isVibeflowProject, resolveProjectRoot } from '../utils/paths.js';
import { loadConfig, resolveModelForRole, resolveStageTimeout, VibeflowConfig } from './config.js';
import { listFeatures, readRunState, writeRunState, StageState, RunState } from './run.js';
import { STAGE_OUTPUT_FILENAME, buildContext } from './context.js';
import { ensureOutputWritten } from './output-artifact.js';
import { buildAdapterMap } from '../adapters/registry.js';
import { AgentRunResult, InvokeMode } from '../adapters/types.js';
import { advanceCurrentStage } from './advance.js';
import { isGitRepo } from '../utils/git.js';
import prompts from 'prompts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface RunStageOptions {
  stageId: string;
  feature?: string;
  modelOverride?: string;
  invokeMode?: InvokeMode;
  /** 用户传入的额外变量，例如 requirement 阶段的 user_input */
  userVariables?: Record<string, string>;
  /** 全部交互回答 yes，自动 chain 到下一阶段（用于脚本/CI） */
  yes?: boolean;
  /** 完成后既不询问也不 chain，停在当前阶段（旧行为，调试时用） */
  noChain?: boolean;
  /** 进入开发类阶段前要求 final_plan 不是占位（MVP 软门禁） */
  requireLockedPlan?: boolean;
  /** 必须满足"评审者与开发者不同模型"的约束 */
  requireDifferentFromDeveloper?: boolean;
  /** 强制重跑已完成的阶段（并级联把其后已完成阶段重置为待执行） */
  force?: boolean;
  /** 内部：当前 chain 深度，防止无限递归 */
  _chainDepth?: number;
}

const MAX_CHAIN_DEPTH = 15;

export interface StageRunOutcome {
  feature: string;
  stage: StageState;
  result: AgentRunResult;
  outputWritten: boolean;
}

export async function pickFeature(projectRoot: string, explicit?: string, stageId?: string): Promise<string> {
  if (explicit) return explicit;
  const features = await listFeatures(projectRoot);
  if (features.length === 0) {
    throw new Error('当前项目没有任何任务，请先运行 vibeflow new "<需求名>"');
  }
  const activeFeatures: string[] = [];
  for (const name of features) {
    const state = await readRunState(projectRoot, name);
    if (!state) continue;
    const isActive = state.status === 'created' || state.status === 'in_progress' || state.status === 'blocked';
    // delivered 是软终态：仅在续接 develop 时才把它视为可选任务（其他阶段不自动选中已交付任务）
    const isResumableDelivered = stageId === 'develop' && state.status === 'delivered';
    if (isActive || isResumableDelivered) {
      activeFeatures.push(name);
    }
  }
  if (activeFeatures.length === 1) return activeFeatures[0];
  if (activeFeatures.length === 0) {
    throw new Error('没有进行中的任务，请用 --feature 指定，或运行 vibeflow new');
  }
  throw new Error(
    `检测到多个进行中的任务，请用 --feature 指定其中之一:\n  ${activeFeatures.join(', ')}`,
  );
}

function findStage(state: RunState, stageId: string): StageState {
  const stage = state.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new Error(
      `当前工作流 (${state.workflow}) 不包含阶段 ${stageId}\n实际阶段顺序: ${state.stages.map((s) => s.id).join(' → ')}`,
    );
  }
  return stage;
}

function validateStageOrder(state: RunState, stageId: string): void {
  const idx = state.stages.findIndex((s) => s.id === stageId);
  if (idx === -1) throw new Error(`阶段未找到: ${stageId}`);
  for (let i = 0; i < idx; i += 1) {
    const prev = state.stages[i];
    if (prev.status === 'completed' || prev.status === 'skipped') continue;
    throw new Error(
      `前置阶段 ${prev.id} 尚未完成 (status=${prev.status})。请先执行 vibeflow ${prev.id.replace(/_/g, '-')}`,
    );
  }
}

function summarizeStdout(text: string, max = 6): string {
  const lines = text.trim().split('\n');
  if (lines.length <= max) return text.trim();
  return lines.slice(0, max).join('\n') + `\n... (省略 ${lines.length - max} 行)`;
}

// ensureOutputWritten / isPlaceholderFile 已抽取到 ./output-artifact.ts，供普通阶段与探索 runner 复用

/**
 * 检查 develop / fix 阶段后，代码是否真的落盘了。
 * - 优先用 git diff：检查 app/src/ / src/ / lib/ 等代码目录是否有未提交修改
 * - 非 git 仓库时：fallback 用"`.ai-dev/` 和 `docs/ai-workflow/` 之外的文件最近 5 分钟内有修改"
 *
 * 这是 v0.1 的软门禁，防止 develop/fix 阶段 AI 输出 patch 文本但未实际写入文件，
 * 仍被误判为成功（导致 B1 反复出现）。
 */
async function checkCodeChangeApplied(
  projectRoot: string,
): Promise<{ applied: boolean; reason: string; summary?: string }> {
  const isGit = await isGitRepo(projectRoot);

  if (isGit) {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', projectRoot, 'status', '--porcelain'],
        { timeout: 10000 },
      );
      // 过滤掉 .ai-dev/ 和 docs/ai-workflow/ 下的变更——它们是 vibeflow 自己产物
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => {
          const filePart = l.slice(3).trim();
          // 排除 vibeflow 自己生成的文件，避免误判为"代码已落盘"
          return !filePart.startsWith('.ai-dev/')
            && !filePart.startsWith('docs/ai-workflow/')
            && filePart !== 'CLAUDE.md'
            && filePart !== 'AGENTS.md'
            && filePart !== 'docs/';
        });
      if (lines.length === 0) {
        return {
          applied: false,
          reason: '`git status` 中 `.ai-dev/` 和 `docs/ai-workflow/` 之外没有任何修改',
        };
      }
      return {
        applied: true,
        reason: '',
        summary: `${lines.length} 个文件有变更：${lines.slice(0, 3).map((l) => l.slice(3).trim()).join(', ')}${lines.length > 3 ? ' …' : ''}`,
      };
    } catch {
      // git 命令失败，fallback 走 mtime 检测
    }
  }

  // 非 git 仓库 或 git 命令失败 → 用 mtime 兜底
  return await checkRecentFileModification(projectRoot);
}

async function checkRecentFileModification(
  projectRoot: string,
): Promise<{ applied: boolean; reason: string; summary?: string }> {
  const recentMs = 5 * 60 * 1000; // 5 分钟内修改的文件视为"刚刚改过"
  const now = Date.now();
  const skipDirs = new Set(['node_modules', '.git', 'build', 'dist', '.ai-dev', '.dart_tool']);

  async function walk(dir: string, depth: number): Promise<string[]> {
    if (depth > 4) return [];
    const recent: string[] = [];
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full.includes('docs/ai-workflow')) continue;
        const sub = await walk(full, depth + 1);
        recent.push(...sub);
        if (recent.length > 10) return recent;
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          if (now - stat.mtimeMs < recentMs) {
            recent.push(path.relative(projectRoot, full));
          }
        } catch { /* skip */ }
      }
    }
    return recent;
  }

  const recent = await walk(projectRoot, 0);
  if (recent.length === 0) {
    return {
      applied: false,
      reason: '过去 5 分钟内 `.ai-dev/` 和 `docs/ai-workflow/` 之外没有任何文件被修改（非 git 仓库，用 mtime 检测）',
    };
  }
  return {
    applied: true,
    reason: '',
    summary: `过去 5 分钟内 ${recent.length} 个文件被修改：${recent.slice(0, 3).join(', ')}${recent.length > 3 ? ' …' : ''}`,
  };
}

/**
 * P0-2: develop/fix 落盘后自动跑 build 验证编译。
 * codex 在 spawn 沙箱里编译不了目标项目，对不确定的三方 API 会臆测签名导致编译失败；
 * 这里在落盘后跑一次 config.commands.build，把编译错误回灌给用户/后续阶段。
 * 返回 null = 未配置 build（跳过）；否则返回是否通过 + 错误摘要。
 */
async function runBuildCheck(
  projectRoot: string,
  buildCommands: string[] | undefined,
): Promise<{ passed: boolean; output: string } | null> {
  const cmds = (buildCommands ?? []).filter((c) => c && c.trim());
  if (cmds.length === 0) return null;

  for (const cmd of cmds) {
    try {
      const { stdout, stderr } = await execFileAsync('sh', ['-c', cmd], {
        cwd: projectRoot,
        timeout: 5 * 60 * 1000,
        maxBuffer: 2 * 1024 * 1024,
      });
      // 命令成功（exit 0）→ 继续下一条
      void stdout; void stderr;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const out = `${e.stderr ?? ''}\n${e.stdout ?? ''}`.trim() || e.message || '构建失败';
      // 取尾部（编译错误通常在末尾）
      const tail = out.length > 1500 ? '…\n' + out.slice(-1500) : out;
      return { passed: false, output: `$ ${cmd}\n${tail}` };
    }
  }
  return { passed: true, output: '' };
}

/**
 * #54: 阶段开始前提醒未配置的项目命令。
 * - test 阶段：commands.test 为空时，AI 没有实际可跑的测试命令，验收只能靠人肉/口述，价值大打折扣。
 * - develop / fix 阶段：commands.build / lint 为空时给出软提示，便于做编译/静态检查自检。
 * 仅提醒，不阻断执行。
 */
function warnMissingProjectCommands(config: VibeflowConfig, stageId: string): void {
  const cmds = config.commands ?? {};
  const isEmpty = (arr?: string[]) => !arr || arr.length === 0;

  if (stageId === 'test' && isEmpty(cmds.test)) {
    log.warn('config.yaml 的 commands.test 为空，test 阶段没有可执行的测试命令。');
    log.hint('建议在 .ai-dev/config.yaml 配置，例如：');
    log.hint('  commands:');
    log.hint('    test: ["npm test"]   # 或 flutter test / pytest 等');
    log.hint('未配置时 test 阶段只能依赖人工/AI 口述验收，无法实际运行测试。');
    return;
  }

  if ((stageId === 'develop' || stageId === 'fix')) {
    const missing: string[] = [];
    if (isEmpty(cmds.build)) missing.push('build');
    if (isEmpty(cmds.lint)) missing.push('lint');
    if (missing.length) {
      log.hint(`提示：config.yaml 的 commands.${missing.join(' / commands.')} 为空，${stageId} 阶段无法做编译/静态检查自检（仅提示，不影响执行）。`);
    }
  }
}

export async function runStage(opts: RunStageOptions): Promise<StageRunOutcome> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    throw new Error('当前目录不是 vibeflow 项目，请先运行 vibeflow init');
  }

  const config = await loadConfig(projectRoot);
  const featureName = await pickFeature(projectRoot, opts.feature, opts.stageId);
  const state = await readRunState(projectRoot, featureName);
  if (!state) throw new Error(`找不到 run.json: ${featureName}`);

  const stage = findStage(state, opts.stageId);

  if (stage.status === 'completed') {
    if (!opts.force) {
      log.warn(`阶段 ${opts.stageId} 已完成。如需重做，加 --force 重跑。`);
      log.hint('--force 会重新执行本阶段，并把其后已完成的阶段重置为待执行（它们的输入已过时，需要重跑）。');
      return { feature: featureName, stage, result: { status: 'cancelled', modelId: stage.model ?? '', invokeMode: opts.invokeMode ?? 'spawn', durationMs: 0 }, outputWritten: false };
    }
    // --force 重跑：清掉本阶段旧的完成痕迹，并级联把其后"已完成"的阶段重置为 pending。
    // 只重置 completed（不动用户主动 skipped 的阶段，尊重其跳过意图）。
    const stageIdx = state.stages.findIndex((s) => s.id === opts.stageId);
    const downstreamDone = state.stages.slice(stageIdx + 1).filter((s) => s.status === 'completed');
    for (const s of downstreamDone) {
      s.status = 'pending';
      s.completed_at = undefined;
      s.notes = undefined;
    }
    stage.completed_at = undefined;
    stage.notes = undefined;
    // 任务若已收尾（done），重新打开为进行中（delivered 由下方统一处理）
    if (state.status === 'done') state.status = 'in_progress';
    if (downstreamDone.length) {
      log.warn(`--force 重跑 ${opts.stageId}：已把其后 ${downstreamDone.length} 个已完成阶段重置为待执行（${downstreamDone.map((s) => s.id).join(' → ')}）。`);
    } else {
      log.info(`--force 重跑 ${opts.stageId}。`);
    }
  }

  validateStageOrder(state, opts.stageId);

  if (opts.requireLockedPlan) {
    const finalPlanPath = path.join(getFeatureDir(projectRoot, featureName), '03_final_plan.md');
    if (!(await fs.pathExists(finalPlanPath))) {
      throw new Error('final_plan.md 不存在，请先完成 finalize 阶段');
    }
    const content = await fs.readFile(finalPlanPath, 'utf8');
    if (/由 vibeflow new 占位生成/.test(content) || content.trim().length < 50) {
      throw new Error('final_plan.md 仍是占位/空内容，请先运行 vibeflow finalize 并确认锁定（vibeflow advance）');
    }
    const finalizeStage = state.stages.find((s) => s.id === 'finalize');
    if (finalizeStage && finalizeStage.status !== 'completed') {
      throw new Error('finalize 阶段尚未完成（human_gate 未确认），请先运行 vibeflow advance');
    }
  }

  const modelId = resolveModelForRole(config, stage.role, opts.modelOverride);

  if (opts.requireDifferentFromDeveloper) {
    const developerStage = state.stages.find((s) => s.id === 'develop');
    const developerModel = developerStage?.model
      ?? resolveModelForRole(config, 'developer');
    if (developerModel && developerModel === modelId) {
      throw new Error(
        `角色 ${stage.role} 默认模型 ${modelId} 与 developer 相同。配置 must_be_different_from_developer 要求评审者与开发者使用不同模型。请用 --model 显式指定`,
      );
    }
  }
  const adapters = buildAdapterMap(config);
  const adapter = adapters.get(opts.invokeMode === 'export' ? 'export' : modelId)
    ?? adapters.get(modelId);
  if (!adapter) {
    throw new Error(`找不到模型适配器: ${modelId}`);
  }

  const outputFileName = STAGE_OUTPUT_FILENAME[opts.stageId];
  if (!outputFileName) throw new Error(`阶段 ${opts.stageId} 没有定义输出文件名`);
  const outputPath = path.join(getFeatureDir(projectRoot, featureName), outputFileName);

  const ctx = await buildContext({
    projectRoot,
    config,
    featureName,
    stageId: opts.stageId,
    outputPath,
    variables: opts.userVariables,
  });

  const stageTimeoutMs = resolveStageTimeout(config, opts.stageId);

  log.title(`vibeflow ${opts.stageId}: ${featureName}`);
  log.step(`角色: ${stage.role}  模型: ${chalk.cyan(modelId)}${opts.invokeMode === 'export' ? chalk.yellow(' [export]') : ''}`);
  log.step(`产物: ${path.relative(projectRoot, outputPath)}`);
  if (stageTimeoutMs) {
    log.step(`超时: ${Math.round(stageTimeoutMs / 1000)}s（阶段级配置 stage_timeouts.${opts.stageId}）`);
  }
  if (ctx.referencedFiles.length) {
    log.step(`引用文件: ${ctx.referencedFiles.join(', ')}`);
  }
  if (ctx.missingVariables.length) {
    log.warn(`Prompt 中存在未填充变量: ${ctx.missingVariables.join(', ')}（可能是阶段还没到/用户未提供）`);
  }

  // #54: 提醒未配置的项目命令。
  // test 阶段依赖 commands.test 才能真正跑测试；develop/fix 阶段缺 build/lint 也会影响自检。
  warnMissingProjectCommands(config, opts.stageId);

  stage.status = 'in_progress';
  stage.model = modelId;
  stage.started_at = new Date().toISOString();
  // created 或 delivered（续接开发）→ in_progress；delivered 时保留 meta.delivered_at 不删
  if (state.status === 'created' || state.status === 'delivered') state.status = 'in_progress';
  state.current_stage = opts.stageId;
  await writeRunState(projectRoot, featureName, state);

  const result = await adapter.run({
    runId: state.run_id,
    featureName,
    stageId: opts.stageId,
    roleId: stage.role,
    modelId: adapter.id,
    projectRoot,
    prompt: ctx.prompt,
    outputPath,
    invokeMode: opts.invokeMode ?? 'spawn',
    timeoutMs: stageTimeoutMs,
    // develop/fix 阶段允许 AI 直接写文件落盘；其他阶段只读（更安全）
    writeAccess: opts.stageId === 'develop' || opts.stageId === 'fix',
  });

  let outputWritten = false;

  switch (result.status) {
    case 'success': {
      outputWritten = await ensureOutputWritten(outputPath, result);
      if (!outputWritten) {
        stage.status = 'blocked';
        stage.notes = '模型未输出任何内容到 stdout 或产物文件';
        log.warn('调用成功但没拿到产物：请检查 stdout 与 outputPath，或换用 export 模式');
        break;
      }

      // 软门禁：develop / fix 阶段必须 git diff 非空，否则视为"假完成"
      // （已给 AI 授予写权限，但若它仍只输出 patch 文本而没真改文件，会被这里拦下）
      const isCodeStage = opts.stageId === 'develop' || opts.stageId === 'fix';
      if (isCodeStage) {
        const diffCheck = await checkCodeChangeApplied(projectRoot);
        if (!diffCheck.applied) {
          stage.status = 'blocked';
          stage.notes = `产物已生成但代码未落盘：${diffCheck.reason}`;
          log.success(`产物已写入: ${path.relative(projectRoot, outputPath)}`);
          log.warn(`⚠️ 检测到代码未落盘：${diffCheck.reason}`);
          log.hint('本阶段已给模型授予写权限，但未检测到代码改动——可能模型仍只输出了 patch、或改动落在被忽略的目录。');
          log.hint(`建议：重跑 vibeflow ${opts.stageId} 让模型直接改文件；或手动 apply 报告里的改动后再：`);
          log.hint(`  vibeflow advance --feature ${featureName}    # 确认已落盘，推进到下一阶段`);
          if (result.stdoutText) {
            log.hint('stdout 摘要:');
            for (const line of summarizeStdout(result.stdoutText).split('\n')) console.log('    ' + chalk.gray(line));
          }
          break;
        }
        log.success(`代码落盘检测：${diffCheck.summary}`);

        // P0-2: 落盘后跑 build 验证编译（配了 commands.build 才跑）
        const buildResult = await runBuildCheck(projectRoot, config.commands?.build);
        if (buildResult && !buildResult.passed) {
          stage.status = 'blocked';
          stage.notes = `代码已落盘但构建失败（commands.build）。需修复编译错误后再推进。`;
          log.success(`产物已写入: ${path.relative(projectRoot, outputPath)}`);
          log.error('⚠️ 代码已落盘，但 commands.build 构建失败：');
          for (const line of buildResult.output.split('\n')) console.log('    ' + chalk.gray(line));
          log.hint(`常见原因：模型臆测了三方 API 签名/类型。请修复后：`);
          log.hint(`  重跑 vibeflow ${opts.stageId}（让模型据错误修正），或手动修复后 vibeflow advance --feature ${featureName}`);
          break;
        }
        if (buildResult?.passed) log.success('构建验证通过（commands.build）');
      }

      if (stage.human_gate) {
        stage.status = 'in_progress';
        stage.notes = '等待人工确认（human_gate）';
        log.success(`产物已写入: ${path.relative(projectRoot, outputPath)}`);
        log.warn(`阶段需要人工确认（human_gate），确认无误后运行: vibeflow advance --feature ${featureName}`);
      } else {
        stage.status = 'completed';
        stage.completed_at = new Date().toISOString();
        log.success(`产物已写入: ${path.relative(projectRoot, outputPath)}`);
      }
      if (result.stdoutText) {
        log.hint('stdout 摘要:');
        for (const line of summarizeStdout(result.stdoutText).split('\n')) console.log('    ' + chalk.gray(line));
      }
      break;
    }
    case 'exported': {
      stage.status = 'in_progress';
      stage.notes = `已导出 prompt 到 ${result.promptFilePath}`;
      log.info('已切换到 export 模式');
      if (result.hint) for (const line of result.hint.split('\n')) log.hint(line);
      break;
    }
    case 'timeout': {
      // P0-1 超时保护：develop/fix 阶段超时被 kill 时，模型可能已落盘部分代码。
      // 先检测落盘，有产出则标 blocked（保留成果、提示 review），不要当彻底失败丢弃。
      const isCodeStage = opts.stageId === 'develop' || opts.stageId === 'fix';
      if (isCodeStage) {
        const diffCheck = await checkCodeChangeApplied(projectRoot);
        if (diffCheck.applied) {
          stage.status = 'blocked';
          stage.notes = `调用超时，但已检测到代码落盘（${diffCheck.summary}）。超时前模型可能已完成部分/全部改动，请 review 后再决定。`;
          log.warn(`⚠️ 调用超时（${result.error}），但检测到代码已落盘：${diffCheck.summary}`);
          log.hint('超时不代表没产出——模型在被中断前可能已改了文件。请：');
          log.hint(`  1) git diff 查看已落盘的改动是否完整/可用`);
          log.hint(`  2) 完整可用 → vibeflow advance --feature ${featureName}（推进到下一阶段，让 code-review 把关）`);
          log.hint(`  3) 不完整 → 手动补全，或重跑 vibeflow ${opts.stageId}（注意会基于当前已落盘状态继续）`);
          break;
        }
      }
      stage.status = 'failed';
      stage.notes = result.error ?? 'timeout';
      log.error(`调用超时: ${result.error}`);
      log.hint(`未检测到代码落盘。可调高 stage_timeouts.${opts.stageId} 后重跑，或拆小本阶段任务范围。`);
      break;
    }
    case 'failed': {
      stage.status = 'failed';
      stage.notes = result.error ?? `exit ${result.exitCode}`;
      log.error(`调用失败: ${stage.notes}`);
      if (result.stderrPath) log.hint(`查看 stderr: ${path.relative(projectRoot, result.stderrPath)}`);
      break;
    }
    case 'cancelled': {
      stage.status = 'pending';
      log.warn('已取消');
      break;
    }
  }

  await writeRunState(projectRoot, featureName, state);

  // 只有真正"完成"（非 human_gate、非 blocked、非 failed）才考虑 chain
  if (
    result.status === 'success' &&
    stage.status === 'completed' &&
    !opts.noChain
  ) {
    await maybeChainToNext({
      projectRoot,
      featureName,
      currentStageId: opts.stageId,
      opts,
    });
  }

  return { feature: featureName, stage, result, outputWritten };
}

interface ChainParams {
  projectRoot: string;
  featureName: string;
  currentStageId: string;
  opts: RunStageOptions;
}

async function maybeChainToNext(params: ChainParams): Promise<void> {
  const { projectRoot, featureName, currentStageId, opts } = params;

  const state = await readRunState(projectRoot, featureName);
  if (!state) return;

  const idx = state.stages.findIndex((s) => s.id === currentStageId);
  const next = state.stages.slice(idx + 1).find((s) => s.status === 'pending');

  if (!next) {
    // 所有阶段都完成了，标记任务为 done
    const allDone = state.stages.every((s) => s.status === 'completed' || s.status === 'skipped');
    if (allDone) {
      state.status = 'done';
      state.current_stage = null;
      await writeRunState(projectRoot, featureName, state);
      log.success(chalk.bold('🎉 全部阶段已完成'));
    }
    return;
  }

  const chainDepth = opts._chainDepth ?? 0;
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    log.warn(`已达到 chain 深度上限 (${MAX_CHAIN_DEPTH})，停下来。下一阶段: ${next.id}`);
    return;
  }

  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const shouldChain =
    opts.yes ? true :
    !isTTY ? false :
    await askChainConfirmation(next.id, next.role);

  if (!shouldChain) {
    log.hint(`已停下。继续时运行: vibeflow ${next.id.replace(/_/g, '-')}`);
    return;
  }

  log.title(`→ 自动进入下一阶段: ${next.id}`);

  // 递归调下一阶段。userVariables 不传递（每个阶段独立）。
  await runStage({
    stageId: next.id,
    feature: featureName,
    modelOverride: undefined,             // 不复用上一阶段的 model override
    invokeMode: opts.invokeMode,
    yes: opts.yes,
    noChain: opts.noChain,
    requireLockedPlan: next.id === 'develop',
    requireDifferentFromDeveloper: next.id === 'code_review',
    _chainDepth: chainDepth + 1,
  });
}

async function askChainConfirmation(nextStageId: string, nextRole: string): Promise<boolean> {
  console.log('');
  const answer = await prompts({
    type: 'select',
    name: 'choice',
    message: `继续进入下一阶段 ${chalk.cyan(nextStageId)} (role: ${nextRole}) ？`,
    choices: [
      { title: 'Y - 继续，自动进入下一阶段', value: 'yes' },
      { title: 'n - 停下，我先看看产物', value: 'no' },
    ],
    initial: 0,
  });
  return answer.choice === 'yes';
}
