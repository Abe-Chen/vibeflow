#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { registerInitCommand } from './commands/init.js';
import { registerNewCommand } from './commands/new.js';
import { registerStatusCommand } from './commands/status.js';
import { registerNextCommand } from './commands/next.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerRequirementCommand } from './commands/requirement.js';
import { registerAdvanceCommand } from './commands/advance.js';
import { registerDeliverCommand } from './commands/deliver.js';
import { registerChangeRequestCommand } from './commands/change-request.js';
import { registerStageCommands } from './commands/stages.js';
import { registerAcceptPlanCommand } from './commands/accept-plan.js';
import { registerConsultCommand } from './commands/consult.js';
import { registerSynthesizeCommand } from './commands/synthesize.js';
import { registerHandoffCommand } from './commands/handoff.js';
import { registerLearnCommand } from './commands/learn.js';
import { registerProfileCommand } from './commands/profile.js';

const program = new Command();

program
  .name('vibeflow')
  .description('让不同 AI 模型分别负责方案、开发和评审，避免同一个模型自写自审')
  .version('0.3.0', '-v, --version', '查看版本号')
  .helpOption('-h, --help', '查看帮助');

registerInitCommand(program);
registerNewCommand(program);
registerStatusCommand(program);
registerNextCommand(program);
registerDoctorCommand(program);
registerLearnCommand(program);
registerProfileCommand(program);
registerRequirementCommand(program);
registerStageCommands(program);
registerAcceptPlanCommand(program);
registerConsultCommand(program);
registerSynthesizeCommand(program);
registerAdvanceCommand(program);
registerDeliverCommand(program);
registerChangeRequestCommand(program);
registerHandoffCommand(program);

program.on('command:*', (operands) => {
  console.error(chalk.red(`未知命令: ${operands[0]}`));
  console.error(`运行 ${chalk.cyan('vibeflow --help')} 查看可用命令`);
  process.exit(1);
});

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red('执行失败:'), err.message);
  if (process.env.VIBEFLOW_DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
