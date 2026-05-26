# 多模型 AI 研发工作流系统 PRD

| 文档信息 | 内容 |
|---|---|
| 产品名称 | 多模型 AI 研发工作流系统 |
| 版本 | PRD v1.0 |
| 日期 | 2026-05-20 |
| 目标用户 | 高频使用 AI 编程工具的产品经理、独立开发者、研发团队、AI 应用团队 |
| 产品定位 | 面向 Vibe Coding / AI Coding 的多模型研发流程编排与质量控制系统 |
| 核心目标 | 将“需求 - 方案 - 评审 - 开发 - 代码评审 - 测试验收 - 交付沉淀”产品化、流程化、可配置化 |

---

## 1. 背景与问题

### 1.1 背景

AI 编程工具已经从“辅助写代码”进入“辅助完成完整研发任务”的阶段。用户常见的工作方式已经从单一聊天窗口，演变为同时使用 Codex、Claude Code、Gemini CLI、Cursor Agent、OpenCode 等多个模型或编码 Agent。

当前用户的实际工作方式是：打开多个终端，一个模型负责方案生成，另一个模型负责评审，再由原模型吸收评审意见输出 v2 方案，最终人工确认后选择一个模型开发，另一个模型做代码评审和验收。这种方式已经验证了价值，但仍高度依赖人工手动组织上下文、复制文档、判断阶段、切换模型和检查结果。

### 1.2 当前痛点

| 痛点 | 说明 | 影响 |
|---|---|---|
| 多终端混乱 | Codex、Claude、Gemini 等分散在不同终端或工具中 | 状态难追踪、上下文难管理 |
| 方案未锁定就开发 | AI 容易直接进入编码，边做边改方向 | 返工、需求膨胀、实现偏离目标 |
| 缺少强制评审 | 单模型自写自审可靠性不足 | 容易遗漏边界、回归风险和测试场景 |
| 模型切换断层 | 中途换模型时没有标准交接材料 | 新模型容易重复工作或误解现状 |
| 过程产物分散 | 方案、评审、报告、测试记录没有统一归档 | 后续复盘和团队协作困难 |
| 人工介入不清晰 | 不知道什么时候必须人来决策 | AI 可能在产品取舍上擅自决定 |
| 流程不可复用 | 每次迭代都靠临时 prompt | 无法沉淀成稳定 SOP |

### 1.3 产品机会

不是再做一个“多模型聊天工具”，而是做一个**多模型 AI 研发工作流系统**：将多个模型视为不同角色的执行者，将研发过程拆成可配置阶段，并用文档产物、质量门禁、人工决策节点和上下文交接机制，保证 AI 编程从需求到交付可控、可追踪、可复用。

---

## 2. 产品定位与目标

### 2.1 产品定位

本产品是一个面向 AI 编程场景的**多模型研发流程编排器**，帮助用户把多个 AI 模型组织成一个可控的研发团队。

它不是：

- 普通多模型聊天窗口
- 简单 prompt 管理器
- 单模型代码生成器
- 完全无人监管的自动开发平台

它是：

- 流程驱动的 AI 研发工作台
- 角色可配置的多模型协作系统
- 文件/仓库驱动的研发过程管理工具
- 从需求到开发、评审、测试、归档的闭环系统

### 2.2 核心价值

| 价值 | 描述 |
|---|---|
| 可控 | 所有关键阶段有明确产物和门禁，方案未确认不得开发 |
| 灵活 | 每个阶段可选择不同模型，也可使用默认模型配置 |
| 可扩展 | 未来可接入 Codex、Claude、Gemini、本地模型、IDE Agent、MCP 工具 |
| 可追踪 | 每个需求有完整目录，保留需求、方案、评审、实现、测试和交付记录 |
| 可复用 | 支持流程模板、角色模板、项目规则沉淀 |
| 可协作 | 支持人类产品负责人、多个模型、未来团队成员共同参与 |

### 2.3 阶段性目标

| 阶段 | 目标 | 形态 |
|---|---|---|
| MVP | 先跑通个人使用闭环 | 文件驱动 + 命令行 + 手动/半自动调用模型 |
| V1 | 形成稳定产品化工作台 | 可视化流程状态 + 模型配置 + 阶段产物管理 |
| V2 | 支持多模型自动编排 | 自动路由、并行方案、结构化争议、质量门禁 |
| V3 | 支持团队级研发协作 | 多项目、多成员、权限、成本、审计、组织知识库 |
| V4 | 智能化研发操作系统 | 基于历史表现自动选择模型、自动复盘、持续优化工作流 |

---

## 3. 竞品与参考方案启发

### 3.1 FLOW 的启发

FLOW 强调“一个人 + 多个 AI Agent”的团队方式，每个 Agent 有明确角色、独立工作区、上下文交接、任务状态和 GitHub 工作流。它给本产品的启发是：

- 角色边界必须清晰，不应让一个 Agent 同时承担产品、架构、开发、评审、测试所有职责。
- 每个开发 Agent 最好有独立 worktree 或分支，避免互相覆盖代码。
- 上下文要沉淀到项目知识库，而不是只依赖聊天记录。
- handover / resume / reflect 是多 Agent 长任务的关键机制。

### 3.2 metaswarm 的启发

metaswarm 更接近“方案 - 评审 - 实现 - 对抗评审 - PR - 学习”的严谨研发流水线。它给本产品的启发是：

- 需要 Plan Review Gate 和 Design Review Gate。
- 实现和评审最好由不同模型完成。
- 评审不仅发生在代码阶段，也必须发生在方案阶段。
- 需要 Human Checkpoint，让人类只处理关键取舍。
- 需求完成后要 Close + Learn，把经验写入知识库。

### 3.3 OpenCastle 的启发

OpenCastle 更像多 Agent 研发工作台，强调 Orchestrator、Specialist Agents、Workflow Templates、Quality Gates、Dashboard 和 mixed runtimes。它给本产品的启发是：

- 需要一个“流程编排器/队长”负责拆解、委派和验证，但不直接写代码。
- 专家 Agent 可按前端、后端、安全、测试、文档等职责配置。
- 质量门禁应产品化，包括 lint、typecheck、unit test、build、diff、人工验收等。
- 长期需要可视化状态面板，而不是全部堆在终端中。

