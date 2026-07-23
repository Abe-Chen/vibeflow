# vibeflow Backlog

> 任务清单单一事实来源。此前只存在于会话记忆里，现落盘到项目。

## v0.1 polish

### ✅ 已完成

- **#48** SpawnAdapter spinner（ora + 已耗时/剩余超时显示，非 TTY 自动降级）
- **#49** init 生成 config.yaml 默认 `timeout_ms=900000`（三家模型都加）
- **#51** prompt 禁止英文思考前言（DOC_OUTPUT_INSTRUCTION + CODE_OUTPUT_INSTRUCTION 加约束）
- **#52** develop/fix 加 git diff 落盘检测（stage-runner `checkCodeChangeApplied`，过滤 `.ai-dev/` 和 `docs/ai-workflow/`）
- **#54** config.yaml `commands.test/build/lint` 空数组检测 + 提醒
  - `doctor` 新增「项目命令配置」段，逐项显示并在缺失时告警
  - stage-runner 在 `test` 阶段缺 `commands.test` 时显著告警；`develop/fix` 缺 build/lint 给软提示
  - init 模板补了配置示例注释
- **#50** 阶段级 timeout 配置
  - config.yaml 新增 `stage_timeouts`（init 模板默认 `develop/fix: 1800000`）
  - `resolveStageTimeout(config, stageId)`；stage-runner 解析后以 `timeoutMs` 传入 `adapter.run`，并打印「超时: Ns」行
  - 优先级：`stage_timeouts[stage]` > 模型级 `timeout_ms` > 默认 5min
- **#41** requirement 输入增强
  - `-F, --from-file <path>`：从文件读入需求正文（相对路径基于项目根）
  - `--edit`：打开 `$EDITOR` 撰写（已有非占位产物会预填；`# vibeflow-edit:` 前缀行忽略）
  - 自动检测：无 `-m/--from-file/--edit` 时，若任务的 `00_requirement.md` 非占位则用作输入
  - 优先级：`--from-file` > `--edit` > `-m` > 自动检测；都没有则给友好报错
- **#53**（P2）init/doctor 工具链 ready-check
  - 新增 `src/core/ready-check.ts`：`commandExists`（含路径分隔符→查文件，否则 `which`）、`toolchainTargets`（从 package_manager + commands 推断工具集，去重合并来源）、`runReadyCheck`
  - `doctor` 新增「工具链就绪检测」段，逐项 ✓/✗ 显示解析路径与来源
  - `init` 探测后对识别到的包管理器 CLI 做轻量检测并告警

> ✅ **v0.1 polish 全部完成**（P0 四件 + P1 三件 + P2 一件）。

## 方案交付模式 deliver（2026-05-26，用 vibeflow 自己 dogfood 实现）

**已完成**（requirement→plan→plan-review→finalize→develop 全程走 vibeflow 自己，develop 由人按锁定方案手动落地）：
- 新增软终态 `RunStatus = 'delivered'` + `run.json.meta.delivered_at`（`src/core/run.ts`）
- 新增 `src/core/deliver.ts`（getDeliverability/assertDeliverable/markDelivered）+ `src/cli/commands/deliver.ts` + 注册
- 门禁：finalize 已锁定 + develop 及之后全 pending；幂等；拒绝文案区分"未锁定"/"已进开发"
- `stage-runner.pickFeature` 加 `stageId`（仅 develop 放行 delivered）；develop 续接时 `delivered → in_progress` 且保留 delivered_at
- `advance` finalize 后提示"继续开发 / 交付收尾"两条路；`status` 显示 `📦 方案已交付（可继续开发）`
- 文档同步：README / USAGE §6.6 / TECH_DESIGN
- 验收：核心 7 条实测通过（未锁定拒绝/成功/delivered_at/已开发拒绝/幂等/📦/续接保留）

