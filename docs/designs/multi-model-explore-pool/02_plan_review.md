# 方案评审报告：多模型并行出方案与探索池（01_plan_v1）

> 评审对象：`01_plan_v1.md`
> 评审依据：`00_requirement.md`、`04_human_decisions.md`（D1-D3）、`.ai-dev/rules/*`，并对照现有代码（`src/core/stage-runner.ts` / `run.ts` / `advance.ts` / `next-advisor.ts` / `config.ts` / `deliver.ts` / `adapters/base.ts`）逐一核实。

## 总体结论

方案对需求理解准确，D1-D3 人工决策均已正确吸收，验收标准 2 的六个场景题全部给出了回答，整体架构（探索池作为 plan 阶段增强子状态、复用 run.json / adapter / context builder）符合"不另起一套机制"的红线，无过度设计。

但存在 **2 个 Blocker**：均为状态机衔接上的真实缺口——`--force` 级联语义扩展的作用域未界定（直接动摇"零破坏"承诺），以及 `awaiting_accept` 状态可被既有 `vibeflow advance` / 不带 `--multi` 的 `vibeflow plan` 绕过（击穿"探索池必须人选"的核心约束）。这两处不补全，设计文档无法据以编码。

---

## Blocker（不解决不能进入 finalize）

### B1. `--force` 级联重置语义扩展的作用域未界定，与"零破坏"承诺冲突

**位置**：方案 §5「路径互通与 --force」。

**问题**：现有 `stage-runner.ts:321-329` 的 `--force` 级联**只把下游 `completed` 阶段重置为 pending**（注释明确写了"不动用户主动 skipped 的阶段"）。方案 §5 提出"重置 plan 后续阶段，包括 `completed` / `in_progress` / `blocked` / `failed`"，这是对现有语义的扩展，但**没有说明该扩展是全局生效还是仅探索模式生效**：

- 若全局修改 `runStage` 的 force 级联逻辑，则不带 `--multi` 的老用户跑任意 `<stage> --force` 时行为也变了（例如下游 blocked 的 develop 会被重置），直接违反需求 P0-5 和方案自己的零破坏保证；
- 若仅 `plan --multi --force` 生效，则 `plan --force`（不带 `--multi`）退回时语义不一致，且需要明确两套语义如何在代码中区分。

另有一个方案未覆盖的具体场景：finalize 产物已生成、human_gate 尚未 advance（`finalize.status = 'in_progress'`，即**未锁定**），此时按方案允许退回探索；但现有级联只重置 `completed`，finalize 会残留 `in_progress` 状态和一份过时的 `03_final_plan.md`。

**建议**：在设计中明确——扩展语义**仅限 plan 阶段的探索模式重跑**（或给出全局扩展的影响分析并单独走人工确认）；补一张「force 重跑 plan 时各下游阶段状态 × 处理方式」的完整表格，覆盖 `in_progress`（含 human_gate 等待中）/ `blocked` / `failed` / `skipped`，并说明残留产物文件（`02_plan_review.md`、`03_final_plan.md`）如何标记过时。

### B2. `awaiting_accept` 可被既有 `advance` 和单模型 `plan` 绕过，"必须人工 accept"不成立

**位置**：方案 §4「状态处理」、§5「路径互通」。

**问题**：方案让 multi 模式下 `plan.status` 停在 `in_progress` 直到 accept-plan，但没有设计与两条既有命令的衔接，二者都能绕过 accept：

1. **`vibeflow advance`**：`advance.ts:26-32` 允许把 `in_progress` 阶段直接标 `completed` 并推进 `current_stage`。更糟的是，现有 `next-advisor.ts:112-118` 对"非 human_gate 却 in_progress"的阶段**恰恰会推荐 `vibeflow advance`**——用户照提示执行后，plan 被标完成、流程进入 plan-review，而 `01_plan_v1.md` 可能还是占位或旧内容，探索池永久卡在 `awaiting_accept` 脏状态。
2. **`vibeflow plan`（不带 `--multi`）**：此时 plan 非 `completed`，不需要 `--force` 就能直接跑，单模型产出覆盖 `01_plan_v1.md`、标 completed 并可能自动 chain，同样留下 `awaiting_accept` 脏状态。需求 P0-4 要求"单方案 / 多方案 / 探索池可自由切换"，方案的互通表只覆盖了"单 → 多"，**"多（等待 accept 中）→ 单"这条腿缺失**。

