# 多模型并行出方案与探索池技术实现方案

## 需求理解

本期要把 vibeflow 的 plan 阶段从“单模型产出一份 `01_plan_v1.md`”扩展为可选的“多模型探索池”：用户可运行 `vibeflow plan --multi` 让 2-3 个模型各出方案，后续可咨询、融合、择优，并通过 `accept-plan` 把某份探索产物复制为正式 `01_plan_v1.md`，再继续既有 `plan-review → finalize → develop` 流程。

人工决策已明确，方案必须遵守：

- 本期只完整设计 `plan --multi` / `consult` / `synthesize` / `accept-plan` / 退回探索；`plan --multi-extend` / `plan --add` / `plan-status` 仅做 P2 预留。
- 从 plan-review 退回探索池不新增 `back-to-explore`，复用 `--force` 语义。
- `plan --multi` 一次确认后调用全部模型；即使 `-y`，生成方案后也必须停在决策菜单等待用户选择。

核心设计结论：探索池不是新 workflow，也不是独立状态机，而是 standard_feature 的 plan 阶段增强子状态；不加 `--multi` 时，现有单方案路径保持零变化。

## 目标与非目标

### 目标

- 支持 `vibeflow plan --multi [--models a,b,c]` 并行生成多个候选方案。
- 支持 `accept-plan` 从探索池选定正式方案，写入 `01_plan_v1.md`。
- 支持 `consult` 对指定方案 / 文件做单轮咨询。
- 支持 `synthesize` 基于多份方案融合出新方案。
- 支持锁定前路径互通：plan、plan-review、finalize 未锁定前可重新探索和重新 accept。
- 支持 `vibeflow next` 感知探索池状态并给出下一步命令。
- 保留 `explore/` 下所有探索产物，便于复盘。

### 非目标

- 不做自动 Judge / 自动裁决，只预留扩展点。
- 不做 `plan-status` 完整可视化命令，本期由 `next` 和菜单兜底。
- 不做 `plan --multi-extend` / `plan --add` 完整实现，只在数据模型和模块接口中预留。
- 不做 GUI / TUI。
- 不改变不加 `--multi` 时的 `vibeflow plan` 行为。
- 不在锁定后允许回探索池；锁定后统一走 `change-request`。

## 影响范围

| 范围 | 影响 |
|---|---|
| CLI 命令 | `plan` 增加 `--multi` / `--models`；新增 `consult` / `synthesize` / `accept-plan` |
| run.json | 新增可选 `explore` 字段；旧任务缺失该字段时视为空探索池 |
| 阶段状态机 | 多方案模式下 plan 阶段在生成候选后保持 `in_progress`，直到 `accept-plan` 才变为 `completed` |
| 产物目录 | 新增 `docs/ai-workflow/<feature>/explore/` 目录保存候选方案、咨询记录、融合稿 |
| next 引导 | `next` 识别“等待 accept”的探索池状态，优先提示 accept，兼顾 consult / synthesize / rerun |
| adapter 调用 | `plan --multi` 并发调用多个现有 adapter，仍然只读，不授予写权限 |
| standard_feature | 默认单方案路径不受影响，现有阶段产物、命令语义、chain 行为保持不变 |

## 技术设计

### 1. 总体架构

新增探索池能力分四层：

| 层 | 职责 |
|---|---|
| CLI 层 | 解析命令参数、做用户确认、展示决策菜单 |
| Explore Core 层 | 管理探索产物、状态转换、accept 历史、锁定校验 |
| Runner 层 | 并发调用模型、构造 consult/synthesize prompt、写入 explore 产物 |
| Advisor 层 | 让 `next` 和菜单基于 run.json 给出下一步 |

推荐新增核心模块：

- `src/core/explore-state.ts`：探索池状态读写、锁定判断、产物注册、accept 状态转换。
- `src/core/parallel-plan.ts`：多模型并行出方案。
- `src/core/consult.ts`：单轮咨询。
- `src/core/synthesize.ts`：方案融合。
- `src/cli/utils/explore-menu.ts`：探索完成后的交互菜单。

