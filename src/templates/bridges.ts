/**
 * 项目根的 CLAUDE.md / AGENTS.md 桥接文件。
 * 让原生 Claude Code / Codex / 其它 AI 编程工具启动时能自动发现 vibeflow 的产物。
 *
 * 用户离开 vibeflow 直接用原生 CLI 时，这些文件仍然指引模型读到项目规则和当前任务的产物。
 */

export const CLAUDE_BRIDGE = `# CLAUDE.md

> 这个项目使用 [vibeflow](https://github.com/) 编排多模型 AI 研发流程。
> 即使没有运行 \`vibeflow\` CLI，你也应当读取下面的文件来获取项目上下文。

## 1. 项目规则（必读，按顺序）

- \`.ai-dev/rules/project_rules.md\` — 项目概览、目录约定、不可触碰的红线
- \`.ai-dev/rules/coding_rules.md\` — 编码规范
- \`.ai-dev/rules/product_rules.md\` — 产品红线

## 2. 当前进行中的任务（如有）

在 \`docs/ai-workflow/\` 下查看各任务目录。每个任务目录都有 \`run.json\`。

找到 \`status\` 为 \`in_progress\` 或 \`blocked\` 的任务，然后阅读：

| 文件 | 何时读 |
|---|---|
| \`00_requirement.md\` | 总是先读 |
| \`03_final_plan.md\` | 已存在 → 这是已锁定的方案，不得超出范围 |
| \`04_human_decisions.md\` | 用户拍板的关键决定 |
| \`05_implementation_report.md\` | 上一次开发已做了什么 |
| \`06_code_review.md\` | 评审反馈 |
| \`handoff.md\` | 上一位模型/会话留下的交接信息 |

## 3. 全局偏好（用户级）

如果 \`~/.vibeflow/profile.md\` 存在，请读取并优先遵守其中跨项目的偏好（除非与项目规则冲突）。

## 4. 协作约束

- 发现需求或方案有歧义 → **先列出待确认问题**，不要凭假设继续
- \`03_final_plan.md\` 一旦存在，开发不得超出其范围
- 涉及付费 / 账号 / 权限 / 数据迁移 / 删除操作 → 停下等用户确认
- 不要修改 \`.ai-dev/\` 目录下的配置文件，除非用户明确要求

## 5. 关于 vibeflow

\`vibeflow\` 是一个把多个 AI 编程工具组织成研发团队的 CLI 工具。每个研发阶段（需求/方案/评审/开发/评审/测试/归档）都有标准产物。详见 \`.ai-dev/\` 目录和项目内的 vibeflow docs/。

如果用户当前没有用 vibeflow 调用你，你只需把上面的产物当作有效的项目上下文即可。
`;

export const AGENTS_BRIDGE = `# AGENTS.md

> 这个项目使用 vibeflow 编排多模型 AI 研发流程。
> 任何 AI 编程 Agent（Codex / Cursor Agent / 等）启动后请读取以下文件。

## 必读：项目规则

- \`.ai-dev/rules/project_rules.md\`
- \`.ai-dev/rules/coding_rules.md\`
- \`.ai-dev/rules/product_rules.md\`

## 当前任务（如有进行中的）

\`docs/ai-workflow/\` 下每个目录是一个研发任务，含 \`run.json\` 状态机和阶段产物。
找到 \`status: in_progress\` 的任务，按 \`00_*.md\` → \`03_final_plan.md\` → \`05_implementation_report.md\` 的顺序读上下文。

## 关键约束

- \`03_final_plan.md\` 是锁定的方案，不得越界开发
- 高风险操作（删除、迁移、推送、改权限）必须人工确认
- 不要修改 \`.ai-dev/\` 配置文件

## 全局偏好

\`~/.vibeflow/profile.md\` 是用户的跨项目偏好（如有）。
`;
