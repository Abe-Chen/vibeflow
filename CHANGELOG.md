# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。

## [Unreleased]

## [0.3.0] - 2026-07-23

### Added

- 多模型并行出方案：`plan --multi`
- 探索池候选选择：`accept-plan`
- 单轮咨询与方案融合：`consult`、`synthesize`
- 探索池状态、防绕过和锁定边界
- 首批自动化测试、ESLint 和 GitHub Actions CI
- 开源社区、贡献与安全文档
- npm 发布元数据、受控打包范围和发布前校验

### Security

- 探索池 artifact 输入增加项目根目录边界检查，防止被篡改的路径读取工作区外文件

## [0.2.0] - 2026-06-12

### Added

- 阶段重跑：`--force`
- 下一步导航：`vibeflow next`

## [0.1.0] - 2026-05-27

### Added

- 需求、方案、评审、开发、修复、测试和归档完整流水线
- Claude、Codex、Gemini 与 Export Adapter
- 方案锁定、人工门禁和跨模型代码评审
- `learn`、`doctor`、`profile`、`deliver`、`change-request`、`handoff`
- develop/fix 真实落盘、Git diff 检测、构建验证和超时保护

[Unreleased]: https://github.com/Abe-Chen/vibeflow/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Abe-Chen/vibeflow/releases/tag/v0.3.0
[0.2.0]: https://github.com/Abe-Chen/vibeflow/releases/tag/v0.2.0
[0.1.0]: https://github.com/Abe-Chen/vibeflow/releases/tag/v0.1.0
