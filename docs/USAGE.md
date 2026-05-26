# vibeflow 使用说明

> 多模型 AI 研发工作流系统：把 Codex / Claude / Gemini 等多个 AI 编程工具组织成一个可控、可评审、可验收的研发团队。
> 当前版本：**MVP**（v0.1.0）。

---

## 1. 适用场景

你应该用 vibeflow 来组织 AI 编程工作，如果你有以下需求之一：

- 想用一个模型出方案、用另一个模型评审，避免"自写自审"
- 想让 AI 在 final_plan 锁定后才动代码，避免边做边改方向
- 想让每一次 AI 协作都有可追溯的文档产物（需求 / 方案 / 评审 / 报告）
- 想中途切换模型，但不希望新模型丢上下文
- 想为团队沉淀一套可复用的 SOP

如果你只是想让 AI 帮你写一段 50 行的脚本，**不需要 vibeflow**，直接用 Claude Code / Codex 就行。

---

## 2. 先决条件

在使用 vibeflow 之前，请确认以下工具已安装：

| 工具 | 命令 | 验证方式 |
|---|---|---|
| Node.js ≥ 20 | `node --version` | 显示版本号 |
| Claude Code | `claude --version` | 任一可用即可，不必三家都装 |
| Codex CLI | `codex --version` | 同上 |
| Gemini CLI | `gemini --version` | 同上 |

**注意**：vibeflow 不强制要求三家 CLI 都装。但默认配置下：
- `developer` / `planner` / `finalizer` 角色用 Codex
- `product_analyst` / `reviewer` / `qa` 角色用 Claude
- `gemini` 作为 fallback

如果你只装了 Claude Code，请在 `config.yaml` 中把所有角色的 `default_model` 改成 `claude`（见 §6.2）。

---

## 2.5 模型 CLI 准备清单

> 这一节解答常见疑问："vibeflow 要不要填 API key？模型怎么配置？"

**关键事实**：vibeflow **不直连模型 API**，而是 `spawn` 本地已装的 CLI。**所以 vibeflow 不需要任何 API key**——认证由各家 CLI 自己管。

### 2.5.1 四层概念区分（避免混淆）

| 层级 | 是什么 | 怎么配 |
|---|---|---|
| **L1 - CLI 安装** | `claude` / `codex` / `gemini` 三个命令是否在 PATH 里 | 各自官网装 |
| **L2 - CLI 认证** | CLI 自己的登录态（账号/订阅/key） | `claude` 首次启动会引导登录；codex/gemini 同理 |
| **L3 - vibeflow 角色→模型映射** | `.ai-dev/config.yaml` 描述 "哪个角色用哪个模型" | `vibeflow init` 默认填好，需要时编辑 |
| **L4 - 用户偏好** | `~/.vibeflow/profile.md` 跨项目风格偏好 | 跟模型选择无关，详见 §7.3 |

vibeflow 自己**不知道也不管成本**——它只调 CLI，怎么计费是各家的事。

### 2.5.2 第 1 步：安装 CLI（如未装）

