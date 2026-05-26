import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';
import { GeminiAdapter } from './gemini.js';
import { ExportAdapter } from './export.js';
import { ModelAdapter, ModelDefinition } from './types.js';
import { VibeflowConfig } from '../core/config.js';

type AdapterFactory = (def: ModelDefinition) => ModelAdapter;

/**
 * 按 model id 选择 Adapter 实现。规则：
 *   - id === 'claude' 或 command 含 'claude'  → ClaudeAdapter
 *   - id === 'codex'  或 command 含 'codex'   → CodexAdapter
 *   - id === 'gemini' 或 command 含 'gemini'  → GeminiAdapter
 *   - type === 'export'                       → ExportAdapter
 *   - 其它统一兜底为 ClaudeAdapter 风格（stdin pipe）
 */
const BUILTIN: Array<{ match: (def: ModelDefinition) => boolean; factory: AdapterFactory }> = [
  {
    match: (def) => def.type === 'export',
    factory: (def) => new ExportAdapter(def),
  },
  {
    match: (def) => def.id === 'claude' || (def.command ?? '').includes('claude'),
    factory: (def) => ClaudeAdapter.create(def),
  },
  {
    match: (def) => def.id === 'codex' || (def.command ?? '').includes('codex'),
    factory: (def) => CodexAdapter.create(def),
  },
  {
    match: (def) => def.id === 'gemini' || (def.command ?? '').includes('gemini'),
    factory: (def) => GeminiAdapter.create(def),
  },
];

export function createAdapter(def: ModelDefinition): ModelAdapter {
  const hit = BUILTIN.find((entry) => entry.match(def));
  if (hit) return hit.factory(def);
  // 兜底：通用 stdin pipe 行为，按 Claude 形式处理
  return ClaudeAdapter.create(def);
}

export function buildAdapterMap(config: VibeflowConfig): Map<string, ModelAdapter> {
  const map = new Map<string, ModelAdapter>();
  for (const [id, def] of Object.entries(config.models)) {
    map.set(id, createAdapter({ ...def, id }));
  }
  // 始终内建一个 export-fallback，可在 doctor/调用时显式选择
  if (!map.has('export')) {
    map.set('export', new ExportAdapter({ id: 'export', type: 'export' }));
  }
  return map;
}

export function getAdapter(adapterMap: Map<string, ModelAdapter>, modelId: string): ModelAdapter {
  const adapter = adapterMap.get(modelId);
  if (!adapter) {
    throw new Error(`未在 config.yaml 中找到模型: ${modelId}`);
  }
  return adapter;
}
