# vibeflow 使用说明

> 适用于 vibeflow v0.3.0 · Node.js 20+

vibeflow 把一次 AI Coding 任务拆成需求、方案、评审、开发、代码评审、测试和归档，并让不同角色默认由不同模型承担。核心目的不是增加流程，而是避免同一个模型自写自审。

## 1. 安装

### npm 安装

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

## 2. 准备模型 CLI

vibeflow 不直接调用模型 API，也不要求把 API Key 写进配置。它调用本机已经安装并完成认证的 CLI：

```bash
claude --version
codex --version
gemini --version
```

不必安装三家。建议至少准备两种模型，才能发挥跨模型评审的价值；缺少某个 CLI 时，也可以用 `--export` 导出 Prompt 后手动交给其他模型。

初始化后的默认角色映射如下：

| 角色 | 默认模型 | 作用 |
|---|---|---|
| product_analyst | Claude | 整理需求 |
| planner | Codex | 输出方案 |
| plan_reviewer | Claude | 评审方案 |
| finalizer | Codex | 吸收评审并定稿 |
| developer | Codex | 修改代码 |
| code_reviewer | Claude | 评审代码 |
| qa | Claude | 测试与验收 |

这些映射可以在 `.ai-dev/config.yaml` 中修改，也可以在单次阶段命令中用 `--model <id>` 覆盖。默认配置会让方案作者与方案评审者分离；代码评审还有硬门禁，评审模型不能与实际开发模型相同。

## 3. 初始化目标项目

进入你真正要开发的项目，而不是 vibeflow 自己的源码目录：

```bash
cd your-project
vibeflow init
vibeflow doctor
vibeflow learn
```

- `init`：生成 `.ai-dev/` 配置、工作流、Prompt、规则和桥接文件。
- `doctor`：检查模型 CLI、角色映射、Git 状态和项目构建命令。
- `learn`：扫描现有项目并生成规则草稿，执行前会展示扫描范围。

新项目还没有代码时：

```bash
vibeflow learn --new-project -m "一个帮助用户管理个人知识的桌面应用"
```

先看扫描结果、不调用模型：

```bash
vibeflow learn --dry-run
```

## 4. 跑通标准流程

### 4.1 创建任务

```bash
vibeflow new "user-profile" -d "增加用户资料编辑"
```

可选工作流：

```bash
vibeflow new "feature-name" --workflow standard_feature
vibeflow new "small-fix" --workflow quick_fix
vibeflow new "login-bug" --workflow bugfix
```

- `standard_feature`：完整 9 阶段，适合正常功能。
- `quick_fix`：需求、开发、代码评审、测试，适合小改动。
- `bugfix`：需求、方案、定稿、开发、代码评审、测试。

### 4.2 整理并确认需求

直接输入需求：

```bash
vibeflow requirement -m "用户可以修改头像、昵称和个人简介"
```

长需求可以从文件读取：

```bash
vibeflow requirement --from-file ./requirement.md
```

也可以使用本机编辑器：

```bash
vibeflow requirement --edit
```

需求阶段是人工门禁。检查 `00_requirement.md` 后确认：

```bash
vibeflow advance
```

### 4.3 方案、评审与定稿

```bash
vibeflow plan -y
```

`-y` 会连续执行 `plan → plan-review → finalize`，遇到最终方案的人工门禁后停止。检查 `03_final_plan.md`，确认方案可进入开发：

```bash
vibeflow advance
```

这一步会锁定最终方案。方案未锁定时，`develop` 不会执行。

如果希望逐阶段检查：

```bash
vibeflow plan --no-chain
vibeflow plan-review --no-chain
vibeflow finalize --no-chain
```

### 4.4 开发、代码评审、修复与测试

```bash
vibeflow develop -y
```

标准工作流会继续执行：

```text
develop → code-review → fix → test → archive
```

其中：

- develop/fix 会允许对应模型修改真实工作区。
- develop/fix 后会检查 Git diff，避免模型只声称完成、实际没有落盘。
- 如果配置了 `commands.build`，落盘后会运行构建验证。
- code-review 的模型必须与本次 developer 不同。
- test 会运行 `.ai-dev/config.yaml` 中配置的测试命令。
- archive 完成后任务状态变为 `done`。

建议在写入阶段前保持 Git 工作区可回滚，并在每个关键节点检查：

```bash
git diff
vibeflow status
```

## 5. 不知道下一步时

```bash
vibeflow next
vibeflow status
```

- `next` 根据 `run.json` 给出当前最合适的下一条命令。
- `status` 展示任务和各阶段状态。
- 同时有多个任务时，用 `--feature <name>` 明确指定。

例如：

```bash
vibeflow status --feature user-profile
vibeflow next --feature user-profile
```

## 6. 多模型并行出方案

复杂或高风险需求可以让 2～3 个模型分别出方案：

```bash
vibeflow plan --multi --models codex,claude,gemini
```

候选方案会进入 `explore/` 探索池，而不是直接覆盖正式的 `01_plan_v1.md`。

### 直接选择

```bash
vibeflow accept-plan plan_001
```

