# 参与贡献

感谢你愿意改进 vibeflow。这个项目的核心目标是：让不同 AI 模型分别负责方案、开发和评审，降低同一个模型自写自审带来的盲区。

## 开始之前

- Bug、文档错误和小范围修复可以直接提交 Pull Request。
- 新命令、状态机变化、Prompt/Workflow 模板变化，请先开 Issue 说明场景、预期行为和兼容性影响。
- 安全问题不要开公开 Issue，请按 [SECURITY.md](SECURITY.md) 私密报告。
- 不要提交真实 API Key、Token、私有项目产物、`.env` 或用户代码。

## 本地开发

要求 Node.js 20 或更高版本。

```bash
git clone https://github.com/Abe-Chen/vibeflow.git
cd vibeflow
npm install
npm run verify
```

常用命令：

```bash
npm run dev -- --help
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
```

## 修改原则

- 保持 TypeScript strict、ESM 和现有代码风格。
- 相对 import 使用 `.js` 扩展名。
- 修复 Bug 时补能复现问题的测试。
- 用户可见行为变化必须同步 README 或 `docs/USAGE.md`。
- 不顺手重构无关代码，不在同一个 PR 中混入多个主题。
- `src/templates/` 会进入所有下游项目，修改时必须说明对已有项目和新项目的影响。
- `src/adapters/base.ts`、`src/core/project-scanner.ts` 和权限相关逻辑属于安全敏感区域，PR 必须解释威胁模型和验证方式。

## Pull Request 检查清单

- [ ] 说明了问题、根因和改动范围
- [ ] 没有提交密钥、私有路径或真实用户产物
- [ ] 新行为有测试或可复现的手动验证
- [ ] `npm run verify` 通过
- [ ] 相关文档已同步
- [ ] 没有不相关的格式化、依赖升级或重构
