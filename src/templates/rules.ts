export const PROJECT_RULES = `# 项目规则（project_rules.md）

> 本文件由 vibeflow 在 init 时生成，请按项目实际情况补充。
> 所有阶段的 Agent 都会读取这份规则。

## 项目概览
- 项目名称: TODO
- 主要技术栈: TODO
- 包管理器: TODO（npm / pnpm / yarn / pip / poetry / cargo / ...）

## 代码规范
- TODO: 命名规范、目录结构、错误处理风格
- TODO: 注释要求

## 不可触碰的红线
- TODO: 不能改动的关键模块或文件
- TODO: 不能未经确认就执行的操作（数据库迁移、删除、push、发布）

## 测试要求
- TODO: 提交前必须运行的命令
- TODO: 覆盖率要求

## 安全与隐私
- TODO: 敏感数据处理要求
- TODO: 密钥、环境变量、证书的存放规则
`;

export const CODING_RULES = `# 编码规范（coding_rules.md）

> 列出本项目特有的编码规则，避免每次让 AI 都重新摸索。

## 通用
- TODO: 代码风格、格式化工具

## 语言相关
- TODO

## 框架相关
- TODO
`;

export const PRODUCT_RULES = `# 产品规则（product_rules.md）

> 列出产品层面的硬性约束，让 AI 不会越界做产品决策。

## 用户体验红线
- TODO: 必须保留的核心交互
- TODO: 不允许的交互模式

## 业务边界
- TODO: 涉及付费、账号、权限、数据迁移时必须人工确认
`;
