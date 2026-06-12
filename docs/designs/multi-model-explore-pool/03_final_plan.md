# 最终方案：多模型并行出方案与探索池

## 1. 结论

本期把「探索池」设计为 standard_feature 的 plan 阶段增强能力，而不是新 workflow 或新状态机。

正式流程仍只认 `01_plan_v1.md`：

- `plan --multi` 只生成候选方案到 `explore/`。
- `consult` / `synthesize` 只生成探索产物，不自动进入正式流程。
- 只有 `accept-plan` 会把某个探索产物复制为正式 `01_plan_v1.md`。
- `01_plan_v1.md` 之后继续走既有 `plan-review → finalize → advance 锁定 → deliver / develop`。
- 不加 `--multi` 时，老用户的 `vibeflow plan`、`next`、`advance`、`deliver` 行为保持不变。

本任务交付物是设计文档；后续 develop 任务如按此方案编码，不得扩大范围。如开发中发现方案需要变更，必须进入 change_request 流程。

## 2. 本期范围

### P0 项

1. `plan --multi` 多模型出方案  
   让 2-3 个已配置模型独立生成候选方案，产物进入当前任务目录的 `explore/plans/`，每份产物记录模型来源、候选 ID、批次 ID。

2. `accept-plan` 选定正式方案  
   从已登记的探索产物中选择一份 `plan` 或 `synthesis`，复制为 `01_plan_v1.md`，记录来源与选择历史，并推进到 plan-review。

3. 决策菜单与 `next` 兜底  
   `plan --multi` 完成后必须停在决策菜单，`-y` 也不能自动 accept；`vibeflow next` 能识别探索池等待选择、已 accept、评审后可回探索、锁定后禁止探索等状态。

4. 锁定前路径互通  
   锁定前允许单方案、多方案、咨询、融合、重新 accept、从 plan-review 退回探索池。退回探索池复用 `plan --multi --force`，不新增 `back-to-explore`。

5. 对 standard_feature 零破坏  
   不加 `--multi` 时不创建 `explore/`，不改变现有单方案产物、阶段状态、chain 语义、`--force` 全局语义。

### P1 本期一并设计并纳入实现范围

1. `consult` 单轮咨询  
   针对指定探索产物或任务文件，调用指定模型输出咨询意见到 `explore/consults/`。

2. `synthesize` 方案融合  
   基于多份方案或咨询结果，调用指定模型生成可被 accept 的融合稿到 `explore/syntheses/`。

3. 探索全过程可追溯  
   所有候选方案、咨询记录、融合稿、失败记录、accept 历史永久保留在 `explore/` 和 `run.json.explore` 中。

4. 与既有命令兼容  
   明确 `--force`、`next`、`advance`、`deliver`、`change-request` 的衔接边界。

## 3. 不做范围

1. 不做自动 Judge / 自动裁决；只预留 `judge` artifact 类型，未来可输出建议，但不能自动 accept。
2. 不做 `plan --multi-extend`、`plan --add <model>`、`plan-status` 的完整实现，仅在数据结构和模块接口中预留挂点。
3. 不把探索池设为默认路径；简单需求仍走现有单模型 plan。
4. 不做 GUI / TUI，仅 CLI 文本菜单与命令提示。
5. 不允许锁定后回探索池；锁定后统一走 change-request 或新建任务。
6. 本期不支持探索命令的 `--export` 兜底模式；现有单阶段 `vibeflow plan --export` 保持不变。探索池 export 可作为后续 P2 单独设计，避免半成品产物污染 `run.json`。
7. 不修改 `.ai-dev/` 配置文件；不修改 `src/templates/*.ts`。consult / synthesize prompt 本期使用内置模板，未来若要下发到用户项目模板，需单独人工确认。

## 4. 人工决策结论