### 2. explore 目录结构

采用追加式命名，不覆盖旧产物：

```text
docs/ai-workflow/<feature>/
  01_plan_v1.md
  02_plan_review.md
  03_final_plan.md
  run.json
  explore/
    plans/
      plan_001_codex.md
      plan_002_claude.md
      plan_003_gemini.md
    consults/
      consult_001_claude.md
      consult_002_gemini.md
    syntheses/
      synth_001_codex.md
      synth_002_claude.md
```

命名原则：

- ID 全局递增：`plan_001`、`consult_001`、`synth_001`。
- 文件名包含模型名，便于肉眼识别。
- 菜单里可临时显示 A/B/C，但 run.json 内部使用稳定 ID。
- `--force` 重跑 plan 时不清空 `explore/`，只追加新批次。

### 3. run.json 扩展

`RunState` 新增可选字段：

```ts
explore?: {
  version: 1;
  status: 'idle' | 'running' | 'awaiting_accept' | 'accepted';
  latest_batch_id?: string;
  artifacts: Array<{
    id: string;
    kind: 'plan' | 'consult' | 'synthesis' | 'judge';
    batch_id?: string;
    model: string;
    file: string;
    title?: string;
    inputs?: string[];
    created_at: string;
  }>;
  failures: Array<{
    batch_id?: string;
    kind: 'plan' | 'consult' | 'synthesis';
    model: string;
    error: string;
    log_file?: string;
    created_at: string;
  }>;
  accepted?: {
    artifact_id: string;
    source_file: string;
    target_file: '01_plan_v1.md';
    accepted_at: string;
  };
  accept_history: Array<{
    artifact_id: string;
    source_file: string;
    target_file: '01_plan_v1.md';
    accepted_at: string;
    superseded_previous?: boolean;
  }>;
}
```

兼容策略：

- 旧 `run.json` 没有 `explore` 字段时，代码通过 `ensureExploreState()` 视为空探索池。
- 不需要一次性迁移旧任务。
- 方案锁定仍以 `finalize.status === 'completed'` 为主判断，兼容现有软门禁；可在 `advance` finalize 时补写 `finalize.locked = true` 和 `meta.final_plan_locked_at`，但不是旧任务的必需字段。

### 4. 命令设计

#### `vibeflow plan --multi`

参数：

```text
vibeflow plan --multi [--models codex,claude,gemini] [-f <feature>] [--force] [-y] [--no-chain]
```

前置条件：

- 当前项目已 `vibeflow init`。
- 当前 workflow 包含 `plan` 阶段。
- `requirement` 已完成。
- final plan 尚未锁定。
- 模型 ID 存在于 `.ai-dev/config.yaml`。

默认模型推荐：

- 若传 `--models`，使用用户指定模型，去重，建议限制 2-3 个。
- 若未传，取 `roles.planner.default_model` + `roles.planner.fallback_models`，去重后取前 2-3 个。
- 少于 2 个可用模型时报错，提示用户显式传 `--models` 或补配置。

状态处理：

- 调用前：`plan.status = 'in_progress'`，`explore.status = 'running'`。
- 至少 1 个模型成功：写入 `explore/plans/`，`explore.status = 'awaiting_accept'`，`plan.status` 保持 `in_progress`，等待用户 `accept-plan`。
- 全部失败：`plan.status = 'failed'`，记录 failures。
- `-y` 只跳过“是否调用全部模型”的确认，不自动 accept，也不自动进入 plan-review。

部分失败推荐语义：

- 3 个模型中 1 个失败：保留成功方案，菜单提示失败模型和日志，允许 accept 或 `plan --multi --force` 重跑。
- 只有 1 个成功：仍可 accept，但菜单默认更推荐重跑 / 换模型。

#### `vibeflow accept-plan`

参数：

```text
vibeflow accept-plan <artifact-id-or-path> [-f <feature>]
```

前置条件：

