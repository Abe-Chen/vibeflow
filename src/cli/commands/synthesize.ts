import { Command } from 'commander';
import { log } from '../../utils/logger.js';
import { resolveProjectRoot, isVibeflowProject } from '../../utils/paths.js';
import { runSynthesize } from '../../core/explore-runners.js';

interface SynthesizeOptions {
  feature?: string;
  base?: string;
  model?: string;
  message?: string;
}

export function registerSynthesizeCommand(program: Command): void {
  program
    .command('synthesize')
    .description('让指定模型融合多份方案为一版，产物存入 explore/syntheses/（可被 accept-plan 选定）')
    .option('-f, --feature <name>', '指定任务')
    .requiredOption('--base <refs>', '待融合方案：探索产物 id 或项目内文件路径，逗号分隔')
    .requiredOption('--model <id>', '用哪个模型融合')
    .option('-m, --message <text>', '融合偏好（可选）')
    .action(async (opts: SynthesizeOptions) => {
      try {
        const projectRoot = resolveProjectRoot();
        if (!(await isVibeflowProject(projectRoot))) {
          log.error('当前目录不是 vibeflow 项目');
          process.exitCode = 1;
          return;
        }
        const { artifactId, file } = await runSynthesize({
          projectRoot,
          feature: opts.feature,
          model: opts.model!,
          base: opts.base!.split(',').map((s) => s.trim()).filter(Boolean),
          preference: opts.message,
        });
        log.success(`融合完成 → ${artifactId}（${file}）`);
        log.hint(`选定它为正式方案： vibeflow accept-plan ${artifactId}`);
      } catch (e) {
        log.error((e as Error).message);
        process.exitCode = 1;
      }
    });
}
