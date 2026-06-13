import path from 'node:path';
import fs from 'fs-extra';
import { Command } from 'commander';
import prompts from 'prompts';
import { log } from '../../utils/logger.js';
import { resolveProjectRoot, isVibeflowProject, getFeatureDir } from '../../utils/paths.js';
import { readRunState, writeRunState } from '../../core/run.js';
import { pickFeature, runStage } from '../../core/stage-runner.js';
import {
  ensureExploreState,
  isFinalPlanLocked,
  acceptArtifact,
  resetDownstreamForExplore,
} from '../../core/explore-state.js';
import { isPlaceholderFile } from '../../core/output-artifact.js';

interface AcceptPlanOptions {
  feature?: string;
  yes?: boolean;
  /** commander --no-chain → false */
  chain?: boolean;
}

export async function runAcceptPlan(artifactId: string, opts: AcceptPlanOptions): Promise<void> {
  const projectRoot = resolveProjectRoot();
  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    process.exitCode = 1;
    return;
  }
  if (!artifactId) {
    log.error('请指定要选定的探索产物 id，如 vibeflow accept-plan plan_001');
    process.exitCode = 1;
    return;
  }

  const featureName = await pickFeature(projectRoot, opts.feature);
  const state = await readRunState(projectRoot, featureName);
  if (!state) {
    log.error(`找不到 run.json: ${featureName}`);
    process.exitCode = 1;
    return;
  }
  if (isFinalPlanLocked(state)) {
    log.error('方案已锁定，不能再 accept。如需变更请用 vibeflow change-request');
    process.exitCode = 1;
    return;
  }

  const explore = ensureExploreState(state);
  const featureDir = getFeatureDir(projectRoot, featureName);

  // acceptArtifact 校验 id/kind/status，并更新 accepted + accept_history + status
  let artifact;
  try {
    artifact = acceptArtifact(explore, artifactId);
  } catch (e) {
    log.error((e as Error).message);
    process.exitCode = 1;
    return;
  }

  const sourceAbs = path.join(featureDir, artifact.file);
  if (!(await fs.pathExists(sourceAbs))) {
    log.error(`来源文件不存在: ${artifact.file}`);
    process.exitCode = 1;
    return;
  }
  const sourceContent = (await fs.readFile(sourceAbs, 'utf8')).trim();
  if (!sourceContent || (await isPlaceholderFile(sourceAbs))) {
    log.error(`来源文件为空或占位，无法 accept: ${artifact.file}`);
    process.exitCode = 1;
    return;
  }

  // 复制为正式 01_plan_v1.md，文件头加来源标注（可追溯，呼应 P1-8 / Minor6）
  const targetAbs = path.join(featureDir, '01_plan_v1.md');
  const header = `> accepted from ${artifact.file}（${artifact.id}, ${artifact.model}）@ ${new Date().toISOString()}\n\n`;
  await fs.writeFile(targetAbs, header + sourceContent + '\n', 'utf8');

  // plan 阶段标 completed；若正式方案变化（重新 accept），重置下游已处理阶段
  const planStage = state.stages.find((s) => s.id === 'plan');
  if (planStage) {
    planStage.status = 'completed';
    planStage.completed_at = new Date().toISOString();
    planStage.model = artifact.model;
    planStage.notes = `accepted ${artifact.id}`;
  }
  const reset = resetDownstreamForExplore(state);
  state.current_stage = 'plan_review';
  if (state.status === 'created' || state.status === 'delivered') state.status = 'in_progress';
  await writeRunState(projectRoot, featureName, state);

  log.success(`已选定 ${artifact.id}（${artifact.model}）为正式方案 → 01_plan_v1.md`);
  if (reset.length) log.hint(`已重置下游阶段为待执行：${reset.join(', ')}`);

  // chain 到 plan-review（M4：accept 已完成人工选择，这里按 chain 范式询问/自动）
  const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  let go = opts.yes === true;
  if (!go && opts.chain !== false && isTTY) {
    const ans = await prompts({
      type: 'select',
      name: 'c',
      message: '继续进入 plan-review（换一个模型评审）？',
      choices: [
        { title: 'Y - 继续', value: 'y' },
        { title: 'n - 先停下', value: 'n' },
      ],
      initial: 0,
    });
    go = ans.c === 'y';
  }
  if (go) {
    await runStage({ stageId: 'plan_review', feature: featureName, yes: opts.yes });
  } else {
    log.hint('继续评审： vibeflow plan-review');
  }
}

export function registerAcceptPlanCommand(program: Command): void {
  program
    .command('accept-plan <artifact>')
    .description('从探索池选定一份方案为正式 01_plan_v1.md，进入 plan-review')
    .option('-f, --feature <name>', '指定任务')
    .option('-y, --yes', '选定后自动继续 plan-review')
    .option('--no-chain', '选定后停下，不自动进入 plan-review')
    .action(async (artifact: string, opts: AcceptPlanOptions) => {
      await runAcceptPlan(artifact, opts);
    });
}