- final plan 未锁定。
- 来源必须是当前任务目录内的已登记探索产物，避免路径穿越。
- 来源文件存在且不是占位内容。

行为：

- 将来源文件复制为 `01_plan_v1.md`。
- 更新 `explore.accepted` 和 `explore.accept_history`。
- 将 `plan.status` 置为 `completed`。
- 将 `current_stage` 推进到 `plan_review`。
- 如果之前已经跑过 plan-review / finalize，因正式方案变更，级联重置 plan 后续阶段为 `pending`。
- 锁定后执行时报错：提示“方案已锁定，请使用 `vibeflow change-request -m "<变更原因>"`”。

#### `vibeflow consult`

参数：

```text
vibeflow consult --about <file1,file2> --model <id> -m "<问题>" [-f <feature>]
```

前置条件：

- final plan 未锁定。
- `--about` 文件必须在项目根目录内，优先支持当前任务产物和 `explore/` 产物。
- `--model` 必须是已配置模型。

行为：

- 构造包含需求、人工决策、about 文件内容、用户问题的 prompt。
- 调用指定模型，输出到 `explore/consults/consult_###_<model>.md`。
- 注册 artifact，不改变正式 `01_plan_v1.md`。
- 如果 plan 正在等待 accept，继续保持 `plan.status = in_progress`。

#### `vibeflow synthesize`

参数：

```text
vibeflow synthesize --base <file1,file2,...> --model <id> [-m "<融合偏好>"] [-f <feature>]
```

前置条件：

- final plan 未锁定。
- base 文件必须在项目根目录内。
- `--model` 必须是已配置模型。

行为：

- 读取需求、人工决策、base 文件内容和用户偏好。
- 输出融合稿到 `explore/syntheses/synth_###_<model>.md`。
- 注册 artifact。
- 不自动覆盖 `01_plan_v1.md`，必须由用户 `accept-plan`。

### 5. 路径互通与 `--force`

锁定前的路径互通规则：

| 当前状态 | 用户意图 | 命令 | 状态变化 |
|---|---|---|---|
| 单方案已生成但未锁定 | 改走多模型探索 | `vibeflow plan --multi --force` | 重开 plan，保留旧 `01_plan_v1.md` 但视为过时，追加 explore 产物 |
| plan-review 后发现方向有偏 | 退回探索池 | `vibeflow plan --multi --force` | plan 后续阶段重置为 pending，explore 旧产物保留，新批次追加 |
| consult / synthesize 后满意 | 选定方案 | `vibeflow accept-plan synth_001` | 覆盖 `01_plan_v1.md`，进入 plan-review |
| finalize 已 advance | 想回探索 | 任意 explore 命令 | 拒绝，提示 change-request |

`--force` 的探索模式语义：

- 不删除 `explore/`。
- 不清空 `accept_history`。
- 将当前 `explore.accepted` 置为过时或覆盖为 undefined，等待重新 accept。
- 重置 plan 后续阶段，包括 `completed` / `in_progress` / `blocked` / `failed`，避免旧 review 继续套用新方案。
- 保留 `skipped` 的阶段需谨慎，建议本期也重置 plan 后所有非 pending 状态，减少状态歧义。

### 6. 决策菜单与 next

`plan --multi` 成功后展示菜单。推荐顺序以 accept 为先，防止用户陷入反复探索：

```text
✓ 已生成 3 个候选方案

[1] accept plan_001 (codex) → 进入 plan-review
[2] accept plan_002 (claude) → 进入 plan-review
[3] accept plan_003 (gemini) → 进入 plan-review
[4] consult：询问某模型对某方案的看法
[5] synthesize：融合多份方案
[6] 重跑 / 换模型：vibeflow plan --multi --force --models ...
[q] 退出菜单，稍后用 vibeflow next 查看
```

交互规则：

- TTY 环境使用 `prompts` 菜单。
- 非 TTY 环境只打印推荐命令，不阻塞。
- `-y` 模式仍停在菜单，不自动选择。
- 菜单内部不通过 shell 拼命令执行，避免命令注入；应调用对应 core runner。

