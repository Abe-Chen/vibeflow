import { SpawnAdapter, SpawnInvocation } from './base.js';
import { AgentRunRequest, ModelDefinition } from './types.js';

/**
 * Gemini CLI 非交互模式：
 *   gemini -p "<prompt>"
 *   echo "<prompt>" | gemini -p
 */
export class GeminiAdapter extends SpawnAdapter {
  static create(def: ModelDefinition): GeminiAdapter {
    return new GeminiAdapter({
      ...def,
      command: def.command ?? 'gemini',
      headless_flag: def.headless_flag ?? '-p',
    });
  }

  protected buildInvocation(request: AgentRunRequest): SpawnInvocation {
    const command = this.definition.command ?? 'gemini';
    const args: string[] = [this.definition.headless_flag ?? '-p'];
    // 已知限制（见 BACKLOG）：gemini CLI 的 `-p` 需带值（当前 stdin 方式有兼容问题），
    // 且 yolo 在"未信任文件夹"下会被降级回 default 而不落盘。develop/fix 建议用 codex/claude（已验证可落盘）。
    if (request.writeAccess) args.push('--approval-mode', 'yolo');
    if (this.definition.extra_args?.length) args.push(...this.definition.extra_args);
    return { command, args, promptViaStdin: true };
  }

  protected buildVersionInvocation(): { command: string; args: string[] } {
    return { command: this.definition.command ?? 'gemini', args: ['--version'] };
  }
}