### 3.4 Orloj 的启发

Orloj 的核心思路是 Agent Infrastructure as Code，用 YAML 定义 agents、tools、policies、workflows。它给本产品的启发是：

- 工作流、角色、模型、策略、工具都应配置化。
- 工作流应支持 DAG、重试、失败中止、人工门禁、日志和追踪。
- 配置文件应该可以跟随项目仓库保存，实现项目级 SOP。

### 3.5 本产品的差异化

本产品不是直接复制某一个方案，而是融合：

```text
FLOW 的人类 + 多 Agent 团队方法
metaswarm 的跨模型评审与方案门禁
OpenCastle 的工作台和质量门禁
Orloj 的 YAML 化流程配置
用户自己的 Vibe Coding 实践经验
```

最终形成一个更适合产品经理、独立开发者和小团队的多模型 AI 研发工作流系统。

---

## 4. 用户角色与核心场景

### 4.1 用户角色

| 角色 | 说明 | 核心诉求 |
|---|---|---|
| 独立开发者 | 一个人用多个 AI 工具开发产品 | 提升效率、减少混乱、保证质量 |
| 产品经理型开发者 | 不一定写代码，但高频用 AI 生成 Demo / 产品 | 从需求到方案到开发可控推进 |
| 小团队负责人 | 带 1-5 人团队，同时使用 AI 辅助研发 | 统一流程、评审、验收和沉淀 |
| AI 应用团队 | 快速做原型和迭代 | 多模型协同、快速验证、减少返工 |
| 企业研发团队 | 对安全、审计、权限和质量要求高 | 可配置、可审计、可集成 CI/CD |

### 4.2 核心使用场景

#### 场景一：标准功能开发

用户输入需求，选择 Codex 输出方案，Claude 评审，Codex 输出最终方案，用户确认后让 Codex 开发，Claude 做代码评审，Codex 修复，Claude 输出测试验收报告。

#### 场景二：复杂功能多模型方案讨论

用户发起复杂需求，系统让 Codex、Claude、Gemini 分别输出方案，随后由评审 Agent 进行结构化对比，输出推荐方案、风险点、需要人工决策的问题。用户确认后进入开发。

#### 场景三：模型中途切换

Codex 开发到一半出现上下文不足或效果不佳，用户选择切换 Claude。系统先要求 Codex 生成 handoff.md，包括已完成内容、修改文件、风险、下一步，再交给 Claude 继续。

#### 场景四：多模块并行开发

复杂需求被拆成前端、后端、测试三个模块，系统为每个模块分配不同 Agent 和 worktree，最后由 Orchestrator 汇总并触发集成评审。

#### 场景五：Bug 修复

用户描述 Bug，系统先要求模型复现和定位，不直接修改。确认修复方案后由开发 Agent 修复，再由评审 Agent 检查回归风险并生成测试报告。

---

## 5. 产品范围

### 5.1 本期必须解决的问题

| 编号 | 需求 | 优先级 |
|---|---|---|
| P0-1 | 支持从自然语言需求创建一个研发任务 | P0 |
| P0-2 | 支持为每个阶段选择模型或使用默认模型 | P0 |
| P0-3 | 支持方案生成、方案评审、最终方案确认 | P0 |
| P0-4 | 支持最终方案锁定后进入开发 | P0 |
| P0-5 | 支持开发完成后的实现报告 | P0 |
| P0-6 | 支持代码评审和测试验收流程 | P0 |
| P0-7 | 支持所有阶段产物自动归档到任务目录 | P0 |
| P0-8 | 支持模型切换时生成交接文档 | P0 |
| P0-9 | 支持 AI 自动学习项目，生成 rules 草稿（老项目扫描 / 新项目从愿景出发） | P0 |
| P0-10 | 支持全局用户偏好（跨项目通用），自动注入到每次阶段 prompt | P0 |
| P0-11 | 支持跨模型记忆兼容：init 时生成 CLAUDE.md / AGENTS.md 桥接，让原生 CLI 也能发现 vibeflow 产物 | P0 |
| P0-12 | 支持阶段间交互确认：完成后弹 [Y/n] 询问是否进入下一阶段；`-y` 一键 chain；`--no-chain` 单步 | P0 |
| P1-1 | 支持流程模板配置 | P1 |
| P1-2 | 支持角色模板配置 | P1 |
| P1-3 | 支持质量门禁配置 | P1 |
| P1-4 | 支持可视化流程状态 | P1 |
| P1-5 | 支持多个模型并行输出方案 | P1 |
| P2-1 | 支持成本/Token 统计 | P2 |
| P2-2 | 支持团队协作、权限和审计 | P2 |
| P2-3 | 支持历史表现驱动的模型推荐 | P2 |

### 5.2 暂不解决的问题

- 不做通用聊天助手。
- 不承诺完全无人自动开发上线。
- 不直接替代 GitHub、GitLab、Jira、Linear，而是优先集成。
- 不在早期内置云端代码执行环境，优先本地执行或调用现有 CLI。
- 不在 MVP 阶段做复杂权限系统。

---

## 6. 产品架构

### 6.1 总体架构

```text
用户需求
  ↓
任务管理层：创建需求、阶段状态、产物目录
  ↓
工作流编排层：选择流程模板、阶段顺序、门禁规则
  ↓
角色层：需求分析、方案设计、方案评审、开发、评审、测试、归档
  ↓
模型适配层：Codex / Claude / Gemini / OpenCode / 本地模型 / IDE Agent
  ↓
工具执行层：Git、文件系统、终端命令、测试命令、MCP、CI/CD
  ↓
产物层：需求文档、方案文档、评审报告、最终方案、实现报告、测试报告、复盘文档
```

### 6.2 三层抽象

#### 工作流层

定义不同需求类型应该走什么流程，例如：

- quick_fix
- standard_feature
- complex_feature
- bugfix
- refactor
- ui_iteration
- prd_only
- release_check

#### 角色层

角色不等于模型。角色是阶段职责，模型只是执行者。