1. D1：本期完整设计核心五件事：`plan --multi`、`consult`、`synthesize`、`accept-plan`、退回探索；`plan --multi-extend` / `plan --add` / `plan-status` 仅 P2 预留。
2. D2：从 plan-review 退回探索池复用 `plan --multi --force`，不新增 `back-to-explore`。
3. D3：`plan --multi` 一次确认后调用全部模型；即使使用 `-y`，生成候选方案后也必须停在决策菜单等人选择。
4. 默认模型策略：未传 `--models` 时，取 `roles.planner.default_model + roles.planner.fallback_models` 去重后的前 2-3 个；不足 2 个时报错。
5. 模型数量策略：`--models` 硬限制 2-3 个，超过 3 个报错，重复模型自动去重。
6. 部分失败策略：至少 1 个模型成功即进入 `awaiting_accept`；失败模型写入 `explore.failures` 并在菜单提示。全部失败则 plan 阶段失败。
7. consult / synthesize 模型范围：允许使用任意已配置模型，不要求参与过 `plan --multi`。
8. 执行方式：spawn 模式下本期做真正并发；为避免多个 spinner 冲突，最小改动 `src/adapters/base.ts` 增加静默 UI 参数。该文件属于红线文件，锁定本方案即确认该最小改动范围。
9. deliver 策略：不复制、不打包、不搬运 explore 产物；deliver 仍只标记任务为 delivered。探索产物自然留在任务目录中。

## 5. 对评审意见的逐条回应

### B1：`--force` 级联重置作用域

采纳。扩展后的级联重置只用于「plan 的正式输入发生变化」的探索场景，不改变全局 `runStage --force` 语义。

触发范围仅包括：

- `vibeflow plan --multi --force`
- `vibeflow plan --force` 在放弃 `awaiting_accept`、回到单方案路径时
- `accept-plan` 覆盖已有正式 `01_plan_v1.md` 时

普通 `vibeflow <stage> --force` 仍保持现状：只重置下游 completed 阶段，不动 skipped。

探索模式下 plan 后续阶段处理表：

| 下游阶段原状态 | 处理方式 | 原产物文件 |
|---|---|---|
| `pending` | 保持 `pending` | 不处理 |
| `completed` | 置为 `pending`，清 `completed_at` | 文件保留，阶段 notes 标记为因方案变更已过时 |
| `in_progress` | 置为 `pending`，清 `started_at` / `notes` | 文件保留，视为过时 |
| `blocked` | 置为 `pending`，清失败原因 | 文件保留，视为过时 |
| `failed` | 置为 `pending`，清失败原因 | 文件保留，视为过时 |
| `skipped` | 置为 `pending` | 因 skip 决策基于旧方案，本探索路径中必须重新确认 |

`02_plan_review.md`、`03_final_plan.md` 不删除、不改写；过时状态以 run.json 阶段状态和 notes 为准。后续 `next/status` 必须按阶段状态提示重跑，不能因为文件存在就视为有效。

### B2：`awaiting_accept` 被 advance 或单模型 plan 绕过

采纳。新增两条硬规则：

1. `explore.status = 'awaiting_accept'` 且当前阶段是 plan 时，`vibeflow advance` 必须拒绝，提示使用 `accept-plan`。  
   这条保护放在 `advanceCurrentStage` 或其调用前的 core guard 中，避免 CLI 外调用绕过。

2. `explore.status = 'awaiting_accept'` 时运行不带 `--multi` 的 `vibeflow plan`，默认拒绝，防止误覆盖。  
   如果用户明确想放弃探索池回到单方案路径，使用 `vibeflow plan --force`。该命令保留 `explore/` 历史，清空当前 `explore.accepted`，将探索状态收回到 `idle`，再按现有单方案 plan 流程生成新的 `01_plan_v1.md`。

### M1：parallel-plan 需复用 / 复刻 runStage 职责，且失败处理需完整

采纳。`parallel-plan` 不直接裸调 adapter，而是复用或抽取以下职责：

- 项目与 feature 选择：复用 `pickFeature` 逻辑。
- 阶段顺序校验：要求 requirement 已完成，finalize 未锁定。
- 模型解析：复用 `loadConfig`、`resolveStageTimeout`、adapter registry。
- 输出兜底：从 `stage-runner` 抽取 `ensureOutputWritten` 到共享 helper。
- 状态落盘：只由 orchestrator 统一写 run.json，单个模型 runner 不写。
- 失败处理：每个探索命令都记录失败语义。

失败规则：

