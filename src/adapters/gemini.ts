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

  protected buildInvocation(_request: AgentRunRequest): SpawnInvocation {
    const command = this.definition.command ?? 'gemini';
    const args: string[] = [this.definition.headless_flag ?? '-p'];
    if (this.definition.extra_args?.length) args.push(...this.definition.extra_args);
    return { command, args, promptViaStdin: true };
  }

  protected buildVersionInvocation(): { command: string; args: string[] } {
    return { command: this.definition.command ?? 'gemini', args: ['--version'] };
  }
}