| CLI | 安装命令（示例） |
|---|---|
| Claude Code | 见 [Claude Code 官方文档](https://docs.claude.com/claude-code) |
| Codex CLI | `npm install -g @openai/codex` 或见 OpenAI 官方文档 |
| Gemini CLI | 见 Google 官方文档 |

具体命令以各家官网为准。本节不复制官网说明，避免过时。

### 2.5.3 第 2 步：完成各自的登录认证

CLI 装了不等于能调用——还要登录或填 key/订阅信息。

```bash
# Claude Code：首次跑会引导登录
claude -p "say hi"

# Codex CLI：首次跑会引导登录或填 key
codex exec "say hi"

# Gemini CLI：首次跑会引导
gemini -p "say hi"
```

**简单办法**：直接跑 `vibeflow doctor`，它会用各自 `--version` 探活。
**最稳办法**：上面三条命令手动试一遍，确保都能真正调通——避免 vibeflow 跑到一半才发现某家没登录。

### 2.5.4 第 3 步：vibeflow 角色→模型映射（init 已默认填好）

`vibeflow init` 后，`.ai-dev/config.yaml` 默认是这样：

```yaml
roles:
  product_analyst:
    default_model: claude        # 需求整理用 Claude
    fallback_models: [gemini]
  planner:
    default_model: codex         # 出方案用 Codex
    fallback_models: [claude]
  plan_reviewer:
    default_model: claude        # 评审方案用 Claude（≠ planner）
    fallback_models: [gemini]
  finalizer:
    default_model: codex         # 与 planner 同模型，方案连贯
  developer:
    default_model: codex         # 开发用 Codex
  code_reviewer:
    default_model: claude        # 评审代码用 Claude（≠ developer）
    must_be_different_from_developer: true
  qa:
    default_model: claude
```

这套默认配置基于的判断是：

- **Claude**：长文本理解和结构化输出稳定，适合需求整理 / 评审 / QA
- **Codex**：代码理解和实现能力强，适合出方案 / 开发
- **Gemini**：长上下文 + 免费额度，适合 fallback

三家都装且都登录的话，**不需要改任何东西**，直接跑。

### 2.5.5 只装了一家 CLI 怎么办？

**场景 A：只想用 Claude（最常见）**

编辑 `.ai-dev/config.yaml`，把所有 `default_model` 都改成 `claude`：

```yaml
roles:
  product_analyst:
    default_model: claude
  planner:
    default_model: claude
  plan_reviewer:
    default_model: claude
  # ... 全部改成 claude
  code_reviewer:
    default_model: claude
    must_be_different_from_developer: false   # 取消"评审者必须 ≠ 开发者"约束
```

⚠️ 注意 `must_be_different_from_developer: false` 这一行——不改的话，跑 `vibeflow code-review` 会因为评审者和开发者都是 claude 被拒。

**场景 B：保留"跨模型评审"价值，但只用一个本地 CLI**

`code_reviewer` 改成 `export` 模式，复制 prompt 到别处（如 Cursor / Web 版 Claude）跑：

```bash
vibeflow code-review --export
# 系统生成 prompt 文件到 .ai-dev/exports/<feature>/code_review/prompt.md
# 你复制到任意 GUI 工具执行，结果保存到 06_code_review.md
vibeflow advance
```

### 2.5.6 临时换某次的模型

不改 config.yaml，只在本次调用换模型：

```bash
vibeflow plan --model claude          # 这次 plan 用 claude 而不是 codex
vibeflow develop --model gemini       # 这次 develop 用 gemini
vibeflow code-review --model gemini   # 让 gemini 评审
```

### 2.5.7 关于成本

每家计费不同，vibeflow 不管：

| CLI | 计费模式 |
|---|---|
| Claude Code | Anthropic 订阅（Pro/Max）或 API 按 token |
| Codex CLI | OpenAI 订阅或 API 按 token |
| Gemini CLI | 免费额度（每天数百次调用）+ API 按 token |

**跑一次 `standard_feature` 完整流程 = 9 次模型调用**（每阶段一次）。

- 都是订阅用户：跑几次都没问题
- 走 API 按 token 计费：估算一下 prompt 长度，心里有数

V2 会加 `vibeflow profile token-stats` 让成本可见，但 v0.1 没有。

### 2.5.8 验证：跑一次 doctor

所有 CLI 准备好后，跑：

```bash
vibeflow doctor
```

预期输出：

```
- claude   ✓ available (2.1.x)
- codex    ✓ available (0.130.x)
- gemini   ✓ available (0.34.x)
- export   ✓ available (export-mode)

角色 → 模型映射
  product_analyst    ✓ claude
  planner            ✓ codex
  ...
✓ 全部模型可用
```

某家 `✗ unavailable` 时按 §2.5.3 重新登录，或按 §2.5.5 改 config.yaml 切换。

---

## 3. 安装 vibeflow

vibeflow 目前在本地源码运行（尚未发布到 npm）。

### 3.1 源码安装

```bash
cd /Users/chenzhiguo/AndroidStudioProjects/vibeflow
npm install
```

### 3.2 把 vibeflow 加入 PATH（推荐）

```bash
cd /Users/chenzhiguo/AndroidStudioProjects/vibeflow
npm run build
npm link
```

之后任意目录都可以直接运行 `vibeflow`。

### 3.3 源码开发模式（不打包）

如果你要边改 vibeflow 边用，可以直接 tsx 运行：

```bash
# 在目标项目目录下
npx tsx /Users/chenzhiguo/AndroidStudioProjects/vibeflow/src/cli/index.ts <command>
```

为方便，下文统一写 `vibeflow <command>`。如果你没有 `npm link`，把它替换成上面的完整 tsx 路径即可。

---

## 4. 第一次使用：完整流程示例

假设你要在 **schedule_board**（一个 Flutter 平板看板项目）里加一个"按时间维度筛选日程"的功能。

### 4.1 进入目标项目并初始化

```bash
cd /Users/chenzhiguo/AndroidStudioProjects/schedule_board
vibeflow init
```

会在项目根创建 `.ai-dev/` 目录，包含：

```
.ai-dev/
├── config.yaml          # 模型、角色、命令、门禁配置
├── workflows/           # 工作流模板（standard_feature / quick_fix / bugfix）
├── agents/              # 每个角色的职责说明（供模型阅读）
├── prompts/             # 每个阶段的 prompt 模板（10 个）
└── rules/               # 项目级规则（项目规则 / 编码规范 / 产品红线）
```

### 4.2 让 AI 学习项目，自动生成规则草稿（推荐）

`vibeflow init` 生成的 `.ai-dev/rules/*.md` 是占位文件（全是 TODO）。你不需要手动写，跑：

```bash
# 老项目：扫描代码 / README / git log → 生成三份 rules 草稿
vibeflow learn

# 先看看会扫哪些文件，不调模型
vibeflow learn --dry-run

# 新项目（还没代码）：从一句话愿景出发
vibeflow learn --new-project -m "Flutter 平板单机日程看板，ToC 免费，主打离线"
```

`learn` 命令会做的事情：

1. 扫描项目快照：顶层目录树（深度 3，自动过滤 node_modules/.git 等）、所有 manifest 文件（package.json / pubspec.yaml / pyproject.toml...）、README、源码采样（30 文件上限，单文件 200 行）、git log 最近 20 条
2. 调用模型（默认 `product_analyst` 角色配置的模型）
3. 把模型输出按 `<<<PROJECT_RULES>>>` 等分隔符切成三段，分别写入 `project_rules.md` / `coding_rules.md` / `product_rules.md`

**冲突处理**：

- 原文件是占位（全 TODO）→ 直接覆盖
- 原文件已有非占位内容 → 写到 `<name>.md.draft`，让你 `diff` 后手动采纳
- 加 `--yes --force` 可以强制覆盖

**敏感文件保护**：

`.env` / `*.pem` / `*.key` / `id_rsa` / `*.sqlite` / `node_modules/` / `.git/` 等都不会被采样进 prompt。

**完成后**：

打开 `.ai-dev/rules/*.md` 检查 AI 生成的内容，按需补全剩余 TODO。这一步**直接影响后续所有阶段的 AI 输出质量**，值得花 10 分钟仔细看一遍。

### 4.2.1 想完全手写规则？

跳过 `vibeflow learn`，直接编辑 `.ai-dev/rules/project_rules.md` 把 TODO 填满即可。



### 4.3 检查模型 CLI

```bash
vibeflow doctor
```

输出示例：

```
vibeflow doctor
  → 项目: schedule_board
  → 检查 4 个模型...
  - claude   ✓ available (2.1.145 (Claude Code))
  - codex    ✓ available (codex-cli 0.130.0)
  - gemini   ✓ available (0.34.0)
  - export   ✓ available (export-mode)

角色 → 模型映射
  product_analyst    ✓ claude  fallback: gemini
  planner            ✓ codex   fallback: claude
  ...
✓ 全部模型可用
```

如果有 `✗ unavailable`：要么装对应 CLI，要么在 `config.yaml` 把那个角色改成可用模型。

### 4.4 创建第一个任务

```bash
vibeflow new "schedule-filter" -d "支持按时间维度筛选日程"
```

会创建：

```
docs/ai-workflow/schedule-filter/
├── 00_requirement.md           # 占位
├── 01_plan_v1.md               # 占位
├── 02_plan_review.md
├── 03_final_plan.md
├── 04_human_decisions.md
├── 05_implementation_report.md
├── 06_code_review.md
├── 07_fix_report.md
├── 08_test_report.md
├── 09_release_note.md
└── run.json                    # 状态机：当前到哪一阶段、用了什么模型
```

### 4.5 走完整个工作流

每条命令都会：组装 prompt → 调对应模型 CLI → 写产物 → 更新 `run.json`。

```bash
# ① 整理需求。输入有四种方式，任选其一：
vibeflow requirement -m "想让用户能筛选今天/本周/本月/未完成/已延期的日程，并按名称搜索"
# vibeflow requirement --from-file docs/raw-need.md   # 需求较长时从文件读
# vibeflow requirement --edit                          # 打开 $EDITOR 撰写（已有产物会预填）
# vibeflow requirement                                 # 不传参时，自动读取已写好的 00_requirement.md

# ↑ human_gate：完成后请打开 00_requirement.md 检查/编辑
# 确认无误后：
vibeflow advance

# ② 出方案（默认用 Codex）
vibeflow plan

# ③ 评审方案（默认用 Claude，与 planner 不同模型）
vibeflow plan-review

# ④ 出最终方案（吸收评审意见）
vibeflow finalize

# ↑ human_gate：打开 03_final_plan.md 仔细检查
# 一旦 advance，下一步开发就不允许擅自扩大范围
vibeflow advance

# ⑤ 开发（必须先 advance 过 finalize）
vibeflow develop

# ⑥ 代码评审（与 developer 不同模型）
vibeflow code-review

# ⑦ 修复 Blocker / 确认 Major
vibeflow fix

# ⑧ 生成测试报告
vibeflow test

# ⑨ 归档生成上线说明
vibeflow archive
vibeflow advance     # 最后一次 advance，状态变 done 🎉
```

### 4.5.1 三种推进模式（交互 / 一键 / 单步）

每个非 `human_gate` 阶段成功后，会自动询问是否进入下一阶段：

```
继续进入下一阶段 plan_review (role: plan_reviewer) ？
❯ Y - 继续，自动进入下一阶段
  n - 停下，我先看看产物
```

- 默认 TTY 环境：弹出选择，按回车继续，`n` 停下
- 加 `-y` / `--yes`：自动 chain 整条流水线（用于熟练用户或脚本）。`human_gate` 仍会停下
- 加 `--no-chain`：阶段完成后既不询问也不 chain，停在当前阶段
- 非 TTY 环境（管道 / CI）：自动停下，避免卡死，提示你下一条命令

**典型用法**：

```bash
# 第一次跑，每步看一眼
vibeflow plan
# 终端会问，你按回车继续，或 n 停下检查

# 熟练后一键到底（遇到 human_gate 自动停）
vibeflow plan -y

# 调试单步行为
vibeflow develop --no-chain
```

### 4.6 随时查看进度

```bash
vibeflow status
```

输出示例：

```
schedule-filter  [standard_feature]
  ✓ completed   requirement (claude) [human-gate]
  ✓ completed   plan (codex)
  ✓ completed   plan_review (claude)
  ● in_progress finalize (codex) [human-gate]
  ○ pending     develop
  ○ pending     code_review
  ○ pending     fix
  ○ pending     test
  ○ pending     archive
```

---

## 5. 三道门禁（看不见的安全网）

vibeflow 会在以下情况拒绝继续，**这不是 bug**：

### 5.1 human_gate 未确认

`requirement` 和 `finalize` 阶段完成后会停在 `in_progress`，等你检查产物后运行 `vibeflow advance`。

> 用意：避免 AI 自己越过关键节点（产品定义、方案锁定）。

### 5.2 final_plan 未锁定

```
✗ finalize 阶段尚未完成（human_gate 未确认），请先运行 vibeflow advance
```

`develop` 强制要求 `03_final_plan.md` 不能是占位文件，且 `finalize` 阶段必须 `completed`。

> 用意：方案没确认就开发，等于回到混乱状态。

### 5.3 评审者与开发者不能同模型

```
✗ 角色 code_reviewer 默认模型 codex 与 developer 相同……请用 --model 显式指定
```

如果你把 `developer` 和 `code_reviewer` 都设成 `codex`，跑 `code-review` 时会被拒。

> 用意：自写自审等于没审。

---

## 6. 自定义配置

### 6.1 切换某个角色用的模型

```bash
# 临时覆盖（只本次）
vibeflow plan --model claude

# 永久修改：编辑 .ai-dev/config.yaml
roles:
  planner:
    default_model: claude
    fallback_models: [codex]
```

### 6.2 只有一家 CLI 怎么办？

如果你只装了 Claude Code，把所有 `default_model` 都改成 `claude`，但**必须**为 `code_reviewer` 和 `plan_reviewer` 指定一个不同的"虚拟身份"，或者用 `export` 模式（手动切到别的工具）：

```bash
vibeflow code-review --model export
```

会生成 `.ai-dev/exports/<feature>/code_review/prompt.md`，你复制到 Cursor / Gemini Web / 别的 IDE 跑，再把结果保存到 `06_code_review.md`，最后 `vibeflow advance` 推进。

### 6.3 调整工作流

`.ai-dev/workflows/standard_feature.yaml` 列出所有阶段。如果你想去掉 `fix` 阶段（小需求不需要修复轮次），直接删掉那一节即可。

也可以新增模板：把 `.ai-dev/workflows/quick_fix.yaml` 复制改名，然后：

```bash
vibeflow new "tiny-fix" --workflow quick_fix
```

### 6.4 阶段超时（stage_timeouts）

每个模型有自己的 `timeout_ms`（init 默认 900000 = 15 分钟）。当某个阶段普遍更慢——比如 `develop`/`fix` 要真正生成并落盘代码——可以用 `stage_timeouts` 给它单独配更长的超时，覆盖模型级默认：

```yaml
stage_timeouts:
  develop: 1800000   # 30 分钟
  fix: 1800000       # 30 分钟
```

优先级：`stage_timeouts[阶段]` > 模型 `timeout_ms` > 内置默认（5 分钟）。配了的阶段在运行时会打印 `超时: Ns（阶段级配置）`。

### 6.5 项目命令（commands）

`test`/`build`/`lint` 命令供 `test` 等阶段执行实际验证：

```yaml
commands:
  test: ["npm test"]            # 留空时 doctor 和 test 阶段会提醒
  build: ["npm run build"]
  lint: ["npm run lint"]
```

- 留空数组时，`vibeflow doctor` 的「项目命令配置」段会标 *未配置*，`test` 阶段开跑前也会告警（缺测试命令时无法实际跑测试）。
- `vibeflow doctor` 的「工具链就绪检测」会进一步检查这些命令引用的程序（`npm`/`flutter`/`./gradlew`…）是否真的装了或文件是否存在。

---

## 7. 模型调用的两种模式

### 7.1 spawn 模式（默认，推荐）

vibeflow 通过 `child_process.spawn` 直接调 CLI 的非交互模式：

- `claude -p`（stdin 传 prompt）
- `codex exec -`（stdin 传 prompt）
- `gemini -p`（stdin 传 prompt）

stdout 落盘到 `.ai-dev/logs/<feature>/`，便于审计。

### 7.2 export 模式（兜底）

任意命令加 `--export`：

```bash
vibeflow plan --export
```

只生成 prompt 文件，不调 CLI。你复制到任意工具执行（Claude Desktop、Cursor、Gemini Web、网页版），把结果手动保存到约定路径，再 `advance` 推进。

适用场景：复杂多轮交互、需要在 IDE 内深度操作、想用 GUI 工具的 file picker。

---

## 7.3 记忆与跨模型兼容

vibeflow 不锁定你的工具链。所有"记忆"都是 markdown 文件，你随时可以离开 vibeflow，直接用 Claude Code / Codex / Cursor 等接续。

### 三层记忆结构

| 层级 | 位置 | 跨项目 | 离开 vibeflow 也能读 |
|---|---|---|---|
| 全局偏好 | `~/.vibeflow/profile.md` | ✅ | ✅ 可一键 sync 到 `~/.claude/CLAUDE.md` |
| 项目规则 | `.ai-dev/rules/*.md` | ❌ | ✅ 项目根的 `CLAUDE.md` / `AGENTS.md` 指向这里 |
| 任务产物 | `docs/ai-workflow/<feature>/*.md` | ❌ | ✅ 同上 |

### 全局偏好（跨项目）

```bash
vibeflow profile init               # 创建 ~/.vibeflow/profile.md（默认占位）
vibeflow profile edit               # $EDITOR 打开编辑
vibeflow profile show               # 查看当前内容
vibeflow profile path               # 打印路径（方便脚本）
vibeflow profile sync-claude        # 把 profile 写到 ~/.claude/CLAUDE.md（带 vibeflow 标记块）
vibeflow profile unsync-claude      # 撤销同步
```

`profile.md` 包含跨所有项目的偏好（"我用 pnpm 不用 npm"、"我反感深嵌套" 等）。每次跑阶段命令时，vibeflow 会**自动把 profile 内容注入到 prompt 顶部**（在项目 rules 之前）。

如果 profile 主要还是 TODO 占位（≥5 个 TODO），不会被注入——避免污染 prompt。

### 项目桥接文件（CLAUDE.md / AGENTS.md）

`vibeflow init` 时会在项目根生成两个轻量桥接文件：

- `CLAUDE.md` — 给 Claude Code 等读
- `AGENTS.md` — 给 Codex 等读

它们的作用是：**即使你某天直接用原生 CLI（不通过 vibeflow），这些工具启动时也会读到这两个文件，从而自动发现** `.ai-dev/rules/` 和 `docs/ai-workflow/<feature>/`。

你可以照常用 `git` 跟踪它们。

### 离开 vibeflow 的场景

假设你切到一台没装 vibeflow 的机器，或者直接用 Claude Code 接续：

```bash
cd ~/my-project   # 这里有 .ai-dev/ 和 CLAUDE.md 和 docs/ai-workflow/
claude
# Claude Code 启动时自动读 CLAUDE.md，按指引读 .ai-dev/rules/* + 当前 in_progress 任务的产物
```

所有上下文都是 markdown 文件，没有 vibeflow 二进制锁定。

## 8. 中途切换模型（handoff）

如果开发到一半 Codex 上下文不够、或你想换 Claude 接手，跑：

```bash
vibeflow handoff
```

会生成 `handoff.md`，包含当前进度、已锁定方案、已完成内容、未完成事项、阻塞点、不能改动的约束。

**`handoff` 不会改 run.json 状态**——它是横切命令，可以在任何时候触发。

之后切到新模型继续：

```bash
vibeflow develop --model claude
```

新模型会自动读到 final_plan / implementation_report / handoff.md。

---

## 9. 命令速查

| 命令 | 作用 |
|---|---|
| `vibeflow init` | 在当前项目初始化 `.ai-dev/` 配置 |
| `vibeflow doctor` | 体检：模型 CLI 可用性 + 角色映射 + 项目命令配置 + 工具链就绪 + git 仓库状态 |
| `vibeflow learn` | 调 AI 学习项目，自动生成 rules 草稿（老项目扫码 / 新项目用 `--new-project -m`） |
| `vibeflow profile init/edit/show/path` | 管理 `~/.vibeflow/profile.md` 全局偏好（跨项目通用） |
| `vibeflow profile sync-claude/unsync-claude` | 把 profile 同步到 `~/.claude/CLAUDE.md` 或撤销 |
| `vibeflow new "<feature>" [-w workflow]` | 创建一个新任务 |
| `vibeflow status [-f feature]` | 查看任务和阶段状态 |
| `vibeflow requirement [-m <文本> \| --from-file <路径> \| --edit]` | 整理需求；四种输入：-m 直传 / --from-file 读文件 / --edit 开编辑器 / 无参时自动读已有 00_requirement.md |
| `vibeflow plan` | 出方案 |
| `vibeflow plan-review` | 评审方案 |
| `vibeflow finalize` | 出最终方案（human_gate） |
| `vibeflow advance [--skip]` | 标当前阶段完成 + 推进 |
| `vibeflow develop` | 按方案开发 |
| `vibeflow code-review` | 代码评审 |
| `vibeflow fix` | 修复 Blocker / Major |
| `vibeflow test` | 测试验收 |
| `vibeflow archive` | 生成上线说明 |
| `vibeflow handoff` | 生成交接文档（横切） |

所有阶段命令都支持：
- `-f, --feature <name>`：指定任务（默认选唯一进行中的）
- `--model <id>`：覆盖角色配置的默认模型
- `--export`：切到 export 兜底模式
- `-y, --yes`：自动 chain 到下一阶段（不询问，human_gate 仍会停下）
- `--no-chain`：完成后既不询问也不 chain，停在当前阶段

---

## 10. 常见问题

### Q: 我能跳过某个阶段吗？

A: 可以。`vibeflow advance --skip` 会把当前阶段标 `skipped`。但**不建议跳过 `human_gate` 阶段**（requirement / finalize），它们是产品取舍的关键节点。

### Q: 一个项目能有多个并行任务吗？

A: 可以。每个任务有独立的目录和 `run.json`。但同一时刻最好只让一个任务处于 `develop` 阶段——多个开发并行会引起代码冲突。worktree 隔离是 V2 的事。

### Q: 阶段失败了怎么办？

A: 跑 `vibeflow status` 看 `notes` 字段，里面有失败原因。详细日志在 `.ai-dev/logs/<feature>/<stage>-<timestamp>.stderr.log`。

常见原因：
- 模型 CLI 没装或没登录（跑 `vibeflow doctor` 确认）
- prompt 中的占位文件还没填充（说明上一阶段没完成）
- CLI 命令超时（默认 5 分钟）

修复后再跑一次同一个阶段命令即可（`run.json` 里 `failed` 状态会被覆盖）。

### Q: 产物文件可以手动编辑吗？

A: 完全可以，**强烈推荐**。AI 输出的需求 / 方案 / 评审都应该被你审阅后调整。`vibeflow advance` 看的是文件存在 + 非占位，不校验内容。

### Q: 想完全卸载 vibeflow 的痕迹怎么办？

A: 删 `.ai-dev/` 和 `docs/ai-workflow/` 两个目录即可。不会污染你的项目代码。

### Q: 能集成到 CI 吗？

A: 当前 MVP 不推荐。`human_gate` 设计本就是要人决策的。V3 团队版会加 CI 集成。

---

## 11. 文件结构总览

```
your-project/
├── .ai-dev/                    # vibeflow 配置（建议 git 入库）
│   ├── config.yaml
│   ├── workflows/
│   ├── agents/
│   ├── prompts/
│   ├── rules/                  # ← 这是你最该补的地方
│   ├── exports/                # export 模式生成的 prompt 文件
│   └── logs/                   # CLI 调用的 stdout/stderr 日志
└── docs/
    └── ai-workflow/
        └── <feature-name>/
            ├── 00_requirement.md
            ├── 01_plan_v1.md
            ├── ...
            ├── 09_release_note.md
            └── run.json
```

`.ai-dev/exports/` 和 `.ai-dev/logs/` 建议加 `.gitignore`（默认已加）。

---

## 12. 下一步阅读

- `docs/PRD.md` —— 产品需求文档（包含完整设计理念、竞品分析、版本规划）
- `docs/TECH_DESIGN.md` —— 技术方案（架构、数据模型、API、可观测性）
- `README.md` —— 项目概览

---

## 13. 反馈与贡献

vibeflow 当前是 MVP，欢迎试用并反馈以下信息：

- 哪个阶段的 prompt 模板效果不好（请附上你的需求描述和模型输出对比）
- 哪条命令的错误提示让你困惑
- 哪个工作流模板不适合你的项目类型

直接修改 `.ai-dev/prompts/` 或 `.ai-dev/workflows/` 也可以——它们就是模板文件，不会被 vibeflow 强行覆盖（除非你跑 `vibeflow init --force`）。