| 角色 | 职责 |
|---|---|
| Product Analyst | 整理需求、识别边界、补充待确认问题 |
| Planner / Architect | 输出方案、拆解任务、识别影响面 |
| Plan Reviewer | 审查方案完整性、风险、过度设计 |
| Finalizer | 汇总评审意见，输出最终方案 |
| Developer | 按最终方案实现功能 |
| Code Reviewer | 审查代码质量、回归风险、是否符合方案 |
| QA Tester | 生成测试用例、执行或指导验收 |
| Release Writer | 生成 release note 和复盘文档 |
| Judge / Arbitrator | 多模型冲突时做对比分析和裁判建议 |

#### 模型层

模型可自由绑定到角色。

示例：

```yaml
roles:
  product_analyst:
    default_model: claude
  planner:
    default_model: codex
  plan_reviewer:
    default_model: claude
  developer:
    default_model: codex
  code_reviewer:
    default_model: claude
  qa_tester:
    default_model: gemini
```

---

## 7. 核心业务流程

### 7.1 标准功能开发流程

```text
1. 用户输入需求
2. AI 整理结构化需求
3. 用户确认或补充需求
4. 方案模型输出 plan_v1
5. 评审模型输出 review_v1
6. 方案模型吸收评审并输出 final_plan
7. 用户锁定 final_plan
8. 开发模型按 final_plan 开发
9. 开发模型输出 implementation_report
10. 评审模型进行 code_review
11. 开发模型修复 Blocker / 指定 Major
12. 测试模型输出 test_report
13. 用户最终验收
14. 系统生成 release_note 和 retrospective
```

### 7.2 复杂需求 / 探索池模式（V2 范围）

> 本节由原"复杂需求多模型讨论流程"重写。原版本是单轮多模型 + Judge 裁决，缺少"用户主导节奏 / 路径互通 / 跳过循环"等真实工作流需求。

**核心设计**：探索池**可选**，路径之间**可自由切换**（finalize 锁定前），关键决策点都有**主动引导菜单**。

#### 7.2.1 整体流程

```text
1. 用户输入复杂需求（与 standard_feature 共用 requirement 阶段）
2. plan --multi：多模型并行出方案
   → 01_plan_A.md / 01_plan_B.md / 01_plan_C.md
3. 系统主动展示菜单（认知层引导）：
   [1-3] 直接 accept 某方案 → 跳到 plan_review（最快路径）
   [4-6] consult 某模型对某方案的看法
   [7]   synthesize 让模型融合多个方案
   [8]   重跑 / 换模型 / 改需求
4. 用户在探索池内自由穿梭（产物全部进 explore/）：
   - consult：单轮问答（指定模型 + 指定上下文文件）
   - synthesize：融合多个方案（带用户偏好）
   - 任何时候可 accept-plan 终止探索
5. accept-plan 选定最终方案 → 复制到 02_plan_v1.md
6. 进入 plan_review → finalize → develop ...（沿用 standard_feature 后续）
7. finalize advance = 方案锁定分水岭：
   - 锁定前：所有路径可自由切换（包括 back-to-explore）
   - 锁定后：方案锁定，须走 change-request 流程修订
```

#### 7.2.2 三条典型路径

| 路径 | 命令链 | 适用场景 |
|---|---|---|
| **路径 1 - 直接选** | plan --multi → 菜单选 accept A → plan-review → ... | 三方案中有明显好的 |
| **路径 2 - 探索池** | plan --multi → consult → synthesize → accept-plan synth_v2 → plan-review → ... | 各方案有可取之处，需融合 |
| **路径 3 - 跨阶段反悔** | ... → plan-review 发现问题 → back-to-explore → synthesize → accept-plan v3 → plan-review 再评 → ... | 评审后才发现方向有偏 |

锁定后变更走 `change-request`：

```text
develop 中发现 final_plan 有重大问题
  ↓
vibeflow change-request -m "<问题描述>"
  ↓
轻量评审（不重走 plan/review/finalize 全套）
  ↓
重新锁定 → 继续开发
```

#### 7.2.3 关键设计原则

1. **探索池可选**：不强制多模型路径，简单需求仍可走 standard_feature 单方案
2. **路径互通**：finalize 锁定前，单方案 / 多方案 / 探索池可以来回切
3. **锁定门明确**：finalize advance 是分水岭，之前自由，之后严格
4. **主动引导**：每个决策点都有菜单 + `vibeflow next` 命令兜底
5. **产物可追溯**：探索池所有产物保留在 explore/ 目录，复盘时能看全过程

### 7.3 模型切换流程

```text
1. 用户选择切换模型
2. 当前模型必须生成 handoff.md
3. 系统检查 handoff.md 是否完整
4. 新模型读取 final_plan、implementation_report、handoff.md、当前 diff
5. 新模型继续执行
6. 切换记录进入任务日志
```

### 7.4 多 Agent 并行开发流程

多 Agent 并行仅适合明确拆分模块的需求。

规则：

- 不允许两个 Agent 同时修改同一高风险文件。
- 每个 Agent 必须在独立 branch / worktree 执行。
- Orchestrator 负责拆分任务和汇总。
- 集成前必须做冲突检查和整体回归测试。

---

## 8. 功能需求

### 8.1 任务创建

用户可以通过自然语言创建研发任务。

输入示例：

```text
我想优化日程查询功能，支持查询今天、本周、本月、未完成、已延期的日程，并支持按名称搜索。
```

系统输出：

- 任务名称建议
- 需求类型识别
- 推荐流程模板
- 推荐模型组合
- 初始需求文档
- 待确认问题

验收标准：

- 系统可以自动生成任务目录。
- 系统可以生成 `00_requirement.md`。
- 用户可以编辑、确认、重新生成需求文档。

### 8.2 工作流模板管理

系统支持预设和自定义工作流模板。

预设模板：

