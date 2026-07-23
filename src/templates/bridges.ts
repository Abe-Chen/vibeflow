/**
 * 项目根的 CLAUDE.md / AGENTS.md 桥接文件。
 * 让原生 Claude Code / Codex / 其它 AI 编程工具启动时能自动发现 vibeflow 的产物。
 *
 * 内容用标记块 <!-- BEGIN vibeflow --> ... <!-- END vibeflow --> 包裹，
 * 这样对【已存在】的 CLAUDE.md / AGENTS.md 可以"插入/更新本区块"而不覆盖用户原有内容。
 */

export const VIBEFLOW_BLOCK_START = '<!-- BEGIN vibeflow -->';
export const VIBEFLOW_BLOCK_END = '<!-- END vibeflow -->';

/** vibeflow 桥接区块内容（通用，适用于 Claude / Codex / 其它 agent）。 */
export function buildBridgeBlock(): string {
  return [
    VIBEFLOW_BLOCK_START,
    '',
    '## vibeflow 工作流（本区块由 vibeflow 维护，请勿手改）',
    '',
    '> 本项目用 [vibeflow](https://github.com/Abe-Chen/vibeflow) 编排多模型 AI 研发流程。',
    '> 即使没有人通过 `vibeflow` CLI 调用你，下面的产物也是有效的项目上下文。',
    '',
    '### 与 vibeflow 的配合（仅当有进行中任务时）',
    '',
    'vibeflow 是本项目**可选**的多模型研发流程工具，**不是所有需求都要走它**——是否对某个需求启用由用户决定。',
    '',
    '- 只有当 `docs/ai-workflow/` 下存在 `in_progress` / `blocked` 的任务时，才用 `vibeflow next` 或 `vibeflow status` 了解其状态（比自己解析 `run.json` 更可靠）；**没有进行中任务，就按常规直接处理需求，不必牵扯 vibeflow。**',
    '- `vibeflow next` 给的是**顺流默认导航，仅供参考**。**用户指令优先**：用户要退回 / 改方案 / 重做某阶段时以用户为准（用对应阶段的 `--force` 重跑），不要因为 next 建议往前就往前。',
    '',
    '### 项目规则（必读，按顺序）',
    '',
    '- `.ai-dev/rules/project_rules.md` — 项目概览、目录约定、不可触碰的红线',
    '- `.ai-dev/rules/coding_rules.md` — 编码规范',
    '- `.ai-dev/rules/product_rules.md` — 产品红线',
    '',
    '### 进行中的任务（如有）',
    '',
    '在 `docs/ai-workflow/` 下找 `status` 为 `in_progress` 或 `blocked` 的任务，按需阅读：',
    '',
    '| 文件 | 何时读 |',
    '|---|---|',
    '| `00_requirement.md` | 总是先读 |',
    '| `03_final_plan.md` | 已存在 → 这是已锁定的方案，不得超出范围 |',
    '| `04_human_decisions.md` | 用户拍板的关键决定 |',
    '| `05_implementation_report.md` | 上一次开发已做了什么 |',
    '| `06_code_review.md` | 评审反馈 |',
    '| `handoff.md` | 上一位模型/会话留下的交接信息 |',
    '',
    '### 全局偏好（用户级）',
    '',
    '若 `~/.vibeflow/profile.md` 存在，读取并优先遵守其中跨项目的偏好（除非与项目规则冲突）。',
    '',
    '### 协作约束',
    '',
    '- 发现需求或方案有歧义 → **先列出待确认问题**，不要凭假设继续',
    '- `03_final_plan.md` 一旦存在，开发不得超出其范围',
    '- 涉及付费 / 账号 / 权限 / 数据迁移 / 删除操作 → 停下等用户确认',
    '- 不要修改 `.ai-dev/` 目录下的配置文件，除非用户明确要求',
    '',
    VIBEFLOW_BLOCK_END,
  ].join('\n');
}

export const CLAUDE_BRIDGE = `# CLAUDE.md\n\n${buildBridgeBlock()}\n`;
export const AGENTS_BRIDGE = `# AGENTS.md\n\n${buildBridgeBlock()}\n`;

/**
 * 把 vibeflow 区块合并进【已存在】的 CLAUDE.md / AGENTS.md：
 * - 已含本标记区块 → 原地更新（内容相同则 unchanged）；
 * - 不含 → 追加到文件末尾。
 * 不触碰用户其它内容。
 */
export function upsertBridgeBlock(existing: string): {
  content: string;
  mode: 'added' | 'updated' | 'unchanged';
} {
  const block = buildBridgeBlock();
  if (existing.includes(VIBEFLOW_BLOCK_START) && existing.includes(VIBEFLOW_BLOCK_END)) {
    const re = new RegExp(`${VIBEFLOW_BLOCK_START}[\\s\\S]*?${VIBEFLOW_BLOCK_END}`, 'm');
    const next = existing.replace(re, block);
    return next === existing
      ? { content: existing, mode: 'unchanged' }
      : { content: next, mode: 'updated' };
  }
  const next = existing.trimEnd() + '\n\n' + block + '\n';
  return { content: next, mode: 'added' };
}
