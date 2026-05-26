import { SpawnAdapter, SpawnInvocation } from './base.js';
import { AgentRunRequest, ModelDefinition } from './types.js';

/**
 * Codex CLI 非交互模式：
 *   codex exec "<prompt>"
 *   echo "<prompt>" | codex exec -
 * 我们用 stdin 写入 prompt，命令行参数使用 `-` 让 codex 从 stdin 读取。
 * 若 CLI 不支持 `-`，可在 config.yaml 用 extra_args 覆盖。
 */
export class CodexAdapter extends SpawnAdapter {
  static create(def: ModelDefinition): CodexAdapter {
    return new CodexAdapter({
      ...def,
      command: def.command ?? 'codex',
      subcommand: def.subcommand ?? 'exec',
    });
  }

  protected buildInvocation(request: AgentRunRequest): SpawnInvocation {
    const command = this.definition.command ?? 'codex';
    const args: string[] = [];
    if (this.definition.subcommand) args.push(this.definition.subcommand);

    // develop/fix 阶段需落盘：codex exec 默认 read-only 沙箱，切到 workspace-write 才能写工作区
    if (request.writeAccess) args.push('--sandbox', 'workspace-write');

    if (this.definition.extra_args?.length) {
      args.push(...this.definition.extra_args);
    } else {
      args.push('-');
    }

    return { command, args, promptViaStdin: true };
  }

  protected buildVersionInvocation(): { command: string; args: string[] } {
    return { command: this.definition.command ?? 'codex', args: ['--version'] };
  }
}