| 模板 | 适用场景 | 阶段 |
|---|---|---|
| quick_fix | 小 Bug、小改动 | 需求 - 修复 - 简评 - 测试 |
| standard_feature | 普通功能 | 需求 - 方案 - 评审 - 开发 - 代码评审 - 测试 |
| complex_feature | 复杂功能 | 多方案 - 多评审 - 人工决策 - 开发 - 双评审 - 回归 |
| prd_only | 只写文档 | 需求 - 文档 - 评审 - 定稿 |
| refactor | 重构 | 现状分析 - 重构方案 - 风险评估 - 分步实现 - 回归 |
| ui_iteration | UI 迭代 | 需求 - 设计方案 - 截图/视觉评审 - 实现 - 视觉验收 |

### 8.3 模型配置

用户可以为每个角色配置默认模型、备用模型和可用模型。

配置项：

| 字段 | 说明 |
|---|---|
| provider | 模型提供方或工具名称 |
| command | 本地 CLI 命令或 API 入口 |
| role_binding | 默认绑定角色 |
| cost_level | 成本等级 |
| speed_level | 速度等级 |
| context_level | 长上下文能力等级 |
| coding_level | 代码执行能力等级 |
| review_level | 评审能力等级 |
| fallback | 失败时备用模型 |

### 8.4 阶段执行

每个阶段都应包含：

- 阶段名称
- 执行角色
- 执行模型
- 输入文件
- 输出文件
- 成功条件
- 失败处理
- 是否需要人工确认

示例：

```yaml
plan_review:
  role: plan_reviewer
  model: claude
  input:
    - 00_requirement.md
    - 01_plan_v1.md
  output: 02_plan_review.md
  human_gate: false
  fail_on_blocker: true
```

### 8.5 方案锁定

最终方案必须被锁定后才能进入开发。

锁定内容包括：

- 本期范围
- 不做范围
- 技术实现路径
- 修改文件范围
- 数据/接口影响
- 验收标准
- 人工决策结论

规则：

- 未锁定 final_plan，不允许进入 develop 阶段。
- final_plan 锁定后，开发 Agent 不得擅自扩大范围。
- 如开发中发现 final_plan 有问题，必须进入 change_request 流程。

### 8.6 开发执行

开发 Agent 必须基于 final_plan 执行。

开发完成后必须输出 `implementation_report.md`。

报告必须包含：

- 修改文件清单
- 每个文件修改原因
- 完成需求列表
- 未完成需求列表
- 与 final_plan 的差异
- 已运行命令
- 测试结果
- 已知风险

### 8.7 代码评审

代码评审 Agent 必须基于：

- final_plan.md
- implementation_report.md
- 当前 diff
- 项目规则
- 测试结果

输出 `code_review.md`。

问题分级：

| 级别 | 含义 | 处理规则 |
|---|---|---|
| Blocker | 不修不能合并/上线 | 必须修复 |
| Major | 高风险或明显缺陷 | 默认建议修复，需用户确认 |
| Minor | 小问题 | 可选处理 |
| Optional | 优化建议 | 本期默认不处理 |
| Question | 需要人工决策 | 停止并等待用户确认 |

### 8.8 测试验收

测试验收包括：

- 测试用例生成
- 自动化测试执行或指导执行
- 手动验收清单
- 回归风险检查
- 验收报告

输出 `test_report.md`。

验收维度：

- 是否满足用户需求
- 是否符合 final_plan
- 是否覆盖核心路径
- 是否覆盖异常场景
- 是否有回归风险
- 是否需要补充人工测试

### 8.9 上下文交接

任何模型切换、长任务中断、跨天继续，都必须支持 handoff。

`handoff.md` 包含：

- 当前任务目标
- 已确定方案
- 已完成内容
- 未完成内容
- 修改文件
- 当前阻塞
- 已知风险
- 下一步建议
- 不允许改动的约束

### 8.10 项目知识库

系统应维护项目级知识库。

目录建议：

```text
.context/
  project_overview.md
  ai_rules.md
  glossary.md
  architecture.md
  coding_standards.md
  product_rules.md
  anti_patterns.md
  learnings.md
```

每次任务结束后，将可复用经验写入 `learnings.md` 或相关规则文件。

---

## 9. 目录与文件规范

### 9.1 项目配置目录

```text
.ai-dev/
  config.yaml
  agents/
    product_analyst.md
    planner.md
    plan_reviewer.md
    finalizer.md
    developer.md
    code_reviewer.md
    qa_tester.md
    judge.md
  workflows/
    quick_fix.yaml
    standard_feature.yaml
    complex_feature.yaml
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
    handoff.md
  policies/
    safety.yaml
    permissions.yaml
    quality_gates.yaml
```

### 9.2 任务产物目录

```text
docs/ai-workflow/
  feature-name/
    00_requirement.md
    01_plan_v1.md
    02_plan_review.md
    03_final_plan.md
    04_human_decisions.md
    05_implementation_report.md
    06_code_review.md
    07_fix_report.md
    08_test_report.md
    09_release_note.md
    10_retrospective.md
    handoff.md
```

---

## 10. 可视化工作台设计

### 10.1 首页

首页展示：

- 当前项目
- 正在进行的任务
- 每个任务所在阶段
- 当前执行模型
- 是否等待用户确认
- 最近失败/阻塞任务
- 成本和执行时长概览

### 10.2 任务详情页

任务详情页分为：

- 左侧阶段流程
- 中间当前产物内容
- 右侧模型配置、执行日志、评审结论
- 底部操作按钮：继续、重跑、切换模型、确认方案、进入开发、生成 handoff

### 10.3 阶段卡片

每个阶段卡片显示：

- 阶段名称
- 状态：未开始 / 执行中 / 待确认 / 通过 / 阻塞 / 失败
- 执行模型
- 输入文件
- 输出文件
- 关键结论
- 操作入口

### 10.4 争议处理界面

当多个模型意见冲突时，系统展示：

- 争议点
- 模型 A 观点
- 模型 B 观点
- Judge 分析
- 推荐选择
- 用户决策入口

---

## 11. 权限与安全策略

### 11.1 执行权限等级

| 等级 | 说明 | 示例 |
|---|---|---|
| L0 | 只读 | 读取文件、分析需求 |
| L1 | 写文档 | 生成 markdown 文档 |
| L2 | 修改代码 | 编辑项目文件 |
| L3 | 执行安全命令 | lint、test、build |
| L4 | 高风险命令 | 删除文件、迁移数据、push、发布 |

