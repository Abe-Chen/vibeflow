# vibeflow v0.1 首次端到端实战复盘 — FlipClockApp

> 历史实战快照：本文如实保留 v0.1 当时的问题与判断。文中多项“待解决/V2”能力后来已实现，当前状态请以 [CAPABILITIES.md](CAPABILITIES.md) 为准。

| 项 | 内容 |
|---|---|
| 项目 | FlipClockApp（Android Kotlin + Jetpack Compose 翻页时钟应用） |
| 需求 | 参考 iOS 系统时钟翻页效果，重做数字翻页动画 |
| 工作流 | standard_feature（9 阶段） |
| 日期 | 2026-05-21 ~ 2026-05-22 |
| 状态 | vibeflow 流程 status=done ✓，代码已落盘但 gradle 验证因环境问题跳过 |

---

## 1. 实战数据

### 1.1 流程数据

| 阶段 | 模型 | 产物 | 耗时（估算） | 状态 |
|---|---|---|---|---|
| init | - | 24 模板文件 + CLAUDE.md/AGENTS.md + git init | <1 分钟 | ✓ |
| doctor | - | 模型可用性诊断 | <30 秒 | ✓ |
| learn | claude | 3 份 rules 草稿（A 级质量） | ~1 分钟 | ✓ |
| new | - | 任务目录 + run.json | <10 秒 | ✓ |
| requirement | claude | 00_requirement.md (68 行，10 个待确认问题) | ~1 分钟 | ✓ |
| plan | codex | 01_plan_v1.md (322 行) | ~2 分钟 | ✓ |
| plan_review | claude | 02_plan_review.md (123 行，**1 Blocker + 5 Major**) | ~2 分钟 | ✓ |
| finalize | codex | 03_final_plan.md (265 行，含关键帧表 + 角度公式) | ~2 分钟 | ✓ |
| develop | codex | 05_implementation_report.md (含 +175/-18 diff) | ~5 分钟 | ✓ |
| code_review | claude | 06_code_review.md (123 行，**1 Blocker + 3 Major + 5 Minor**) | ~3 分钟 | ✓ |
| fix | codex | 07_fix_report.md (含完整新文件) | ~5 分钟 | ✓ |
| test | claude | 08_test_report.md (165 行，**明确不建议交付**) | ~3 分钟 | ✓ |
| archive | claude | 09_release_note.md (80 行，**含 6 条经验沉淀**) | ~2 分钟 | ✓ |

**总产物**：13 个 markdown 文件，约 1400 行高质量文档；1 个真实代码改动（FlipClockView.kt +175/-18）。

### 1.2 模型调用失败次数

| 失败 | 原因 | 修复方式 |
|---|---|---|
| codex `plan` 第一次 | "Not inside a trusted directory" | git init |
| codex `develop` 第一次 | 5 分钟超时 | config.yaml 加 timeout_ms: 900000 |
| claude `code_review` 第一次 | 5 分钟超时 | config.yaml 给 claude 同样加 timeout_ms |
| Claude Code "等待授权"前言 | prompt 模板措辞误导 | 改 prompt：明确"不要调用 Write/Edit 工具" |

每次失败都暴露了 vibeflow v0.1 的一个真实缺陷，且都得到了立即修复。

---

## 2. vibeflow 设计验证（经受住考验的）

### 2.1 跨模型评审 ⭐⭐⭐ 核心价值

**3 次 Claude 抓到 Codex 自己没看到的真实问题**：

1. **plan_review B1**：Codex 设计了 6 层渲染，但**所有"翻"的层都只在上半区**，下半区会硬切。Claude 从需求 R3 反推发现。
2. **code_review B1 + M1 + M2**：
   - B1：Claude 跑 `git status` 发现 patch 没落盘
   - M1：推理 Compose 渲染时序，发现"第一帧 progress.value=1f 会闪现新数字"
   - M2：发现动画结束后 graphicsLayer 残留 ~400ms
3. **test B1 复检**：fix 阶段 codex"输出完整新内容"但仍未落盘，Claude 跑 git status 再次发现

**关键观察**：codex 自审有盲点，**单模型无论多强都看不到自己代码的边界态问题**。这正是 vibeflow 的核心设计意义。

### 2.2 文档驱动 + 产物可追溯

13 个产物文件按 00_-09_ 编号归档，每个阶段读上一阶段产物作为输入。整个流程**没有依赖任何聊天记录或外部状态**。

