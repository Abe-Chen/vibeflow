# vibeflow

多模型 AI 研发工作流系统：把 Codex / Claude / Gemini 等多个 AI 编程工具组织成一个可控、可评审、可验收的研发团队。

面向 Vibe Coding / AI Coding 场景，将「需求 - 方案 - 评审 - 开发 - 代码评审 - 测试验收 - 交付沉淀」产品化、流程化、可配置化。

**当前版本**：MVP（v0.1.0），完整工作流闭环已跑通。

## 核心理念

- **角色与模型解耦**：Planner / Reviewer / Developer / QA 是角色，Codex / Claude / Gemini 只是可替换的执行模型
- **文档驱动**：每个阶段都有可追踪的 Markdown 产物，而不是只保留聊天记录
- **方案锁定**：`final_plan` 未锁定，不得进入开发
- **跨模型评审**：实现和评审默认由不同模型完成
- **人工门禁**：涉及范围、架构、数据、权限、付费时必须停下等待用户确认

## 快速开始

```bash
# 1. 安装依赖
cd vibeflow && npm install

# 2. 链接到全局（可选，方便后续直接 vibeflow xxx）
npm run build && npm link

# 3. （可选）一次性设置跨项目偏好
vibeflow profile init
vibeflow profile edit            # 填写"我用 pnpm 不用 npm"之类的偏好
vibeflow profile sync-claude     # 让原生 Claude Code 也能读到（可撤销）

# 4. 进入你的目标项目
cd ~/AndroidStudioProjects/<your-project>

# 5. 初始化（同时生成 CLAUDE.md / AGENTS.md 桥接，让原生 CLI 也能用）
vibeflow init

# 6. 检查模型 CLI / 项目命令 / 工具链是否就绪
vibeflow doctor

# 7. 让 AI 学习项目，自动生成规则草稿（强烈推荐）
vibeflow learn               # 老项目
# vibeflow learn --new-project -m "<项目愿景>"   # 新项目

# 8. 创建第一个任务
vibeflow new "feature-name" -d "一句话描述"

# 9. 走完整工作流（默认每步会问 [Y/n]，回车继续，加 -y 一键 chain）
vibeflow requirement -m "<需求描述>"
vibeflow advance              # human_gate 确认需求
vibeflow plan -y              # -y 自动 chain：plan → plan-review → finalize，遇 human_gate 停
vibeflow advance              # human_gate 锁定方案 —— 此后二选一：
vibeflow deliver              #   ① 只要方案就收尾（状态=📦方案已交付，之后仍可继续 develop）
vibeflow develop -y           #   ② 继续开发：-y 自动 chain develop → code-review → fix → test → archive
vibeflow advance              # 收尾，状态变 done
```

详细使用指南：[docs/USAGE.md](docs/USAGE.md)

## 命令清单

| 命令 | 作用 |
|---|---|
| `init` / `doctor` / `learn` / `new` / `status` | 项目骨架、诊断、AI 学习项目 |
| `profile init/edit/show/path/sync-claude/unsync-claude` | 管理 `~/.vibeflow/profile.md` 跨项目偏好 |
| `requirement` → `plan` → `plan-review` → `finalize` | 需求与方案阶段 |
| `develop` → `code-review` → `fix` → `test` → `archive` | 开发与交付阶段 |
| `advance` | 标当前阶段完成并推进（用于 human_gate） |
| `deliver` | 方案锁定后交付收尾，标记"方案已交付（可继续开发）"，之后仍可随时 `develop` |
| `handoff` | 生成交接文档（横切，不动 run.json） |

阶段命令通用选项：`-f, --feature` / `--model` / `--export` / `-y, --yes`（自动 chain）/ `--no-chain`（单步）。

完整速查：[docs/USAGE.md §9](docs/USAGE.md#9-命令速查)

## 文档

- [docs/USAGE.md](docs/USAGE.md) — **使用说明**（从安装到走完整工作流）
- [docs/PRD.md](docs/PRD.md) — 产品需求文档（设计理念 / 竞品分析 / 版本规划）
- [docs/TECH_DESIGN.md](docs/TECH_DESIGN.md) — 技术方案（架构 / 数据模型 / API / 可观测性）

## 项目结构

```
vibeflow/
├── src/
│   ├── cli/                   # CLI 入口与命令
│   │   ├── index.ts
│   │   └── commands/          # 16 个命令
│   ├── core/                  # 核心：工作流引擎、状态机、Context Builder、Stage Runner
│   ├── adapters/              # 模型适配层：Claude / Codex / Gemini / Export
│   ├── templates/             # 内置的 prompt / workflow / agent / rules 模板
│   └── utils/                 # 通用工具
├── docs/
│   ├── USAGE.md
│   ├── PRD.md
│   └── TECH_DESIGN.md
├── package.json
└── tsconfig.json
```

## 状态

- ✅ **MVP v0.1 完整闭环**：19 个命令、10 个 prompt 模板、3 道门禁、4 种模型适配
- ✅ **首次端到端实战验证**：FlipClockApp（Android Kotlin）跑通 9 阶段完整流程，跨模型评审 3 次抓到 Codex 自己没看到的真实 Bug。详见 [`docs/RETROSPECTIVE-flipclockapp.md`](docs/RETROSPECTIVE-flipclockapp.md)
- ✅ **三层记忆 + 跨模型兼容**：全局 profile / 项目 rules / 任务产物；CLAUDE.md + AGENTS.md 桥接让原生 CLI 也能接续
- ✅ **AI 自动学习项目**：`vibeflow learn` 扫码生成 rules 草稿，支持老项目和新项目
- ✅ **阶段间交互推进**：默认 [Y/n] 询问，`-y` 一键 chain，`--no-chain` 单步
- ✅ **Spinner + 分级超时**：阶段命令调模型时显示已耗时/剩余超时；config.yaml 默认 `timeout_ms=900000`，并支持 `stage_timeouts` 给 develop/fix 等阶段单独配更长超时
- ✅ **Git 仓库自动检测 + init**：init 检测目标项目是否 git 仓库，三选项处理（自动 init / 绕过 codex 检查 / 跳过）
- ✅ **develop/fix git diff 落盘检测**：软门禁防止 AI 输出 patch 但未真写盘
- ✅ **requirement 多种输入**：`-m` 直接传 / `--from-file` 读文件 / `--edit` 开编辑器 / 自动检测已有 `00_requirement.md`
- ✅ **doctor 全面体检**：模型 CLI 可用性 + 角色映射 + 项目命令配置（test/build/lint）+ 工具链就绪 + git 仓库状态
- ✅ **v0.1 polish 全部完成**：P0 四件 + P1 三件 + P2 一件，见 [`docs/BACKLOG.md`](docs/BACKLOG.md)
- ✅ **方案交付模式 `deliver`**：finalize 锁定后可"只要方案"正式收尾（📦 方案已交付、可继续开发），用 vibeflow 自己 dogfood 全流程实现
- ⏳ V2 规划：探索池模式（parallel_plan + accept-plan + consult + synthesize），详见 PRD §7.2 / §15.3

## License

MIT
