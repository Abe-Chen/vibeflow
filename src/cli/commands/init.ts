import { Command } from 'commander';
import path from 'node:path';
import fs from 'fs-extra';
import prompts from 'prompts';
import { log } from '../../utils/logger.js';
import { getVibeflowDir, getWorkflowDocsDir, isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { DEFAULT_CONFIG_YAML } from '../../templates/config.js';
import { STANDARD_FEATURE_WORKFLOW, QUICK_FIX_WORKFLOW, BUGFIX_WORKFLOW } from '../../templates/workflows.js';
import {
  REQUIREMENT_PROMPT,
  PLAN_PROMPT,
  PLAN_REVIEW_PROMPT,
  FINALIZE_PROMPT,
  DEVELOP_PROMPT,
  CODE_REVIEW_PROMPT,
  TEST_PROMPT,
  HANDOFF_PROMPT,
  ARCHIVE_PROMPT,
  FIX_PROMPT,
} from '../../templates/prompts.js';
import {
  PRODUCT_ANALYST_AGENT,
  PLANNER_AGENT,
  PLAN_REVIEWER_AGENT,
  FINALIZER_AGENT,
  DEVELOPER_AGENT,
  CODE_REVIEWER_AGENT,
  QA_AGENT,
} from '../../templates/agents.js';
import { PROJECT_RULES, CODING_RULES, PRODUCT_RULES } from '../../templates/rules.js';
import { CLAUDE_BRIDGE, AGENTS_BRIDGE } from '../../templates/bridges.js';
import { isGitRepo, isGitInstalled, initGitRepo, addCodexSkipGitCheck } from '../../utils/git.js';
import { commandExists, PACKAGE_MANAGER_BIN } from '../../core/ready-check.js';

interface InitOptions {
  force?: boolean;
  yes?: boolean;
  template?: string;
}

const FILES: Array<{ relPath: string; content: string }> = [
  { relPath: 'config.yaml', content: DEFAULT_CONFIG_YAML },

  { relPath: 'workflows/standard_feature.yaml', content: STANDARD_FEATURE_WORKFLOW },
  { relPath: 'workflows/quick_fix.yaml', content: QUICK_FIX_WORKFLOW },
  { relPath: 'workflows/bugfix.yaml', content: BUGFIX_WORKFLOW },

  { relPath: 'prompts/requirement.md', content: REQUIREMENT_PROMPT },
  { relPath: 'prompts/plan.md', content: PLAN_PROMPT },
  { relPath: 'prompts/plan_review.md', content: PLAN_REVIEW_PROMPT },
  { relPath: 'prompts/finalize.md', content: FINALIZE_PROMPT },
  { relPath: 'prompts/develop.md', content: DEVELOP_PROMPT },
  { relPath: 'prompts/code_review.md', content: CODE_REVIEW_PROMPT },
  { relPath: 'prompts/test.md', content: TEST_PROMPT },
  { relPath: 'prompts/handoff.md', content: HANDOFF_PROMPT },
  { relPath: 'prompts/archive.md', content: ARCHIVE_PROMPT },
  { relPath: 'prompts/fix.md', content: FIX_PROMPT },

  { relPath: 'agents/product_analyst.md', content: PRODUCT_ANALYST_AGENT },
  { relPath: 'agents/planner.md', content: PLANNER_AGENT },
  { relPath: 'agents/plan_reviewer.md', content: PLAN_REVIEWER_AGENT },
  { relPath: 'agents/finalizer.md', content: FINALIZER_AGENT },
  { relPath: 'agents/developer.md', content: DEVELOPER_AGENT },
  { relPath: 'agents/code_reviewer.md', content: CODE_REVIEWER_AGENT },
  { relPath: 'agents/qa.md', content: QA_AGENT },

  { relPath: 'rules/project_rules.md', content: PROJECT_RULES },
  { relPath: 'rules/coding_rules.md', content: CODING_RULES },
  { relPath: 'rules/product_rules.md', content: PRODUCT_RULES },
];

async function detectProjectMeta(projectRoot: string): Promise<{
  name: string;
  language: string;
  packageManager: string;
}> {
  const name = path.basename(projectRoot);
  let language = '';
  let packageManager = '';

  if (await fs.pathExists(path.join(projectRoot, 'package.json'))) {
    language = 'typescript/javascript';
    if (await fs.pathExists(path.join(projectRoot, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (await fs.pathExists(path.join(projectRoot, 'yarn.lock'))) packageManager = 'yarn';
    else packageManager = 'npm';
  } else if (await fs.pathExists(path.join(projectRoot, 'pubspec.yaml'))) {
    language = 'dart/flutter';
    packageManager = 'flutter';
  } else if (await fs.pathExists(path.join(projectRoot, 'pyproject.toml'))) {
    language = 'python';
    packageManager = 'poetry';
  } else if (await fs.pathExists(path.join(projectRoot, 'Cargo.toml'))) {
    language = 'rust';
    packageManager = 'cargo';
  } else if (await fs.pathExists(path.join(projectRoot, 'go.mod'))) {
    language = 'go';
    packageManager = 'go';
  } else if (
    (await fs.pathExists(path.join(projectRoot, 'build.gradle.kts'))) ||
    (await fs.pathExists(path.join(projectRoot, 'build.gradle'))) ||
    (await fs.pathExists(path.join(projectRoot, 'settings.gradle.kts'))) ||
    (await fs.pathExists(path.join(projectRoot, 'settings.gradle')))
  ) {
    // Android / Kotlin / Java（gradle 项目）
    const isKts =
      (await fs.pathExists(path.join(projectRoot, 'build.gradle.kts'))) ||
      (await fs.pathExists(path.join(projectRoot, 'settings.gradle.kts')));
    const isAndroid =
      (await fs.pathExists(path.join(projectRoot, 'app'))) ||
      (await fs.pathExists(path.join(projectRoot, 'AndroidManifest.xml')));
    language = isAndroid
      ? (isKts ? 'android/kotlin' : 'android/java')
      : (isKts ? 'kotlin' : 'java');
    packageManager = 'gradle';
  } else if (await fs.pathExists(path.join(projectRoot, 'pom.xml'))) {
    language = 'java';
    packageManager = 'maven';
  } else if (
    (await fs.pathExists(path.join(projectRoot, 'Package.swift'))) ||
    (await fs.pathExists(path.join(projectRoot, 'Podfile')))
  ) {
    language = 'swift/ios';
    packageManager = (await fs.pathExists(path.join(projectRoot, 'Podfile'))) ? 'cocoapods' : 'spm';
  } else if (await fs.pathExists(path.join(projectRoot, 'Gemfile'))) {
    language = 'ruby';
    packageManager = 'bundler';
  } else if (await fs.pathExists(path.join(projectRoot, 'composer.json'))) {
    language = 'php';
    packageManager = 'composer';
  }

  return { name, language, packageManager };
}

function fillConfig(template: string, meta: { name: string; language: string; packageManager: string }): string {
  return template
    .replace(/name: ""/, `name: "${meta.name}"`)
    .replace(/language: ""/, `language: "${meta.language}"`)
    .replace(/package_manager: ""/, `package_manager: "${meta.packageManager}"`);
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();
  const vibeflowDir = getVibeflowDir(projectRoot);
  const workflowDocsDir = getWorkflowDocsDir(projectRoot);

  log.title(`vibeflow init`);
  log.step(`项目路径: ${projectRoot}`);

  const exists = await isVibeflowProject(projectRoot);
  if (exists && !opts.force) {
    log.warn('当前目录已经是 vibeflow 项目');
    log.hint('如需重置请加 --force（会覆盖 .ai-dev/config.yaml 之外的模板文件）');
    return;
  }

  if (exists && opts.force && !opts.yes) {
    const ans = await prompts({
      type: 'confirm',
      name: 'ok',
      message: '检测到已有 vibeflow 项目，确定要覆盖模板文件吗？（不会删除 docs/ai-workflow/ 内的任务产物）',
      initial: false,
    });
    if (!ans.ok) {
      log.info('已取消');
      return;
    }
  }

  const meta = await detectProjectMeta(projectRoot);
  log.step(`识别到项目: ${meta.name} (${meta.language || '未识别语言'})`);

  await fs.ensureDir(vibeflowDir);
  await fs.ensureDir(workflowDocsDir);

  let created = 0;
  let skipped = 0;

  for (const file of FILES) {
    const target = path.join(vibeflowDir, file.relPath);
    await fs.ensureDir(path.dirname(target));

    if ((await fs.pathExists(target)) && !opts.force) {
      skipped += 1;
      continue;
    }

    const content = file.relPath === 'config.yaml' ? fillConfig(file.content, meta) : file.content;
    await fs.writeFile(target, content, 'utf8');
    created += 1;
  }

  const gitignore = path.join(vibeflowDir, '.gitignore');
  if (!(await fs.pathExists(gitignore))) {
    await fs.writeFile(gitignore, 'cache/\nlogs/\nexports/\n', 'utf8');
  }

  // 在项目根生成 CLAUDE.md / AGENTS.md 桥接文件（让原生 CLI 也能发现 vibeflow 产物）
  const bridges: Array<{ name: string; content: string }> = [
    { name: 'CLAUDE.md', content: CLAUDE_BRIDGE },
    { name: 'AGENTS.md', content: AGENTS_BRIDGE },
  ];
  const bridgesCreated: string[] = [];
  const bridgesSkipped: string[] = [];
  for (const b of bridges) {
    const target = path.join(projectRoot, b.name);
    if (await fs.pathExists(target)) {
      if (opts.force) {
        await fs.writeFile(target, b.content, 'utf8');
        bridgesCreated.push(b.name);
      } else {
        bridgesSkipped.push(b.name);
      }
    } else {
      await fs.writeFile(target, b.content, 'utf8');
      bridgesCreated.push(b.name);
    }
  }

  log.success(`已生成 ${created} 个模板文件${skipped ? `，跳过 ${skipped} 个已存在文件` : ''}`);
  if (bridgesCreated.length) {
    log.success(`已生成桥接文件: ${bridgesCreated.join(', ')}（让原生 CLI 也能发现 vibeflow 产物）`);
  }
  if (bridgesSkipped.length) {
    log.info(`已存在，未覆盖: ${bridgesSkipped.join(', ')}（如要覆盖请加 --force）`);
  }

  // 检测 git 仓库（Codex CLI 默认要求 git，且 vibeflow 后续阶段也受益于 git）
  await handleGitDetection(projectRoot, opts);

  // 轻量工具链检测：识别到的包管理器 CLI 是否可用（完整检测见 vibeflow doctor）
  if (meta.packageManager) {
    const bin = PACKAGE_MANAGER_BIN[meta.packageManager] ?? meta.packageManager;
    const { ok } = await commandExists(bin, projectRoot);
    if (!ok) {
      log.warn(`识别到包管理器 ${meta.packageManager}，但其命令 "${bin}" 不在 PATH 中。`);
      log.hint(`develop/test 等阶段执行实际命令时会失败，请先安装。完整检测可运行 vibeflow doctor`);
    } else {
      log.success(`工具链检测：${bin} 可用`);
    }
  }

  log.title('下一步');
  log.hint(`1. 让 AI 自动生成规则草稿: vibeflow learn`);
  log.hint(`2. 检查并补全 ${path.relative(projectRoot, path.join(vibeflowDir, 'rules/'))} 下的 TODO`);
  log.hint(`3. （可选）设置跨项目偏好: vibeflow profile init && vibeflow profile edit`);
  log.hint(`4. 创建第一个任务: vibeflow new "<需求名>"`);
}

async function handleGitDetection(projectRoot: string, opts: InitOptions): Promise<void> {
  if (await isGitRepo(projectRoot)) {
    return; // 已是 git 仓库，无需处理
  }

  if (!(await isGitInstalled())) {
    log.warn('git 命令未安装。Codex CLI 默认要求 git 仓库，建议安装 git 或在 config.yaml 给 codex 加 --skip-git-repo-check');
    return;
  }

  log.title('git 仓库检测');
  log.warn('当前项目不是 git 仓库。Codex CLI 默认要求 git 仓库才能调用。');

  let choice: 'init' | 'skip-check' | 'skip-all' | null = null;

  if (opts.yes) {
    // -y 模式：默认选 init（推荐路径）
    choice = 'init';
    log.info('--yes 模式：自动执行 git init');
  } else {
    const ans = await prompts({
      type: 'select',
      name: 'choice',
      message: '如何处理？',
      choices: [
        { title: '我帮你 git init（推荐，会自动 add . + commit）', value: 'init' },
        { title: '不 init，给 codex 加 --skip-git-repo-check（绕过 codex 安全检查）', value: 'skip-check' },
        { title: '跳过，我自己处理', value: 'skip-all' },
      ],
      initial: 0,
    });
    choice = ans.choice ?? 'skip-all';
  }

  if (choice === 'init') {
    log.step('正在执行 git init + add + commit...');
    const result = await initGitRepo(projectRoot);
    if (result.initialized) {
      if (result.committed) {
        log.success('git 仓库已创建，并完成首次 commit');
      } else {
        log.warn(`git init 成功但 commit 失败：${result.error ?? '未知原因'}`);
        log.hint('你可以手动运行: cd ' + path.relative(process.cwd(), projectRoot) + ' && git add . && git commit -m "baseline"');
      }
    } else {
      log.error(`git init 失败：${result.error ?? '未知原因'}`);
      log.hint('请手动运行 git init，或重跑 vibeflow init 选择其他方式');
    }
  } else if (choice === 'skip-check') {
    try {
      const result = await addCodexSkipGitCheck(projectRoot);
      if (result.added) {
        log.success('已给 codex 加上 --skip-git-repo-check 参数（写入 .ai-dev/config.yaml）');
        log.warn('⚠️ 此参数绕过 codex 的安全检查。请确认 vibeflow 工作在你期望的项目目录');
      } else {
        log.info('config.yaml 已包含 --skip-git-repo-check，无需重复添加');
      }
    } catch (err) {
      log.error(`修改 config.yaml 失败：${(err as Error).message}`);
    }
  } else {
    log.info('已跳过 git 处理。后续若调用 codex 报"Not inside a trusted directory"，请手动 git init 或重跑 vibeflow init 选第 2 项');
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('在当前项目初始化 .ai-dev/ 目录骨架（配置、工作流模板、角色定义、规则）')
    .option('-f, --force', '覆盖已有模板文件')
    .option('-y, --yes', '跳过确认提示')
    .option('-t, --template <name>', '使用指定模板 (standard | strict)', 'standard')
    .action(async (opts: InitOptions) => {
      await runInit(opts);
    });
}