**建议**：设计中明确补两条规则——(a) `explore.status = 'awaiting_accept'` 时 `advance` 拒绝推进 plan 阶段，提示改用 `accept-plan`；(b) 此时运行 `vibeflow plan`（不带 `--multi`）的语义二选一并写明：拒绝并提示（保守），或允许并定义其为"放弃探索池回单方案"（此时 `explore.status` 如何收尾、产物是否保留须写清）。两条都要补进「关键场景回答」。

---

## Major（强烈建议处理）

### M1. `parallel-plan` 绕开 `runStage` 后，需复刻的既有职责清单缺失；export 兜底与 consult/synthesize 失败处理未定义

现有 `runStage`（stage-runner.ts:302-557）承担了：阶段顺序校验、占位检测、`ensureOutputWritten`（stdout 兜底写文件）、`resolveStageTimeout`、run.json 状态落盘、export 模式分支。方案新建 `parallel-plan.ts` / `consult.ts` / `synthesize.ts` 直接调 adapter，但没有逐项说明上述职责哪些复用、哪些复刻、哪些不适用。特别是：

- **export 兜底模式**（`--export`，现有每个阶段命令都支持）对 `plan --multi` / `consult` / `synthesize` 是否可用？未装多个 CLI 的用户依赖它，不支持也应显式声明。
- **consult / synthesize 失败时的状态处理**未写（验收标准 1 明确要求每个命令有"失败时的状态处理"）：失败是否只追加 `explore.failures`、`explore.status` 是否变化、对 `plan.status` 有无影响，应逐命令补一句。

### M2. `--about` / `--base` 仅限"项目根目录内"不足以防密钥泄漏

项目根内同样存在 `.env` / `.pem` / `id_rsa` 等敏感文件。现有内容级脱敏（`redactSecrets()`）和文件级忽略只作用于 project-scanner 链路；consult / synthesize 把用户指定文件原文注入 prompt 发给外部模型 CLI，**完全绕过了这两层防护**。这与项目规则「安全与隐私」一节直接相关。建议：复用 project-scanner 的文件级忽略清单拒绝读取敏感文件，且注入内容过一遍 `redactSecrets()`；在设计文档中写明这一点。

### M3. 并发执行下 run.json 写入纪律与 `adapters/base.ts` 改动未落实到清单

- `writeRunState` 是整文件覆写、无锁（run.ts:101-106）。若并发的各模型 runner 各自写 run.json，会互相覆盖。设计应明确：**并发期间只由 orchestrator（parallel-plan）在全部/逐个完成后统一写入**，单模型 runner 不碰 run.json。
- 风险表承认 base.ts 的 ora spinner 并发会冲突，并提出"必要时只加静默 UI 参数"——这就是要改 `src/adapters/base.ts`（项目红线文件：spawn 外部 CLI、命令注入与 env 透传敏感），但**文件修改清单里没有列它**。要么列入清单并标注需人工确认，要么在"可延后项 1（并发 vs 顺序）"上直接给出推荐结论（如本期顺序执行、并发留作优化），从根上规避。

### M4. accept-plan 之后的推进方式未定义（产品红线：每步默认 [Y/n]）

方案多处写"accept → 进入 plan-review"，但没说清是**只推进 `current_stage` 指针并提示命令**，还是**自动调起 plan-review 阶段**。产品红线要求"调用外部 CLI 默认每步 [Y/n] 询问"。建议明确：accept-plan 本身不调模型，完成复制与状态推进后，按现有 chain 范式询问"是否继续 plan-review [Y/n]"（`-y` 时自动 chain，与 D3 不冲突——D3 只约束 `--multi` 完成后必须停菜单）。

### M5. `explore.status` 状态转移不完整且有一处自相矛盾；schema 冗余字段缺同步规则