规则：

- L4 操作必须人工确认。
- 未锁定 final_plan 前不得进入 L2。
- 生产环境相关操作默认禁止。

### 11.2 风险拦截

系统应拦截：

- 删除大量文件
- 修改锁定配置
- 擅自扩大需求范围
- 未经确认修改数据库迁移
- 未经确认提交/push/发布
- 未经确认变更支付、账号、权限、安全逻辑

---

## 12. 质量门禁

### 12.1 方案门禁

进入开发前必须确认：

- 需求是否清晰
- 范围是否明确
- 不做范围是否明确
- 影响面是否识别
- 数据/接口是否评估
- 风险是否列出
- 测试方案是否存在
- 人工决策项是否处理

### 12.2 开发门禁

开发完成后必须确认：

- 是否符合 final_plan
- 是否输出 implementation_report
- 是否运行必要测试
- 是否说明未完成内容
- 是否说明已知风险

### 12.3 合并/交付门禁

交付前必须确认：

- Blocker 为 0
- Major 已处理或用户确认延期
- 核心测试通过
- 回归风险已说明
- release_note 已生成
- 可复用经验已沉淀

---

## 13. 配置文件示例

```yaml
product: ai-dev-workflow
version: 1

default_workflow: standard_feature

providers:
  codex:
    type: cli
    command: codex
    capabilities: [plan, develop, test, shell]
  claude:
    type: cli
    command: claude
    capabilities: [requirement, plan, review, document]
  gemini:
    type: cli
    command: gemini
    capabilities: [review, qa, research]

roles:
  product_analyst:
    default_model: claude
    fallback_model: gemini
  planner:
    default_model: codex
    fallback_model: claude
  plan_reviewer:
    default_model: claude
    fallback_model: gemini
  finalizer:
    default_model: codex
    fallback_model: claude
  developer:
    default_model: codex
    fallback_model: claude
  code_reviewer:
    default_model: claude
    fallback_model: gemini
  qa_tester:
    default_model: claude
    fallback_model: codex

workflows:
  standard_feature:
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
      - id: develop
        role: developer
        output: 05_implementation_report.md
        require_locked_plan: true
      - id: code_review
        role: code_reviewer
        output: 06_code_review.md
      - id: fix
        role: developer
        output: 07_fix_report.md
      - id: test
        role: qa_tester
        output: 08_test_report.md
      - id: archive
        role: product_analyst
        output: 09_release_note.md
```

---

## 14. 命令行 MVP 设计

### 14.1 命令列表

> **v0.1 实际命名为 `vibeflow`**（不是 `ai-dev`）。下面是 v0.1 已实现的完整命令清单。

```bash
# 项目骨架与诊断
vibeflow init                    # 初始化 .ai-dev/ + 生成项目根 CLAUDE.md / AGENTS.md 桥接
vibeflow doctor                  # 检查所有模型 CLI 可用性
vibeflow learn                   # 调 AI 学习项目，自动生成 .ai-dev/rules/ 草稿
vibeflow learn --new-project -m "<愿景>"   # 新项目模式

# 全局用户偏好（跨项目通用）
vibeflow profile init
vibeflow profile edit
vibeflow profile show / path
vibeflow profile sync-claude     # 同步到 ~/.claude/CLAUDE.md（带标记块可撤销）
vibeflow profile unsync-claude

# 任务管理
vibeflow new "<feature>" -d "<描述>"
vibeflow status

# 阶段命令（默认弹 [Y/n] 交互确认；-y 一键 chain；--no-chain 单步）
vibeflow requirement -m "<需求>"
vibeflow plan
vibeflow plan-review
vibeflow finalize
vibeflow develop                 # 软门禁：要求 final_plan 非占位 + finalize 已 advance
vibeflow code-review             # 强校验：评审者模型 ≠ 开发者模型
vibeflow fix
vibeflow test
vibeflow archive

# 横切命令
vibeflow advance [--skip]        # human_gate 确认/跳过
vibeflow handoff                 # 生成交接文档，不动 run.json
```

所有阶段命令通用选项：`-f, --feature` / `--model` / `--export` / `-y, --yes` / `--no-chain`。

### 14.2 MVP 重点

MVP 不追求完全自动化，而是先保证：

- 目录标准化
- Prompt 标准化
- 产物标准化
- 阶段状态标准化
- 模型切换有 handoff
- final_plan 锁定后才能开发
- 模型调用走 spawn 优先（`claude -p` / `codex exec` / `gemini -p`），保留 prompt 导出作为兜底，兼顾自动化与灵活性

---

## 15. 版本规划

### 15.1 MVP：文件驱动版

目标：个人可用，替代手动多终端混乱。

功能：

- 初始化项目配置
- 创建任务目录
- 生成各阶段 prompt
- 调用或辅助调用 Codex / Claude / Gemini
- 生成标准文档产物
- 支持 final_plan 锁定
- 支持 handoff
- 支持状态查看

### 15.2 V1：产品化工作台

目标：从命令行工具升级为可视化工作台。

功能：

- 本地 Web UI
- 任务看板
- 阶段流程图
- 模型配置中心
- 文档预览与编辑
- 一键进入下一阶段
- 执行日志
- 质量门禁状态

### 15.3 V2：探索池 + 路径互通 + 认知引导

> 本节由原"V2 多模型自动编排"重写。原版本聚焦"自动化"，但实际真实需求是"用户主导节奏 + 路径自由 + 不迷路"。

**核心目标**：让方案讨论环节**灵活、可控、可视**。让用户能"想轻就轻、想深就深、想反悔就反悔"。

#### 15.3.1 探索池模式（可选）

新增命令：

| 命令 | 作用 |
|---|---|
| `vibeflow plan --multi [--models X,Y,Z]` | 多模型并行出方案 |
| `vibeflow consult --about <files> --model X -m "<问题>"` | 让指定模型基于若干文件回答一次（单轮问答） |
| `vibeflow synthesize --base <files> --model X [-m "<偏好>"]` | 让指定模型融合多个方案 |
| `vibeflow accept-plan <file>` | 选定方案进入后续流程，可重新执行覆盖前次选择（锁定前） |

