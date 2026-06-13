# vibeflow 能力总览

> 版本 v0.3.0 · Node ≥20 · 本文档只描述**已实现并验证**的能力，规划中的 V2 见末尾「尚未具备」。

## 一句话

vibeflow 把 **Claude / Codex / Gemini** 三个 AI 编程工具，编排成一支「需求 → 方案 → 评审 → 开发 → 代码评审 → 测试 → 归档」的研发团队。核心是**文档驱动**与**跨模型评审**：每个阶段产出标准化 Markdown 产物，关键阶段由与作者不同的模型把关。

---

## 一、完整研发流水线

`standard_feature` 工作流的 9 个阶段，每阶段产出标准 Markdown 产物，状态持久化在 `run.json`：

```
requirement → plan → plan-review → finalize → develop → code-review → fix → test → archive
   需求       出方案    跨模型评审   锁定方案   真改代码   跨模型评审   修复   测试   上线说明
   00_        01_        02_         03_        05_        06_         07_   08_    09_
```

另有两套内置工作流：
- **quick_fix**：精简（需求 → 开发 → 评审 → 测试），适合小 bug/文案/样式
- **bugfix**：复现定位 → 修复 → 回归

---

## 二、两个核心价值（已在真实项目验证）

### 1. 跨模型评审
`plan-review` / `code-review` 强制使用**与作者不同的模型**（`must_be_different_from_developer` 门禁）。评审模型会真正读代码——引用具体行号、跑 `git diff`、grep 调用方——能抓出作者自身看不到的真问题。

> 实战记录（cultural 项目）：claude 评审 codex 的产出，抓出「现有公共识别链路被新代码孤立」「方案文件清单与红线自相矛盾」「develop 臆测了不存在的 SDK API 导致编译失败」等作者未自检出的 Blocker。

### 2. develop 真正落盘
develop / fix 阶段，三家 CLI 都能**直接修改/创建项目代码文件**（不是输出 patch 文本让人手动 apply）：
- Codex：`--sandbox workspace-write`
- Claude：`--permission-mode acceptEdits`
- Gemini：`--prompt "" --skip-trust --approval-mode yolo`

落盘后自动用 `git diff` 校验代码真的写入，并（若配置了 `commands.build`）自动跑构建验证编译。

---

## 三、命令清单（25 个）

| 类别 | 命令 | 作用 |
|------|------|------|
| **项目** | `init` | 生成 `.ai-dev/` 骨架 + `CLAUDE.md`/`AGENTS.md` 桥接 |
| | `doctor` | 体检：模型 CLI 可用性 + 角色映射 + 项目命令 + 工具链就绪 + git 状态 |
| | `learn` | AI 扫描项目（目录/manifest/源码采样/git log）生成三份 rules 草稿 |
| **任务** | `new` / `status` / `next` | 创建任务 / 查看阶段状态 / 看下一步该跑什么命令 |
| **阶段** | `requirement` `plan` `plan-review` `finalize` `develop` `code-review` `fix` `test` `archive` | 9 个流水线阶段 |
| **探索池** | `plan --multi` / `accept-plan` / `consult` / `synthesize` | 多模型并行出方案 → 选定 / 咨询 / 融合（可选叠加，详见 §三补） |
| **流转** | `advance` | 标当前阶段完成并推进（human_gate 确认） |
| | `deliver` | 方案锁定后「只要方案」交付收尾（软终态 delivered，可逆续接 develop） |
| | `change-request` | 对已收尾（done/delivered）任务发起变更，重开到开发阶段走轻量修订 |
| | `handoff` | 生成交接文档（横切，不动 run.json） |
| **偏好** | `profile`（init/edit/show/path/sync-claude/unsync-claude） | 管理 `~/.vibeflow/profile.md` 跨项目偏好 |

---

## 四、关键机制

### 门禁（保证质量不被跳过）
- **human_gate**：requirement / finalize 完成后必须人工 `advance` 确认
- **require_locked_plan**：方案未锁定不得进入 develop
- **must_be_different_from_developer**：代码评审者模型 ≠ 开发者模型

### 可靠性
- **落盘检测**：develop/fix 必须 `git diff` 非空，防止"输出了 patch 但没真改文件"的假完成
- **编译验证**：落盘后自动跑 `commands.build`，失败则标 blocked + 回灌错误，不放过编译错
- **超时保护**：阶段超时被 kill 时，若已检测到落盘则标 blocked 保留成果（而非当失败丢弃）
- **阶段级 timeout**：`stage_timeouts` 可给 develop/fix 等慢阶段单独配更长超时

### 记忆与兼容（不锁定用户）
- **三层记忆**：全局 `~/.vibeflow/profile.md`（跨项目）→ 项目 `.ai-dev/rules/`（项目内）→ 任务 `docs/ai-workflow/<feature>/`（任务内）
- **桥接文件**：init 生成 `CLAUDE.md` + `AGENTS.md`，原生 Claude Code / Codex 不跑 vibeflow 也能发现产物上下文
- **内容级密钥脱敏**：learn 扫描源码时对硬编码的 JWT / API Key 等脱敏，不进 prompt/日志

### 灵活性
- **角色↔模型解耦**：`config.yaml` 里任意角色可绑定任意模型，命令行 `--model` 临时覆盖
- **chain 模式**：阶段完成后可连续推进（`-y` 一键 chain / 默认 [Y/n] / `--no-chain` 单步）
- **阶段重跑（`--force`）**：对产物不满意时重做任意**已完成**阶段（含 plan/finalize），并级联把其下游已完成阶段重置为待执行——不必全部重来、也不必手改 run.json（尊重主动 skip 的阶段）
- **export 兜底**：CLI 不可用时导出 prompt 文件，手动到任意工具执行

---

## 五、适配的项目类型

`learn` / `doctor` 的扫描与工具链检测支持（含 monorepo / 代码在深层子目录的情况）：
Node/TypeScript、Flutter/Dart、Python、Rust、Go、Java/Kotlin（Gradle/Maven）、**iOS/Swift（Xcode 工程）**、Supabase/Deno、Ruby、PHP 等。

---

## 六、已验证

- **cultural**（iOS 原生 Swift + Supabase/Deno，文物识别 AR App）：两个完整 feature 全程跑通流水线 + 上线级真机验证；develop 真改十几个文件、跨模型评审抓出真回归、change-request 修订。
- **FlipClockApp**（Android Kotlin）：首次端到端验证，跨模型评审 3 次抓到真 Bug。
- **dogfooding**：vibeflow 用自己的流程开发了自己的 `deliver` 命令。

---

## 七、尚未具备（规划中 / V2）

- `plan --multi-extend`（单方案中途转多方案）/ `plan --add <model>`（追加模型）/ `plan-status`（探索池可视化）——P2 预留挂点
- 自动 Judge（多模型方案的结构化裁决，当前仅预留 `judge` artifact 类型）
- 本地 Web 可视化工作台 · 多 feature 的 worktree 隔离
- （多模型**并行**出方案探索池 `plan --multi` / consult / synthesize / accept-plan 已实现，见命令清单；`vibeflow next` 已实现）
- Judge Agent（多模型意见冲突的结构化裁决）
- 本地 Web 可视化工作台
- 多 feature 的 worktree 隔离
- test 阶段对"需真机/真实环境"项目自动产出人工验收清单

详见 `docs/PRD.md` §15.3 与 `docs/TECH_DESIGN.md` §5.9。

---

*本文档对应 v0.3.0，最近更新 2026-06-13（新增多模型探索池）。能力变更请同步更新本文件与 `docs/BACKLOG.md`。*