- `plan --multi`：至少一个成功则 `awaiting_accept`；全部失败则 `plan.status = failed`。
- `consult`：失败只追加 `explore.failures`，不改变正式 plan 状态。
- `synthesize`：失败只追加 `explore.failures`，不改变正式 plan 状态。
- `accept-plan`：来源不合法、文件不存在、内容为空或占位时直接失败，不改 `01_plan_v1.md`，不写 accept 历史。

本期不支持探索命令 `--export`，避免 pending export 产物的状态复杂度；现有单阶段 export 不受影响。

### M2：`--about` / `--base` 防密钥泄漏

采纳。consult / synthesize 读取用户指定文件前必须经过安全读取：

- 路径必须 `realpath` 后仍在项目根目录内。
- 拒绝 `.env`、`.pem`、`.key`、`id_rsa`、数据库、二进制、压缩包、媒体等敏感或非文本文件。
- 文件内容注入 prompt 前必须调用现有 `redactSecrets()`。
- 单文件和总输入大小设上限，超限时报错并提示缩小范围。
- `accept-plan` 的 path 形态只是已登记 artifact ID 的便利写法，不允许 accept 未登记文件。

实现上从 `project-scanner.ts` 抽取或导出安全判断函数，但不得削弱现有 `redactSecrets()` 规则。

### M3：并发 run.json 写入与 base.ts 风险

采纳。并发纪律如下：

- artifact ID 和输出路径由 orchestrator 在启动前统一分配。
- 单模型 adapter 只写 stdout/stderr 日志和目标 markdown，不写 run.json。
- orchestrator 在启动前写一次 `running` 状态，在所有任务结束后基于内存结果统一写一次最终状态。
- 如后续要逐个完成即刻写入，也必须通过 orchestrator 串行写，不允许 worker 并发覆写 `run.json`。

`src/adapters/base.ts` 只做最小改动：`AgentRunRequest` 增加可选 UI 参数，允许调用方关闭 spinner。并发时由 `parallel-plan` 做聚合进度展示，避免多个 ora spinner 同时写终端。

### M4：accept-plan 后是否自动进入 plan-review

采纳。`accept-plan` 本身不调模型，只完成复制、记录、状态推进。

完成后：

- 默认询问是否继续执行 plan-review `[Y/n]`。
- `accept-plan -y` 自动 chain 到 plan-review。
- `accept-plan --no-chain` 只推进 `current_stage = plan_review` 并提示下一条命令。
- 这不违反 D3，因为 D3 约束的是 `plan --multi` 完成后不能自动 accept；用户执行 `accept-plan` 已经完成了人工选择。

### M5：`explore.status` 转移与 accepted 同步

采纳。`explore.status` 使用完整状态机：

```ts
'idle' | 'running' | 'awaiting_accept' | 'accepted' | 'failed'
```

状态转移：

| 动作 | 原状态 | 新状态 | plan 阶段 |
|---|---|---|---|
| 初始旧任务 | 无 explore | `idle` | 不变 |
| `plan --multi` 开始 | 任意未锁定 | `running` | `in_progress` |
| 多模型至少一份成功 | `running` | `awaiting_accept` | `in_progress` |
| 多模型全部失败 | `running` | `failed` | `failed` |
| `accept-plan` | `awaiting_accept` / `accepted` | `accepted` | `completed` |
| `consult` 成功 | 任意未锁定 | 不改变 | 不改变 |
| `synthesize` 成功且尚未 accept | `awaiting_accept` | `awaiting_accept` | 不改变 |
| `synthesize` 成功且已有正式 plan | `accepted` | `accepted` | 不改变 |
| `plan --multi --force` | 任意未锁定 | `running` → `awaiting_accept` / `failed` | `in_progress` / `failed` |
| `plan --force` 放弃探索回单方案 | `awaiting_accept` | `idle` | 走现有单方案流程 |
| finalize 锁定后 | 任意 | 不再允许探索命令改变 | 不变 |

`accepted` 与 `accept_history` 的同步规则：

- `accept_history` 是追加日志，记录每次选择。
- `accepted` 是当前正式方案指针，由 `acceptArtifact()` 在同一次写入中更新。
- 不允许其他模块直接改 `accepted`。
- 重新 accept 时，旧 history 保留，新 history 追加，`accepted` 指向最新项。

