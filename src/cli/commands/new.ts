import { Command } from 'commander';
import path from 'node:path';
import fs from 'fs-extra';
import prompts from 'prompts';
import { log } from '../../utils/logger.js';
import { getFeatureDir, isVibeflowProject, resolveProjectRoot, slugify } from '../../utils/paths.js';
import { buildInitialRun, loadWorkflowTemplate, writeRunState } from '../../core/run.js';

interface NewOptions {
  workflow?: string;
  description?: string;
  yes?: boolean;
}

const STAGE_FILE_HINTS: Record<string, string> = {
  '00_requirement.md': '# 需求文档\n\n> 由 vibeflow new 占位生成，等待 requirement 阶段填充。\n',
  '01_plan_v1.md': '# 方案 v1\n\n> 由 vibeflow new 占位生成，等待 plan 阶段填充。\n',
  '02_plan_review.md': '# 方案评审\n\n> 由 vibeflow new 占位生成，等待 plan_review 阶段填充。\n',
  '03_final_plan.md': '# 最终方案\n\n> 由 vibeflow new 占位生成，等待 finalize 阶段填充。\n',
  '04_human_decisions.md': '# 人工决策记录\n\n> 由 vibeflow new 占位生成。\n',
  '05_implementation_report.md': '# 实现报告\n\n> 由 vibeflow new 占位生成，等待 develop 阶段填充。\n',
  '06_code_review.md': '# 代码评审\n\n> 由 vibeflow new 占位生成，等待 code_review 阶段填充。\n',
  '07_fix_report.md': '# 修复报告\n\n> 由 vibeflow new 占位生成，等待 fix 阶段填充。\n',
  '08_test_report.md': '# 测试报告\n\n> 由 vibeflow new 占位生成，等待 test 阶段填充。\n',
  '09_release_note.md': '# 上线说明\n\n> 由 vibeflow new 占位生成，等待 archive 阶段填充。\n',
};

export async function runNew(featureNameInput: string, opts: NewOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();

  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    log.hint('请先运行 vibeflow init');
    process.exitCode = 1;
    return;
  }

  const featureName = slugify(featureNameInput);
  if (!featureName) {
    log.error('需求名称不能为空');
    process.exitCode = 1;
    return;
  }

  const workflowId = opts.workflow || 'standard_feature';
  const workflow = await loadWorkflowTemplate(projectRoot, workflowId);

  const featureDir = getFeatureDir(projectRoot, featureName);
  if (await fs.pathExists(featureDir)) {
    if (!opts.yes) {
      const ans = await prompts({
        type: 'confirm',
        name: 'ok',
        message: `目录已存在 (${path.relative(projectRoot, featureDir)})，仍要继续吗？`,
        initial: false,
      });
      if (!ans.ok) {
        log.info('已取消');
        return;
      }
    }
  }

  await fs.ensureDir(featureDir);

  const placeholders = new Set<string>();
  for (const stage of workflow.stages) {
    if (stage.output) placeholders.add(stage.output);
  }
  placeholders.add('04_human_decisions.md');

  let created = 0;
  for (const fileName of placeholders) {
    const target = path.join(featureDir, fileName);
    if (await fs.pathExists(target)) continue;
    const hint = STAGE_FILE_HINTS[fileName] ?? `# ${fileName}\n\n> 由 vibeflow new 占位生成。\n`;
    await fs.writeFile(target, hint, 'utf8');
    created += 1;
  }

  const runState = buildInitialRun(featureName, workflow, opts.description);
  await writeRunState(projectRoot, featureName, runState);

  log.title(`vibeflow new: ${featureName}`);
  log.success(`任务目录已创建: ${path.relative(projectRoot, featureDir)}`);
  log.step(`工作流: ${workflow.id} (${workflow.name})`);
  log.step(`产物占位: ${created} 个`);
  log.step(`run.json: 已写入，当前阶段 ${runState.current_stage}`);

  log.title('下一步');
  log.hint(`vibeflow status                   # 查看当前阶段`);
  log.hint(`vibeflow requirement              # 进入第一阶段（需求整理）`);
}

export function registerNewCommand(program: Command): void {
  program
    .command('new <feature-name>')
    .description('创建一个新的研发任务，生成产物目录和初始 run.json')
    .option('-w, --workflow <id>', '使用的工作流模板 (standard_feature | quick_fix | bugfix)', 'standard_feature')
    .option('-d, --description <text>', '需求的一句话描述')
    .option('-y, --yes', '跳过确认')
    .action(async (featureName: string, opts: NewOptions) => {
      await runNew(featureName, opts);
    });
}
