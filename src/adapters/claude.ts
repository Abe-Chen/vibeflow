import { SpawnAdapter, SpawnInvocation } from './base.js';
import { AgentRunRequest, ModelDefinition } from './types.js';

/**
 * Claude Code 非交互模式：
 *   claude -p "<prompt>"            # 默认 print，stdout 输出
 *   claude -p                       # 从 stdin 读
 *   claude -p --output-format json
 * 我们走 stdin 通道避免长 prompt 越过 ARG_MAX。
 */
export class ClaudeAdapter extends SpawnAdapter {
  static create(def: ModelDefinition): ClaudeAdapter {
    return new ClaudeAdapter({
      ...def,
      command: def.command ?? 'claude',
      headless_flag: def.headless_flag ?? '-p',
    });
  }

  protected buildInvocation(request: AgentRunRequest): SpawnInvocation {
    const command = this.definition.command ?? 'claude';
    const args: string[] = [this.definition.headless_flag ?? '-p'];

    // develop/fix 阶段需落盘：默认 permission-mode 在 headless 下不写文件，acceptEdits 自动批准编辑
    if (request.writeAccess) args.push('--permission-mode', 'acceptEdits');

    if (this.definition.output_format === 'json') {
      args.push('--output-format', 'json');
    }

    if (this.definition.extra_args?.length) {
      args.push(...this.definition.extra_args);
    }

    return { command, args, promptViaStdin: true };
  }

  protected buildVersionInvocation(): { command: string; args: string[] } {
    return { command: this.definition.command ?? 'claude', args: ['--version'] };
  }
}
