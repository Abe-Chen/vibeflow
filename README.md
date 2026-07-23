# vibeflow

> **别让一个模型既写代码，又给自己打分。**

vibeflow 是一个面向 AI Coding 的开源 CLI：让 Claude、Codex、Gemini 等不同模型分别负责方案、开发和评审，通过跨模型复核减少单模型的思维盲区。

每个阶段都会留下可追踪的 Markdown 产物；需求和最终方案设有人工门禁；代码评审默认由与开发不同的模型完成。

当前版本：**v0.3.0 中文预览版** · Node.js 20+

## 为什么需要 vibeflow

单个 AI 很适合快速推进，但“自己写、自己审”容易继承同一套假设：

- 出方案时遗漏的边界，自我评审时可能继续遗漏。
- 写代码时形成的实现偏见，会影响后续判断。
- 聊天上下文会越来越长，关键决定容易被淹没。
- 没有明确门禁时，模型可能在方案未确认前直接开发。

vibeflow 把一次复杂需求拆成有角色、有产物、有检查点的流程：

```text
需求整理
  ↓ 人工确认
方案（默认 Codex）
  ↓
方案评审（默认 Claude）
  ↓
最终方案
  ↓ 人工锁定
开发（默认 Codex）
  ↓
代码评审（默认 Claude，硬门禁：不能与 Developer 相同）
  ↓
修复 → 测试 → 归档
```

不同模型不保证绝对正确，但能减少同一个模型受既有思路影响、为自己的方案辩护或重复遗漏同类问题的概率。

## 已验证的价值

vibeflow 不是只存在于 PRD 中的流程。它已经在 Android、iOS + Supabase/Deno 和自身 dogfooding 中跑过完整闭环：

- 方案评审发现开发方案没有覆盖动画下半区，阻止问题进入实现。
- 代码评审通过真实 `git diff` 发现“模型报告说已修改，但代码没有落盘”。
- 跨模型评审发现新实现切断旧业务链路、臆测不存在的 SDK API 等真实回归。
- develop/fix 已能让三家 CLI 直接写入工作区，并在落盘后执行构建验证。

详细案例见 [首次端到端实战复盘](docs/RETROSPECTIVE-flipclockapp.md)。

## 核心能力

- **角色与模型解耦**：Planner、Reviewer、Developer、QA 可绑定不同模型。
- **跨模型评审**：默认让方案作者与方案评审者、开发者与代码评审者分离；代码评审有不同模型硬门禁。
- **文档驱动**：需求、方案、评审、实现、测试和发布说明均为 Markdown。
- **人工门禁**：需求确认和最终方案锁定必须由人推进。
- **方案锁定**：`03_final_plan.md` 未锁定，不得进入 develop。
- **真实落盘**：develop/fix 给模型工作区写权限，并用 Git diff 验证结果。
- **多模型探索池**：2～3 个模型并行出方案，可咨询、融合和择优。
- **可中断续接**：`status`、`next`、`handoff` 和持久化 `run.json` 支持跨会话继续。
- **阶段重跑**：`--force` 可重做某阶段并重置过时的下游状态。
- **Export 兜底**：不自动调用模型，只导出 Prompt 到文件。

完整清单见 [docs/CAPABILITIES.md](docs/CAPABILITIES.md)。

## 安装

### 从 npm 安装

首个公开包发布后：

```bash
npm install -g vibeflow
vibeflow --version
```

### 从源码安装

```bash
git clone https://github.com/Abe-Chen/vibeflow.git
cd vibeflow
npm install
npm run build
npm link
```

## 准备模型 CLI

vibeflow 不直接调用模型 API，也不要求在配置中填写 API Key。它调用你本机已经安装并完成认证的 CLI：

```bash
claude --version
codex --version
gemini --version
```

不必三家都安装。要获得“避免自写自审”的核心价值，建议至少准备两种模型；也可以用一个本地 CLI，再把评审阶段通过 `--export` 交给其他工具。

