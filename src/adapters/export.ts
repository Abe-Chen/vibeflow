import path from 'node:path';
import fs from 'fs-extra';
import {
  AdapterAvailability,
  AgentRunRequest,
  AgentRunResult,
  ModelAdapter,
  ModelDefinition,
} from './types.js';

/**
 * Export 兜底 Adapter：
 * 不调用任何 CLI，把 prompt 写入文件，让用户复制到 IDE / GUI 工具里执行。
 * 用户执行完后，把模型输出写到约定的 outputPath，再用 `vibeflow advance --done` 标记阶段完成。
 *
 * 适用场景：
 * - 复杂多轮交互
 * - 需要 IDE 内深度操作
 * - 该模型对应的 CLI 不可用，或用户主动选择手动控制
 */
export class ExportAdapter implements ModelAdapter {
  constructor(public readonly definition: ModelDefinition) {}

  get id(): string {
    return this.definition.id;
  }

  async checkAvailability(): Promise<AdapterAvailability> {
    return { available: true, version: 'export-mode' };
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const start = Date.now();
    const dir = path.join(
      request.projectRoot,
      '.ai-dev',
      'exports',
      request.featureName,
      request.stageId,
    );
    await fs.ensureDir(dir);
    const promptFile = path.join(dir, 'prompt.md');

    const header =
      `# Prompt for ${request.stageId}\n\n` +
      `- run_id: ${request.runId}\n` +
      `- feature: ${request.featureName}\n` +
      `- role: ${request.roleId}\n` +
      `- model: ${request.modelId} (export mode)\n` +
      `- output_path: ${request.outputPath ?? '(由你决定)'}\n\n` +
      `---\n\n`;

    await fs.writeFile(promptFile, header + request.prompt, 'utf8');

    const hint =
      `prompt 已导出到 ${path.relative(request.projectRoot, promptFile)}\n` +
      `执行步骤:\n` +
      `  1) 把内容复制到你想用的工具（Claude Desktop / Cursor / Gemini Web / ...）\n` +
      `  2) 让模型把最终产物写入: ${request.outputPath ?? '(自行约定)'}\n` +
      `  3) 完成后回到这里运行 vibeflow advance --done`;

    return {
      status: 'exported',
      modelId: this.id,
      invokeMode: 'export',
      durationMs: Date.now() - start,
      promptFilePath: promptFile,
      outputPath: request.outputPath,
      hint,
    };
  }
}
