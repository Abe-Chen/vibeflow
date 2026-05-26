# 多模型 AI 研发工作流系统 - 技术方案

| 文档属性 | 内容 |
|---|---|
| 文档类型 | 技术方案 / Technical Design |
| 适用产品 | 多模型 AI 研发工作流系统 |
| 目标版本 | MVP - V4 长期演进 |
| 核心定位 | 面向 Vibe Coding 的多模型研发流程编排、执行、评审与验收系统 |
| 推荐形态 | Local-first CLI + Web 控制台，后续扩展为桌面端 / 团队版 / 云端协作版 |
| 主要用户 | 产品经理、独立开发者、AI 编程用户、小型研发团队、技术负责人 |
| 当前状态 | 初版技术方案 |

---

## 1. 技术方案结论

本系统不建议从一开始做成“纯聊天工具”或“单一 IDE 插件”，而应设计为一个 **Local-first 的多模型研发工作流编排系统**。

推荐技术路线：

```text
第一阶段：CLI + 本地项目目录 + Markdown 产物 + YAML 配置
第二阶段：本地 Web 控制台 + 工作流状态管理 + 模型适配层
第三阶段：Git/Worktree 隔离 + 多 Agent 并发 + 质量门禁
第四阶段：团队协作 + 云端任务记录 + 权限体系 + 成本统计
第五阶段：插件生态 + IDE 集成 + 可视化工作流编排
```

核心技术原则：

```text
1. 文档驱动：每个阶段必须生成明确产物，而不是只保留聊天记录。
2. 流程驱动：需求、方案、评审、开发、测试、验收均进入状态机管理。
3. 角色与模型解耦：Planner、Reviewer、Developer、QA 是角色，Codex、Claude、Gemini 是可替换执行模型。
4. 本地优先：优先在用户项目目录内运行，保护代码和上下文资产。
5. Git 隔离：开发执行建议基于 branch/worktree，避免多个模型互相覆盖。
6. 人工门禁：涉及范围、架构、数据、权限、付费、风险时必须停下等待用户确认。
7. 可扩展适配：模型、IDE、CLI、测试工具、CI、代码仓库均通过 Adapter 接入。
```

---

## 2. 建设目标

### 2.1 业务目标

系统要解决用户在 AI 编程中的以下问题：

| 问题 | 技术方案中的解决方式 |
|---|---|
| 多个模型需要手动开终端切换 | 通过模型适配层和工作流引擎统一调度 |
| 方案讨论没有沉淀 | 每个阶段输出 Markdown / JSON 产物 |
| AI 容易直接写代码，缺少方案确认 | 设置 Plan Review Gate 和 Final Plan Lock |
| 切换模型时上下文丢失 | 引入 Handoff Artifact 和 Run Context |
| 多 Agent 同时改代码容易冲突 | 使用 Git branch / worktree 隔离 |
| 开发完成后不知道改了什么 | 强制生成 Implementation Report |
| AI 评审意见过多或跑偏 | 评审结果结构化为 Blocker / Major / Minor / Question |
| 测试验收薄弱 | 引入 Test Plan、Test Run、Acceptance Report |
| 不同任务需要不同流程 | 通过 Workflow Template 配置 |
| 不同阶段适合不同模型 | 通过 Role - Model Mapping 配置 |

### 2.2 技术目标

```text
P0：支持单项目、本地运行、手动触发阶段、生成标准产物。
P1：支持工作流状态管理、阶段自动流转、模型可配置、Git 隔离。
P2：支持多 Agent 并发、方案投票、争议裁决、测试自动化、Web 控制台。
P3：支持团队协作、权限、审计、云端同步、组织级模板。
P4：支持插件生态、IDE 集成、模型市场、可视化流程编排。
```

---

## 3. 系统整体架构

### 3.1 总体架构图

```text
┌─────────────────────────────────────────────────────────────┐
│                         用户入口层                          │
│  CLI / Local Web Console / Desktop App / IDE Plugin / API    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         应用服务层                          │
│  Project Service / Workflow Service / Artifact Service       │
│  Config Service / Decision Service / Audit Service           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         工作流引擎层                        │
│  Workflow Engine / Stage Runner / Gate Manager / Scheduler   │
│  Context Builder / State Machine / Retry & Resume            │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         Agent 编排层                        │
│  Role Manager / Agent Orchestrator / Debate Manager          │
│  Reviewer Panel / Judge Agent / Handoff Manager              │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         模型适配层                          │
│  Codex Adapter / Claude Adapter / Gemini Adapter             │
│  OpenCode Adapter / Cursor Adapter / HTTP LLM Adapter        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         执行与工具层                        │
│  Git Manager / Worktree Manager / Shell Executor             │
│  Test Runner / Static Analyzer / CI Adapter / File System    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                         数据与产物层                        │
│  SQLite/Postgres / Markdown Artifacts / JSON Logs            │
│  Prompt Templates / YAML Config / Git Repo / File Storage    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 架构分层说明

| 层级 | 主要职责 | MVP 是否需要 |
|---|---|---|
| 用户入口层 | 用户发起需求、选择模型、查看进度、确认门禁 | 需要 CLI；Web 可在 V1 做 |
| 应用服务层 | 管理项目、流程、配置、产物、决策记录 | MVP 需要轻量版本 |
| 工作流引擎层 | 控制阶段流转、状态机、失败重试、恢复 | MVP 需要基础状态机 |
| Agent 编排层 | 分配角色、组织评审、处理争议和交接 | MVP 需要单 Agent + Review Agent |
| 模型适配层 | 统一调用 Codex、Claude、Gemini 等模型 | MVP 需要 CLI Adapter |
| 执行与工具层 | 操作 Git、执行命令、跑测试、读取 diff | MVP 需要 Git + Shell 基础能力 |
| 数据与产物层 | 存储运行记录、阶段产物、配置、日志 | MVP 使用本地文件 + SQLite |

---

## 4. 推荐技术栈

### 4.1 MVP 技术栈

| 模块 | 推荐技术 | 原因 |
|---|---|---|
| CLI | Node.js + TypeScript + Commander 或 Oclif | 易于调用 shell、读写文件、跨平台 |
| 本地服务 | Node.js + Fastify 或 Hono | 轻量、启动快、适合本地 API |
| 数据库 | SQLite + Drizzle ORM | 本地优先、部署简单、后续可迁移 Postgres |
| 配置 | YAML + JSON Schema | 易读、易修改、适合声明式工作流 |
| 文档产物 | Markdown + JSON metadata | 人可读，模型也容易读 |
| 模型调用 | CLI Adapter + Process Spawn | 先接 Codex/Claude/Gemini CLI，降低集成成本 |
| Git 操作 | simple-git / child_process git | 支持 branch、diff、commit、worktree |
| 测试执行 | Shell Runner | 直接跑 npm test、pnpm test、flutter test 等 |
| 前端控制台 | React + Vite | V1 引入，展示流程和产物 |
| 桌面壳 | Tauri 或 Electron | 后期可选，Tauri 更轻 |

### 4.2 V2 - V4 技术栈演进

| 阶段 | 技术升级 |
|---|---|
| V1 | 增加 React Web Console、本地 API、流程可视化 |
| V2 | 增加 Queue、并发 Agent、Worktree 隔离、Panel Review |
| V3 | SQLite 升级到 Postgres，增加团队空间、权限、审计 |
| V4 | 插件系统、IDE 插件、云端任务协作、模型成本统计 |

### 4.3 为什么不建议一开始直接做云端 SaaS

```text
1. 用户代码和项目上下文敏感，Local-first 更容易获得信任。
2. AI 编程工具链依赖本地 CLI、IDE、Git、测试命令，云端很难覆盖所有场景。
3. 早期最大价值是验证流程，而不是做账户、权限、计费和团队协作。
4. 本地文件驱动可以快速迭代，后续再抽象为云端协作。
```

---

## 5. 核心模块设计

## 5.1 Project Manager 项目管理模块

### 职责

管理接入系统的代码项目。

### 主要能力

```text
1. 初始化项目工作流目录
2. 识别项目类型和技术栈
3. 读取 Git 状态
4. 读取项目配置
5. 管理项目级规则文件
6. 管理项目内所有 workflow runs
```

### 项目初始化目录

```text
project-root/
  .ai-dev/
    config.yaml
    agents/
      product_analyst.md
      planner.md
      reviewer.md
      developer.md
      qa.md
    workflows/
      standard_feature.yaml
      bugfix.yaml
      refactor.yaml
      ui_iteration.yaml
    prompts/
      requirement.md
      plan.md
      review.md
      finalize.md
      develop.md
      code_review.md
      test.md
    rules/
      project_rules.md
      coding_rules.md
      product_rules.md
  docs/
    ai-workflow/
      feature_xxx/
        00_requirement.md
        01_plan_v1.md
        02_plan_review.md
        03_final_plan.md
        04_handoff.md
        05_implementation_report.md
        06_code_review.md
        07_test_report.md
        08_release_note.md
        run.json
