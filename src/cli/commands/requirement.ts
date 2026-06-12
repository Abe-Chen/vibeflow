import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import fs from 'fs-extra';
import { log } from '../../utils/logger.js';
import { runStage, pickFeature } from '../../core/stage-runner.js';
import { InvokeMode } from '../../adapters/types.js';
import { getFeatureDir, isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';

const REQUIREMENT_ARTIFACT = '00_requirement.md';
const PLACEHOLDER_RE = /由 vibeflow new 占位生成/;
const EDIT_GUIDE_PREFIX = '# vibeflow-edit:';

interface RequirementOptions {
  feature?: string;
  model?: string;
  message?: string;
  fromFile?: string;
  edit?: boolean;
  export?: boolean;
  yes?: boolean;
  chain?: boolean;
  force?: boolean;
}

/** 去掉编辑器引导注释行，返回正文 */
function stripEditGuide(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith(EDIT_GUIDE_PREFIX))
    .join('\n')
    .trim();
}

/** 打开 $EDITOR 让用户撰写需求，返回正文（取消/空则返回 undefined） */
async function composeViaEditor(initial: string): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.error('--edit 需要交互式终端（当前是非 TTY，无法打开编辑器）');
    return undefined;
  }
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const tmpFile = path.join(os.tmpdir(), `vibeflow-requirement-${Date.now()}.md`);
  const guide = [
    `${EDIT_GUIDE_PREFIX} 在此撰写你的原始需求，保存退出后会作为 requirement 阶段的输入。`,
    `${EDIT_GUIDE_PREFIX} 以 "${EDIT_GUIDE_PREFIX}" 开头的行会被忽略。内容为空则取消。`,
    '',
  ].join('\n');
  await fs.writeFile(tmpFile, (initial ? initial + '\n' : '') + guide, 'utf8');

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [tmpFile], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', () => resolve());
    });
    const raw = await fs.readFile(tmpFile, 'utf8');
    const body = stripEditGuide(raw);
    return body.length ? body : undefined;
  } finally {
    await fs.remove(tmpFile).catch(() => {});
  }
}

/** 读取已有的 requirement 产物正文；占位/不存在返回 undefined */
async function readExistingArtifact(projectRoot: string, feature: string): Promise<string | undefined> {
  const file = path.join(getFeatureDir(projectRoot, feature), REQUIREMENT_ARTIFACT);
  if (!(await fs.pathExists(file))) return undefined;
  const content = (await fs.readFile(file, 'utf8')).trim();
  if (!content || PLACEHOLDER_RE.test(content)) return undefined;
  return content;
}

/**
 * 解析 requirement 阶段的用户输入。优先级：
 *   --from-file > --edit > -m/--message > 自动检测已有 00_requirement.md 正文
 */
async function resolveUserInput(
  opts: RequirementOptions,
  projectRoot: string,
): Promise<string | undefined> {
  if (opts.fromFile) {
    const file = path.resolve(projectRoot, opts.fromFile);
    if (!(await fs.pathExists(file))) {
      log.error(`--from-file 指定的文件不存在: ${file}`);
      return undefined;
    }
    const text = (await fs.readFile(file, 'utf8')).trim();
    if (!text) {
      log.error(`--from-file 文件内容为空: ${file}`);
      return undefined;
    }
    log.step(`从文件读入需求: ${path.relative(projectRoot, file)} (${text.length} 字符)`);
    return text;
  }

  if (opts.edit) {
    // 编辑器预填：若已有非占位产物，带入便于在原文上修改
    let initial = '';
    try {
      const feature = await pickFeature(projectRoot, opts.feature);
      initial = (await readExistingArtifact(projectRoot, feature)) ?? '';
    } catch {
      /* 没有唯一任务也没关系，从空白开始 */
    }
    return composeViaEditor(initial);
  }

  if (opts.message) return opts.message;

  // 自动检测：用户可能已把原始需求直接写进了 00_requirement.md
  try {
    const feature = await pickFeature(projectRoot, opts.feature);
    const existing = await readExistingArtifact(projectRoot, feature);
    if (existing) {
      log.step(`检测到已有需求产物 ${REQUIREMENT_ARTIFACT}（${existing.length} 字符），用作本次输入`);
      return existing;
    }
  } catch {
    /* 无法确定唯一任务，落到下方报错 */
  }

  return undefined;
}

export async function runRequirement(opts: RequirementOptions): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目，请先运行 vibeflow init');
    process.exitCode = 1;
    return;
  }

  const userInput = await resolveUserInput(opts, projectRoot);
  if (!userInput) {
    log.error('未获得需求内容。请用以下任一方式提供：');
    log.hint('  -m "<需求描述>"            直接传入');
    log.hint('  --from-file <path>         从文件读入');
    log.hint('  --edit                     打开编辑器撰写');
    log.hint(`  或先把需求写进任务的 ${REQUIREMENT_ARTIFACT}，再直接运行 vibeflow requirement`);
    process.exitCode = 1;
    return;
  }

  const invokeMode: InvokeMode | undefined = opts.export ? 'export' : undefined;

  try {
    await runStage({
      stageId: 'requirement',
      feature: opts.feature,
      modelOverride: opts.model,
      invokeMode,
      userVariables: {
        user_input: userInput,
      },
      yes: opts.yes,
      noChain: opts.chain === false,
      force: opts.force,
    });
  } catch (err) {
    log.error((err as Error).message);
    process.exitCode = 1;
  }
}

export function registerRequirementCommand(program: Command): void {
  program
    .command('requirement')
    .description('整理用户需求，生成 00_requirement.md（默认走 Product Analyst 角色配置的模型）')
    .option('-f, --feature <name>', '指定任务（默认选择唯一进行中的任务）')
    .option('-m, --message <text>', '用户的原始需求描述')
    .option('-F, --from-file <path>', '从文件读入需求正文（相对路径基于项目根）')
    .option('--edit', '打开 $EDITOR 撰写需求（已有产物会预填）')
    .option('--model <id>', '覆盖角色配置的默认模型')
    .option('--export', '改用 export 兜底模式：只生成 prompt 文件，不调 CLI')
    .option('-y, --yes', '需求阶段完成后会触发 human_gate，本选项暂不影响（需求阶段不 chain）')
    .option('--no-chain', '完成后不自动 chain（requirement 阶段本身就是 human_gate，本选项一般不需要）')
    .option('--force', '强制重跑已完成的需求阶段（会把其后已完成阶段重置为待执行）')
    .action(async (opts: RequirementOptions) => {
      await runRequirement(opts);
    });
}
