# 安全策略

vibeflow 会读取项目文件、调用本地 AI CLI，并在部分阶段授权模型修改工作区。安全边界是产品的一部分。

## 支持范围

安全修复优先支持最新发布版本。尚未发布的 `main` 分支问题也欢迎报告。

## 私密报告漏洞

请使用 GitHub 仓库的 **Security → Report a vulnerability** 私密报告功能。公开仓库创建后，维护者应先启用 Private vulnerability reporting。

报告请包含：

- 受影响版本或 commit
- 可复现的最小步骤
- 实际影响和可能的攻击路径
- 建议修复方向（如有）

请不要在公开 Issue 中粘贴真实密钥、私有源码、完整日志或可直接利用的漏洞细节。

## 使用者需要知道的安全边界

- `requirement`、`plan`、`plan-review`、`finalize`、`code-review`、`test` 等阶段以读取和生成文档为主。
- `develop` 和 `fix` 会给对应 AI CLI 工作区写权限；具体权限还受各家 CLI 自身配置影响。
- Gemini Adapter 在写入阶段使用 `--approval-mode yolo`，并使用 `--skip-trust` 信任当前工作区。
- vibeflow 可能执行 `.ai-dev/config.yaml` 中用户配置的 build/test/lint 命令。
- 子进程会继承当前环境变量，以便各家 CLI 使用自己的认证状态。
- Prompt、stdout 和 stderr 会写入 `.ai-dev/logs/`；日志可能包含项目上下文或模型输出。
- `redactSecrets()` 和敏感文件过滤是尽力保护，不保证识别所有密钥格式。

建议始终在 Git 仓库中使用 vibeflow，执行写入阶段前保持工作区可回滚，并在进入下一阶段前检查 `git diff`。

如果不希望自动调用或授权本地 CLI，可使用 `--export` 只生成 Prompt，再到受控环境手动执行。
