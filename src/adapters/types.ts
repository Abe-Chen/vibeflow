export type InvokeMode = 'spawn' | 'export';

export type AdapterRunStatus = 'success' | 'failed' | 'timeout' | 'cancelled' | 'exported';

export interface ModelDefinition {
  id: string;
  type: 'cli' | 'http' | 'export';
  command?: string;
  subcommand?: string;
  headless_flag?: string;
  output_format?: 'text' | 'json';
  invoke_mode?: InvokeMode;
  extra_args?: string[];
  env?: Record<string, string>;
  capabilities?: string[];
  timeout_ms?: number;
}

export interface AdapterAvailability {
  available: boolean;
  version?: string;
  error?: string;
  checkedCommand?: string;
}

export interface AgentRunRequest {
  runId: string;
  featureName: string;
  stageId: string;
  roleId: string;
  modelId: string;
  projectRoot: string;
  /** 子进程的工作目录，默认为 projectRoot */
  workingDirectory?: string;
  /** 完整 prompt 文本（包含上下文清单/指令/约束） */
  prompt: string;
  /** 期望模型把最终产物写入的绝对路径 */
  outputPath?: string;
  /** 由调用方控制本次走 spawn 还是 export */
  invokeMode?: InvokeMode;
  /** 单次调用超时，默认 5 分钟 */
  timeoutMs?: number;
  /** 透传额外环境变量（不会覆盖已有 env） */
  env?: Record<string, string>;
}

export interface AgentRunResult {
  status: AdapterRunStatus;
  modelId: string;
  invokeMode: InvokeMode;
  durationMs: number;
  exitCode?: number;
  /** stdout 文本，可能用于直接解析 */
  stdoutText?: string;
  /** stderr 文本（仅记录尾部用于错误提示） */
  stderrTail?: string;
  /** stdout 完整内容落盘后的路径 */
  stdoutPath?: string;
  /** stderr 完整内容落盘后的路径 */
  stderrPath?: string;
  /** 模型已生成的产物文件路径（若约定写文件） */
  outputPath?: string;
  /** export 模式下，生成的 prompt 文件 */
  promptFilePath?: string;
  /** 用户可读的下一步说明 */
  hint?: string;
  /** 失败原因，用户可读 */
  error?: string;
}

export interface ModelAdapter {
  readonly id: string;
  readonly definition: ModelDefinition;

  checkAvailability(): Promise<AdapterAvailability>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export class AdapterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AdapterError';
  }
}