`vibeflow next` 增强：

- `explore.status = awaiting_accept` 时，headline 显示“探索池等待选择正式方案”。
- commands 优先列出 `accept-plan`，再列 `consult` / `synthesize` / `plan --multi --force`。
- 如果 plan-review failed/blocked 且未锁定，提示可 `vibeflow plan --multi --force` 回到探索。
- 如果已锁定，提示 `change-request`。

### 7. Prompt 与上下文

`plan --multi` 复用现有 plan prompt，但额外注入候选信息：

- `candidate_id`
- `candidate_model`
- `output_path`
- “请在标题下标注模型来源和候选 ID”

`consult` / `synthesize` 需要新增 prompt 模板：

- `consult.md`：输入需求、人工决策、about 文件、用户问题；输出咨询意见。
- `synthesize.md`：输入需求、人工决策、base 文件、融合偏好；输出可被 accept 的完整方案。

兼容旧项目：

- 新项目由 `vibeflow init` 下发 `.ai-dev/prompts/consult.md` 和 `.ai-dev/prompts/synthesize.md`。
- 老项目没有这两个 prompt 时，命令使用内置默认模板兜底，并提示可通过 `vibeflow init --force` 更新模板。
- 修改 `src/templates/prompts.ts` 属于模板红线，后续实现前需要人工确认。

### 8. P2 预留

本期不做完整实现，但数据结构保留扩展位：

- `plan --multi-extend`：未来可把现有 `01_plan_v1.md` 注册为 `kind: 'plan'` 的 artifact，不需要改 schema。
- `plan --add <model>`：未来可调用 `runParallelPlan()` 的单模型追加模式，生成同一 explore 池的新 plan artifact。
- 自动 Judge：未来可新增 `kind: 'judge'` artifact，输入为多个方案，输出为裁决建议，但不自动 accept。
- `plan-status`：未来可直接读取 `run.explore.artifacts` / `accept_history` 渲染探索池视图。

## 数据影响

- 无数据库。
- 无缓存。
- 无数据迁移脚本。
- 文件系统新增 `explore/` 目录。
- `run.json` 新增可选 `explore` 字段；缺失时按空状态处理，向后兼容。
- `01_plan_v1.md` 仍是 plan-review 的唯一正式输入；探索池产物不会绕过 accept 直接进入后续阶段。

## 接口影响

### CLI 兼容性

| 接口 | 变化 | 兼容性 |
|---|---|---|
| `vibeflow plan` | 默认行为不变 | 兼容 |
| `vibeflow plan --multi` | 新增多模型模式 | 新能力 |
| `vibeflow plan --models` | 仅配合 `--multi` 生效 | 新能力 |
| `vibeflow consult` | 新命令 | 新能力 |
| `vibeflow synthesize` | 新命令 | 新能力 |
| `vibeflow accept-plan` | 新命令 | 新能力 |
| `vibeflow next` | 增加 explore-aware 建议 | 兼容 |
| `vibeflow deliver` | 不改变交付逻辑；探索产物自然保留在任务目录 | 兼容 |
| `vibeflow change-request` | 锁定后探索命令统一引导到它 | 兼容 |

### 版本兼容

- `run.json.version` 可继续保持 1，因新增字段为 optional。
- 若希望更严格，可在未来大版本把 `run.json.version` 升为 2；本期不建议，避免迁移成本。
- 老项目不需要重新 `vibeflow init` 才能继续单方案流程。

## 文件修改清单