最终 archive 阶段读 final_plan / impl_report / test_report 三份产物，能生成结构化的 release_note + 6 条经验沉淀——这是文档驱动设计的直接价值。

### 2.3 human_gate

`requirement` 完成后强制 advance：用户检查并补充了需求，AI 列出的 10 个待确认问题在 04_human_decisions.md 中得到回答。

`finalize` 完成后强制 advance：用户检查 final_plan 后才进入 develop（lock-plan 软门禁）。

这两个 gate 都体现了"不让 AI 自己决定关键产品取舍"的设计哲学。

### 2.4 角色与模型解耦

| 角色 | 模型 | 验证 |
|---|---|---|
| planner / developer / finalizer | codex | 出代码能力强 |
| product_analyst / plan_reviewer / code_reviewer / qa | claude | 评审、整理、推理能力强 |

`must_be_different_from_developer` 约束被 code_review 阶段触发——评审者和开发者必须不同模型。

### 2.5 chain 模式

每个阶段完成后 `[Y/n]` 询问 + `-y` 一键 chain：用户在熟悉流程后只需要回车，自动 chain 到下一阶段。在 plan-review 出现 Blocker 时用户主动选 `n` 停下，体现了"用户主导节奏"的设计。

---

## 3. v0.1 暴露的真实痛点

按"对实战影响的严重程度"排序：

### 3.1 ⭐⭐⭐ AI 无文件写权限（最大痛点）

**症状**：
- develop / fix 阶段 codex 只能输出 patch 文本，无法真的修改文件
- B1（patch 未落盘）在 plan_review / code_review / test **反复出现 3 次**
- 用户最后需要手动 apply patch

**根因**：
- Claude Code 的 `-p` 非交互模式默认无 Write/Edit 权限
- Codex CLI 类似限制
- vibeflow 没有自动给开发阶段授权的机制

**已部分缓解**：
- prompt 模板改了措辞（"不要调用文件工具，请直接 stdout 输出"）
- 但 develop / fix 阶段无法真改代码这件事没解决

**待解决**：
- Task #48 / Task #52（实施"git diff 落盘检测"作为完成标志）
- 未来 V2：CodexAdapter / ClaudeAdapter 在 develop 阶段自动加 `--permission-mode acceptEdits`

### 3.2 ⭐⭐ AI 无沙箱执行权限

**症状**：gradle/lint/test/build 命令在 codex/claude 沙箱里跑不了，每次都说"未执行"。

**根因**：本地 CLI 默认只读沙箱（防止误操作）。

**待解决**：
- 短期：让用户在 vibeflow 流程外手动跑
- 中期：增加 `vibeflow run-tests` 命令，由 vibeflow 直接 spawn gradle/npm/pnpm 等
- 长期：V2 给 develop 阶段授予命令执行权限

### 3.3 ⭐⭐ 默认超时 5 分钟过短

**症状**：develop / fix / 部分 plan / code_review 都超过 5 分钟。

**已修复（局部）**：FlipClockApp 项目手动改 config.yaml 给 codex / claude / gemini 都加 `timeout_ms: 900000`。

**待解决**：
- Task #49：init 生成的 config.yaml 给所有模型默认 timeout_ms=900000
- Task #50：阶段级 timeout 配置（develop 给 15 分钟，requirement 给 5 分钟）

### 3.4 ⭐⭐ 没有 spinner / 进度反馈

**症状**：codex/claude 跑 1-15 分钟期间，终端**完全没有输出**——看起来像卡死。用户得开 Activity Monitor 看 CPU 占用确认进程还活着。

**待解决**：Task #48（SpawnAdapter 加 ora spinner + 已耗时）

### 3.5 ⭐ Claude 思考过程偶尔泄漏

**症状**：08_test_report.md 第 1 行是英文思考"The investigation is clear..."，应该在产物里。

**待解决**：Task #51（prompt 模板加约束"不要输出思考过程"）

### 3.6 ⭐ requirement 输入方式单一

**症状**：只能 `-m "<一长串>"`，引号转义麻烦、多行难输入、修改要重输。

**待解决**：Task #41（加 -f / --edit / 自动检测产物文件）

### 3.7 ⭐ 没有 "ready-check"

**症状**：gradle 8.11.1 下载需要 services.gradle.org，国内网络超时。test 阶段才暴露，整个实战已经走到第 8 阶段。

**待解决**：Task #53（init / doctor 加工具链可用性检测）

### 3.8 ⭐ commands.test/build/lint 空数组无提醒