```

### 初始化命令

```bash
ai-dev init
ai-dev init --template standard
ai-dev init --template strict
```

---

## 5.2 Workflow Engine 工作流引擎

### 职责

工作流引擎负责控制每个需求从开始到交付的完整生命周期。

### 标准状态机

```text
CREATED
  ↓
REQUIREMENT_DRAFTING
  ↓
REQUIREMENT_CONFIRMED
  ↓
PLANNING
  ↓
PLAN_REVIEWING
  ↓
PLAN_REVISING
  ↓
FINAL_PLAN_PENDING_CONFIRMATION
  ↓
FINAL_PLAN_LOCKED
  ↓  （二选一）
  ├─→ DELIVERED  （vibeflow deliver：只交付方案收尾；软终态、可逆，随时回到 DEVELOPING）
  ↓
DEVELOPING
  ↓
IMPLEMENTATION_REPORTED
  ↓
CODE_REVIEWING
  ↓
FIXING
  ↓
TESTING
  ↓
ACCEPTANCE_PENDING
  ↓
DONE
```

异常状态：

```text
BLOCKED：需要人工处理阻塞问题
FAILED：阶段执行失败
CANCELLED：用户取消
PAUSED：用户暂停
ROLLBACK_REQUIRED：需要回滚或重新规划
```

### 阶段定义

| 阶段 | 输入 | 输出 | 是否默认需要人工确认 |
|---|---|---|---|
| Requirement | 用户自然语言需求 | 00_requirement.md | 是 |
| Plan | 需求文档 + 项目上下文 | 01_plan_v1.md | 否 |
| Plan Review | 方案 + 上下文 | 02_plan_review.md | 否 |
| Finalize | 方案 + 评审 | 03_final_plan.md | 是 |
| Develop | final_plan + 当前代码 | 代码变更 + 05_implementation_report.md | 否 |
| Code Review | final_plan + diff + report | 06_code_review.md | 视情况 |
| Fix | review_report | 修复变更 + fix_report | 否 |
| Test | final_plan + diff | 07_test_report.md | 否 |
| Accept | 测试报告 + 产物 | 验收结果 | 是 |
| Archive | 全部产物 | 08_release_note.md | 否 |

---

## 5.3 Workflow Template 工作流模板

### 目标

不同类型任务使用不同流程，避免所有需求都走重流程。

### 内置模板

| 模板 | 适用场景 | 流程强度 |
|---|---|---|
| quick_fix | 小 bug、小文案、小样式 | 轻 |
| standard_feature | 普通功能开发 | 标准 |
| complex_feature | AI 助手、账号、支付、数据结构变更 | 严格 |
| bugfix | 缺陷修复 | 标准 |
| refactor | 重构 | 严格 |
| ui_iteration | UI/交互迭代 | 标准 + 视觉验收 |
| prd_only | 只输出文档 | 轻 |
| research_plan | 调研 + 方案 | 标准 |

### 模板示例

```yaml
id: standard_feature
name: 普通功能开发
stages:
  - id: requirement
    role: product_analyst
    output: 00_requirement.md
    human_gate: true
  - id: plan
    role: planner
    output: 01_plan_v1.md
  - id: plan_review
    role: plan_reviewer
    output: 02_plan_review.md
  - id: finalize
    role: finalizer
    output: 03_final_plan.md
    human_gate: true
    lock_artifact: true
  - id: develop
    role: developer
    output: 05_implementation_report.md
    requires_locked_plan: true
  - id: code_review
    role: code_reviewer
    output: 06_code_review.md
  - id: fix
    role: developer
    input: 06_code_review.md
    policy: only_blocker_and_approved_major
  - id: test
    role: qa
    output: 07_test_report.md
  - id: archive
    role: release_writer
    output: 08_release_note.md
```

---

## 5.4 Role Manager 角色管理模块

### 设计原则

角色与模型必须解耦。

```text
错误设计：Codex = Developer，Claude = Reviewer
正确设计：Developer 是角色，Codex/Claude/Gemini 是可选执行模型
```

### 内置角色

| 角色 | 职责 | 可用模型示例 |
|---|---|---|
| Product Analyst | 整理需求、边界、用户场景 | Claude / GPT / Gemini |
| Planner / Architect | 输出技术方案、任务拆解 | Codex / Claude |
| Plan Reviewer | 评审方案完整性和风险 | Claude / Gemini / GPT |
| Finalizer | 吸收评审意见，输出最终方案 | Codex / Claude |
| Developer | 按最终方案开发 | Codex / Claude / OpenCode |
| Code Reviewer | 审代码、审实现偏差 | Claude / Codex / Gemini |
| QA Tester | 生成测试用例、执行测试、输出报告 | Claude / Codex |
| Judge | 多模型意见冲突时裁决 | Claude / GPT / Gemini |
| Release Writer | 输出上线说明和复盘 | Claude / GPT |

### 角色配置示例

```yaml
roles:
  product_analyst:
    default_model: claude
    fallback_models: [gemini, gpt]
    temperature: 0.2

  planner:
    default_model: codex
    fallback_models: [claude]
    temperature: 0.1

  plan_reviewer:
    default_model: claude
    fallback_models: [gemini]
    temperature: 0.1

  developer:
    default_model: codex
    fallback_models: [claude]
    require_worktree: true

  code_reviewer:
    default_model: claude
    fallback_models: [codex, gemini]
    must_be_different_from_developer: true
```

---

## 5.5 Model Adapter 模型适配层

### 目标

统一接入 Codex、Claude、Gemini、OpenCode、Cursor Agent、本地模型、HTTP LLM API 等执行器。

### Adapter 抽象

```ts
interface ModelAdapter {
  id: string;
  name: string;
  type: 'cli' | 'http' | 'ide' | 'local';
  capabilities: ModelCapability[];

