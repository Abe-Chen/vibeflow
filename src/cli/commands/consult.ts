import { Command } from 'commander';
import { log } from '../../utils/logger.js';
import { resolveProjectRoot, isVibeflowProject } from '../../utils/paths.js';
import { runConsult } from '../../core/explore-runners.js';

interface ConsultOptions {
  feature?: string;
  about?: string;
  model?: string;
  message?: string;
}

export function registerConsultCommand(program: Command): void {
  program
    .command('consult')
    .description('就某方案/文件单轮咨询指定模型，产物存入 explore/consults/')
    .option('-f, --feature <name>', '指定任务')
    .requiredOption('--about <refs>', '咨询材料：探索产物 id 或项目内文件路径，逗号分隔')
    .requiredOption('--model <id>', '用哪个模型回答')
    .requiredOption('-m, --message <text>', '你的问题')
    .action(async (opts: ConsultOptions) => {
      try {
        const projectRoot = resolveProjectRoot();
        if (!(await isVibeflowProject(projectRoot))) {
          log.error('当前目录不是 vibeflow 项目');
          process.exitCode = 1;
          return;
        }
        const { artifactId, file } = await runConsult({
          projectRoot,
          feature: opts.feature,
          model: opts.model!,
          about: opts.about!.split(',').map((s) => s.trim()).filter(Boolean),
          question: opts.message!,
        });
        log.success(`咨询完成 → ${artifactId}（${file}）`);
        log.hint('可继续 consult / synthesize / accept-plan');
      } catch (e) {
        log.error((e as Error).message);
        process.exitCode = 1;
      }
    });
}