#### 15.3.2 路径互通 + lock-plan 分水岭

**关键设计**：finalize advance 是方案锁定的分水岭。

- 锁定前：所有路径互通，可来回切换
- 锁定后：方案锁定（run.json.locked = true），须走 change-request 走变更流程

新增命令：

| 命令 | 作用 |
|---|---|
| `vibeflow plan --multi-extend` | 把已有单方案纳入探索池，让其他模型再出版本（单方案 → 多方案） |
| `vibeflow plan --add <model>` | 探索池中加新模型再出方案 |
| `vibeflow back-to-explore` | 锁定前从 plan_review / finalize 退回探索池继续融合 |
| `vibeflow change-request -m "<问题>"` | 锁定后的变更出口（走轻流程评审） |

#### 15.3.3 认知层引导（避免用户迷路）

每个关键决策点都有主动引导菜单。新增命令：

| 命令 | 作用 |
|---|---|
| `vibeflow next` | 上下文敏感地告诉用户"接下来能做什么" + 给出推荐命令 |
| `vibeflow plan-status` | 可视化展示探索池状态（已有方案、accept 历史、锁定状态） |

**在每个阶段命令完成后**，系统主动展示选项菜单（不只是 [Y/n]）：

```
✓ plan --multi 完成，3 个方案已生成

  A (claude)  : 数据库新加一张表 ...
  B (codex)   : 复用现有表 + 加索引 ...
  C (gemini)  : GraphQL 单端点 ...

接下来你可以：
  [1] accept A → 直接进 plan-review
  [2] accept B → 直接进 plan-review
  [3] accept C → 直接进 plan-review
  [4] 问问 claude 对 A 的看法
  [5] 让 gemini 评判哪个好
  [6] 让 codex 融合 A+B
  [7] 重跑（改需求/换模型）
  [q] 退出菜单（我自己来）
```

回车选 1-7 = 直接跑对应命令，无需用户记 `vibeflow accept-plan plan_A` 这种长命令。

#### 15.3.4 复杂度成本估算

- 代码量：1200-1500 行新增（含测试）
- 开发周期：6-10 天（按 v0.1 节奏，每天 4-6 小时）
- 核心难点：
  - run.json 状态机扩展（explore_history / accept_history / locked）
  - Context Builder 从"按 stage 模板采集"改为"按需采集"
  - 引导菜单需要每个阶段定制下一步选项

#### 15.3.5 最小 / 最长流程承诺

V2 **不会让单方案最小流程变长**。这是产品承诺：

| 流程 | 命令数 | 备注 |
|---|---|---|
| 最小流程（quick_fix） | 5 条 | V2 后不变 |
| 单方案标准流程（standard_feature） | 7 条 | V2 后不变 |
| 多方案直接选（路径 1） | 8-10 条 | V2 新增 |
| 探索池 + 反悔（路径 2/3） | 15-25 条 | V2 新增，用户主导节奏 |

#### 15.3.6 GUI 形态时间线调整

**原 V1 的"本地 Web 控制台"推迟到 V1.5 单独立项**。理由：

| 形态 | 成本 | 解决问题占比 |
|---|---|---|
| **CLI 引导菜单 + next + plan-status**（V2 内做） | 1-2 天 | 80% 的认知层问题 |
| **TUI（ink 终端 UI）**（可选） | 1-2 周 | 90% |
| **本地 Web Console**（推迟到 V1.5） | 1-2 个月 | 100%，但要先验证产品假设 |
| **桌面 App / IDE 插件** | 2-3 个月 | 长期方向 |

先用 CLI 引导验证"用户是否真的需要 GUI"。如果 `vibeflow next` + 引导菜单就够用，省下做 Web Console 的工程；如果不够用，再启动 Web Console。

#### 15.3.7 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| 探索池可能让用户陷入"试一下又试一下"的拖延 | 引导菜单首选项默认是 accept，不是探索；`vibeflow next` 主动推荐"建议你 accept" |
| run.json 状态空间爆炸 | 文档明确状态机；提供 `vibeflow plan-status` 始终能查 |
| 用户分不清"能反悔 vs 不能反悔" | 锁定前后的错误提示要明显区分；`back-to-explore` 失败时直接告诉用户"已锁定，请用 change-request" |
| 多模型并行成本上升 | Adapter 接口已预留 tokenUsage 字段；V2 加 `vibeflow profile token-stats` 让成本可见 |

### 15.4 V3：团队协作版

目标：支持团队研发。

功能：

- 多用户、多项目
- 权限管理
- GitHub/GitLab 集成
- Issue/PR 关联
- 团队模型配置
- 成本统计
- 审计日志
- 组织知识库

### 15.5 V4：智能优化版

目标：让系统根据历史表现自我优化。

功能：

- 模型能力评分
- 按任务类型自动推荐模型
- 失败模式识别
- 自动优化 prompt
- 自动更新项目规则
- 任务成功率、返工率、评审命中率分析

---

## 16. 成功指标

### 16.1 效率指标

| 指标 | 目标 |
|---|---|
| 从需求到锁定方案时间 | 降低 40% |
| 从方案到首次可运行版本时间 | 降低 30% |
| 手动复制上下文次数 | 降低 70% |
| 模型切换准备时间 | 降低 60% |

### 16.2 质量指标

| 指标 | 目标 |
|---|---|
| 未经评审直接开发比例 | 低于 5% |
| final_plan 偏离率 | 低于 10% |
| Blocker 修复率 | 100% |
| 需求遗漏导致返工比例 | 降低 30% |
| 测试报告覆盖核心路径比例 | 高于 90% |

### 16.3 使用指标

| 指标 | 目标 |
|---|---|
| 周活跃任务数 | 持续增长 |
| 单任务平均阶段完成率 | 高于 80% |
| 用户主动复用模板比例 | 高于 50% |
| handoff 使用成功率 | 高于 90% |

---

## 17. 风险与应对