  checkAvailability(): Promise<AdapterStatus>;
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  stream?(request: AgentRunRequest): AsyncIterable<AgentRunEvent>;
  cancel?(runId: string): Promise<void>;
}
```

### 请求结构

```ts
interface AgentRunRequest {
  runId: string;
  stageId: string;
  roleId: string;
  modelId: string;
  projectRoot: string;
  workingDirectory: string;
  prompt: string;
  contextFiles: string[];
  outputContract: OutputContract;
  permissions: PermissionPolicy;
  timeoutMs?: number;
}
```

### 返回结构

```ts
interface AgentRunResult {
  status: 'success' | 'failed' | 'blocked' | 'cancelled';
  outputText: string;
  artifacts: ArtifactRef[];
  changedFiles?: string[];
  commands?: CommandRecord[];
  tokenUsage?: TokenUsage;
  cost?: CostRecord;
  error?: string;
}
```

### CLI Adapter 示例

```yaml
models:
  codex:
    type: cli
    command: codex
    args: []
    working_mode: interactive_or_prompt_file
    supports_code_edit: true
    supports_shell: true

  claude:
    type: cli
    command: claude
    args: []
    working_mode: interactive_or_prompt_file
    supports_code_edit: true
    supports_shell: true

  gemini:
    type: cli
    command: gemini
    args: []
    supports_long_context: true
```

### MVP 调用策略

MVP 阶段采用 **spawn 优先 + 半自动兜底** 的双轨调用策略。

理由：2026 年初 Claude Code、Codex CLI、Gemini CLI 均已提供非交互模式，spawn 自动调用可行且体验显著优于手动复制粘贴。

```text
默认路径（spawn 自动调用）：
1. 系统组装阶段 Prompt 与上下文文件清单。
2. 系统通过 child_process spawn 直接调用对应 CLI 的非交互模式：
   - Claude Code: `claude -p "prompt"`（或 `--output-format json`）
   - Codex CLI: `codex exec "prompt"`
   - Gemini CLI: `gemini -p "prompt"`
3. 系统捕获 stdout/stderr 与退出码，读取约定输出文件，更新阶段状态。
4. 失败或超时进入重试或人工兜底。

兜底路径（半自动导出）：
1. 用户可对单阶段选择 "export prompt" 模式。
2. 系统生成 Prompt 文件和操作说明，用户复制到 IDE / GUI 工具执行。
3. 用户完成后回到系统标记阶段完成，系统读取约定输出文件。
4. 适用场景：复杂多轮交互、IDE 内深度操作、CLI headless 能力不足、用户自行选择手动控制。

后续版本演进：完整流式日志、可视化进度、自动恢复、worktree 并发隔离。
```

---

## 5.6 Prompt Template 提示词模板系统

### 目标

把每个阶段的执行标准固化为模板，避免用户每次重复写复杂提示词。

### 模板变量

```text
{{project_name}}
{{feature_name}}
{{stage_id}}
{{role_name}}
{{requirement_file}}
{{plan_file}}
{{review_file}}
{{final_plan_file}}
{{diff_summary}}
{{output_path}}
{{rules}}
{{human_decisions}}
```

### Plan 阶段模板示例

```markdown
你是本项目的方案设计 Agent。

请阅读以下内容：
- 需求文档：{{requirement_file}}
- 项目规则：{{project_rules}}
- 相关代码目录：{{related_paths}}

任务：
1. 不要写代码。
2. 输出实现方案到：{{output_path}}
3. 方案必须包含：需求理解、目标与非目标、影响范围、技术设计、数据影响、接口影响、文件修改清单、实现步骤、风险点、测试方案、需要人工确认的问题。
4. 如果需求不清楚，不要自行假设为最终事实，请列入“需要人工确认的问题”。
```

### Code Review 模板示例

```markdown
你是代码评审 Agent。

请对照以下内容进行评审：
- 最终方案：{{final_plan_file}}
- 实现报告：{{implementation_report_file}}
- 当前代码 diff：{{diff_summary}}

请输出评审报告到：{{output_path}}

评审结果必须分级：
- Blocker：不修不能上线
- Major：强烈建议修复
- Minor：可选优化
- Question：需要人工决策

请重点检查：
1. 是否严格符合 final_plan。
2. 是否扩大范围。
3. 是否遗漏需求。
4. 是否破坏旧功能。
5. 是否有异常场景未处理。
6. 是否有测试不足。
7. 是否需要回滚部分改动。
```

---

## 5.7 Artifact Manager 产物管理模块

### 目标

所有流程阶段必须有可追踪产物。

### 产物类型

| 产物 | 文件 | 说明 |
|---|---|---|
| 需求文档 | 00_requirement.md | 结构化需求 |
| 方案 v1 | 01_plan_v1.md | 初始方案 |
| 方案评审 | 02_plan_review.md | 评审意见 |
| 最终方案 | 03_final_plan.md | 锁定方案 |
| 人工决策 | 04_human_decisions.md | 用户拍板记录 |
| 交接文档 | 04_handoff.md | 切换模型或暂停恢复用 |
| 实现报告 | 05_implementation_report.md | 开发结果说明 |
| 代码评审 | 06_code_review.md | 代码评审报告 |
| 测试报告 | 07_test_report.md | 测试与验收报告 |
| 上线说明 | 08_release_note.md | 交付说明 |
| 运行元数据 | run.json | 状态、时间、模型、文件索引 |

### 产物元数据

```json
{
  "artifact_id": "art_001",
  "run_id": "run_001",
  "stage_id": "plan_review",
  "path": "docs/ai-workflow/schedule-query/02_plan_review.md",
  "type": "plan_review",
  "model_id": "claude",
  "created_at": "2026-05-20T10:00:00Z",
  "status": "completed",
  "hash": "sha256:..."
}
```

---

## 5.8 Gate Manager 门禁管理模块

### 目标

在关键阶段阻止 AI 直接进入下一步，确保用户掌控方向。

### 内置门禁

| 门禁 | 触发时机 | 是否强制 |
|---|---|---|
| Requirement Confirm Gate | 需求整理完成后 | 可配置 |
| Plan Review Gate | 方案评审完成后 | 标准/严格模式强制 |
| Final Plan Lock Gate | 最终方案完成后 | 强制 |
| Risk Gate | 涉及数据、权限、支付、账号、删除操作 | 强制 |
| Code Review Gate | 开发完成后 | 标准/严格模式强制 |
| Test Gate | 测试失败或未覆盖核心路径 | 强制 |
| Release Gate | 交付前 | 可配置 |

### 风险门禁触发规则

```text
如果评审或方案中出现以下关键词或结构化标签，系统进入 BLOCKED：
1. 数据迁移
2. 删除数据
3. 权限变更
4. 账号体系
5. 支付/订阅/计费
6. 安全策略
7. 生产环境配置
8. 大范围重构
9. 无法自动判断的产品取舍
```

---

## 5.9 Exploration Pool Manager 探索池管理模块（V2）

> 本节由原 "Debate Manager 多模型讨论模块" 重写。原版本是"多模型交叉评审 + Judge 裁决"的固定流水线，缺少"用户主导节奏 / 路径互通 / 跳过循环"等真实工作流需求。
> 详见 PRD §7.2 和 §15.3。

### 5.9.1 目标

支持用户在多个候选方案之间穿梭、问答、对比、融合，直到选出满意版本。
**与原 Debate Manager 的核心差异**：用户主导节奏，不强制循环，路径自由切换（锁定前）。

### 5.9.2 适用场景

```text
1. 复杂功能开发
2. 架构方案不确定
3. 想用多个模型视角避免一家之言
4. 简单需求不强制使用本模式（仍可走 standard_feature 单方案）
```

### 5.9.3 整体流程

```text
requirement (单轮)
  ↓
