/**
 * learn 命令的两份 prompt 模板。
 * 都要求模型用固定分隔符输出三段，便于解析。
 */

export const LEARN_OUTPUT_FORMAT = `## 输出格式要求（必须严格遵守）

请输出三份 Markdown 文档，用以下精确分隔符分段。每个分隔符必须独占一行，前后各空一行。

\`\`\`
<<<PROJECT_RULES>>>
# 项目规则
...内容...

<<<CODING_RULES>>>
# 编码规范
...内容...

<<<PRODUCT_RULES>>>
# 产品规则
...内容...

<<<END>>>
\`\`\`

约束：
- **必须基于真实观察到的项目信息，不要编造**。无法从快照中确定的细节，写 "TODO: <具体待补充的问题>" 而不是猜测。
- 不要在分隔符之外输出额外文字（不要前言、不要总结）。
- 三段都必须输出，即使某一段几乎全是 TODO 也要输出（保留章节结构）。
- 不要在分隔符标记里加 \` 反引号或其他符号。
`;

export const LEARN_EXISTING_PROMPT = `你是经验丰富的项目分析专家。基于下面的项目快照，为这个项目生成三份 vibeflow 规则文档草稿。

# 项目快照

{{project_snapshot}}

# 任务

为以下三份文档生成草稿：

## 1. project_rules（项目规则）
必须包含的章节：
- **项目概览**：项目名、推测的产品定位、主要技术栈、包管理器、运行环境要求
- **目录结构**：基于实际目录树，说明每个主要目录的职责（src/ 是什么、lib/ 是什么）
- **不可触碰的红线**：基于代码观察识别出的关键文件/模块（如数据库迁移、auth 中间件、支付逻辑），列出哪些操作必须人工确认
- **测试要求**：基于 package.json scripts 或类似配置，列出提交前必须运行的命令
- **安全与隐私**：基于 .gitignore 和源码观察，说明敏感数据处理要求

## 2. coding_rules（编码规范）
必须包含的章节：
- **通用风格**：基于代码采样推断的命名规范、缩进、引号风格、分号约定
- **语言相关**：针对该项目主要语言的特定约定（TypeScript 严格模式？async 处理风格？错误处理风格？）
- **框架相关**：如果识别出框架（React/Flutter/Next.js 等），列出框架使用的项目特定约定
- **注释要求**：基于现有代码注释密度，给出建议

## 3. product_rules（产品规则）
必须包含的章节：
- **产品定位**：基于 README 和 commits，推断这是 ToC/ToB、付费/免费、什么品类
- **用户体验红线**：列出从代码或 README 能看出的核心交互（不能丢失的功能）
- **业务边界**：涉及付费、账号、权限、数据迁移时必须人工确认（这是 vibeflow 的通用红线，但根据该项目可补充具体场景）

# 输出准则
- 长度控制：每份 200-400 字之间。不要凑字数。
- 真实优先：宁可写 "TODO: 我没看到 lint 配置，请补充" 也不要凭空写 "应该使用 ESLint"。
- 引用证据：关键判断后面可以括号注明依据，例如 "（依据：package.json 中包含 react-router-dom）"。

${LEARN_OUTPUT_FORMAT}
`;

export const LEARN_NEW_PROJECT_PROMPT = `你是产品咨询师 + 技术架构师。用户正在启动一个新项目，目前还没有代码。

# 用户的项目愿景

{{vision}}

# 项目快照（可能很稀疏，因为是新项目）

{{project_snapshot}}

# 任务

基于愿景生成三份 vibeflow 规则文档草稿。因为还没代码，coding_rules 和 project_rules 主要写"原则方向"和清晰的 TODO 占位；product_rules 应该相对完整，因为愿景是产品视角的。

## 1. project_rules（项目规则）
- **项目概览**：从愿景推断的项目名、定位、目标平台、推荐技术栈
- **目录结构**：如果技术栈明确，列出建议的初始目录结构
- **不可触碰的红线**：写 "TODO: 项目启动后由架构师确认"，并提示几个常见红线类别
- **测试要求**：写 "TODO: 选定技术栈后补充"，并提示需要决定的事项
- **安全与隐私**：基于愿景列出已知的合规/隐私要求（例如 ToC 涉及个人数据）

## 2. coding_rules（编码规范）
- 大量 TODO 占位，但每条 TODO 必须具体（例如 "TODO: 是否启用 ESLint? 如果启用使用哪个配置？"）
- 给出一些通用原则建议（如 "命名清晰胜过简洁"）

## 3. product_rules（产品规则）— 这是这个模式的重点
- **产品定位**：ToC/ToB、付费模型、目标用户、关键场景
- **用户体验红线**：基于愿景描述的关键交互
- **业务边界**：付费、账号、权限、隐私相关的硬约束
- **不做范围**：明确列出项目不会做的事

# 输出准则
- 不要为了让 product_rules 显得丰满而编造细节，找不到的部分写明确的 TODO。
- 不要超出愿景的范畴提出新产品方向。

${LEARN_OUTPUT_FORMAT}
`;

/**
 * 把模型输出按分隔符切成三段。容错：分隔符缺失时整段塞到 project_rules。
 */
export interface ParsedLearnOutput {
  projectRules: string;
  codingRules: string;
  productRules: string;
  parsedCleanly: boolean;
  rawOutput: string;
}

export function parseLearnOutput(raw: string): ParsedLearnOutput {
  const markers = ['<<<PROJECT_RULES>>>', '<<<CODING_RULES>>>', '<<<PRODUCT_RULES>>>', '<<<END>>>'];
  const positions = markers.map((m) => raw.indexOf(m));

  // 至少要找到前三个分隔符
  if (positions[0] === -1 || positions[1] === -1 || positions[2] === -1) {
    return {
      projectRules: raw.trim(),
      codingRules: '# 编码规范\n\n> TODO: 模型未按格式输出 coding_rules，请手动补充或重新生成（vibeflow learn）\n',
      productRules: '# 产品规则\n\n> TODO: 模型未按格式输出 product_rules，请手动补充或重新生成（vibeflow learn）\n',
      parsedCleanly: false,
      rawOutput: raw,
    };
  }

  const endPos = positions[3] !== -1 ? positions[3] : raw.length;
  const projectRules = raw.slice(positions[0] + markers[0].length, positions[1]).trim();
  const codingRules = raw.slice(positions[1] + markers[1].length, positions[2]).trim();
  const productRules = raw.slice(positions[2] + markers[2].length, endPos).trim();

  return {
    projectRules,
    codingRules,
    productRules,
    parsedCleanly: true,
    rawOutput: raw,
  };
}
