export const DEFAULT_CONFIG_YAML = `# vibeflow 项目配置
# 文档: https://github.com/Abe-Chen/vibeflow

version: 1

project:
  name: ""
  language: ""
  package_manager: ""

defaults:
  workflow: standard_feature
  require_final_plan_lock: true
  developer_single_owner: true

# 模型供应方
# 默认采用 spawn 调用各家 CLI 的非交互模式
# 用户也可对单阶段切换到 export 模式（生成 prompt 文件，手动执行）
models:
  claude:
    type: cli
    command: claude
    invoke_mode: spawn        # spawn | export
    headless_flag: "-p"       # claude -p "<prompt>"
    output_format: text       # text | json
    timeout_ms: 900000        # 15 分钟（评审/qa 等阶段读多份产物可能超 5 分钟）
    capabilities: [requirement, plan, review, code_review, qa, document]

  codex:
    type: cli
    command: codex
    invoke_mode: spawn
    subcommand: exec          # codex exec "<prompt>"
    timeout_ms: 900000        # 15 分钟（develop/fix 阶段生成代码 patch 通常需要 5-10 分钟）
    capabilities: [plan, develop, finalize, shell]

  gemini:
    type: cli
    command: gemini
    invoke_mode: spawn
    headless_flag: "-p"       # gemini -p "<prompt>"
    timeout_ms: 900000        # 15 分钟（与 claude/codex 对齐）
    capabilities: [review, qa, research, long_context]

# 角色到模型的映射，可被命令行 --model 覆盖
roles:
  product_analyst:
    default_model: claude
    fallback_models: [gemini]

  planner:
    default_model: codex
    fallback_models: [claude]

  plan_reviewer:
    default_model: claude
    fallback_models: [gemini]

  finalizer:
    default_model: codex
    fallback_models: [claude]

  developer:
    default_model: codex
    fallback_models: [claude]

  code_reviewer:
    default_model: claude
    fallback_models: [gemini]
    must_be_different_from_developer: true

  qa:
    default_model: claude
    fallback_models: [codex]

# 质量门禁
quality_gates:
  require_requirement_confirm: true
  require_final_plan_lock: true
  require_code_review: true
  require_test_report: true

# 阶段级超时（毫秒），覆盖模型级 timeout_ms。
# develop/fix 要真正生成并落盘代码，通常比评审/需求阶段更久，给更长超时。
# 未在此列出的阶段，回退到对应模型的 timeout_ms（默认 900000）。
stage_timeouts:
  develop: 1800000   # 30 分钟
  fix: 1800000       # 30 分钟

# 项目级测试与构建命令
# 留空会在 doctor 和相关阶段提醒：test 阶段缺 commands.test 时无法实际运行测试。
# 示例（按项目类型选一种）：
#   commands:
#     test: ["npm test"]            # Node/TS
#     build: ["npm run build"]
#     lint: ["npm run lint"]
commands:
  test: []
  build: []
  lint: []
`;