plan 阶段（用户选模式）：
  ├─ vibeflow plan          → 单模型出方案（默认，最轻）
  └─ vibeflow plan --multi  → 多模型并行出方案
       ↓
       系统主动展示菜单（认知层引导）：
       ├─ [1-3] accept A/B/C → plan-review（路径 1，最快）
       ├─ [4-6] consult     → 进探索池
       └─ [7]   synthesize  → 进探索池

  ↓
（如进探索池）
  consult/synthesize 可反复执行
  产物全部进 docs/ai-workflow/<feature>/explore/
  任何时候 accept-plan → 进 plan_review

  ↓
plan_review → finalize → develop ...

  ↓
[finalize advance = 锁定分水岭]
  锁定前：所有路径互通，可 back-to-explore
  锁定后：方案锁定，须 change-request
```

### 5.9.4 数据模型扩展

`run.json` 新增字段：

```ts
interface RunState {
  // ... 现有字段
  
  explore?: {
    parallel_plans: Array<{
      id: string;            // 'plan_A' / 'plan_B' / 'plan_C'
      model: string;
      file: string;          // 相对路径
      created_at: string;
    }>;
    consults: Array<{
      id: string;
      about: string[];       // 引用的产物文件
      model: string;
      file: string;
      at: string;
    }>;
    syntheses: Array<{
      id: string;            // 'synth_v1' / 'synth_v2' / ...
      base: string[];        // 融合的基础文件
      model: string;
      file: string;
      at: string;
    }>;
    accepted: {
      source_file: string;   // 当前 accept 的方案文件
      accepted_at: string;
    } | null;
  };
  
  locked: boolean;           // finalize advance 后置为 true
  change_requests?: Array<{  // 锁定后变更记录
    id: string;
    reason: string;
    created_at: string;
    resolved_at?: string;
  }>;
}
```

### 5.9.5 命令清单

| 命令 | 作用 | 涉及模块 |
|---|---|---|
| `vibeflow plan --multi [--models X,Y,Z]` | 多模型并行出方案 | ParallelPlanRunner |
| `vibeflow plan --multi-extend` | 把现有单方案纳入探索池 | ParallelPlanRunner |
| `vibeflow plan --add <model>` | 探索池中加新模型 | ParallelPlanRunner |
| `vibeflow consult --about <files> --model X -m "<问题>"` | 单轮问答 | ConsultRunner |
| `vibeflow synthesize --base <files> --model X [-m "<偏好>"]` | 融合方案 | SynthesizerRunner |
| `vibeflow accept-plan <file>` | 选定方案（锁定前可重新执行） | ExploreStateManager |
| `vibeflow back-to-explore` | 锁定前从 plan_review/finalize 退回探索池 | ExploreStateManager |
| `vibeflow change-request -m "<问题>"` | 锁定后的变更出口 | ChangeRequestRunner |
| `vibeflow plan-status` | 可视化探索池状态 | PlanStatusFormatter |
| `vibeflow next` | 上下文敏感的"接下来能做什么" | NextResolver |

### 5.9.6 核心模块拆分

| 模块 | 文件 | 职责 |
|---|---|---|
| `ParallelPlanRunner` | `src/core/parallel-plan.ts` | 并发 spawn 多个 Adapter，处理失败容错 |
| `ConsultRunner` | `src/core/consult.ts` | 单次问答；自动注入 --about 引用的文件 |
| `SynthesizerRunner` | `src/core/synthesize.ts` | 多方案融合；用户偏好通过 -m 或 04_human_decisions.md 输入 |
| `ExploreStateManager` | `src/core/explore-state.ts` | 状态机管理；accept-plan / back-to-explore 的状态转换 |
| `NextResolver` | `src/core/next-resolver.ts` | 基于 run.json 当前状态推荐下一步选项 |
| `PlanStatusFormatter` | `src/core/plan-status.ts` | 可视化探索池历史（ASCII art） |
| `ChangeRequestRunner` | `src/core/change-request.ts` | 锁定后变更的轻量评审流程 |
| `InteractiveMenu` | `src/cli/utils/menu.ts` | 阶段完成后主动展示选项菜单 |

### 5.9.7 lock-plan 分水岭语义

```text
[finalize advance 之前]
- locked = false
- accept-plan 可重新执行（覆盖前次选择）
- 探索池产物保留
- 任何路径切换都不需要 change-request
- back-to-explore 可用

[finalize advance 之后]
- locked = true
- 方案严格锁定
- accept-plan / back-to-explore 直接报错，提示走 change-request
- change-request 创建一个新的"变更评审"轻流程：
  1. 用户描述变更原因
  2. AI 评估变更影响范围
  3. 用户确认后更新 final_plan + 重新锁定
  4. 继续 develop
```

### 5.9.8 引导菜单（核心 UX 改进）

`stage-runner` 加一个新模块：每个阶段完成后调用 `InteractiveMenu.show(context)`。

```ts
interface MenuOption {
  key: string;              // '1' / '2' / 'A' / 'q'
  label: string;
  description?: string;
  command: string;          // 选中后执行的命令
  cost_hint?: string;       // "需要调一次模型，约 $0.01"
  recommended?: boolean;    // 默认高亮
}

interface MenuContext {
  stageId: string;
  exploreState: ExploreState;
  options: MenuOption[];
}
```

`NextResolver` 决定每个阶段后展示什么选项。例如 `plan --multi` 完成后：

```ts
NextResolver.resolve({
  stageId: 'parallel_plan',
  exploreState: { parallel_plans: [A, B, C], ... },
});

→ 返回：
[
  { key: '1', label: 'accept A → plan-review', recommended: true, ... },
  { key: '2', label: 'accept B → plan-review', ... },
  { key: '3', label: 'accept C → plan-review', ... },
  { key: '4', label: '问问 claude 对 A 的看法', cost_hint: '~$0.005' },
  { key: '5', label: '让 gemini 评判哪个好', cost_hint: '~$0.005' },
  { key: '6', label: '让 codex 融合 A+B', cost_hint: '~$0.01' },
  { key: '7', label: '重跑（改需求/换模型）' },
  { key: 'q', label: '退出菜单（我自己来）' },
]
```

### 5.9.9 实现顺序（V2 内的 MVP）

按价值/成本排序：

1. **`parallel-plan` + `accept-plan`**（路径 1）：覆盖 80% 多模型场景
2. **`InteractiveMenu` + `NextResolver` + `plan-status`**：认知层引导
3. **`consult` + `synthesize`**（路径 2）：完整探索池
4. **`back-to-explore`**：跨阶段反悔
5. **`change-request`**：锁定后变更出口
6. **`plan --multi-extend` + `plan --add`**：单方案 → 多方案的渐进升级

### 5.9.10 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| 探索池产物文件爆炸 | 自动归档到 `explore/` 子目录；`plan-status` 默认折叠老产物 |
| run.json 状态机变复杂 | 每个状态转移都写单元测试；`plan-status` 是排查工具 |
| 用户陷入"反复试"的拖延 | 引导菜单默认高亮 accept；超过 N 次 synthesize 后 `next` 提示"建议你 accept" |
| 锁定后误操作 | back-to-explore 失败时直接报错并提示 change-request |
| 多模型并行 token 成本 | Adapter 已预留 `tokenUsage` 字段；引导菜单标注成本提示 |

---

## 5.10 Git Manager 与 Worktree 隔离

### 目标

确保开发 Agent 的代码修改可追踪、可回滚、可隔离。

### 基础能力

```text
1. 检查 Git 是否干净
2. 创建 feature branch
3. 创建 worktree
4. 获取 diff
5. 获取 changed files
6. 生成 patch
7. 提交 commit
8. 回滚变更
9. 清理 worktree
```

### 推荐分支策略

```text
main / develop
  └── ai-dev/feature-name/codex-dev
  └── ai-dev/feature-name/claude-dev
  └── ai-dev/feature-name/review-fix