| 风险 | 说明 | 应对 |
|---|---|---|
| 流程过重 | 小需求也走完整流程会拖慢效率 | 提供 Quick / Standard / Strict 三种模式 |
| 模型评审过度 | AI 可能提出大量无关优化 | 评审强制分级，Optional 默认不处理 |
| 多模型意见冲突 | 不同模型结论不一致 | V2 探索池模式，用户主导决策，不依赖 AI 自动裁决 |
| 模型切换丢上下文 | 新模型不了解任务状态 | 强制 handoff.md |
| 多 Agent 改代码冲突 | 并行修改同文件 | worktree/branch 隔离，文件锁定机制 |
| 自动执行有安全风险 | AI 可能执行危险命令 | 权限等级和人工确认 |
| 产品复杂度上升 | 配置、流程、角色过多 | MVP 先做固定模板，逐步开放高级配置 |
| **探索池过度灵活导致用户迷路**（V2） | 路径互通后用户可能不知道"现在能去哪" | `vibeflow next` + `vibeflow plan-status` + 阶段完成主动菜单引导 |
| **探索池拖延陷阱**（V2） | 用户陷入"试一下这个再试一下那个"的反复融合 | 引导菜单首选项默认是 accept，主动推荐"建议你 accept" |
| **锁定后误反悔**（V2） | finalize 锁定后用户想回探索池 | `back-to-explore` 锁定后失败并提示走 `change-request` |
| **多模型并行成本激增**（V2） | parallel_plan 一次调 3 个模型，token 成本翻倍 | `vibeflow profile token-stats` 让成本可见；引导菜单标注成本提示 |

---

## 18. 非功能需求

| 类型 | 要求 |
|---|---|
| 本地优先 | 代码和项目文件优先在本地处理 |
| 可审计 | 所有模型执行、文件修改、决策节点留痕 |
| 可恢复 | 支持中断后 resume |
| 可扩展 | 支持新增模型 provider、角色、工作流模板 |
| 可迁移 | 配置和产物跟随项目仓库保存 |
| 安全 | 高风险命令必须人工确认 |
| 可观测 | 展示阶段状态、日志、失败原因、成本和耗时 |

---

## 19. 信息架构

```text
项目首页
  ├─ 任务看板
  ├─ 模型配置
  ├─ 工作流模板
  ├─ 角色配置
  ├─ 项目知识库
  ├─ 质量门禁
  ├─ 执行日志
  └─ 设置

任务详情
  ├─ 需求文档
  ├─ 方案生成
  ├─ 方案评审
  ├─ 最终方案
  ├─ 开发执行
  ├─ 代码评审
  ├─ 测试验收
  ├─ 交付归档
  └─ 任务日志
```

---

## 20. 推荐默认流程

初期默认流程建议：

```text
用户输入需求
↓
Claude 整理需求
↓
Codex 输出方案 v1
↓
Claude 评审方案
↓
Codex 输出最终方案
↓
用户确认并锁定
↓
Codex 开发
↓
Claude 代码评审
↓
Codex 修复
↓
Claude 生成测试验收报告
↓
用户最终验收
↓
系统归档并沉淀经验
```

复杂需求可以启用：

```text
Codex + Claude + Gemini 并行出方案
↓
Judge 对比方案
↓
用户决策
↓
Finalizer 输出最终方案
```

---

## 21. 开发优先级建议

### P0：先实现闭环

- 项目初始化
- 任务创建
- 标准目录生成
- 工作流模板
- 阶段状态
- 模型选择
- 文档产物生成
- final_plan 锁定
- implementation_report
- code_review
- test_report

### P1：提升可用性

- 本地 Web UI
- 可视化任务流
- 配置中心
- 模型调用适配
- 日志面板
- 多模型方案对比
- handoff 自动检查

### P2：增强自动化

- 自动执行测试命令
- 失败自动重试
- fallback 模型
- worktree 隔离
- GitHub issue / PR 集成
- 成本统计

### P3：团队化

- 多用户
- 权限
- 审计
- 团队模板
- 企业安全策略
- 组织知识库

---

## 22. 结论

本产品的核心不是“让 AI 自动写代码”，而是建立一套可控、可配置、可追踪、可复盘的 AI 研发流程。

最终产品应坚持以下原则：

1. 角色可配置，模型可替换。
2. 方案阶段多模型碰撞，开发阶段主责明确。
3. 最终方案必须锁定后才能开发。
4. 开发完成必须输出实现报告。
5. 代码必须由不同模型评审。
6. 测试验收必须成为独立阶段。
7. 关键产品取舍必须由人类决策。
8. 所有阶段必须有产物沉淀。
9. 长任务必须支持 handoff 和 resume。
10. 每次交付后都要把经验写回项目知识库。

一句话总结：

> 这是一个面向 Vibe Coding 时代的多模型 AI 研发工作流系统，目标是把多个 AI 编程工具从“混乱的终端助手”升级为“可编排、可评审、可验收的研发团队”。

---

## 23. 参考资料

- FLOW: Human-Agent Team Workflow for Claude Code
- metaswarm: multi-agent spec-driven development and cross-model review workflow
- OpenCastle: multi-agent orchestration for AI coding assistants
- Orloj: agent infrastructure as code with YAML-defined agents, tools, policies, and workflows
- AgentsRoom / Maestro 等多模型 IDE 与多 Agent 编排方向

---

## 24. v0.1 MVP 实现状态

> 本节追踪当前已实现 / 未实现的功能。每次发版应同步更新。

### 24.1 已实现（v0.1）