**dogfood 沿途又验证/发现**：
- ✅ 验证了 #3（requirement 待确认项分级生效）、#4（plan 注入 human_decisions 生效，codex 明确"严格遵守"决策）
- ⏳ 待修：`plan_review` 阶段同样未注入 human_decisions（#4 兄弟问题；claude 会主动读 04 弥补，但不该依赖模型主动性）
- ✅ **develop 自动落盘短板已攻克**（2026-05-26）：根因有二——① adapter 朴素 headless 调用没给写权限；② `CODE_OUTPUT_INSTRUCTION` 主动禁止写文件、要求输出 patch（v0.1 临时设计）。修复：develop/fix 注入 codex `--sandbox workspace-write` / claude `--permission-mode acceptEdits`（实测均能落盘）+ prompt 翻转为"直接改文件"+ 落盘检测过滤排除 vibeflow 自产文件（CLAUDE.md/AGENTS.md/docs/）。e2e 实测：codex 经 vibeflow develop 真创建文件、落盘检测精确识别。
  - ✅ gemini 落盘也已解决（2026-05-26）：`-p` 无值+stdin 会报 "Not enough arguments following: p"，改为 `--prompt ""` 空值占位+stdin（base.ts 保留空串参数避免被过滤）；`--skip-trust` 信任当前工作区，防 yolo/approval 被降级回 default；develop/fix 加 `--approval-mode yolo`。e2e 实测 gemini 经 vibeflow develop 真落盘。**至此 codex/claude/gemini 三家 headless 均可经 vibeflow develop 落盘。**
- ⏳ 待补：引入测试框架 + 为 `assertDeliverable` 门禁补最小单测（项目目前无测试框架）

## v0.2（2026-06-12）：阶段重跑 --force + next 导航

### ✅ 已完成

- **阶段重跑 `--force`**：补齐"已完成阶段无法重跑"的缺口（此前代码里是 `--force（待实现）`，只能手改 run.json）。
  - `stage-runner.ts`：已完成阶段加 `--force` 放行重跑；**级联**把其后所有 `completed` 阶段重置为 `pending`（输入已过时），只重置 completed、不动用户主动 `skipped` 的阶段；任务若已 `done`/`delivered` 则自动重开为 `in_progress`。重跑后可正常 chain 一路重做下游。
  - `stages.ts`（8 个阶段命令）+ `requirement.ts` 均加 `--force` 选项（`-f` 已被 `--feature` 占用，故无短选项）。
  - 与 `change-request` 分工：`--force` 通用、可针对任意已完成阶段（含 plan/finalize 推翻方案）；`change-request` 专用于已收尾任务、固定从 develop 重开、不动已锁定方案。
  - 文档同步：CAPABILITIES「灵活性」+ USAGE §6.7 + 版本 bump 0.1.0→0.2.0（package.json + cli/index.ts）。

- **`vibeflow next` 导航引导**（V2「认知引导」首项落地）：读 `run.json` 纯本地推断"下一步该跑什么命令"，不调模型。
  - `core/next-advisor.ts`（纯函数 `adviseNext(state)→{headline,commands,reason,finished}`，便于复用/测试）+ `cli/commands/next.ts`（紧凑进度条 + 渲染 + 0/1/多任务处理）。
  - 覆盖状态：created→requirement、pending→该阶段、human_gate in_progress→advance（finalize 额外给 deliver）、blocked（develop/fix 先 git diff）、failed→重跑、done→change-request、delivered→develop 续接。
  - 多任务逐个列下一步、`next -f` 钻取；无活跃任务时列已收尾任务并引导。7 个状态场景实测通过。
  - 文档同步：CAPABILITIES 命令表（21→22）+「尚未具备」标记 next 已实现 + USAGE §4.6.1。
  - 剩余「认知引导」未做项：路径互通、`plan-status`。

## 探索池（多模型并行出方案）实现完成（2026-06-13）

按 `docs/designs/multi-model-explore-pool/` 设计 10 步分步实现，每步 typecheck/build + 独立 commit：

