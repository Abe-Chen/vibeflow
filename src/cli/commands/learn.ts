import { Command } from 'commander';
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import prompts from 'prompts';
import { log } from '../../utils/logger.js';
import { getVibeflowDir, isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { loadConfig, resolveModelForRole } from '../../core/config.js';
import { scanProject, formatSnapshotForPrompt, ProjectSnapshot } from '../../core/project-scanner.js';
import { buildAdapterMap } from '../../adapters/registry.js';
import { LEARN_EXISTING_PROMPT, LEARN_NEW_PROJECT_PROMPT, parseLearnOutput } from '../../templates/learn-prompts.js';
import { InvokeMode } from '../../adapters/types.js';

interface LearnOptions {
  newProject?: boolean;
  message?: string;        // 新项目愿景
  model?: string;
  export?: boolean;
  yes?: boolean;           // 直接覆盖原 rules 文件，不生成 .draft
  dryRun?: boolean;        // 只打印扫描结果，不调模型
  force?: boolean;         // 已有非占位 rules 时强制覆盖
}

const RULES = ['project_rules.md', 'coding_rules.md', 'product_rules.md'] as const;

function isPlaceholderRules(content: string): boolean {
  return /^- TODO:/m.test(content) && (content.match(/TODO/g)?.length ?? 0) >= 3;
}

async function chooseTargetFile(
  rulesDir: string,
  ruleName: string,
  opts: { yes?: boolean; force?: boolean },
): Promise<{ targetPath: string; usedDraft: boolean; skipped: boolean }> {
  const finalPath = path.join(rulesDir, ruleName);
  const draftPath = `${finalPath}.draft`;

  if (!(await fs.pathExists(finalPath))) {
    // 文件不存在：直接写到 final
    return { targetPath: finalPath, usedDraft: false, skipped: false };
  }
  const existing = await fs.readFile(finalPath, 'utf8');
  if (isPlaceholderRules(existing)) {
    // 原内容是占位，直接覆盖
    return { targetPath: finalPath, usedDraft: false, skipped: false };
  }
  if (opts.yes && opts.force) {
    return { targetPath: finalPath, usedDraft: false, skipped: false };
  }
  // 原内容非占位：写 .draft 让用户对比
  return { targetPath: draftPath, usedDraft: true, skipped: false };
}

function preview(content: string, maxLines = 20): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  return lines.slice(0, maxLines).join('\n') + `\n... (省略 ${lines.length - maxLines} 行)`;
}

function buildSnapshotSummary(s: ProjectSnapshot): string {
  return [
    `根目录: ${s.rootPath}`,
    `Git 仓库: ${s.isGitRepo ? '是' : '否'}`,
    `推测技术栈: ${s.detectedStack.join(', ') || '(未识别)'}`,
    `源码文件数: ${s.stats.sourceFileCount}`,
    `已采样: ${s.stats.sampledFileCount} 个文件 / ${s.stats.totalSampleBytes} 字节`,
    `Manifest 文件: ${s.manifests.map((m) => m.path).join(', ') || '(无)'}`,
    `README: ${s.readme ? '有' : '无'}`,
  ].join('\n');
}

