import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import YAML from 'yaml';
import { getVibeflowDir } from './paths.js';

const execFileAsync = promisify(execFile);

export async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--git-dir'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function isGitInstalled(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export interface InitGitResult {
  initialized: boolean;
  committed: boolean;
  error?: string;
}

/**
 * 在指定目录初始化 git 仓库，并尝试做第一次 commit。
 * 如果目录是空的或没有可 commit 的内容，跳过 commit 步骤不抛错。
 */
export async function initGitRepo(
  projectRoot: string,
  commitMessage = 'vibeflow baseline (auto-created by vibeflow init)',
): Promise<InitGitResult> {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'init'], { timeout: 10000 });
  } catch (err) {
    return { initialized: false, committed: false, error: (err as Error).message };
  }

  // 确保有 .gitignore 至少忽略 .ai-dev/logs 和 cache
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const ignoreLines = ['.ai-dev/logs/', '.ai-dev/cache/', '.ai-dev/exports/'];
  let existing = '';
  if (await fs.pathExists(gitignorePath)) {
    existing = await fs.readFile(gitignorePath, 'utf8');
  }
  const toAppend = ignoreLines.filter((l) => !existing.includes(l));
  if (toAppend.length) {
    const newContent = (existing.trimEnd() + '\n\n# vibeflow 自动追加\n' + toAppend.join('\n') + '\n').trimStart();
    await fs.writeFile(gitignorePath, newContent, 'utf8');
  }

  try {
    await execFileAsync('git', ['-C', projectRoot, 'add', '.'], { timeout: 30000 });
  } catch {
    // 空目录 / 没东西 add，继续
  }

  // 检查 git config user 是否配置；没配置就给个临时值，避免 commit 失败
  let needTempUser = false;
  try {
    await execFileAsync('git', ['-C', projectRoot, 'config', 'user.email'], { timeout: 5000 });
  } catch {
    needTempUser = true;
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (needTempUser) {
    env.GIT_AUTHOR_NAME = env.GIT_AUTHOR_NAME ?? 'vibeflow';
    env.GIT_AUTHOR_EMAIL = env.GIT_AUTHOR_EMAIL ?? 'vibeflow@localhost';
    env.GIT_COMMITTER_NAME = env.GIT_COMMITTER_NAME ?? 'vibeflow';
    env.GIT_COMMITTER_EMAIL = env.GIT_COMMITTER_EMAIL ?? 'vibeflow@localhost';
  }

  try {
    await execFileAsync(
      'git',
      ['-C', projectRoot, 'commit', '-m', commitMessage, '--allow-empty'],
      { timeout: 30000, env },
    );
    return { initialized: true, committed: true };
  } catch (err) {
    return { initialized: true, committed: false, error: (err as Error).message };
  }
}

/**
 * 修改 config.yaml，给 codex 模型的 extra_args 加上 --skip-git-repo-check。
 * 用于用户明确选择"不初始化 git，绕过 codex 检查"的场景。
 */
export async function addCodexSkipGitCheck(projectRoot: string): Promise<{ added: boolean }> {
  const configPath = path.join(getVibeflowDir(projectRoot), 'config.yaml');
  if (!(await fs.pathExists(configPath))) {
    throw new Error(`找不到 config.yaml: ${configPath}`);
  }

  const raw = await fs.readFile(configPath, 'utf8');
  const doc = YAML.parseDocument(raw);

  const codex = doc.getIn(['models', 'codex'], true);
  if (!codex || !YAML.isMap(codex)) {
    throw new Error('config.yaml 中找不到 models.codex 节点');
  }

  const flag = '--skip-git-repo-check';
  const existing = codex.get('extra_args', true);

  if (YAML.isSeq(existing)) {
    const hasFlag = existing.items.some((item) => {
      if (YAML.isScalar(item)) return item.value === flag;
      return false;
    });
    if (hasFlag) return { added: false };
    existing.add(flag);
  } else {
    codex.set('extra_args', doc.createNode([flag]));
  }

  await fs.writeFile(configPath, doc.toString(), 'utf8');
  return { added: true };
}