**症状**：FlipClockApp 的 .ai-dev/config.yaml 这三个字段是空数组，vibeflow 从未提示用户应该配齐。

**待解决**：Task #54（doctor / init / learn 时检测 + 提醒）

### 3.9 ○ codex CLI 默认要求 git 仓库

**症状**：FlipClockApp 不是 git 仓库时 codex 拒绝运行。

**已修复**：Task #43-47（vibeflow init 时主动询问 + git init / --skip-git-repo-check / 跳过 三选项；doctor 加 git 状态提示）

### 3.10 ○ 没有 "重跑 stage" 简便命令

**症状**：阶段 failed 后想重跑只能直接再跑（vibeflow 默认允许 failed 重跑），但没有 `vibeflow retry <stage>` 让重置状态更明确。

**待解决**：在 v0.2 待做项里（之前的 Task 没单独列出，应该补一个）

---

## 4. 意外发现（Surprise）

### 4.1 Claude 真的会主动跑命令验证

`code_review` 和 `test` 阶段，Claude 真的执行了 `git status --short`、读取磁盘上的 `FlipClockView.kt`、对照报告内容。这超出我对"评审 Agent"的预期——它不只读文档，**真的去验证文件系统状态**。

### 4.2 Codex 出方案极其精细

`finalize` 阶段产出的 `03_final_plan.md` 含**逐进度关键帧表**（progress=0/0.25/0.5/0.75/1）+ 角度计算公式（`topPhase = (progress / 0.5).coerceIn(0, 1)` 等），细到可以直接照抄到代码里。

### 4.3 AI 主动发现项目原有 bug

`learn` 阶段，Claude 在 `coding_rules.md` 末尾加了一条：

> ⚠️ `app/build.gradle.kts` 当前重复声明了 `compose-bom` 和 `material3`，新增依赖时请去重

——这是项目原有的 dependency 重复声明问题，AI 顺手挑出来了。

### 4.4 learn 命令在没 README 的项目也能识别产品定位

FlipClockApp 没有 README，只有 3 个 Kotlin 源码文件。但 Claude 通过 `MainActivity.kt` 中的 `detectHorizontalDragGestures` + `is24Hour` 状态，**推断出"翻页时钟，支持手势切换 12/24 小时制"**——而且每个判断后括号注明依据。

### 4.5 codex 的 `animationTarget + hasPendingChange` 修复思路

Code_review M1 给了两种修复方向，codex 在 fix 阶段选了**第三种**：引入 `animationTarget` 状态判断"current 已变但 LaunchedEffect 还没执行"，**用组合状态绕过 LaunchedEffect 的时序问题**。这比 Claude 给的两个方案更优雅。

---

## 5. 任务优先级整理（已建 task 共 14 个）

### 5.1 已完成 (10 个)

| # | Task | 完成内容 |
|---|---|---|
| #42 | Claude 写入权限问题 | 改 10 个 prompt 模板，加 DOC_OUTPUT_INSTRUCTION / CODE_OUTPUT_INSTRUCTION |
| #43-47 | git 仓库初始化 | git 工具模块 + init 三选项询问 + doctor git 状态提示 + E2E |
| **#48** | **SpawnAdapter spinner** | base.ts 加 ora spinner + 已耗时/剩余超时显示；非 TTY 自动降级 |
| **#49** | **init 默认 timeout_ms** | config.ts 模板给 claude/codex/gemini 都加 timeout_ms: 900000 |
| **#51** | **prompt 禁止思考前言** | DOC_OUTPUT_INSTRUCTION / CODE_OUTPUT_INSTRUCTION 加"不要输出思考过程" |
| **#52** | **develop/fix git diff 落盘检测** | stage-runner 加 checkCodeChangeApplied：git diff 非空才标 completed，否则 blocked 提示用户 apply |

### 5.2 P0 待做 — **已全部完成 ✅**

### 5.3 P1 待做（影响产物质量 / UX）

| # | Task | 理由 |
|---|---|---|
| #51 | prompt 模板禁止英文思考前言泄漏 | 直接影响产物质量 |
| #50 | 阶段级 timeout 配置 | 比 #49 更通用 |
| #41 | requirement 加 -f / --edit | 长需求难用 |
| #54 | config.yaml commands 空数组检测 | 跨项目通用提醒 |

### 5.4 P2 待做（增强项）

| # | Task | 理由 |
|---|---|---|
| #53 | init/doctor 加 ready-check 工具链 | 提前发现环境问题 |
| 新增 | `vibeflow retry <stage>` | 失败重跑更明确 |
| 新增 | `vibeflow run-tests` | 由 vibeflow 直接 spawn gradle/npm |