- [1] run.ts 类型 + explore-state（ensureExploreState / isFinalPlanLocked / allocate / register / accept / resetDownstream）
- [2] output-artifact 抽取 + explore-input 安全读取（脱敏 / 越界与敏感文件拒绝）
- [3] adapters quiet 参数 + parallel-plan 并发 runner（orchestrator 统一写 run.json）
- [4] plan --multi / --models 接入 + 决策菜单 + awaiting_accept 防绕过
- [5] accept-plan（复制为 01_plan_v1 + 来源标注 + 重置下游 + chain）
- [6] advance / next 的 explore 防绕过
- [7] consult / synthesize（单模型 explore runner）
- [8] finalize 锁定标记 + change-request 放宽到锁定任务
- [9] status 探索池摘要 + CAPABILITIES / USAGE 文档
- [10] 验证

**真实模型端到端验证通过**：plan --multi(codex+claude) → 部分失败语义（1 成功即 awaiting_accept）→ 防绕过 → accept-plan → next 引导。
**仍未做（设计 P2 预留）**：`plan --multi-extend` / `plan --add` / `plan-status` / 自动 Judge。

## 📥 产物自动呈现 + 浏览态格式转换（需求池，2026-06-15 整理，未实现）

> 来源：用户实际使用痛点——每次方案类阶段跑完，仍要手动去 `docs/ai-workflow/<feature>/` 找文件、再手动打开看；且管理用 markdown，但看长方案时源文件没渲染，读着累。
> **本条目仅为需求记录，未进入实现。** 决策已和用户对齐（见下「关键决策」）。

### 场景 → 需求 → 功能

- **场景**：`plan` / `plan-review` / `finalize` / `deliver` 等方案类阶段成功后，用户想立刻读这一版方案；多模型并行（`plan --multi`）时还有多个候选文件，找+打开更麻烦。
- **痛点两层**：①「找文件 + 打开」是重复手工动作；②markdown 源文件在编辑器里看，标题/表格/折叠/Mermaid 未渲染，长方案阅读体验差。
- **需求**：阶段产物「自动呈现 + 以更易读的形态呈现」，但**管理仍以 markdown 为单一真相源不变**。

### 拆成两个可独立交付的子需求（分期）

**A — 产物自动呈现（先做，零外部依赖，价值立竿见影）**
- 方案类阶段成功后，自动用系统默认程序打开对应产物（macOS `open`）。
- 触发范围：**所有方案类阶段**（plan / plan-review / finalize / deliver）——已和用户确认（不含 develop/fix/code-review/test，避免打扰）。
- 多产物处理：`plan --multi` / 探索池场景下打开什么待设计（候选全开 vs 汇总对比页），A 期可先只打开主产物，多产物对比留给 B。
- 开关：建议 config.yaml 加 `auto_open`（默认开、可关、可覆盖阶段范围），非 TTY / CI 自动禁用。

**B — 浏览态格式转换（A 的增强，分两步：先 HTML 后飞书）**
- **B1 本地 HTML（先做）**：md → 带样式 HTML（标题锚点/目录/折叠/代码高亮/Mermaid），浏览器秒开、离线、零损耗、样式可控。打开的是渲染版而非源文件。A 期的「自动打开」在 B1 落地后改为打开 HTML。
- **B2 飞书文档（后做，作为"要分享给团队时"的第二通道）**：md → 自动同步飞书文档，手机可看/可评论/可转发。
  - **已知代价（需求阶段就记清）**：要联网 + 走飞书 API；md→飞书有格式损耗（代码块/嵌套表格/Mermaid 常丢）；是**单向快照**——飞书里改的不回流 md；有上传延迟。
  - 因此 B2 不替代 B1，二者服务不同场景（B1=自己快速浏览，B2=对外分享/协作）。

### 关键决策（已和用户对齐 2026-06-15）

1. **最终浏览形态**：两个都要、分期——先本地 HTML 满足自己快速浏览，飞书作为对外分享第二通道后续加。
2. **触发时机**：所有方案类阶段（plan / plan-review / finalize / deliver）自动打开；代码/测试类不自动弹。
3. **需求池落地**：本 BACKLOG.md（贴近代码）。