选择后才会进入正式的 plan-review。自动继续：

```bash
vibeflow accept-plan plan_001 -y
```

### 让另一个模型点评候选

```bash
vibeflow consult \
  --about plan_001,plan_002 \
  --model gemini \
  -m "比较两份方案的迁移风险和测试成本"
```

### 融合候选

```bash
vibeflow synthesize \
  --base plan_001,plan_002 \
  --model claude \
  -m "保留方案一的低改动范围，吸收方案二的回滚设计"
```

融合结果仍在探索池中，需要再次显式 `accept-plan <artifact-id>`。vibeflow 不会自动替人决定最终采用哪份方案。

## 7. 常用控制参数

阶段命令通常支持：

| 参数 | 作用 |
|---|---|
| `-f, --feature <name>` | 指定任务 |
| `--model <id>` | 临时覆盖该角色的默认模型 |
| `--export` | 只导出 Prompt，不自动调用 CLI |
| `-y, --yes` | 完成后自动继续后续阶段 |
| `--no-chain` | 完成当前阶段后停止 |
| `--force` | 重跑已完成阶段，并重置过时的下游状态 |

`requirement`、`consult`、`synthesize` 和 `change-request` 还提供各自的 `-m, --message <text>`。不同命令支持的参数略有差异，以实际帮助为准：

```bash
vibeflow <command> --help
```

## 8. Export 兜底模式

当某个模型 CLI 未安装、认证异常，或你希望在其他界面手动执行时：

```bash
vibeflow plan --export
vibeflow code-review --export
```

命令只生成 Prompt 文件，不调用模型。把 Prompt 交给目标模型执行后，将结果保存到提示的产物路径，再继续流程。

## 9. 交付、变更与交接

### 只交付方案

方案已经锁定，但当前只需要方案、不准备立即开发：

```bash
vibeflow deliver
```

任务会变为 `delivered`，以后仍可继续：

```bash
vibeflow develop
```

### 已收尾任务发起变更

```bash
vibeflow change-request -m "真实环境发现上传超时，需要增加重试和取消"
```

变更原因会被记录，任务从 `done` 或 `delivered` 重开到开发阶段，不会直接推翻已经锁定的方案。

### 生成交接文档

```bash
vibeflow handoff
```

`handoff` 会生成当前任务的交接文档，但不改变阶段状态。

## 10. 产物与状态

初始化后：

```text
.ai-dev/
├── config.yaml
├── workflows/
├── prompts/
├── agents/
├── rules/
└── logs/
```

每个任务：

```text
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

`run.json` 是流程状态的单一真相源。不要为了跳阶段手改它，优先使用 `advance`、`--force`、`deliver` 或 `change-request`。

## 11. Profile：跨项目偏好

```bash
vibeflow profile init
vibeflow profile show
vibeflow profile edit
vibeflow profile path
```

如果希望原生 Claude Code 也读取同一份偏好：

```bash
vibeflow profile sync-claude
vibeflow profile unsync-claude
```

## 12. 安全边界

vibeflow 是本地工作流工具，但会调用外部 AI CLI，并可能读取或修改真实项目：

- develop/fix 会授予对应 CLI 工作区写权限。
- 配置中的 build/test/lint 命令可能被执行。
- Prompt 和模型输出会写入 `.ai-dev/logs/`。
- 子进程会继承当前环境变量，以复用 CLI 的认证状态。
- 内容脱敏属于尽力保护，无法保证识别所有密钥格式。

使用建议：

1. 在 Git 仓库中运行，写入阶段前保留可回滚状态。
2. 不要把生产密钥、用户数据或私有证书放进需求和规则文件。
3. 首次使用先运行 `doctor`，并检查 `.ai-dev/config.yaml` 中的命令。
4. 自动执行后检查 `git diff`，再继续下一阶段。
5. 对敏感项目使用 `--export`，自行控制交给模型的上下文。

完整说明见 [SECURITY.md](../SECURITY.md)。

## 13. 命令速查

| 命令 | 用途 |
|---|---|
| `init` | 初始化项目 |
| `doctor` | 检查环境与配置 |
| `learn` | 扫描项目并生成规则草稿 |
| `profile` | 管理跨项目偏好 |
| `new` | 创建任务 |
| `status` | 查看任务状态 |
| `next` | 推荐下一步 |
| `requirement` | 整理需求 |
| `plan` | 生成单方案或多模型候选方案 |
| `plan-review` | 评审方案 |
| `finalize` | 生成最终方案 |
| `develop` | 开发并写入工作区 |
| `code-review` | 代码评审 |
| `fix` | 修复评审问题 |
| `test` | 测试与验收 |
| `archive` | 生成发布说明并归档 |
| `accept-plan` | 接受探索池方案 |
| `consult` | 针对探索材料咨询模型 |
| `synthesize` | 融合多个候选方案 |
| `advance` | 确认或推进人工门禁 |
| `deliver` | 只交付已锁定方案 |
| `change-request` | 重开已收尾任务做轻量变更 |
| `handoff` | 生成交接文档 |