### 5.5 V2 范围（已在 PRD/TECH_DESIGN）

- 探索池模式（parallel_plan / consult / synthesize / accept-plan）
- 路径互通 + change_request
- 认知引导（next / plan-status / 主动菜单）
- Web Console（推迟到 V1.5）

---

## 6. 推荐的下一轮开发顺序

按"投入产出比"+"实战痛点"评估：

### 6.1 第一轮 polish（1-2 天）

**目标**：让下一次实战体验显著改善。

- **#48 spinner**（1 天）—— 直接修在 SpawnAdapter，所有阶段受益
- **#49 默认 timeout=900000**（30 分钟）—— 改 config.yaml 模板
- **#52 git diff 落盘检测**（半天）—— stage-runner 加"develop/fix 阶段 git diff --stat 非空"软门禁
- **#51 prompt 思考泄漏**（半天）—— 改 DOC_OUTPUT_INSTRUCTION 措辞

**完成后**：第二次实战体验差距大；B1 之类的"假完成"基本被堵死。

### 6.2 第二轮 polish（2-3 天）

- **#41 -f / --edit**（半天）
- **#54 commands 检测**（半天）
- **#53 ready-check**（1 天）
- **#50 阶段级 timeout**（半天）

**完成后**：v0.1 的 8 个真实痛点全部修完，可以认为是 v0.2 完成。

### 6.3 V2 启动（6-10 天）

按 PRD §15.3 和 TECH_DESIGN §5.9 的 7 步实现顺序：

1. parallel_plan + accept-plan
2. 引导菜单 + NextResolver + plan-status
3. consult + synthesize
4. back-to-explore
5. change-request
6. plan --multi-extend / --add

---

## 7. 沉淀到 vibeflow 设计的洞察

### 7.1 跨模型评审是 vibeflow 最大的差异化

3 次 Claude 抓到 Codex 没看到的问题，验证了"角色与模型解耦 + 不同模型协作"的设计哲学。如果不是 vibeflow 的流程，用户单用 codex 或单用 claude，都会错过这些 Blocker。

### 7.2 文档驱动比想象的更重要

每个阶段产物都被下游阶段读取——一旦中途断了上下文（比如用户切换会话），vibeflow 能从产物文件恢复全部状态。这次实战甚至**经历了用户休息 + 跨天**，流程仍能继续。

### 7.3 v0.1 的"软门禁"是不够的

`require_locked_plan` 只检查"非占位 + finalize completed"，但**没检测 patch 是否真的落盘**——导致 develop 输出 patch 文本被当成"已实现"。Task #52（git diff 检测）是补这个洞。

### 7.4 用户对节奏的掌控权很重要

chain 模式 + `-y` / `-n` / `--no-chain` 三种行为，让用户能按自己的节奏推进。这次实战用户多次主动选 `n` 停下检查（plan_review 后、test 后等），这是 vibeflow 设计成功的标志。

### 7.5 prompt 模板的措辞会被字面理解

第一次 requirement 跑出"等待授权写入权限"前言，根因是 prompt 写了"输出到：{{output_path}}"——Claude 字面理解为"我要写文件"。后改为"请把内容作为 stdout 回复输出"后立刻干净。

---

## 8. 不足

- **未真机验证**：因本机 Android Studio + Gradle 网络问题，最终代码效果未在设备上确认。
- **gradle BUILD FAILED**：57 分钟跑完最终失败，14 个 task executed。是真实编译错误，但已留作后续单独处理。
- **未跑 lint / unit test**：跟上一条同源问题。
- **流程节奏偏慢**：从 init 到 archive 共耗时 1-2 小时（含等待 + 网络下载），其中至少 50% 时间是 vibeflow UX 缺陷（无 spinner / 网络超时 / timeout 5 分钟）。

---

## 9. 一句话总结

> v0.1 跑完了第一次端到端实战，**vibeflow 的核心设计（跨模型评审 / 文档驱动 / 角色解耦 / 人工门禁）经受住了考验**，但产品体验上的 8 个 polish 项（无 spinner / 5 分钟超时 / patch 落盘检测缺失等）必须修，才能让下一个用户跑得更顺畅。

下一步推荐：**先做 P0 polish 四件（#48/#49/#51/#52），让 v0.2 上线时跑得不再被 v0.1 的 UX 缺陷拖累**。