## 5 分钟开始

进入你要开发的目标项目：

```bash
cd your-project

# 生成 .ai-dev/ 配置、工作流和规则
vibeflow init

# 检查模型 CLI、角色映射、Git 和项目命令
vibeflow doctor

# 扫描现有项目，生成规则草稿
vibeflow learn

# 创建任务
vibeflow new "user-profile" -d "增加用户资料编辑"

# 需求整理 → 人工确认
vibeflow requirement -m "用户可以修改头像、昵称和个人简介"
vibeflow advance

# plan → plan-review → finalize，遇到方案人工门禁时停止
vibeflow plan -y
vibeflow advance

# develop → code-review → fix → test → archive
vibeflow develop -y
```

不知道下一步该做什么时：

```bash
vibeflow next
vibeflow status
```

## 多模型并行出方案

复杂需求可以让 2～3 个模型各自出方案，再由人择优或融合：

```bash
vibeflow plan --multi --models codex,claude,gemini

# 查看候选 id 后选定一份
vibeflow accept-plan plan_001

# 或先咨询 / 融合
vibeflow consult --about plan_001 --model gemini -m "评估迁移风险"
vibeflow synthesize --base plan_001,plan_002 --model claude -m "优先低改动方案"
```

探索池不会自动替你做最终选择，必须显式 `accept-plan` 后才能进入正式评审。

## 主要命令

| 类别 | 命令 |
|---|---|
| 项目准备 | `init`、`doctor`、`learn`、`profile` |
| 任务管理 | `new`、`status`、`next` |
| 方案 | `requirement`、`plan`、`plan-review`、`finalize` |
| 开发 | `develop`、`code-review`、`fix`、`test`、`archive` |
| 探索池 | `plan --multi`、`accept-plan`、`consult`、`synthesize` |
| 流转 | `advance`、`deliver`、`change-request`、`handoff` |

详细参数与完整流程见 [docs/USAGE.md](docs/USAGE.md)。

## 产物结构

在目标项目中，vibeflow 会生成：

```text
.ai-dev/
├── config.yaml
├── workflows/
├── prompts/
├── agents/
├── rules/
└── logs/

docs/ai-workflow/<feature>/
├── run.json
├── 00_requirement.md
├── 01_plan_v1.md
├── 02_plan_review.md
├── 03_final_plan.md
├── 04_human_decisions.md
├── 05_implementation_report.md
├── 06_code_review.md
├── 07_fix_report.md
├── 08_test_report.md
└── 09_release_note.md
```

## 安全说明

vibeflow 会调用外部 AI CLI，并可能读取或修改真实项目：

- develop/fix 会授予对应 CLI 工作区写权限。
- `.ai-dev/config.yaml` 中的 build/test/lint 命令可能被执行。
- Prompt 和模型 stdout/stderr 会写入 `.ai-dev/logs/`。
- 子进程会继承当前环境变量，以复用各家 CLI 的认证状态。
- 密钥脱敏是尽力保护，不保证识别所有格式。

建议始终在 Git 仓库中使用，执行写入阶段前保持工作区可回滚，并在继续下一阶段前检查 `git diff`。完整边界见 [SECURITY.md](SECURITY.md)。

## 当前限制

- CLI 和内置 Prompt 当前以中文为主。
- 多模型调用会消耗各家 CLI 对应的订阅或 API 配额。
- 真机、GUI 和真实后端环境仍需要人工验收。
- 多 feature 的 Git worktree 隔离和本地 Web Console 尚未实现。

## 开发与贡献

```bash
npm install
npm run verify
npm pack --dry-run
```

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。

## 文档

- [使用说明](docs/USAGE.md)
- [能力清单](docs/CAPABILITIES.md)
- [产品设计](docs/PRD.md)
- [技术设计](docs/TECH_DESIGN.md)
- [变更记录](CHANGELOG.md)

## License

[MIT](LICENSE)
