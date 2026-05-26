export const STANDARD_FEATURE_WORKFLOW = `id: standard_feature
name: 普通功能开发
description: 适合大多数标准功能，需要方案评审、代码评审、测试报告
stages:
  - id: requirement
    role: product_analyst
    output: 00_requirement.md
    human_gate: true
  - id: plan
    role: planner
    output: 01_plan_v1.md
  - id: plan_review
    role: plan_reviewer
    output: 02_plan_review.md
  - id: finalize
    role: finalizer
    output: 03_final_plan.md
    human_gate: true
    lock_artifact: true
  - id: develop
    role: developer
    output: 05_implementation_report.md
    requires_locked_plan: true
  - id: code_review
    role: code_reviewer
    output: 06_code_review.md
  - id: fix
    role: developer
    input: 06_code_review.md
    output: 07_fix_report.md
    policy: only_blocker_and_approved_major
  - id: test
    role: qa
    output: 08_test_report.md
  - id: archive
    role: product_analyst
    output: 09_release_note.md
`;

export const QUICK_FIX_WORKFLOW = `id: quick_fix
name: 快速修复
description: 适合小 bug、小文案、小样式
stages:
  - id: requirement
    role: product_analyst
    output: 00_requirement.md
  - id: develop
    role: developer
    output: 05_implementation_report.md
  - id: code_review
    role: code_reviewer
    output: 06_code_review.md
  - id: test
    role: qa
    output: 08_test_report.md
`;

export const BUGFIX_WORKFLOW = `id: bugfix
name: 缺陷修复
description: 先复现定位，再修复，最后回归
stages:
  - id: requirement
    role: product_analyst
    output: 00_requirement.md
    human_gate: true
  - id: plan
    role: planner
    output: 01_plan_v1.md
  - id: finalize
    role: finalizer
    output: 03_final_plan.md
    human_gate: true
    lock_artifact: true
  - id: develop
    role: developer
    output: 05_implementation_report.md
    requires_locked_plan: true
  - id: code_review
    role: code_reviewer
    output: 06_code_review.md
  - id: test
    role: qa
    output: 08_test_report.md
`;