```

### Worktree 策略

```text
project-root/
worktrees/
  feature-name-codex/
  feature-name-claude/
  feature-name-review/
```

### 什么时候必须使用 Worktree

```text
1. 多个开发 Agent 并发开发
2. 复杂功能开发
3. 重构任务
4. 需要保留原项目干净状态
5. 用户选择“严格模式”
```

### MVP 策略

```text
MVP 可以先只支持 branch，不强制 worktree。
V1 支持自动 branch。
V2 支持 worktree 隔离。
```

---

## 5.11 Shell Executor 命令执行模块

### 目标

支持模型或系统执行测试、构建、lint、类型检查等命令。

### 权限策略

命令分为三类：

| 类型 | 示例 | 是否需要确认 |
|---|---|---|
| Safe | git diff、ls、cat、npm test | 默认允许 |
| Risky | npm install、pnpm add、rm、git reset | 需要确认 |
| Forbidden | 上传密钥、删除根目录、修改系统配置 | 禁止 |

### Command Policy 示例

```yaml
command_policy:
  allow:
    - git status
    - git diff
    - npm test
    - pnpm test
    - npm run build
    - flutter test
  require_confirm:
    - npm install
    - pnpm add
    - git reset
    - rm
  deny:
    - rm -rf /
    - curl * | sh
    - chmod -R 777
```

### 命令记录

```json
{
  "command": "npm test",
  "cwd": "/project/worktree/feature-a",
  "started_at": "...",
  "finished_at": "...",
  "exit_code": 0,
  "stdout_path": "logs/npm-test.out",
  "stderr_path": "logs/npm-test.err"
}
```

---

## 5.12 Test & Verification 测试验收模块

### 目标

把“AI 说完成了”变成“可验证完成”。

### 测试类型

| 类型 | 说明 |
|---|---|
| Static Check | lint、type-check、格式检查 |
| Unit Test | 单元测试 |
| Integration Test | 接口、数据库、模块联动 |
| E2E Test | 页面和用户流程 |
| Visual Test | UI 截图对比 |
| Manual Acceptance | 人工验收清单 |
| Regression Test | 旧功能回归 |

### 测试报告格式

```markdown
# 测试验收报告

## 1. 测试范围
## 2. 测试环境
## 3. 自动化测试结果
## 4. 手动验收清单
## 5. 失败用例
## 6. 未覆盖场景
## 7. 回归风险
## 8. 是否建议交付
```

### 验收标准

```text
1. final_plan 中 P0 需求全部完成。
2. 代码评审无 Blocker。
3. 核心测试命令通过。
4. 实现报告说明的风险可接受。
5. 用户确认 Acceptance Gate。
```

---

## 5.13 Context Builder 上下文构建模块

### 目标

每个模型执行任务前，系统需要自动组装最小必要上下文。

### 上下文来源

```text
1. 当前需求文档
2. 历史阶段产物
3. final_plan.md
4. human_decisions.md
5. 项目规则文件
6. 相关代码文件
7. Git diff
8. 测试日志
9. 之前的 review_report
10. handoff.md
```

### 上下文控制原则

```text
1. 不把整个项目无脑塞给模型。
2. 先用文件索引和规则定位相关目录。
3. 对长日志做摘要。
4. 对代码 diff 做优先级排序。
5. 阶段不同，上下文不同。
```

### 阶段上下文策略

| 阶段 | 必需上下文 |
|---|---|
| Requirement | 用户原始需求、项目简介、产品规则 |
| Plan | 需求文档、相关目录、项目规则、历史类似功能 |
| Review | 方案文档、需求文档、项目规则 |
| Develop | final_plan、human_decisions、相关代码、开发规则 |
| Code Review | final_plan、implementation_report、git diff |
| Test | final_plan、changed files、测试命令、验收标准 |

---

## 5.14 Handoff Manager 交接模块

### 目标

解决切换模型、暂停恢复、上下文中断的问题。

### 触发场景

```text
1. 用户手动切换开发模型
2. 当前模型失败
3. 任务暂停后恢复
4. 进入下一阶段前需要交接
5. 多 Agent 分模块开发
```

### Handoff 文档模板

```markdown
# Handoff