## 6. 技术实现路径

### 6.1 总体架构

新增探索池能力分四层：

| 层 | 职责 |
|---|---|
| CLI 层 | 解析参数、确认副作用、展示菜单、调用 core |
| Explore Core 层 | 管理 explore 状态、artifact 注册、accept、锁定 guard、下游重置 |
| Runner 层 | 调用 adapter 生成 plan / consult / synthesis 产物 |
| Advisor 层 | 让 `next` / `status` 基于 run.json 给出清晰引导 |

核心原则：

- 正式输入只有 `01_plan_v1.md`。
- `explore/` 永远是候选池和审计记录。
- 锁定前可切换，锁定后不可回探索。
- 新能力走 optional 字段，对旧 run.json 向后兼容。

### 6.2 explore 目录结构

采用追加式命名，不覆盖旧产物：

```text
docs/ai-workflow/<feature>/
  00_requirement.md
  01_plan_v1.md
  02_plan_review.md
  03_final_plan.md
  04_human_decisions.md
  run.json
  explore/
    plans/
      plan_001_codex.md
      plan_002_claude.md
      plan_003_gemini.md
    consults/
      consult_004_gemini.md
      consult_005_claude.md
    syntheses/
      synth_006_codex.md
    logs/
      batch_20260612_153000.json
```

命名规则：

- ID 全局单调递增，避免不同类型重名。
- 文件名包含类型、序号、模型 ID。
- 菜单可显示 A/B/C，但 run.json 内部只使用稳定 ID。
- `--force` 重跑不清空 `explore/`，只追加新 batch。

### 6.3 run.json 扩展

`RunState` 新增 optional `explore` 字段；旧任务缺失时视为 `idle`。

```ts
explore?: {
  version: 1;
  status: 'idle' | 'running' | 'awaiting_accept' | 'accepted' | 'failed';
  latest_batch_id?: string;
  next_seq: number;
  artifacts: Array<{
    id: string;
    kind: 'plan' | 'consult' | 'synthesis' | 'judge';
    status: 'ready' | 'failed';
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
    stdout_file?: string;
    stderr_file?: string;
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

- 不升级 `run.json.version`，因为新增字段 optional。
- `ensureExploreState()` 负责补默认值，但只在需要写入时落盘。
- 老任务继续单方案流程时不写 `explore` 字段。

### 6.4 命令设计

#### `vibeflow plan --multi`

参数：

```bash
vibeflow plan --multi [--models codex,claude,gemini] [-f <feature>] [--force] [-y] [--no-chain]
```

前置条件：

- 当前目录已 `vibeflow init`。
- requirement 阶段已完成。
- final plan 未锁定。
- 模型 ID 存在于 config，去重后数量为 2-3。
- 不支持 `--export`，传入时报错并提示使用真实 CLI 或先走单方案 export。

行为：

- 启动前一次确认将调用哪些模型；`-y` 跳过该确认。
- 设置 `plan.status = in_progress`、`explore.status = running`。
- 并发调用模型，输出到 `explore/plans/`。
- 至少一份成功：注册 artifacts，`explore.status = awaiting_accept`，plan 保持 `in_progress`。
- 全部失败：`explore.status = failed`，`plan.status = failed`。
- 完成后必须显示决策菜单；`-y` 也不得自动 accept 或进入 plan-review。

#### `vibeflow accept-plan`

参数：

```bash
vibeflow accept-plan <artifact-id-or-registered-path> [-f <feature>] [-y] [--no-chain]
```

前置条件：

- final plan 未锁定。
- 来源必须是当前任务 run.json 中已登记的 `plan` 或 `synthesis` artifact。
- 来源文件存在、非空、非占位。
- path 形态只用于匹配已登记 artifact，不允许任意项目文件。

行为：

- 将来源复制为 `01_plan_v1.md`。
- 在文件头追加简短来源标注：accepted from、artifact id、model、accepted_at。
- 更新 `explore.accepted` 和 `accept_history`。
- 将 plan 阶段置为 `completed`。
- 若正式方案发生变化，按探索专用规则重置 plan 后续阶段。
- 推进 `current_stage = plan_review`。
- 默认询问是否继续 plan-review；`-y` 自动继续，`--no-chain` 停下。

#### `vibeflow consult`

参数：

```bash
vibeflow consult --about <file-or-artifact-id>[,<file-or-artifact-id>...] --model <id> -m "<问题>" [-f <feature>]
```

前置条件：

- final plan 未锁定。
- `--model` 是已配置模型。
- `--about` 通过安全读取校验。
- 不支持 `--export`。

行为：

- prompt 注入 requirement、human decisions、about 文件摘要、用户问题。
- 输出到 `explore/consults/consult_###_<model>.md`。
- 注册 `kind = consult` artifact。
- 不改变 `01_plan_v1.md`、plan 状态、current_stage。
- 失败只写 `explore.failures`。