- consult 一节写"如果 plan 正在等待 accept，继续保持 `plan.status = in_progress`"，但 accept **之后**（plan 已 completed、未锁定）仍允许 consult / synthesize——此时 `plan.status` 和 `explore.status` 各是什么、是否回到 `awaiting_accept`，方案没有回答，且与该句隐含假设矛盾。
- `accepted` 与 `accept_history` 末项信息重复，应写明同步规则（或改为只存 history、`accepted` 由末项推导）。
- `latest_batch_id` 的 batch 概念只在命名原则里一笔带过：batch 何时创建、ID 怎么生成、artifact 编号在并发完成时由谁统一分配，需各补一句。

建议补一张 `explore.status` 完整状态转移图（idle → running → awaiting_accept → accepted，以及 accepted 后再 consult / 再 accept / force 重跑各自的回转边）。这是验收标准 3「字段有明确清单与含义」的核心。

---

## Minor（可选优化）

1. **`src/cli/utils/explore-menu.ts` 目录不存在**：当前 `src/cli/` 下只有 `commands/` 和 `index.ts`，通用工具在 `src/utils/`。建议遵循现状放 `src/utils/` 或 `src/cli/commands/` 同级新建时说明理由。
2. **实现步骤未逐步标注涉及模块**：验收标准 4 明确要求"每步标注涉及的现有模块（状态机 / adapter / context builder / next-advisor 等）"。现有 10 步可推断但未显式标注，补上即可。
3. **`--models` 上限**：需求说 2~3 个，方案只"建议限制"。明确硬上限（如 >3 报错）还是软提示。
4. **`plan --multi` 的 `--no-chain` 参数**：multi 模式永远停菜单，该参数无意义，应说明忽略或不在 multi 分支暴露。
5. **测试方案补两个场景**：(a) 非 TTY + `-y` 组合下 `--multi` 停菜单的行为（这是 D3 红线的落地验证）；(b) 旧 run.json（无 `explore` 字段）的任务跑一遍单方案全流程，验证向后兼容声明。
6. **可追溯性加分项**：accept-plan 复制时在 `01_plan_v1.md` 文件头注入来源标注（如"accepted from explore/syntheses/synth_001_codex.md @时间"），呼应需求 P1-8，且能缓解"旧 01_plan_v1.md 过时误解"风险。
7. **`accept-plan <artifact-id-or-path>` 的 path 形态语义**：既然来源"必须是已登记探索产物"，path 形态只是 id 的便利写法还是允许未登记文件？一句话说死，避免实现时扩大。

---

## Question（需人工决策）

1. 方案末尾 5 个待确认问题（模板红线放行、默认模型策略、部分失败语义、consult/synthesize 模型范围、deliver 是否附 explore 摘要）划分合理、均属可延后项，建议随 finalize 一并拍板。其中默认模型策略引用的 `roles.planner.fallback_models` 在 `config.ts` 中确实存在，方案可行。
2. **deliver 的表述建议澄清而非决策**：现有 `deliver` 只做状态标记（`markDelivered`），不复制、不打包任何文件，所以"探索产物自然保留在任务目录"成立——建议在设计文档中写明这一事实，免得读者误以为 deliver 有产物搬运行为。需求可延后项 6（交付是否携带 explore）随之自然消解为"是否在交付提示中列出 explore 摘要"，即方案问题 5。

---

## 验收标准对照

| 验收标准 | 状态 |
|---|---|
| 1. 七项范围内容 + 每命令六要素 | 大体覆盖；consult/synthesize/accept-plan 的失败状态处理缺失（M1/M5） |
| 2. 六个场景题可直接回答 | 已全部回答；但 B2 揭示「多方案等待中转回单方案」场景缺失 |
| 3. run.json 扩展字段清单 + 向后兼容 | 字段清单已给、兼容策略合理；个别字段语义不完整（M5） |
| 4. 分步实现建议标注现有模块 | 步骤已拆，模块标注未显式给出（Minor 2） |
| 5. 流程闭环（plan-review → finalize → deliver） | 本评审即该流程一环 |

**结论：方案方向正确、地基扎实，修复 2 个 Blocker 并处理 Major 1/2/3/5 后即可进入 finalize。**
