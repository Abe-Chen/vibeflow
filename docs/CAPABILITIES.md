# vibeflow 能力总览

> v0.3.0 · Node.js 20+ · 这里只描述当前代码中已经实现的能力。

## 一句话

vibeflow 让不同 AI 模型分别负责方案、开发和评审，通过跨模型复核减少“同一个模型自写自审”带来的共同盲区。

## 完整研发流水线

`standard_feature` 有 9 个阶段，状态持久化在 `run.json`：

```text
requirement → plan → plan-review → finalize → develop → code-review → fix → test → archive
```

每个阶段输出独立 Markdown 产物。需求和最终方案需要人工确认，最终方案未锁定时不能进入开发。

另外提供：

- `quick_fix`：需求 → 开发 → 代码评审 → 测试。
- `bugfix`：需求 → 方案 → 定稿 → 开发 → 代码评审 → 测试。

## 核心价值

### 不同模型负责生产与复核

默认配置中：

- Codex 负责方案、定稿和开发。
- Claude 负责需求、方案评审、代码评审和 QA。

方案作者与方案评审者默认分离；代码评审还有硬门禁，实际 Reviewer 不能与 Developer 使用同一个模型。角色映射可以配置，关键不是固定使用哪家模型，而是让生产者和复核者保持独立视角。

跨模型评审在真实项目中发现过动画边界遗漏、模型声称修改但代码未落盘、旧业务链路被新实现切断、引用不存在的 SDK API 等问题。不同模型不保证绝对正确，但能减少作者沿用原假设进行自我辩护或重复遗漏的概率。

### 开发结果真实落盘

develop/fix 会让模型直接修改工作区，而不是只输出一段待人工复制的 Patch：

- Codex：workspace-write 沙箱。
- Claude：acceptEdits 权限模式。
- Gemini：自动审批写入模式。

写入后会检查 Git diff；若配置了 `commands.build`，还会执行构建验证。未检测到真实代码变更或构建失败时，不会把阶段当成正常完成。

## 质量与可靠性

- **人工门禁**：需求和最终方案必须由人确认。
- **方案锁定**：`03_final_plan.md` 锁定后才能 develop。
- **跨模型代码评审**：Reviewer 模型不能与 Developer 相同。
- **真实落盘检测**：develop/fix 后验证 Git diff。
- **项目命令验证**：支持 build、test、lint 命令。
- **阶段超时**：可为 develop/fix 等慢阶段单独配置。
- **超时成果保留**：超时但已落盘的变更会保留，并把阶段标为 blocked。
- **阶段重跑**：`--force` 可重做已完成阶段并重置过时的下游状态。

## 多模型探索池

`plan --multi` 可让 2～3 个模型并行生成候选方案。用户可以：

- `consult`：让指定模型比较或点评候选。
- `synthesize`：融合多个方案。
- `accept-plan`：显式选择最终进入正式评审的方案。

探索池不会自动替用户做最终产品决策。

## 可追踪与可续接

- 需求、方案、评审、实现、测试和发布说明均为 Markdown。
- `run.json` 持久化任务、阶段、模型和探索池状态。
- `status` 查看全局状态，`next` 推荐下一条命令。
- `handoff` 生成跨会话、跨模型交接文档。
- `deliver` 支持只交付方案，之后仍能继续开发。
- `change-request` 支持已归档任务做轻量修订。

## 记忆与配置

- 全局层：`~/.vibeflow/profile.md`，保存跨项目偏好。
- 项目层：`.ai-dev/rules/`，保存项目规则。
- 任务层：`docs/ai-workflow/<feature>/`，保存任务上下文与产物。
- `init` 生成 `CLAUDE.md` 和 `AGENTS.md` 桥接，让原生 Claude Code / Codex 也能发现上下文。
- 角色与模型解耦，可在配置中绑定，也可用 `--model` 临时覆盖。
- CLI 不可用时可用 `--export` 只导出 Prompt。

## 项目适配

项目扫描和工具链检测覆盖常见的 Node/TypeScript、Flutter/Dart、Python、Rust、Go、Java/Kotlin、iOS/Swift、Supabase/Deno、Ruby 和 PHP 项目，并兼容代码位于深层目录的仓库。

## 已验证场景

- Android Kotlin 项目：完整 9 阶段闭环，跨模型评审多次发现真实问题。
- 某生产级 iOS + Supabase/Deno 项目：多次完整流水线、跨模型评审和变更请求。
- vibeflow 自身：使用自身流程设计并实现 `deliver` 与多模型探索池。

## 23 个顶层命令

| 类别 | 命令 |
|---|---|
| 项目 | `init`、`doctor`、`learn`、`profile` |
| 任务 | `new`、`status`、`next` |
| 阶段 | `requirement`、`plan`、`plan-review`、`finalize`、`develop`、`code-review`、`fix`、`test`、`archive` |
| 探索池 | `accept-plan`、`consult`、`synthesize` |
| 流转 | `advance`、`deliver`、`change-request`、`handoff` |

`profile` 下面还有 `init`、`show`、`edit`、`path`、`sync-claude` 和 `unsync-claude` 子命令。

## 当前尚未具备

- 自动 Judge：结构化裁决多模型意见冲突。
- 多 feature 的 Git worktree 隔离。
- 本地 Web 可视化工作台。
- 团队权限、审计和云端协作。
- 自动完成真机、GUI 或真实后端环境验收。

详细用法见 [USAGE.md](USAGE.md)。