#### `vibeflow synthesize`

参数：

```bash
vibeflow synthesize --base <file-or-artifact-id>[,<file-or-artifact-id>...] --model <id> [-m "<融合偏好>"] [-f <feature>]
```

前置条件：

- final plan 未锁定。
- `--model` 是已配置模型。
- `--base` 通过安全读取校验。
- 不支持 `--export`。

行为：

- prompt 注入 requirement、human decisions、base 内容、融合偏好。
- 输出到 `explore/syntheses/synth_###_<model>.md`。
- 注册 `kind = synthesis` artifact，可被 `accept-plan` 接受。
- 不自动覆盖 `01_plan_v1.md`。
- 失败只写 `explore.failures`。

### 6.5 决策菜单与 next

`plan --multi` 成功后显示菜单，accept 优先：

```text
已生成 3 个候选方案，等待选择正式方案

[1] accept plan_001 (codex)  → 进入 plan-review
[2] accept plan_002 (claude) → 进入 plan-review
[3] accept plan_003 (gemini) → 进入 plan-review
[4] consult                 → 询问某模型对方案的看法
[5] synthesize              → 融合多份方案
[6] rerun                   → vibeflow plan --multi --force --models ...
[7] single                  → vibeflow plan --force，放弃本轮等待并回单方案
[q] 退出，稍后用 vibeflow next 查看
```

非 TTY 环境不弹交互，只打印推荐命令。

`vibeflow next` 增强：

- `awaiting_accept`：headline 为“探索池等待选择正式方案”，优先提示 `accept-plan`。
- `accepted` 且 plan-review pending：提示 `vibeflow plan-review`。
- plan-review blocked/failed 且未锁定：提示可 `vibeflow plan --multi --force` 回探索。
- finalize in_progress：仍提示 `advance` / `deliver`，但若存在 accepted source，一并显示来源。
- finalized locked 后：探索命令不再出现，提示 change-request。

### 6.6 锁定边界

锁定判定：

- `finalize.status = completed`
- `03_final_plan.md` 存在且非占位
- `advance` finalize 时补写 `finalize.locked = true` 与 `meta.final_plan_locked_at`

锁定后：

- `plan --multi`、`plan --force` 试图重开 plan、`consult`、`synthesize`、`accept-plan` 全部拒绝。
- 提示 `vibeflow change-request -m "<变更原因>"`。
- 若现有 change-request 只支持 done/delivered，需在实现中扩展为也支持“finalize 已锁定”的任务，但不得推翻 `03_final_plan.md`；大改方向应提示新建 feature。

### 6.7 P2 预留挂点

- `plan --multi-extend`：未来把现有 `01_plan_v1.md` 注册为 `kind = plan` artifact，再追加候选。
- `plan --add <model>`：未来复用 `parallel-plan` 的单模型追加模式，写入同一 explore 池。
- `plan-status`：未来读取 `run.explore` 渲染探索池视图。
- 自动 Judge：未来新增 `kind = judge` artifact，只输出建议，不自动 accept。

## 7. 修改文件范围

