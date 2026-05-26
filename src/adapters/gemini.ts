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
    // gemini 的 -p/--prompt 必须带值（无值会报 "Not enough arguments following: p"）：
    // 用空值占位，真正的 prompt 走 stdin（base.ts 已保留空串参数）。
    // --skip-trust：信任当前工作区，否则 gemini 读写项目文件受限、且 yolo/approval 会被降级回 default。
    const args: string[] = ['--prompt', '', '--skip-trust'];
    // develop/fix 落盘：yolo 自动批准工具调用（含文件写）
    if (request.writeAccess) args.push('--approval-mode', 'yolo');
    if (this.definition.extra_args?.length) args.push(...this.definition.extra_args);
    return { command, args, promptViaStdin: true };
  }

  protected buildVersionInvocation(): { command: string; args: string[] } {
    return { command: this.definition.command ?? 'gemini', args: ['--version'] };
  }
}