export async function runLearn(opts: LearnOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();

  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    log.hint('请先运行 vibeflow init');
    process.exitCode = 1;
    return;
  }

  log.title('vibeflow learn');
  log.step(`扫描项目: ${projectRoot}`);

  const snapshot = await scanProject(projectRoot);
  console.log('\n' + chalk.bold('项目快照摘要：'));
  console.log(buildSnapshotSummary(snapshot));

  if (opts.newProject && !opts.message) {
    log.error('--new-project 模式需要用 -m "<愿景>" 提供产品愿景');
    log.hint('例如: vibeflow learn --new-project -m "Flutter 平板单机日程看板，ToC 免费"');
    process.exitCode = 1;
    return;
  }

  // 智能识别新项目
  if (!opts.newProject && snapshot.isLikelyNewProject) {
    log.warn('检测到这看起来是个新项目（无源码 / 无 manifest / 无 README）');
    log.hint('建议使用：vibeflow learn --new-project -m "<愿景>"');
    if (!opts.yes) {
      const ans = await prompts({
        type: 'confirm',
        name: 'ok',
        message: '仍然按老项目模式继续扫描吗？',
        initial: false,
      });
      if (!ans.ok) {
        log.info('已取消');
        return;
      }
    }
  }

  if (opts.dryRun) {
    log.info('\n--dry-run: 只显示扫描结果，不调模型');
    console.log('\n' + chalk.bold('完整快照（将作为 prompt 输入）：'));
    console.log(formatSnapshotForPrompt(snapshot));
    return;
  }

  const config = await loadConfig(projectRoot);
  // learn 用 product_analyst 角色（这个角色擅长理解、组织、归纳）
  const modelId = opts.model ?? resolveModelForRole(config, 'product_analyst');
  const adapters = buildAdapterMap(config);
  const adapter = adapters.get(opts.export ? 'export' : modelId) ?? adapters.get(modelId);
  if (!adapter) throw new Error(`找不到模型适配器: ${modelId}`);

  log.step(`使用模型: ${chalk.cyan(modelId)}${opts.export ? chalk.yellow(' [export]') : ''}`);

  const promptTemplate = opts.newProject ? LEARN_NEW_PROJECT_PROMPT : LEARN_EXISTING_PROMPT;
  const fullPrompt = promptTemplate
    .replace('{{project_snapshot}}', formatSnapshotForPrompt(snapshot))
    .replace('{{vision}}', opts.message ?? '');

  const invokeMode: InvokeMode = opts.export ? 'export' : 'spawn';
  const result = await adapter.run({
    runId: `learn_${Date.now().toString(36)}`,
    featureName: '__learn__',
    stageId: 'learn',
    roleId: 'product_analyst',
    modelId: adapter.id,
    projectRoot,
    prompt: fullPrompt,
    invokeMode,
    timeoutMs: 10 * 60 * 1000,
  });

  if (result.status === 'exported') {
    log.info('已切换到 export 模式');
    if (result.hint) for (const line of result.hint.split('\n')) log.hint(line);
    log.warn('export 模式下，请手动把模型输出按 <<<PROJECT_RULES>>> 等分隔符拆分到 .ai-dev/rules/*.md');
    return;
  }
  if (result.status !== 'success') {
    log.error(`learn 调用失败: ${result.error ?? result.status}`);
    if (result.stderrPath) log.hint(`查看 stderr: ${path.relative(projectRoot, result.stderrPath)}`);
    process.exitCode = 1;
    return;
  }

  const stdoutText = result.stdoutText ?? '';
  if (!stdoutText.trim()) {
    log.error('模型返回为空，无法生成 rules');
    process.exitCode = 1;
    return;
  }

  const parsed = parseLearnOutput(stdoutText);
  if (!parsed.parsedCleanly) {
    log.warn('模型未严格按分隔符输出，将整段内容作为 project_rules，其余两份留 TODO');
    log.hint(`原始输出已保留在 stdout 日志：${result.stdoutPath ? path.relative(projectRoot, result.stdoutPath) : '(no log)'}`);
  }

  const rulesDir = path.join(getVibeflowDir(projectRoot), 'rules');
  await fs.ensureDir(rulesDir);

  const written: Array<{ name: string; path: string; usedDraft: boolean }> = [];
  const contents: Record<string, string> = {
    'project_rules.md': parsed.projectRules,
    'coding_rules.md': parsed.codingRules,
    'product_rules.md': parsed.productRules,
  };

  for (const name of RULES) {
    const content = contents[name].trim() + '\n';
    if (!content || content === '\n') continue;
    const choice = await chooseTargetFile(rulesDir, name, { yes: opts.yes, force: opts.force });
    if (choice.skipped) continue;
    await fs.writeFile(choice.targetPath, content, 'utf8');
    written.push({
      name,
      path: path.relative(projectRoot, choice.targetPath),
      usedDraft: choice.usedDraft,
    });
  }

  log.title('生成结果');
  for (const w of written) {
    const tag = w.usedDraft ? chalk.yellow('[草稿，原文件未覆盖]') : chalk.green('[已写入]');
    console.log(`  ${tag} ${w.path}`);
  }

  log.title('下一步');
  if (written.some((w) => w.usedDraft)) {
    log.hint('部分文件已有非占位内容，新生成的写到了 .draft 后缀。请 diff 后手动采纳：');
    log.hint(`  diff .ai-dev/rules/project_rules.md{,.draft}`);
    log.hint(`  确认后: mv .ai-dev/rules/project_rules.md.draft .ai-dev/rules/project_rules.md`);
    log.hint('或者下次跑 vibeflow learn 时加 --yes --force 直接覆盖。');
  }
  log.hint('打开 .ai-dev/rules/*.md 检查并补全 TODO 段落，然后即可使用任意 vibeflow 阶段命令。');

  // 预览
  if (parsed.parsedCleanly && written.length === 3) {
    console.log('\n' + chalk.gray('--- project_rules.md 预览（前 20 行） ---'));
    console.log(chalk.gray(preview(contents['project_rules.md'])));
  }
}

export function registerLearnCommand(program: Command): void {
  program
    .command('learn')
    .description('调用 AI 学习项目并自动生成 .ai-dev/rules/ 草稿（老项目扫描代码 / 新项目从愿景出发）')
    .option('--new-project', '新项目模式（还没代码）：从 -m "<愿景>" 生成草稿')
    .option('-m, --message <text>', '新项目愿景（仅 --new-project 模式必填）')
    .option('--model <id>', '指定模型（默认 product_analyst 角色对应的模型）')
    .option('--export', 'export 模式：只生成 prompt 文件不调 CLI')
    .option('--dry-run', '只显示扫描结果，不调模型')
    .option('-y, --yes', '跳过确认提示')
    .option('--force', '即使原 rules 已有非占位内容也直接覆盖（配合 --yes 使用）')
    .action(async (opts: LearnOptions) => {
      try {
        await runLearn(opts);
      } catch (err) {
        log.error((err as Error).message);
        process.exitCode = 1;
      }
    });
}