| 路径 | 修改原因 |
|---|---|
| `src/core/run.ts` | 扩展 `RunState` 类型，增加 `ExploreState`、`ExploreArtifact`、accept history、`meta.final_plan_locked_at` |
| `src/core/explore-state.ts` | 新增探索池状态管理、artifact 注册、accept、锁定 guard、探索专用下游重置 |
| `src/core/parallel-plan.ts` | 新增 `plan --multi` runner，负责并发调用、统一写 run.json、部分失败处理 |
| `src/core/consult.ts` | 新增 consult runner |
| `src/core/synthesize.ts` | 新增 synthesize runner |
| `src/core/explore-input.ts` | 新增 artifact/path 解析与安全读取，复用密钥脱敏 |
| `src/core/output-artifact.ts` | 从 stage-runner 抽取输出兜底逻辑，供普通阶段和探索 runner 共用 |
| `src/core/project-scanner.ts` | 导出安全文件判断 helper；不得削弱 `redactSecrets()` |
| `src/core/context.ts` | 支持探索命令内置 prompt 所需变量构建；旧项目无需新增 prompt 文件 |
| `src/core/advance.ts` | 增加 awaiting_accept 防绕过 guard；finalize advance 时补写 locked 标记 |
| `src/core/next-advisor.ts` | 增加 explore-aware 下一步建议 |
| `src/core/change-request.ts` | 允许 finalize 已锁定但未 done/delivered 的任务记录 change-request；不允许推翻 final plan |
| `src/core/stage-runner.ts` | 复用抽取后的输出 helper；保持普通 `--force` 语义不变 |
| `src/adapters/types.ts` | `AgentRunRequest` 增加可选 UI 静默参数 |
| `src/adapters/base.ts` | 最小改动：并发探索时关闭单 adapter spinner，避免终端输出冲突 |
| `src/cli/commands/stages.ts` | 给 `plan` 增加 `--multi` / `--models` 分支与 awaiting_accept 下单方案保护 |
| `src/cli/commands/accept-plan.ts` | 新增 accept-plan CLI |
| `src/cli/commands/consult.ts` | 新增 consult CLI |
| `src/cli/commands/synthesize.ts` | 新增 synthesize CLI |
| `src/cli/explore-menu.ts` | 新增 CLI 菜单，封装 TTY / 非 TTY 行为 |
| `src/cli/index.ts` | 注册新命令 |
| `src/cli/commands/next.ts` | 展示 explore-aware 建议 |
| `src/cli/commands/status.ts` | 增加探索池摘要：当前状态、accepted source、候选数量、失败数量 |
| `src/cli/commands/advance.ts` | 接入 core guard 的错误提示；不允许 awaiting_accept 直接 advance |
| `docs/USAGE.md` | 增加探索池命令、示例流程、锁定边界 |
| `docs/TECH_DESIGN.md` | 记录探索池作为 plan 阶段增强子状态的设计 |
| `docs/PRD.md` | 对齐 D1-D3 和 P2 预留项 |
| `README.md` | 更新能力说明与使用入口 |
| `docs/CAPABILITIES.md` | 更新当前能力、限制和 P2 项 |

明确不改：

- 不改 `.ai-dev/` 配置文件。
- 不改 `src/templates/*.ts`。
- 不改现有 workflow 模板。
- 不改变普通阶段 `--force` 的全局语义。

## 8. 数据 / 接口影响

### 数据影响

- 无数据库。
- 无迁移脚本。
- 文件系统新增 `explore/` 目录。
- `run.json` 新增 optional `explore` 字段，旧任务向后兼容。
- `01_plan_v1.md` 仍是 plan-review 唯一正式输入。
- `02_plan_review.md` / `03_final_plan.md` 在方案变更后不删除，但通过 run.json 阶段状态标记为过时。

### CLI 接口影响

| 命令 | 变化 | 兼容性 |
|---|---|---|
| `vibeflow plan` | 默认行为不变 | 兼容 |
| `vibeflow plan --multi` | 新增多模型探索模式 | 新能力 |
| `vibeflow plan --models` | 仅配合 `--multi` 生效 | 新能力 |
| `vibeflow plan --force` | 在 awaiting_accept 时明确表示放弃探索回单方案 | 探索场景新语义 |
| `vibeflow accept-plan` | 新增正式方案选择命令 | 新能力 |
| `vibeflow consult` | 新增咨询命令 | 新能力 |
| `vibeflow synthesize` | 新增融合命令 | 新能力 |
| `vibeflow next` | 增加探索池状态建议 | 兼容 |
| `vibeflow advance` | 增加 awaiting_accept 防绕过保护 | 修正约束 |
| `vibeflow deliver` | 逻辑不变，不搬运 explore 产物 | 兼容 |
| `vibeflow change-request` | 支持 locked 任务记录变更请求 | 边界补齐 |

