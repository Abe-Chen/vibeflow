import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

export const PROFILE_DIR = path.join(os.homedir(), '.vibeflow');
export const PROFILE_FILE = path.join(PROFILE_DIR, 'profile.md');

export const DEFAULT_PROFILE = `# vibeflow 全局用户偏好

> 这份文件跨所有项目通用。所有 vibeflow 阶段命令会在调用模型前，把它注入到 prompt 顶部。
> 编辑: \`vibeflow profile edit\`，或直接编辑本文件。
> 同步到 Claude Code: \`vibeflow profile sync-claude\`

## 我是谁
- 角色: TODO（例如：独立开发者 / 产品经理型开发者 / 团队负责人）
- 主要技术栈: TODO
- 偏好工具链: TODO（例如：pnpm > npm，prettier，eslint）

## 代码偏好
- TODO: 代码风格偏好（简洁 vs 严谨、注释密度、错误处理风格）
- TODO: 我反感的模式（例如：过度设计、过度抽象、过度防御性编程）
- TODO: 命名约定偏好（蛇形/驼峰/帕斯卡）

## 协作偏好
- TODO: 你希望 AI 主动询问还是默默推进
- TODO: 你能接受多大长度的输出
- TODO: 是否允许 AI 自动执行测试/lint 命令
- TODO: 是否允许 AI 自动 git commit

## 红线（跨项目通用）
- 涉及付费/订阅/计费逻辑：必须人工确认
- 涉及账号/认证/权限：必须人工确认
- 涉及数据迁移/删除：必须人工确认
- 涉及生产环境配置：必须人工确认
`;

export interface ProfileStatus {
  exists: boolean;
  path: string;
  isPlaceholder: boolean;
  content: string | null;
}

export async function ensureProfileDir(): Promise<void> {
  await fs.ensureDir(PROFILE_DIR);
}

export async function loadProfile(): Promise<ProfileStatus> {
  if (!(await fs.pathExists(PROFILE_FILE))) {
    return { exists: false, path: PROFILE_FILE, isPlaceholder: false, content: null };
  }
  const content = await fs.readFile(PROFILE_FILE, 'utf8');
  const todoCount = (content.match(/TODO:/g) ?? []).length;
  return {
    exists: true,
    path: PROFILE_FILE,
    isPlaceholder: todoCount >= 5,
    content,
  };
}

export async function initProfileIfMissing(): Promise<boolean> {
  if (await fs.pathExists(PROFILE_FILE)) return false;
  await ensureProfileDir();
  await fs.writeFile(PROFILE_FILE, DEFAULT_PROFILE, 'utf8');
  return true;
}

export async function writeProfile(content: string): Promise<void> {
  await ensureProfileDir();
  await fs.writeFile(PROFILE_FILE, content, 'utf8');
}

/**
 * 把 profile 内容包装成 prompt 注入片段。如果 profile 不存在或全是 TODO，返回 null。
 */
export async function loadProfileForInjection(): Promise<string | null> {
  const status = await loadProfile();
  if (!status.exists || status.isPlaceholder || !status.content) return null;

  return [
    '## 用户全局偏好（来自 ~/.vibeflow/profile.md）',
    '',
    '> 以下偏好跨所有项目通用，请优先遵守。如与项目规则冲突，以项目规则为准。',
    '',
    status.content.trim(),
  ].join('\n');
}
