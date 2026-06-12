# 人工决策记录

> requirement human_gate 阶段，用户对「需要人工确认的问题」中的阻断性决策拍板。plan 及后续阶段须严格遵守，不得重新抛出已决项。

## 阻断性决策（已拍板）

### D1. 增强命令的本期范围
**核心五件为本期设计范围；三个增强命令（plan --multi-extend / plan --add / plan-status）仅作 P2 预留。**
- 本期设计：`plan --multi` / `consult` / `synthesize` / `accept-plan` / 退回探索。
- 三个增强命令本期不展开完整设计，但设计文档须为 `plan --multi-extend`（单方案中途转多方案）预留明确扩展挂点，说明未来如何接入而不改动主干。

### D2. 退回探索的命令形态
**复用 `--force` 语义扩展，不新增 `back-to-explore` 命令。**
- 从 plan-review 退回探索池 ≈ 重跑 plan 阶段，复用已实现的 `--force`（重跑 + 级联重置下游）。
- 设计须明确：`--force` 重跑 plan（探索模式）时，已有 `explore/` 产物如何处理（保留、可追溯，不被清空），以及与级联重置下游（plan-review / finalize）的衔接。

### D3. plan --multi 的确认粒度与 -y 行为
**一次确认跑全部模型；`-y` 自动链模式下 `--multi` 跑完必须停在决策菜单。**
- 一次 `--multi` 一个确认提示（告知将调用哪几个模型），不逐模型确认。
- 即使 `-y`，`--multi` 完成后必须停在决策菜单等待人选择（探索池天然人主导，禁止自动跳过选择）。

## 可延后项（plan 阶段先给推荐方案，标注为待确认，不阻断推进）

并行执行方式（并发 / 顺序）、默认模型组合与数量及读取来源、部分失败语义（1 个模型失败时成功带告警 vs 整体重跑）、`explore/` 命名规则（A/B/C vs 模型名）、accept 历史与探索元数据存放位置（run.json vs explore/ 清单）、deliver 是否携带 explore/ 产物、consult / synthesize 可用模型范围、决策菜单文案与排序（首选项默认 accept 防拖延）。

## 不变红线（重申需求 §6）

- 不加 `--multi` 时行为与现状完全一致，对 standard_feature 零破坏。
- 复用 run.json 状态机 / adapter / context builder，不另起并行体系；复用不可行处须在设计中说明理由。
- 本期只产出设计文档，不写代码；不做自动 Judge（仅在设计中预留扩展位）。