## 9. 实现步骤

1. 类型与状态基础  
   修改 `run.ts`，新增 `explore-state.ts`，实现 `ensureExploreState()`、锁定判断、artifact ID 分配、状态转移。

2. 安全读取与输出 helper  
   从 `stage-runner` 抽取输出兜底到 `output-artifact.ts`；新增 `explore-input.ts`，复用 `redactSecrets()` 和文件忽略规则。

3. 并发调用基础  
   修改 `adapters/types.ts` 和 `adapters/base.ts`，增加静默 UI 参数；实现 `parallel-plan.ts`，确保只有 orchestrator 写 run.json。

4. plan 命令接入  
   修改 `stages.ts`，实现 `plan --multi`、`--models`、数量校验、`--export` 拒绝、`awaiting_accept` 下单方案防绕过。

5. accept-plan  
   新增 CLI 与 core accept 行为，复制正式方案、写来源标注、记录 history、重置下游、处理 chain。

6. next / advance 防绕过  
   修改 `advance.ts`、`next-advisor.ts`、`next.ts`，确保 awaiting_accept 不会被 advance 或错误 next 建议绕过。

7. consult / synthesize  
   实现两个 runner 与 CLI，支持 artifact ID / 安全路径输入，失败只写 failures，不改变正式方案。

8. 锁定后边界与 change-request  
   finalize advance 写 locked 标记；探索命令统一拒绝 locked task；补齐 change-request 对 locked task 的入口。

9. status 与文档  
   status 展示探索池摘要；更新 README、USAGE、TECH_DESIGN、PRD、CAPABILITIES。

10. 验证  
   运行 `npm run typecheck && npm run lint && npm run build`，再跑手工冒烟场景。

## 10. 验收标准

1. 老路径零变化  
   旧 run.json 无 `explore` 字段时，`vibeflow plan → plan-review → finalize → advance → deliver` 行为与当前一致。

2. 多模型生成  
   `vibeflow plan --multi --models codex,claude` 生成 `explore/plans/` 产物，run.json 进入 `explore.status = awaiting_accept`，plan 保持 `in_progress`。

3. `-y` 不绕过选择  
   `vibeflow plan --multi -y` 可跳过调用确认，但完成后仍停在菜单，不自动 accept，不自动 plan-review。

4. awaiting_accept 防绕过  
   此状态下执行 `vibeflow advance` 必须失败并提示 `accept-plan`；执行不带 `--multi` 的 `vibeflow plan` 必须失败并提示 `plan --force` 放弃探索。

5. accept 正式方案  
   `accept-plan plan_001` 后，`01_plan_v1.md` 来源明确，`explore.accepted` 与 `accept_history` 正确，current_stage 推进到 plan_review。

6. consult + synthesize + accept  
   consult 两轮、synthesize 一版后，所有产物保留；accept 融合稿后正式方案来源指向 `explore/syntheses/...`。

7. plan-review 后退回探索  
   plan-review 后执行 `vibeflow plan --multi --force`，旧 explore 保留，新 batch 追加，plan 后续阶段按探索专用规则重置。

8. 下游过时处理  
   finalize 已生成但未 advance 锁定时，退回探索会把 finalize 从 `in_progress` 置回 `pending`，`03_final_plan.md` 文件保留但被视为过时。

9. 部分失败  
   3 个模型中 1 个失败时，成功方案可 accept，失败记录进入 `explore.failures`；全部失败时 plan 阶段失败。

10. 安全读取  
   consult / synthesize 不能读取 `.env`、key、数据库、二进制、项目根外路径；注入 prompt 前必须脱敏。

11. 并发写入安全  
   并发模型调用不会互相覆盖 run.json；run.json 只由 orchestrator 串行写入。

12. 锁定后拦截  
   finalize advance 锁定后，`plan --multi`、`consult`、`synthesize`、`accept-plan` 均拒绝，并提示 change-request。

13. 构建检查  
   后续实现完成后必须通过：

```bash
npm run typecheck
npm run lint
npm run build
```