## 当前目标
## 已锁定方案
## 已完成内容
## 已修改文件
## 未完成事项
## 当前阻塞点
## 不能改动的约束
## 已知风险
## 下一步建议
## 验收标准
```

---

## 5.15 Config Center 配置中心

### 配置层级

```text
全局配置：~/.ai-dev/config.yaml
项目配置：project/.ai-dev/config.yaml
流程配置：project/.ai-dev/workflows/*.yaml
角色配置：project/.ai-dev/agents/*.md
用户临时配置：运行命令参数
```

### 优先级

```text
命令参数 > 项目配置 > 全局配置 > 系统默认配置
```

### 完整配置示例

```yaml
version: 1
project:
  name: my-app
  language: typescript
  package_manager: pnpm

defaults:
  workflow: standard_feature
  require_final_plan_lock: true
  developer_single_owner: true

models:
  codex:
    type: cli
    command: codex
    timeout_ms: 900000        # 模型级默认超时（15 分钟）
  claude:
    type: cli
    command: claude
    timeout_ms: 900000
  gemini:
    type: cli
    command: gemini
    timeout_ms: 900000

roles:
  product_analyst:
    default_model: claude
  planner:
    default_model: codex
  plan_reviewer:
    default_model: claude
  finalizer:
    default_model: codex
  developer:
    default_model: codex
  code_reviewer:
    default_model: claude
    must_be_different_from_developer: true
  qa:
    default_model: claude

quality_gates:
  require_requirement_confirm: true
  require_final_plan_lock: true
  require_code_review: true
  require_test_report: true

# 阶段级超时，覆盖模型级 timeout_ms（优先级：stage_timeouts > 模型 timeout_ms > 默认 5min）
stage_timeouts:
  develop: 1800000          # develop/fix 要真正生成并落盘代码，给更长超时
  fix: 1800000

commands:
  test:
    - pnpm test
  build:
    - pnpm build
  lint:
    - pnpm lint
```

---

## 6. 数据模型设计

## 6.1 核心实体关系

```text
Project 1 - N WorkflowRun
WorkflowTemplate 1 - N WorkflowRun
WorkflowRun 1 - N StageRun
StageRun 1 - N Artifact
StageRun 1 - N AgentRun
AgentRun N - 1 ModelProvider
StageRun 1 - N Decision
CodeReview 1 - N ReviewFinding
TestReport 1 - N TestCaseResult
WorkflowRun 1 - N GitSnapshot
```

## 6.2 表结构建议

### projects

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 项目 ID |
| name | text | 项目名称 |
| root_path | text | 本地路径 |
| git_remote | text | Git 地址 |
| tech_stack | json | 技术栈识别结果 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### workflow_runs

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 运行 ID |
| project_id | text | 项目 ID |
| feature_name | text | 需求名称 |
| workflow_template_id | text | 使用模板 |
| status | text | 当前状态 |
| current_stage_id | text | 当前阶段 |
| created_by | text | 创建人 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| completed_at | datetime | 完成时间 |

### stage_runs

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 阶段运行 ID |
| workflow_run_id | text | 工作流运行 ID |
| stage_id | text | 阶段 ID |
| role_id | text | 执行角色 |
| model_id | text | 执行模型 |
| status | text | 状态 |
| input_artifacts | json | 输入产物 |
| output_artifacts | json | 输出产物 |
| started_at | datetime | 开始时间 |
| completed_at | datetime | 完成时间 |
| error | text | 错误信息 |

### artifacts

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 产物 ID |
| workflow_run_id | text | 工作流 ID |
| stage_run_id | text | 阶段 ID |
| type | text | 产物类型 |
| path | text | 文件路径 |
| title | text | 标题 |
| hash | text | 内容 hash |
| locked | boolean | 是否锁定 |
| created_at | datetime | 创建时间 |

### review_findings

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 问题 ID |
| workflow_run_id | text | 工作流 ID |
| review_artifact_id | text | 评审产物 ID |
| severity | text | Blocker / Major / Minor / Question |
| title | text | 问题标题 |
| description | text | 问题描述 |
| suggestion | text | 修复建议 |
| status | text | open / fixed / accepted / ignored |
| requires_human | boolean | 是否需要人工决策 |

### decisions

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | 决策 ID |
| workflow_run_id | text | 工作流 ID |
| stage_id | text | 触发阶段 |
| question | text | 决策问题 |
| options | json | 可选方案 |
| selected_option | text | 用户选择 |
| reason | text | 决策原因 |
| created_at | datetime | 创建时间 |

---

## 7. API 设计

## 7.1 本地 API 范围

MVP 可以先不开放完整 API，但 V1 Web 控制台需要以下接口。

### Project API

```http
POST /api/projects/init
GET  /api/projects
GET  /api/projects/:id
GET  /api/projects/:id/status
```

### Workflow API

```http
POST /api/projects/:projectId/workflows
GET  /api/workflows/:runId
POST /api/workflows/:runId/stages/:stageId/run
POST /api/workflows/:runId/pause
POST /api/workflows/:runId/resume
POST /api/workflows/:runId/cancel
```

### Artifact API

```http
GET  /api/workflows/:runId/artifacts
GET  /api/artifacts/:artifactId
POST /api/artifacts/:artifactId/lock
```

### Decision API

```http
GET  /api/workflows/:runId/decisions/pending
POST /api/decisions/:decisionId/resolve
```

### Model API

```http
GET  /api/models
POST /api/models/:modelId/check
POST /api/models/:modelId/test-run
```

### Git API

```http
GET  /api/projects/:projectId/git/status
GET  /api/workflows/:runId/git/diff
POST /api/workflows/:runId/git/create-branch
POST /api/workflows/:runId/git/create-worktree
```

---

## 8. 前端控制台设计

## 8.1 页面结构

| 页面 | 说明 |
|---|---|
| 项目列表 | 管理已接入项目 |
| 项目详情 | 查看项目配置、规则、历史工作流 |
| 新建需求 | 输入需求、选择工作流模板、选择模型组合 |
| 工作流运行页 | 查看当前阶段、状态、产物、日志、门禁 |
| 产物阅读页 | 查看 requirement、plan、review、final_plan 等文档 |
| 决策中心 | 处理需要人工确认的问题 |
| 模型配置页 | 配置模型、角色映射、备用模型 |
| 模板配置页 | 配置流程模板和阶段 |
| 执行日志页 | 查看模型输出、命令执行、错误 |

## 8.2 工作流运行页布局

```text
┌───────────────────────────────────────────────────────┐
│ Feature: 日程查询优化                                  │
│ Status: PLAN_REVIEWING                                │
├───────────────────────────────────────────────────────┤
│ 阶段进度条                                             │
│ Requirement → Plan → Review → Finalize → Develop ...   │
├───────────────┬───────────────────────────────────────┤
│ 左侧阶段列表   │ 右侧当前阶段详情                      │
│               │ - 使用模型                            │
│               │ - 输入文件                            │
│               │ - 输出文件                            │
│               │ - 执行日志                            │
│               │ - 待决策问题                          │
├───────────────┴───────────────────────────────────────┤
│ 底部操作：继续 / 暂停 / 切换模型 / 重新运行 / 锁定方案 │
└───────────────────────────────────────────────────────┘
```

## 8.3 MVP 是否需要 UI

MVP 不强制需要 UI。建议：

```text
MVP：CLI + Markdown 文件
V1：本地 Web Console
V2：桌面 App / IDE 插件
```

---

## 9. 安全与权限设计

## 9.1 安全原则

```text
1. 默认本地运行，不上传项目代码。
2. 模型调用前明确上下文文件范围。
3. 敏感命令必须人工确认。
4. 密钥、环境变量、证书文件默认不进入模型上下文。
5. 所有模型调用和命令执行必须记录日志。
6. 支持一键暂停、取消、回滚。
```

## 9.2 敏感文件过滤

默认排除：

```text
.env
.env.*
*.pem
*.key
id_rsa
id_ed25519
node_modules/
dist/
build/
.git/
*.sqlite
*.db
```

## 9.3 权限策略

| 权限 | 说明 | 默认 |
|---|---|---|
| read_files | 读取项目文件 | 允许 |
| write_files | 修改项目文件 | 开发阶段允许 |
| run_safe_commands | 运行安全命令 | 允许 |
| run_risky_commands | 运行风险命令 | 需要确认 |
| network_access | 网络访问 | 默认关闭或确认 |
| git_commit | 自动提交 | 需要确认 |
| git_push | 推送远程 | 默认禁止或确认 |

---

## 10. 可观测性与日志

### 10.1 日志类型

```text
1. Workflow Log：工作流状态变化
2. Stage Log：阶段执行日志
3. Agent Log：模型输入输出摘要
4. Command Log：命令执行记录
5. Git Log：branch、diff、commit、worktree 操作
6. Decision Log：人工决策记录
7. Error Log：错误和恢复记录
```

### 10.2 指标

| 指标 | 说明 |
|---|---|
| 需求完成时间 | 从需求创建到 Done 的时间 |
| 阶段耗时 | 每个阶段耗时 |
| 一次通过率 | Code Review 无 Blocker 的比例 |
| 返工次数 | Fix 循环次数 |
| 测试通过率 | 自动测试通过比例 |
| 人工介入次数 | 每个需求需要用户决策的次数 |
| 模型使用分布 | 每个角色使用的模型 |
| 成本估算 | Token / API / CLI 调用成本 |
| 失败率 | 模型调用失败、命令失败、测试失败 |

---

## 11. 部署方案

## 11.1 MVP 本地部署

```bash
npm install -g ai-dev-workflow
cd your-project
ai-dev init
ai-dev start "schedule-query"
```

### 本地文件

```text
~/.ai-dev/
  config.yaml
  logs/
  cache/

project/.ai-dev/
project/docs/ai-workflow/
```

## 11.2 V1 本地 Web 控制台

```bash
ai-dev server
```

默认启动：

```text
http://localhost:4370
```

## 11.3 V3 团队版部署

```text
Frontend: React / Next.js
Backend: Node.js / NestJS 或 Fastify
DB: Postgres
Queue: Redis / BullMQ
Object Storage: S3 compatible
Auth: OAuth / SSO
Runner: 本地 Agent 或自托管 Runner
```

团队版推荐架构：

```text
Cloud Control Plane：管理用户、项目、配置、任务、审计
Local Runner：运行在用户机器或公司内网，负责读取代码、调用模型、执行命令
```

这样可以避免云端直接接触代码仓库的敏感内容。

---

## 12. 版本规划

## 12.1 MVP：文件驱动的 CLI 工作流

### 目标

快速验证“多模型分阶段协作 + 文档产物 + 人工门禁”的核心价值。

### 功能范围

```text
1. ai-dev init 初始化项目目录
2. 支持 config.yaml 配置角色和模型
3. 支持 standard_feature 工作流
4. 支持生成阶段 Prompt
5. 支持用户选择模型执行阶段
6. 支持产物目录自动创建
7. 支持 final_plan 锁定
8. 支持 implementation_report、code_review、test_report
9. 支持简单 Git diff 读取
10. 支持 handoff.md 生成
```

### 不做范围

```text
1. 不做复杂 UI
2. 不做团队协作
3. 不做云端同步
4. 不做复杂多 Agent 并发
5. 不做自动投票裁决
```

### 验收标准

```text
用户可以在一个真实项目中完成至少一个功能的：
需求 → 方案 → 评审 → 最终方案 → 开发 → 代码评审 → 测试报告 → 归档。
```

---

## 12.2 V1：本地 Web 控制台 + 工作流状态管理

### 新增能力

```text
1. 本地 Web Console
2. 工作流状态可视化
3. 阶段按钮式执行
4. 产物在线阅读
5. 模型配置页面
6. 决策中心
7. 执行日志
8. SQLite 记录 run/stage/artifact/decision
```

---

## 12.3 V2：多 Agent 编排 + Worktree 隔离 + 质量门禁

### 新增能力

```text
1. 多模型方案并行生成
2. Cross Review 交叉评审
3. Judge Agent 裁决
4. Git Worktree 自动隔离
5. 多 Agent 分模块开发
6. 自动测试命令执行
7. 质量门禁策略
8. UI 视觉验收，可选
```

---

## 12.4 V3：团队协作版

### 新增能力

```text
1. 用户账号与团队空间
2. 项目共享
3. 角色权限
4. 组织级模板
5. 审计日志
6. 云端控制台
7. Local Runner
8. GitHub/GitLab PR 集成
9. 成本统计
```

---

## 12.5 V4：平台化与生态

### 新增能力

```text
1. IDE 插件
2. 插件市场
3. 模型市场
4. 可视化流程编排器
5. 自定义 Agent Builder
6. 企业私有化部署
7. Benchmark 与模型效果评估
8. 规则自动沉淀和知识库演进
```

---

## 13. 开发里程碑建议

### 第 1 周：MVP 骨架

```text
1. 初始化 CLI 项目
2. 实现 ai-dev init
3. 生成 .ai-dev 目录结构
4. 支持 config.yaml
5. 支持创建 workflow run 目录
6. 支持生成 requirement / plan / review / final prompt
```

### 第 2 周：核心流程跑通

```text
1. 支持 standard_feature 流程
2. 支持阶段状态 run.json
3. 支持产物检查
4. 支持 final_plan lock
5. 支持 implementation_report 和 code_review 产物
6. 支持 git diff 摘要
```

### 第 3 周：模型适配与执行

```text
1. 接入 Claude CLI Adapter（claude -p 非交互模式）
2. 接入 Codex CLI Adapter（codex exec 非交互模式）
3. 接入 Gemini CLI Adapter（gemini -p 非交互模式）
4. spawn 自动调用为默认，prompt 导出为兜底
5. 支持 stdout/stderr 捕获、退出码与命令日志
6. 支持失败重试、超时控制和 handoff
```

### 第 4 周：本地 Web Console 初版

```text
1. 启动本地 API
2. 工作流列表
3. 工作流详情
4. 阶段状态展示
5. 产物阅读
6. 人工决策按钮
```

---

## 14. 关键技术风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 不同 CLI 模型交互方式不同 | Adapter 难统一 | 先支持 prompt file + output file，后续再做流式 |
| 模型不按约定输出文件 | 阶段失败 | 增加 Output Contract 校验和修复提示 |
| 多 Agent 修改冲突 | 代码冲突 | worktree 隔离 + 单主开发原则 |
| 评审意见过度发散 | 流程变慢 | 严格分级，只处理 Blocker 和确认的 Major |
| 上下文过长 | 成本高/效果差 | Context Builder 做摘要和文件选择 |
| 命令执行有安全风险 | 误删/泄漏 | 命令策略 + 人工确认 + 沙箱 |
| 用户觉得流程重 | 使用门槛高 | quick / standard / strict 三档流程 |
| 云端化涉及代码隐私 | 商业化阻力 | Local Runner + Cloud Control Plane |

---

## 15. MVP 命令设计

```bash
# 初始化
ai-dev init

# 创建需求
ai-dev start schedule-query --workflow standard_feature

# 整理需求
ai-dev requirement --model claude

# 生成方案
ai-dev plan --model codex

# 评审方案
ai-dev review-plan --model claude

# 输出最终方案
ai-dev finalize --model codex

# 锁定方案
ai-dev lock-plan

# 开发
ai-dev develop --model codex

# 代码评审
ai-dev review-code --model claude

# 修复
ai-dev fix --model codex

# 测试
ai-dev test --model claude

# 生成交付说明
ai-dev archive

# 查看状态
ai-dev status

# 生成交接文档
ai-dev handoff
```

---

## 16. 核心验收用例

### 用例 1：普通功能开发

```text
用户输入：优化日程查询功能。
系统生成需求文档。
Codex 输出方案。
Claude 评审方案。
Codex 输出 final_plan。
用户锁定方案。
Codex 开发。
Claude 评审代码。
Codex 修复 Blocker。
Claude 输出测试报告。
用户验收完成。
```

### 用例 2：模型切换

```text
Codex 开发中出现阻塞。
系统生成 handoff.md。
用户选择 Claude 接手。
Claude 读取 final_plan + handoff + diff。
Claude 继续开发或修复。
```

### 用例 3：多模型方案讨论

```text
用户选择 complex_feature。
Codex 输出方案 A。
Claude 输出方案 B。
Gemini 评审 A/B。
系统提取分歧。
Finalizer 输出融合方案。
用户确认。
```

### 用例 4：评审阻塞

```text
代码评审出现 Blocker。
系统进入 BLOCKED 或 FIXING。
只允许修复 Blocker 和用户确认的 Major。
修复后重新评审。
```

---

## 17. 最终技术判断

这个系统的核心不是“多模型聊天”，而是：

```text
基于工作流状态机的多模型研发流程编排系统。
```

技术上建议采用：

```text
Local-first + CLI-first + Markdown Artifact + YAML Workflow + SQLite State + Model Adapter + Git Worktree + Quality Gates
```

短期先做文件驱动的 CLI 版本，快速跑通真实项目；中期补本地 Web 控制台和状态管理；长期再做团队协作、Local Runner、云端控制台和插件生态。

最关键的系统边界是：

```text
1. 系统负责编排流程，不替用户做最终产品决策。
2. 模型负责执行角色任务，不直接决定是否上线。
3. final_plan 是开发依据，未锁定不得开发。
4. 开发必须有实现报告，评审必须有分级结果，测试必须有验收报告。
5. 多模型可讨论，但代码开发默认单主责，除非按模块隔离。
```

这套技术路线可以支持你从当前的手动 Codex + Claude 双终端协作，逐步升级为一个可产品化、可复用、可扩展的多模型 AI 研发工作流平台。

---

## 18. v0.1 实际实现的额外模块（原 §5 之外的新增）

实施过程中，相对原技术方案 §5，新增了以下 4 个模块。它们都在 v0.1 已完成。

### 18.1 Project Scanner（项目快照）

**位置**：`src/core/project-scanner.ts`

**职责**：扫描目标项目，为 `learn` 命令提供结构化快照。

**扫描内容**：
- 顶层目录树（深度 3，过滤 `node_modules` / `.git` / `dist` / `build` / `.dart_tool` 等）
- Manifest 文件（`package.json` / `pubspec.yaml` / `pyproject.toml` / `Cargo.toml` / `go.mod` 等）
- README（README.md / README.MD / README.rst）
- 源码采样（30 文件上限，单文件 200 行 / 32KB，优先 `src/` `lib/` `app/` `cmd/` `pkg/`）
- Git log 最近 20 条提交（容错：非 git 仓库返回 null）
- 技术栈识别（基于 manifest 内容）

**敏感文件白名单过滤**：`.env*` / `*.pem` / `*.key` / `id_rsa` / `id_ed25519` / `*.sqlite` / 媒体二进制全部排除。

**输出**：`ProjectSnapshot` 对象 + `formatSnapshotForPrompt()` 把它格式化为 markdown 段落注入 prompt。

### 18.2 Profile Manager（全局用户偏好）

**位置**：`src/utils/profile.ts` + `src/cli/commands/profile.ts`

**职责**：管理 `~/.vibeflow/profile.md` 跨项目偏好。

**关键能力**：
- `loadProfile()` / `writeProfile()` / `initProfileIfMissing()`
- `loadProfileForInjection()` 返回包装好的注入片段；占位状态（≥5 个 TODO）返回 null
- `sync-claude` 写入 `~/.claude/CLAUDE.md`，用 `<!-- BEGIN vibeflow-profile -->` / `<!-- END vibeflow-profile -->` 标记块隔离
- `unsync-claude` 干净移除标记块，不破坏用户已有的 CLAUDE.md 内容

**注入位置**：`src/core/context.ts` 的 `buildContext()` 末尾，把 profile 放在最终 prompt 顶部（在项目 rules 之前）。

### 18.3 Bridges（CLAUDE.md / AGENTS.md 生成）

**位置**：`src/templates/bridges.ts` + `init.ts` 调用

**职责**：让用户在不运行 vibeflow 的情况下，原生 Claude Code / Codex / Cursor 也能自动发现项目里的 vibeflow 产物。

**生成内容**：
- `CLAUDE.md`：指引 Claude Code 读 `.ai-dev/rules/*` 和 `docs/ai-workflow/<active-feature>/*`
- `AGENTS.md`：同上，给 Codex 等读

**幂等性**：已存在则不覆盖；`vibeflow init --force` 会覆盖。

### 18.4 Chain Runner（阶段间交互推进）

**位置**：`src/core/stage-runner.ts` 的 `maybeChainToNext()` + `askChainConfirmation()`

**职责**：阶段成功后，根据用户选择/选项决定下一步行为。

**三种模式**：

| 触发 | 行为 |
|---|---|
| 默认（TTY） | 弹出 `prompts` 选择：`[Y/n]` 是否进入下一阶段 |
| `-y, --yes` | 自动 chain（递归调 runStage），human_gate 仍停 |
| `--no-chain` | 完成后既不询问也不 chain |
| 非 TTY（管道/CI） | 自动停下，避免卡死 |

**安全机制**：
- `_chainDepth` 字段限制递归深度（上限 15）
- 最后阶段完成自动把 `state.status='done', current_stage=null`
- 进入下一阶段时自动判断是否需要附加 `requireLockedPlan` / `requireDifferentFromDeveloper`

---

## 19. v0.1 命令实际清单（实现状态）

| 命令 | 文件 | 状态 |
|---|---|---|
| `init` | `cli/commands/init.ts` | ✅ 含 22 个模板文件 + CLAUDE.md/AGENTS.md 桥接 |
| `doctor` | `cli/commands/doctor.ts` | ✅ |
| `learn` | `cli/commands/learn.ts` | ✅ 老项目 + 新项目两种模式 |
| `profile init/show/edit/path/sync-claude/unsync-claude` | `cli/commands/profile.ts` | ✅ 6 个子命令 |
| `new` | `cli/commands/new.ts` | ✅ |
| `status` | `cli/commands/status.ts` | ✅ |
| `requirement` | `cli/commands/requirement.ts` | ✅ |
| `plan` / `plan-review` / `finalize` / `develop` / `code-review` / `fix` / `test` / `archive` | `cli/commands/stages.ts`（统一工厂） | ✅ |
| `advance [--skip]` | `cli/commands/advance.ts` | ✅ finalize 后提示"继续开发 / 交付收尾"两条路 |
| `deliver [-f]` | `cli/commands/deliver.ts` + `core/deliver.ts` | ✅ 方案锁定后交付收尾，软终态 `delivered`（可逆续接 develop） |
| `handoff` | `cli/commands/handoff.ts` | ✅ |

总计 20 个面向用户的命令（含 6 个 profile 子命令）。新增 `RunStatus` 软终态 `delivered` + `run.json.meta.delivered_at`。

---

## 20. V2 待实现模块清单

> 详见 §5.9 Exploration Pool Manager。本节是实现路线图，用于 V2 开发时对照。

### 20.1 新模块

| 模块 | 文件 | 状态 |
|---|---|---|
| ParallelPlanRunner | `core/parallel-plan.ts` | ⏳ V2 |
| ConsultRunner | `core/consult.ts` | ⏳ V2 |
| SynthesizerRunner | `core/synthesize.ts` | ⏳ V2 |
| ExploreStateManager | `core/explore-state.ts` | ⏳ V2 |
| NextResolver | `core/next-resolver.ts` | ⏳ V2 |
| PlanStatusFormatter | `core/plan-status.ts` | ⏳ V2 |
| ChangeRequestRunner | `core/change-request.ts` | ⏳ V2 |
| InteractiveMenu | `cli/utils/menu.ts` | ⏳ V2 |

### 20.2 新命令

| 命令 | 文件 | 状态 |
|---|---|---|
| `plan --multi / --multi-extend / --add` | 扩展现有 `cli/commands/stages.ts` 或新建 `parallel-plan.ts` | ⏳ V2 |
| `consult` | `cli/commands/consult.ts` | ⏳ V2 |
| `synthesize` | `cli/commands/synthesize.ts` | ⏳ V2 |
| `accept-plan` | `cli/commands/accept-plan.ts` | ⏳ V2 |
| `back-to-explore` | `cli/commands/back-to-explore.ts` | ⏳ V2 |
| `change-request` | `cli/commands/change-request.ts` | ⏳ V2 |
| `plan-status` | `cli/commands/plan-status.ts` | ⏳ V2 |
| `next` | `cli/commands/next.ts` | ⏳ V2 |

V2 新增预估代码量：**1200-1500 行**（含测试），开发周期 **6-10 天**。

### 20.3 数据模型扩展

`RunState` 加 `explore` / `locked` / `change_requests` 字段，详见 §5.9.4。

需要数据迁移考虑：v0.1 现有的 run.json 不含 `explore` 字段，V2 实现时要保证向前兼容（缺失字段视为空探索池）。

### 20.4 实现顺序

详见 §5.9.9。简而言之：
1. parallel-plan + accept-plan（覆盖 80% 场景）
2. InteractiveMenu + NextResolver + plan-status（认知层）
3. consult + synthesize（完整探索池）
4. back-to-explore（路径互通）
5. change-request（锁定后变更）
6. plan --multi-extend / --add（渐进升级）

### 20.5 与 V1.5（Web Console）的关系

PRD 原 V1 的"本地 Web Console"已推迟到 V1.5。理由：

- V2 的 CLI 引导菜单 + `next` + `plan-status` 能解决 80% 认知问题
- 先验证用户是否真需要 GUI，再投入 1-2 个月做 Web Console
- V2 的数据模型（`ExploreState`）将作为未来 Web Console 的数据基础