| 路径 | 修改原因 |
|---|---|
| `src/core/run.ts` | 扩展 `RunState` 类型，增加 `ExploreState` / `ExploreArtifact` / accept history 类型 |
| `src/core/explore-state.ts` | 新增探索池状态管理：ensure、register artifact、accept、lock guard、reset downstream |
| `src/core/parallel-plan.ts` | 新增多模型并行方案生成逻辑 |
| `src/core/consult.ts` | 新增 consult 单轮咨询 runner |
| `src/core/synthesize.ts` | 新增 synthesize 融合 runner |
| `src/core/context.ts` | 支持 explore prompt 所需动态变量和旧项目 prompt fallback |
| `src/core/next-advisor.ts` | 增加探索池状态下的 next 建议 |
| `src/core/advance.ts` | finalize advance 时可补写锁定标记，供提示和防误操作使用 |
| `src/cli/commands/stages.ts` | 给 `plan` 增加 `--multi` / `--models` 分支 |
| `src/cli/commands/accept-plan.ts` | 新增 accept-plan CLI |
| `src/cli/commands/consult.ts` | 新增 consult CLI |
| `src/cli/commands/synthesize.ts` | 新增 synthesize CLI |
| `src/cli/utils/explore-menu.ts` | 新增探索池交互菜单 |
| `src/cli/index.ts` | 注册新命令 |
| `src/cli/commands/next.ts` | 输出 explore-aware 的 next 命令列表 |
| `src/cli/commands/status.ts` | 可选增加探索池摘要，不做 plan-status 完整替代 |
| `src/templates/prompts.ts` | 新增 consult / synthesize 默认 prompt；红线文件，需人工确认 |
| `src/cli/commands/init.ts` | init 时下发新增 prompt 文件；涉及模板分发，需人工确认 |
| `docs/USAGE.md` | 补充探索池命令用法、锁定前后边界、示例流程 |
| `docs/TECH_DESIGN.md` | 将 §5.9 / §20 与本次人工决策对齐，移除本期 back-to-explore 完整实现表述 |
| `docs/PRD.md` | 对齐 D1-D3：增强命令 P2、退回探索走 `--force`、`-y` 必停菜单 |
| `README.md` | 更新能力状态：探索池设计 / 实现状态 |
| `docs/CAPABILITIES.md` | 更新当前能力与 P2 预留项 |

## 实现步骤

1. 先实现 `ExploreState` 类型和 `src/core/explore-state.ts`，只做 run.json 读写与状态转换，不调用模型。
2. 扩展 `plan` 命令参数，接入 `runParallelPlan()`，实现并发调用、产物落 `explore/plans/`、部分失败记录。
3. 实现 `accept-plan`，完成复制 `01_plan_v1.md`、plan 阶段完成、下游阶段重置。
4. 实现 `next` 的探索池识别和 `explore-menu`，确保 `-y` 不会自动跳过人工选择。
5. 实现 `consult`，输出咨询记录到 `explore/consults/`。
6. 实现 `synthesize`，输出融合稿到 `explore/syntheses/`，并可被 `accept-plan` 接受。
7. 补齐锁定边界：finalize completed 后拒绝 plan --multi / consult / synthesize / accept-plan，并提示 change-request。
8. 更新文档和模板；模板文件改动需人工确认后再落地。
9. 跑 `npm run typecheck && npm run lint && npm run build`。
10. 用临时 vibeflow 项目跑手工冒烟：单方案旧路径、多方案直接 accept、consult+synthesize+accept、plan-review 后 `plan --multi --force`、finalize 后拒绝探索。

## 关键场景回答

### plan --multi 出 3 套方案后 next 提示什么

`next` 显示“探索池等待选择正式方案”，命令按顺序给：

- `vibeflow accept-plan plan_001`
- `vibeflow accept-plan plan_002`
- `vibeflow accept-plan plan_003`
- `vibeflow consult --about ... --model ... -m "..."`
- `vibeflow synthesize --base ... --model ... -m "..."`
- `vibeflow plan --multi --force --models ...`

### consult 两轮、synthesize 一版后 accept

`explore/` 保留：

- `plans/plan_001_*.md`
- `plans/plan_002_*.md`
- `consults/consult_001_*.md`
- `consults/consult_002_*.md`
- `syntheses/synth_001_*.md`

`accept-plan synth_001` 后：

