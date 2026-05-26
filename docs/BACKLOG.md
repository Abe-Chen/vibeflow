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

## 已知遗留（FlipClockApp 实战项目）

- `./gradlew :app:assembleDebug` 曾跑 57 分钟最终 BUILD FAILED；用户本机 Android Studio 环境也有问题
- Gradle Wrapper 已切腾讯云镜像
- `FlipClockView.kt` patch 已 apply（+175/-18），但未做 lint/test/build 验证
- 待用户修好 Android Studio 环境后单独处理
