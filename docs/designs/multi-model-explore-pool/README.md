# 多模型并行出方案与探索池 — 设计文档

> 本目录是 vibeflow **用自己（dogfood）** 完成的一份功能设计的完整记录。
> 原产物在 `docs/ai-workflow/多模型并行出方案与探索池/`（被 .gitignore 忽略），此处复制一份纳入版本控制。
> 产出日期：2026-06-12 · 对应 vibeflow v0.2.0。

## 这是什么

为 vibeflow 增加「多模型并行出方案 + 探索池」能力（PRD §7.2 的落地设计）：让 plan 阶段可选地由 2~3 个模型并行各出一套方案，用户可对比 / 咨询 / 融合 / 择优，最终选定一套进入既有 plan-review → finalize。**本期只产出设计，未实现代码。**

## 如何产生的（dogfood 全流程）

用 vibeflow 的 standard_feature 工作流，对这个需求本身跑了一遍：

```
requirement(claude 整理) → plan(codex 出方案) → plan-review(claude 跨模型评审)
→ finalize(codex 吸收评审定稿) → advance 锁定 → deliver 交付
```

跨模型评审在此过程中抓出 2 个真 Blocker（含「`awaiting_accept` 状态会被既有 advance / next 建议绕过」——精准命中当时刚提交的 `next-advisor.ts` 盲区），均在 finalize 终稿中解决。

## 文件清单

| 文件 | 内容 |
|---|---|
| `00_requirement.md` | 需求文档（claude 整理，含待确认项分级） |
| `01_plan_v1.md` | 初版技术方案（codex） |
| `02_plan_review.md` | 跨模型评审报告（claude，对照代码核实，2 Blocker + 5 Major） |
| `03_final_plan.md` | **最终方案（codex 吸收评审定稿，584 行，可据以编码）** |
| `04_human_decisions.md` | 人工拍板的 D1–D3 阻断性决策 |

## 关键决策（D1–D3）

- **D1**：本期只设计核心五件（`plan --multi` / `consult` / `synthesize` / `accept-plan` / 退回探索）；`--multi-extend` / `--add` / `plan-status` 仅 P2 预留。
- **D2**：退回探索复用 `--force` 语义扩展，不新增 `back-to-explore`。
- **D3**：`plan --multi` 一次确认跑全部模型；`-y` 下跑完也必须停在决策菜单（探索池人主导）。

## 下一步

实现（develop）是另一个架构级任务：涉及约 24 个文件、10 步实现、13 条验收，详见 `03_final_plan.md` §7/§9/§10。建议单独开任务进行。