### 待设计/待确认（进入实现前再定）

- 「自动用编辑器打开」与「转 HTML/飞书」本质冲突：目标若是 HTML 应用浏览器打开。最终形态决定打开方式——A 期先打开 md（编辑器），B1 落地后切到打开 HTML（浏览器）。
- 多产物（`plan --multi` / 探索池）的呈现方式：候选并列对比页 or 逐个打开。
- HTML 渲染选型：纯静态生成（markdown-it + 模板）vs 引轻量库；Mermaid 是否内联渲染。
- 飞书通道复用已有飞书工具链（见记忆 `reference_lark_message_channel` / `feedback_lark_doc`），需先读 skill 文档、用 Lark-flavored Markdown。
- 实施粒度：自动呈现逻辑应收敛在 stage-runner 成功分支的一个统一钩子，避免散落各阶段命令。

## 桥接合并 + agent 配合增强（2026-06-17，已完成 commit d946282）

> 来源：用户希望 Claude / Codex 与 vibeflow 更好配合。结论——**不做 Claude skill**（项目根 `CLAUDE.md` 本就被 Claude Code 自动读取、init 已生成桥接，再做 skill 是重复 + 破坏单一真相源），而是优化桥接本身让任何 agent 双受益。

- **桥接标记块化**：`templates/bridges.ts` 的 CLAUDE.md/AGENTS.md 内容包进 `<!-- BEGIN/END vibeflow -->` 标记（与 profile sync-claude 同模式），新增 `upsertBridgeBlock()`。
- **init 合并而非跳过**：`commands/init.ts` 对已存在的 CLAUDE.md/AGENTS.md 不再整体跳过，改为只插入/更新标记区块（幂等，再 init 不重复追加；`--force` 仍整体覆盖）。解决「已有自己 CLAUDE.md 的存量项目里 Claude 看不到 vibeflow」（典型：某 Flutter 存量项目已有自己的 CLAUDE.md，只有 AGENTS.md 是桥接 → Codex 知道而 Claude 不知道）。
- **桥接引导用双重克制措辞**：① vibeflow 可选、不是所有需求都走它，仅当有 in_progress/blocked 任务时才用 `next`/`status`；② `next` 仅顺流参考、用户指令优先（退回/改方案/重做用 `--force`，不让工具建议压过用户判断）。避免「以工具输出为准」这类强措辞让 agent 犯轴。
- 已同步文档：README（init 注释 + 状态项）、本 BACKLOG。USAGE 暂未单列桥接小节（现有零散提及，按需再补）。

## V1 之后 / V2

- `lock-plan` 严格化：hash + `.locked` 标记（当前是软门禁——只校验「非占位 + finalize 已 advance」）
- Git Manager：diff 摘要 + 分支管理 + worktree
- Path Resolver：自动识别 `related_paths`
- `change_request` 流程：开发中发现 final_plan 有问题时的支线
- 本地 Web Console
- 多模型并行方案 / Judge Agent（PRD §15.3 + TECH_DESIGN §5.9）

## 回归测试发现（某生产级 iOS + Supabase/Deno 项目，2026-05-25）

> 第二次真实回归：某生产级 iOS + Supabase/Deno monorepo 项目。跑到方案锁定为止。

### ✅ 已修

- **project-scanner 对深层/monorepo 项目几乎失效** → 已重写
  - 旧版三个问题：目录树深度仅 3（Swift 在 `ios/App/App/*.swift` 深度 4 被排除）；源码采样只认 `src/lib/app`（`ios/`、`supabase/` 不在白名单）；manifest 只在根目录找固定清单（`.xcodeproj`/`deno.json`/`supabase/` 都不认）→ 结果"源码数=1、技术栈未识别"
  - 修法：统一一次遍历（深度 5）；源码采样改为"全树收集→按优先级取前 N"（PRIORITY_DIRS 加 ios/supabase/functions/Sources 等）；manifest 支持子目录 + 加 deno.json；detectStack 基于 manifest + 目录特征（`.xcodeproj`/`.xcworkspace`→swift/ios，`supabase/`→supabase，`deno.json`→deno）
  - 验证：该项目从"源码 1/未识别"→"源码 32/swift,ios,supabase,deno"，30 采样覆盖全部 Swift + Edge Functions