- `01_plan_v1.md` 内容来自 `explore/syntheses/synth_001_*.md`
- `run.json.explore.accepted.source_file` 记录来源
- `accept_history` 追加本次选择
- plan 阶段完成，进入 plan-review

### plan-review 否定后退回探索

执行：

```bash
vibeflow plan --multi --force
```

状态变化：

- plan 后续阶段重置为 pending
- 旧 `explore/` 产物保留
- 新候选方案追加到 `explore/plans/`
- 旧 `01_plan_v1.md` 不删除，但在状态上视为过时，必须重新 `accept-plan`

### finalize 锁定后想改方案

探索命令直接拒绝，提示：

```bash
vibeflow change-request -m "<变更原因>"
```

### 不加 --multi 的老用户

无变化：

- `vibeflow plan` 仍写 `01_plan_v1.md`
- plan 成功后仍按现有 chain / next 进入 plan-review
- 不创建 `explore/`
- 不要求用户理解探索池

### --force 重跑 plan 时 explore 怎么处理

- 保留已有 `explore/` 全部文件。
- 保留 `accept_history`。
- 追加新 batch。
- 重置 plan 后续阶段。
- 等待用户重新 `accept-plan`。

## 风险点

| 风险 | 应对 |
|---|---|
| 状态机复杂度上升 | 探索池只挂在 plan 阶段，正式流转仍以 `01_plan_v1.md` 为准 |
| 旧 `01_plan_v1.md` 在重开探索后造成误解 | plan 状态置为 in_progress，next 明确提示“需重新 accept” |
| 并发调用多个 CLI 输出混乱 | parallel runner 使用聚合日志，单模型日志写入唯一 stageId / outputPath |
| 部分模型失败 | 至少一个成功即保留成果，失败写入 `explore.failures` 并在菜单提示 |
| 路径穿越读取非预期文件 | `--about` / `--base` / `accept-plan` 路径必须 resolve 在项目根内 |
| 用户反复融合拖延 | 菜单和 next 默认优先 accept |
| 模板文件是对外种子内容 | 修改 `src/templates/prompts.ts` / init 下发前需人工确认 |
| `src/adapters/base.ts` 并发 spinner 可能冲突 | 优先不改命令构造，仅在 parallel runner 层做聚合展示；必要时只加静默 UI 参数 |

## 测试方案

项目当前没有 `test` 脚本，本期以类型检查、lint、build 和手工 CLI 冒烟为主。

必跑命令：

```bash
npm run typecheck
npm run lint
npm run build
```

手工验证场景：

1. 老路径：`vibeflow plan` 不带 `--multi`，确认行为与当前一致。
2. 多方案直接选：`plan --multi --models codex,claude` → `accept-plan plan_001` → `plan-review`。
3. 部分失败：配置一个不可用模型，确认成功产物保留、失败写入 `run.json.explore.failures`。
4. 咨询融合：`consult` 两次、`synthesize` 一次、accept 融合稿。
5. 评审后反悔：plan-review 后执行 `plan --multi --force`，确认旧 explore 保留、下游阶段重置。
6. 锁定后拦截：finalize advance 后执行 `accept-plan` / `synthesize`，确认提示 change-request。
7. next 引导：分别在 awaiting_accept、accepted、plan-review failed、locked 后运行 `vibeflow next`。

## 需要人工确认的问题

以下不是 D1-D3 的重复提问，而是实现前需要确认的剩余取舍：

1. 是否允许修改 `src/templates/prompts.ts` 和 `src/cli/commands/init.ts`，向下游项目新增 consult / synthesize prompt 模板。
2. `plan --multi` 未传 `--models` 时，是否采用“planner default_model + fallback_models 前 2-3 个”的默认策略。
3. 部分失败时，是否接受“至少一个成功就进入 awaiting_accept，失败仅告警”的容错语义。
4. `consult` / `synthesize` 是否允许使用任意已配置模型，包括未参与 `plan --multi` 的模型。
5. `deliver` 是否只保持现状，还是需要在交付提示中额外列出 accepted source 和 explore 摘要。
