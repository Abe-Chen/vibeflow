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

## V1 之后 / V2

- `lock-plan` 严格化：hash + `.locked` 标记（当前是软门禁——只校验「非占位 + finalize 已 advance」）
- Git Manager：diff 摘要 + 分支管理 + worktree
- Path Resolver：自动识别 `related_paths`
- `change_request` 流程：开发中发现 final_plan 有问题时的支线
- 本地 Web Console
- 多模型并行方案 / Judge Agent（PRD §15.3 + TECH_DESIGN §5.9）

## 回归测试发现（cultural 项目，2026-05-25）

> 第二次真实回归：cultural（iOS 原生 Swift + Supabase/Deno monorepo，文物识别 AR App）。跑到方案锁定为止。

### ✅ 已修

- **project-scanner 对深层/monorepo 项目几乎失效** → 已重写
  - 旧版三个问题：目录树深度仅 3（Swift 在 `ios/App/App/*.swift` 深度 4 被排除）；源码采样只认 `src/lib/app`（`ios/`、`supabase/` 不在白名单）；manifest 只在根目录找固定清单（`.xcodeproj`/`deno.json`/`supabase/` 都不认）→ 结果"源码数=1、技术栈未识别"
  - 修法：统一一次遍历（深度 5）；源码采样改为"全树收集→按优先级取前 N"（PRIORITY_DIRS 加 ios/supabase/functions/Sources 等）；manifest 支持子目录 + 加 deno.json；detectStack 基于 manifest + 目录特征（`.xcodeproj`/`.xcworkspace`→swift/ios，`supabase/`→supabase，`deno.json`→deno）
  - 验证：cultural 从"源码 1/未识别"→"源码 32/swift,ios,supabase,deno"，30 采样覆盖全部 Swift + Edge Functions
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

### 🎯 本轮回归结论（方案阶段，cultural）

- **核心假设验证通过**：文档驱动 + 跨模型评审有真价值，水准≥FlipClockApp 那次。
- requirement（claude）：把口语需求结构化为三场景 + P0-P2，读了代码（复用现有置信度分级），主动暴露版权/审核/置信度适配等真问题。
- plan（codex）：双路径架构精准落地，不鲁莽改 candidates.ts（P1 才动 + recognition_hint），自定义开放识别置信度分级，自己预判"候选膨胀→需向量召回"。
- **plan-review（claude，跨模型）= 决定性证据**：真读代码（精确行号），抓出 codex 没看到的真 bug——B2（新列 NOT NULL 破坏现有"故宫10件"insert）、M3（文件清单说不改 doubao.ts 但 P1 公共复用必须改→方案自相矛盾）、M4（审核通过只 ALTER objects 没写 object_contents→识别命中介绍为空）；且客观（指出 codex 过度声称改动面、也肯定其做对处）。
- 跑到 plan-review 止（用户选），未跑 finalize（需用户回答一批真实产品决策）。

## 🔧 cultural 全流程实战暴露的改进点（2026-05-27，按优先级）

> 来源：用 vibeflow 完整做完 cultural 两个 feature（含 develop 真落盘 + 大量真机测试）后的系统复盘。均为真实发生的问题，非臆测。

### P0 — develop 阶段可靠性（这次踩得最多）

- **超时即判 failed，丢失已落盘成果**：cultural 首次 develop 跑满 30min 超时被 kill，但 codex 已落盘 ~500 行 + 没来得及写 implementation_report → 判 failed，要人工补报告+改状态救回。
  - 改法：timeout（含被 kill）时也跑 `checkCodeChangeApplied`，若已落盘则标为"超时但有产出"（如 blocked 而非 failed）+ 提示用户 review 已落盘代码，不要当彻底失败丢弃。位置 `stage-runner.ts` case 'timeout'。
- **develop 产出无编译/类型验证，codex 会臆测 SDK API**：codex 在 spawn 沙箱里编译不了目标项目，对不确定的 API 直接猜——cultural 里 `createSignedURLs` 返回类型猜错、用了不存在的 `URL.percentEncodedPath` → 直接编译失败。code-review(claude) 抓到了一部分，但根因是 develop 无任何编译反馈。
  - 改法（探索）：develop 后若 config.commands.build 非空，自动跑一次 build 把编译错误回灌；或在 prompt 里强约束"不确定的三方 API 必须基于项目已 import 的版本核实，不可臆测签名"。
- **change_request 流程缺失**：cultural archive 后真机又测出一串 bug，全靠人工手改。vibeflow 设计文档提过 change_request 但无实现——"已锁定/已归档 feature 又要改"没有正规支线。
  - 改法：`vibeflow change-request -m` 在锁定后重开轻量评审→改→验证支线（PRD 已有设计）。

### P1 — 上下文与协作

- **plan_review 未注入 human_decisions**（#4 兄弟问题）：claude 会主动读 04 弥补，但不该依赖模型主动性。改 `context.ts` 的 plan_review fileVars。
- **多 feature 工作区耦合无防护**：cultural 两 feature 改动混在工作区、无法独立 diff/commit，code-review 才发现耦合。vibeflow 无"feature 间改动隔离/依赖声明"机制。worktree 隔离（V2 已规划）可缓解。

### P2 — 真实环境衔接

- **test 阶段对"需真机/真实环境"项目无能为力**：cultural 的 test 全靠人肉真机（iOS 需 Xcode、识别需真实拍摄+后端），vibeflow 只能 skip。test 阶段对这类项目应产出"人工验收清单"而非尝试自动跑。
- **后端部署/迁移衔接**：develop 写了 Edge Function + SQL 迁移，但部署/apply 全靠用户手动（且 Supabase 免费项目会被回收→NXDOMAIN，重启需补 apply 后加迁移）。可在 archive/handoff 产出"部署清单"提醒。

### 已在本轮修复（cultural 期间）

- ✅ 落盘检测过滤 CLAUDE.md/AGENTS.md/docs/（`ba4fbaf`，消除误报）
- ✅ develop/fix 三家 CLI 真落盘 + prompt 翻转（`ba4fbaf`/`2afd747`）

## 已知遗留（FlipClockApp 实战项目）

- `./gradlew :app:assembleDebug` 曾跑 57 分钟最终 BUILD FAILED；用户本机 Android Studio 环境也有问题
- Gradle Wrapper 已切腾讯云镜像
- `FlipClockView.kt` patch 已 apply（+175/-18），但未做 lint/test/build 验证
- 待用户修好 Android Studio 环境后单独处理