- **learn 只做文件名级密钥过滤，源码硬编码的密钥会进 prompt/日志** → 加内容级脱敏
  - 暴露场景：扫描变深后，采到 `AppConfig.swift` 里硬编码的 Supabase anon key(JWT)
  - 修法：`redactSecrets()` 对采样和 manifest 内容脱敏（JWT/sk-/AKIA/AIza/gh_/xox- 高置信模式 + 敏感变量名赋值的长字面量），应用于 collectCodeSamples 和 readManifests
  - 验证：AppConfig.swift 的 JWT → `[REDACTED]`，正常代码不误伤
- **requirement 阶段过度发散**（#3）→ 待确认项分级
  - 现象：把清晰需求（两种模式+反哺）拆出 10 个待确认项却不分主次，叠加追问方式，让用户产生"需求被复杂化/聊偏了"的体感
  - 修法：REQUIREMENT_PROMPT 要求"需要人工确认的问题"分两级——**阻断性决策**（卡住方案方向的，精简 2-5 条）/ **可延后项**（实现细节，plan/finalize 再定）
  - 验证：新 init 的 requirement.md 含分级措辞
- **plan 阶段不注入 human_decisions**（#4）→ human_gate 的用户决策传不到紧接着的 plan
  - 现象：plan 的 context 只注入 requirement_file/project_rules/related_paths，human_decisions_file 只在 finalize/develop 才注入；requirement(human_gate) 后用户拍板的决策 plan 读不到
  - 修法：context.ts 的 plan fileVars 加 human_decisions_file；PLAN_PROMPT 加 {{human_decisions_file}} 输入引用 + "硬约束"措辞
  - 验证：新 init 的 plan.md 含 human_decisions_file ×2；本次回归靠"决策追加进 00_requirement.md"绕过

### ⏳ 待修（非阻断，记录）

- detectProjectMeta（init）同样只看根目录 manifest，对 iOS/monorepo 识别为空 language —— 与 scanner 同源，影响小（仅 config.yaml 的 project.language 字段）。可参照 scanner 的特征识别思路修。

### 🎯 本轮回归结论（方案阶段，匿名项目）

- **核心假设验证通过**：文档驱动 + 跨模型评审有真价值，水准≥FlipClockApp 那次。
- requirement（claude）：把口语需求结构化为三场景 + P0-P2，读了代码（复用现有置信度分级），主动暴露版权/审核/置信度适配等真问题。
- plan（codex）：双路径架构精准落地，不鲁莽改 candidates.ts（P1 才动 + recognition_hint），自定义开放识别置信度分级，自己预判"候选膨胀→需向量召回"。
- **plan-review（claude，跨模型）= 决定性证据**：真读代码（精确行号），抓出 codex 没看到的真 bug——B2（新列 NOT NULL 破坏现有"故宫10件"insert）、M3（文件清单说不改 doubao.ts 但 P1 公共复用必须改→方案自相矛盾）、M4（审核通过只 ALTER objects 没写 object_contents→识别命中介绍为空）；且客观（指出 codex 过度声称改动面、也肯定其做对处）。
- 跑到 plan-review 止（用户选），未跑 finalize（需用户回答一批真实产品决策）。

## 🔧 生产级项目全流程实战暴露的改进点（2026-05-27，按优先级）

> 来源：用 vibeflow 完整做完该项目两个 feature（含 develop 真落盘 + 大量真机测试）后的系统复盘。均为真实发生的问题，非臆测。

### P0 — develop 阶段可靠性（这次踩得最多）

