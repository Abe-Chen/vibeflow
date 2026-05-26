import { Command } from 'commander';
import chalk from 'chalk';
import { log } from '../../utils/logger.js';
import { isVibeflowProject, resolveProjectRoot } from '../../utils/paths.js';
import { loadConfig } from '../../core/config.js';
import { buildAdapterMap } from '../../adapters/registry.js';
import { isGitRepo } from '../../utils/git.js';
import { runReadyCheck } from '../../core/ready-check.js';

interface DoctorOptions {
  model?: string;
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<void> {
  const projectRoot = resolveProjectRoot();

  if (!(await isVibeflowProject(projectRoot))) {
    log.error('当前目录不是 vibeflow 项目');
    log.hint('请先运行 vibeflow init');
    process.exitCode = 1;
    return;
  }

  const config = await loadConfig(projectRoot);
  const adapters = buildAdapterMap(config);

  const targets = opts.model
    ? [opts.model]
    : Array.from(adapters.keys());

  if (opts.model && !adapters.has(opts.model)) {
    log.error(`config.yaml 中没有模型: ${opts.model}`);
    log.hint(`可用模型: ${Array.from(adapters.keys()).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  log.title('vibeflow doctor');
  log.step(`项目: ${config.project.name ?? '(未命名)'} (${projectRoot})`);
  log.step(`检查 ${targets.length} 个模型...`);

  let failed = 0;
  for (const id of targets) {
    const adapter = adapters.get(id)!;
    process.stdout.write(`  - ${chalk.bold(id.padEnd(8))} `);
    const status = await adapter.checkAvailability();
    if (status.available) {
      console.log(chalk.green('✓ available'), chalk.gray(status.version ? `(${status.version})` : ''));
    } else {
      failed += 1;
      console.log(chalk.red('✗ unavailable'));
      console.log(chalk.gray(`     command: ${status.checkedCommand ?? 'n/a'}`));
      console.log(chalk.gray(`     reason : ${status.error ?? 'unknown'}`));
    }
  }

  log.title('角色 → 模型映射');
  for (const [roleId, role] of Object.entries(config.roles)) {
    const model = role.default_model;
    const adapter = adapters.get(model);
    const mark = adapter ? chalk.green('✓') : chalk.red('✗ 未配置');
    console.log(`  ${roleId.padEnd(18)} ${mark} ${chalk.cyan(model)}${role.fallback_models?.length ? chalk.gray(`  fallback: ${role.fallback_models.join(', ')}`) : ''}`);
  }

  if (failed > 0) {
    log.warn(`${failed} 个模型不可用。可考虑：1) 安装对应 CLI 2) 在 config.yaml 切换为其他模型 3) 用 export 模式手动执行`);
    process.exitCode = 0; // doctor 只是诊断，不让 CI 挂掉
  } else {
    log.success('全部模型可用');
  }

  // 项目命令配置检测（#54：空命令影响 test/develop 阶段自检）
  log.title('项目命令配置');
  const cmds = config.commands ?? {};
  const cmdRows: Array<[string, string[] | undefined]> = [
    ['test', cmds.test],
    ['build', cmds.build],
    ['lint', cmds.lint],
  ];
  let emptyCmds = 0;
  for (const [name, arr] of cmdRows) {
    if (arr && arr.length > 0) {
      console.log(`  ${name.padEnd(6)} ${chalk.green('✓')} ${chalk.gray(arr.join(' && '))}`);
    } else {
      emptyCmds += 1;
      console.log(`  ${name.padEnd(6)} ${chalk.yellow('— 未配置')}`);
    }
  }
  if (emptyCmds > 0) {
    log.warn(`${emptyCmds} 项命令未配置。test 阶段缺 commands.test 时无法实际运行测试，建议在 .ai-dev/config.yaml 补齐。`);
  } else {
    log.success('test / build / lint 命令均已配置');
  }

  // 工具链就绪检测（#53：包管理器 + commands 引用的程序是否真的装了）
  log.title('工具链就绪检测');
  const toolChecks = await runReadyCheck(config, projectRoot);
  if (toolChecks.length === 0) {
    log.info('未推断出需要检测的工具链（未设置 package_manager，commands 也为空）');
  } else {
    let missingTools = 0;
    for (const c of toolChecks) {
      if (c.available) {
        console.log(`  ${c.tool.padEnd(12)} ${chalk.green('✓')} ${chalk.gray(`${c.detail ?? ''}  (来源: ${c.source})`)}`);
      } else {
        missingTools += 1;
        console.log(`  ${c.tool.padEnd(12)} ${chalk.red('✗')} ${chalk.gray(`${c.detail ?? '未找到'}  (来源: ${c.source})`)}`);
      }
    }
    if (missingTools > 0) {
      log.warn(`${missingTools} 个工具不可用。相关阶段（develop/test 等）执行实际命令时会失败，请先安装或修正路径。`);
      process.exitCode = 0; // doctor 只诊断，不让 CI 挂掉
    } else {
      log.success('所需工具链均可用');
    }
  }

  // git 仓库状态检测（影响 codex 调用）
  log.title('git 仓库状态');
  const isGit = await isGitRepo(projectRoot);
  if (isGit) {
    log.success('项目是 git 仓库');
  } else {
    log.warn('项目不是 git 仓库');
    log.hint('影响：Codex CLI 默认会拒绝运行（"Not inside a trusted directory"）');
    log.hint('修复方式（任选一）：');
    log.hint('  1) cd 到项目目录运行 git init && git add . && git commit -m "baseline"');
    log.hint('  2) 重跑 vibeflow init，按提示选第 2 项绕过检查');
    log.hint('  3) 不用 codex（在 config.yaml 把 codex 角色映射改为 claude/gemini）');
  }
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('检查 config.yaml 中所有模型 CLI 是否可用，显示版本号或错误原因')
    .option('-m, --model <id>', '只检查某个模型')
    .action(async (opts: DoctorOptions) => {
      await runDoctor(opts);
    });
}