| 模块 | 状态 | 说明 |
|---|---|---|
| 项目骨架 | ✅ | Node.js + TypeScript + Commander + ESM |
| 三层记忆结构 | ✅ | 全局 profile / 项目 rules / 任务产物 |
| 跨模型桥接 | ✅ | init 生成 CLAUDE.md + AGENTS.md，sync-claude/unsync 带标记块 |
| 项目学习（learn） | ✅ | 目录树 / manifest / README / 代码采样 / git log → 三份 rules 草稿；老项目 + 新项目两种模式 |
| 工作流引擎 | ✅ | 标准状态机（CREATED→DONE），运行时持久化到 run.json |
| 内置工作流模板 | ✅ | standard_feature / quick_fix / bugfix |
| 模型适配层 | ✅ | Claude / Codex / Gemini Spawn Adapter + Export 兜底，统一 stdin pipe |
| 阶段命令（9 个） | ✅ | requirement / plan / plan-review / finalize / develop / code-review / fix / test / archive |
| 横切命令 | ✅ | advance / handoff |
| 三道门禁 | ✅ | human_gate / require_locked_plan（develop 软门禁）/ must_be_different_from_developer（code-review） |
| 阶段间交互 chain | ✅ | 默认弹 [Y/n] / `-y` 一键 chain / `--no-chain` 单步 / 非 TTY 自动停 |
| 全局 profile | ✅ | 5 子命令 + 自动注入 prompt + 占位自动跳过 + sync-claude 标记块 |
| 命令日志落盘 | ✅ | `.ai-dev/logs/<feature>/<stage>-<ts>.{stdout,stderr}.log` |
| 多模型 doctor 检查 | ✅ | 实测 claude 2.1.x / codex 0.130.x / gemini 0.34.x 可用 |
| Markdown 产物归档 | ✅ | 标准化 00_-09_ 文件名 + handoff.md |
| **Git 仓库检测 + 自动 init** | ✅（2026-05-22） | init 时检测项目是否 git 仓库，三选项：自动 init / 加 codex --skip-git-repo-check / 跳过；doctor 同步加 git 状态提示 |
| **Spawn Adapter spinner** | ✅（2026-05-23） | 阶段命令调用模型时显示 spinner + 已耗时 + 剩余超时提示；非 TTY 自动降级 |
| **默认 timeout=15 分钟** | ✅（2026-05-23） | init 生成的 config.yaml 给三家模型都默认 timeout_ms=900000 |
| **prompt 禁止思考前言** | ✅（2026-05-23） | DOC_OUTPUT_INSTRUCTION / CODE_OUTPUT_INSTRUCTION 加约束，第一行必须是 # 标题 |
| **develop/fix git diff 落盘检测** | ✅（2026-05-23） | 软门禁：develop/fix 阶段成功后必须 git diff 非空才标 completed（filter .ai-dev/ 和 docs/ai-workflow/），否则标 blocked 提示用户 apply |
| **requirement 多种输入**（#41） | ✅（2026-05-24） | -m 直传 / --from-file 读文件 / --edit 开 $EDITOR（预填已有产物）/ 无参时自动检测非占位 00_requirement.md |
| **阶段级 timeout 配置**（#50） | ✅（2026-05-24） | config.yaml 新增 stage_timeouts，按阶段覆盖模型级 timeout_ms（init 默认 develop/fix=1800000） |
| **commands 空数组检测**（#54） | ✅（2026-05-24） | doctor 新增「项目命令配置」段；test 阶段缺 commands.test 显著告警，develop/fix 缺 build/lint 软提示 |
| **工具链 ready-check**（#53） | ✅（2026-05-24） | 新增 ready-check 模块；doctor「工具链就绪检测」段检查 commands 引用程序与包管理器 CLI；init 探测后轻量告警 |
| **首次端到端实战验证** | ✅（2026-05-21~23） | FlipClockApp 完整跑通 9 阶段，详见 docs/RETROSPECTIVE-flipclockapp.md |

### 24.2 未实现 / 推迟到后续版本

| 模块 | 计划版本 | 说明 |
|---|---|---|
| lock-plan 严格化 | v0.2 | hash + .locked 标记（当前是软门禁——只校验"非占位 + finalize advance" + git diff 非空） |
| `vibeflow retry <stage>` | v0.2 | 阶段失败后一键重跑（当前要手动改 run.json） |
| `standard_lite` 工作流 | v0.2 | 介于 quick_fix（无评审）和 standard_feature（9 阶段）之间的中间档 |
| Git Manager | v0.2 | diff 摘要自动注入 / 分支管理 / worktree 隔离 |
| Path Resolver | v0.2 | 按需求关键字自动推荐 related_paths |
| **V2 探索池模式**（详见 §7.2、§15.3） | **V2** | 包含以下子模块 |
| └─ parallel_plan + accept-plan | V2 | 多模型并行 + 用户选 |
| └─ consult + synthesize | V2 | 探索池内的问答 + 融合 |
| └─ back-to-explore + change-request | V2 | 路径互通 + 锁定后变更出口 |
| └─ next + plan-status | V2 | 认知层引导命令 |
| └─ 阶段完成主动菜单 | V2 | 不只是 [Y/n]，而是列出所有可选下一步 |
| `vibeflow profile token-stats` | V2 | 成本/Token 统计（Adapter 接口已预留字段） |
| 本地 Web Console | **V1.5（推迟，原 V1）** | 先用 V2 的 CLI 引导验证产品假设，再启动 |
| TUI（终端 UI，ink） | V1.5（可选） | CLI 引导和 Web Console 之间的中间形态 |
| 团队协作 / 权限 / 审计 | V3 | 当前为本地单用户 |
| IDE 插件 | V4 | |

### 24.3 与原 PRD 设计的差异

| 原设计 | v0.1 实际 | 原因 |
|---|---|---|
| 命名为 `ai-dev` | 命名为 `vibeflow` | 用户决定 |
| MVP 半自动（手动复制 prompt） | spawn 优先 + export 兜底 | 2026 年初三家 CLI 都支持 headless，spawn 体验显著更好 |
| 没有项目学习能力 | 新增 `vibeflow learn` | 解决"上手第一公里"问题，原 PRD 假设用户手写 rules |
| 没有全局用户偏好层 | 新增 `~/.vibeflow/profile.md` | 跨项目记忆需求，且支持 sync 到原生 Claude Code |
| 没有桥接文件 | init 生成 CLAUDE.md / AGENTS.md | 让用户能"离开 vibeflow 也能用"，避免工具锁定 |
| 完成阶段后停下等手动 | 默认弹 [Y/n] 交互 + `-y` 一键 chain | 体验改进，仍保留 `--no-chain` 兼容原行为 |