- ✅ **超时即判 failed，丢失已落盘成果**（2026-05-27 已修）：该项目首次 develop 跑满 30min 超时被 kill，但 codex 已落盘 ~500 行 → 判 failed 要人工救回。
  - 已改：`stage-runner.ts` case 'timeout' 对 develop/fix 先跑 `checkCodeChangeApplied`——有落盘→标 `blocked`（保留成果，提示 git diff review / advance / 重跑）；无落盘→仍 `failed`（提示调 stage_timeouts 或拆小任务）。两向均测过（有落盘→blocked、无落盘→failed）。
- ✅ **develop 产出无编译验证→codex 臆测 SDK API**（2026-05-27 已修，commit 7e903ee）：develop/fix 落盘后自动跑 `config.commands.build`，失败→blocked+回灌错误尾部、成功→completed（未配则跳过）；DEVELOP/FIX prompt 加"不要臆测三方 API、按锁定版本真实签名写"约束。两向验证通过。
- ✅ **change_request 流程缺失**（2026-05-27 已修）：`vibeflow change-request -m "<原因>"` 对 done/delivered 任务发起变更——记录到 `run.json.change_requests[]` + `change_requests.md`，重开到 develop（develop/fix 阶段注入 change_requests_file），引导走轻量修订。进行中任务拒绝。验证通过。

### P1 — 上下文与协作

- **plan_review 未注入 human_decisions**（#4 兄弟问题）：claude 会主动读 04 弥补，但不该依赖模型主动性。改 `context.ts` 的 plan_review fileVars。
- **多 feature 工作区耦合无防护**：该项目两个 feature 的改动混在工作区、无法独立 diff/commit，code-review 才发现耦合。vibeflow 无"feature 间改动隔离/依赖声明"机制。worktree 隔离（V2 已规划）可缓解。

### P2 — 真实环境衔接

- **test 阶段对"需真机/真实环境"项目无能为力**：该项目的 test 全靠人工真机验证（iOS 需 Xcode、识别需真实拍摄+后端），vibeflow 只能 skip。test 阶段对这类项目应产出"人工验收清单"而非尝试自动跑。
- **后端部署/迁移衔接**：develop 写了 Edge Function + SQL 迁移，但部署/apply 全靠用户手动（且 Supabase 免费项目会被回收→NXDOMAIN，重启需补 apply 后加迁移）。可在 archive/handoff 产出"部署清单"提醒。
- **长期文档生命周期管理（用多了才显现）**：每个 feature 在 `docs/ai-workflow/<feature>/` 留 11 个文件（00–09 产物 + run.json），archive 不移动/不归档——内容不会乱（目录隔离 + 文件名标准化），但跑几十上百个 feature 后会**平铺膨胀**：所有目录堆在一层、`status` 把 done 的也全列出、无活跃/归档区分、找历史只能靠目录名。
  - 改法（轻→重）：①`status` 默认只显示活跃任务（created/in_progress/blocked），done/delivered 折叠，`--all` 全显示；②`archive` 把 done 的 feature 目录移到 `docs/ai-workflow/_archived/`，活跃区只留进行中；③按年月/模块分目录 + 总索引 `INDEX.md`。
  - 建议组合：①+②（status 默认看活跃 + archive 自动归档），改动小、解决主要痛点。短期（几个 feature）不影响，无需急做。

### 已在本轮修复

- ✅ 落盘检测过滤 CLAUDE.md/AGENTS.md/docs/（`ba4fbaf`，消除误报）
- ✅ develop/fix 三家 CLI 真落盘 + prompt 翻转（`ba4fbaf`/`2afd747`）

## 已知遗留（FlipClockApp 实战项目）

- `./gradlew :app:assembleDebug` 曾跑 57 分钟最终 BUILD FAILED；用户本机 Android Studio 环境也有问题
- Gradle Wrapper 已切腾讯云镜像
- `FlipClockView.kt` patch 已 apply（+175/-18），但未做 lint/test/build 验证
- 待用户修好 Android Studio 环境后单独处理
