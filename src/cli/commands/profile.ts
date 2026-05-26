import { Command } from 'commander';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import chalk from 'chalk';
import prompts from 'prompts';
import { log } from '../../utils/logger.js';
import {
  PROFILE_FILE,
  loadProfile,
  initProfileIfMissing,
  ensureProfileDir,
} from '../../utils/profile.js';

const CLAUDE_GLOBAL_MD = path.join(os.homedir(), '.claude', 'CLAUDE.md');

const SYNC_BLOCK_START = '<!-- BEGIN vibeflow-profile -->';
const SYNC_BLOCK_END = '<!-- END vibeflow-profile -->';

async function runEditor(filePath: string): Promise<void> {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`编辑器退出码 ${code}`));
    });
  });
}

function buildSyncBlock(profileContent: string): string {
  return [
    SYNC_BLOCK_START,
    '',
    '## 来自 vibeflow 的全局用户偏好',
    '> 由 `vibeflow profile sync-claude` 自动同步。请在 ~/.vibeflow/profile.md 编辑。',
    '',
    profileContent.trim(),
    '',
    SYNC_BLOCK_END,
  ].join('\n');
}

async function syncToClaude(profileContent: string): Promise<{ created: boolean; updated: boolean; path: string }> {
  await fs.ensureDir(path.dirname(CLAUDE_GLOBAL_MD));
  const block = buildSyncBlock(profileContent);

  if (!(await fs.pathExists(CLAUDE_GLOBAL_MD))) {
    await fs.writeFile(CLAUDE_GLOBAL_MD, block + '\n', 'utf8');
    return { created: true, updated: false, path: CLAUDE_GLOBAL_MD };
  }

  const existing = await fs.readFile(CLAUDE_GLOBAL_MD, 'utf8');
  if (existing.includes(SYNC_BLOCK_START) && existing.includes(SYNC_BLOCK_END)) {
    const re = new RegExp(`${SYNC_BLOCK_START}[\\s\\S]*?${SYNC_BLOCK_END}`, 'm');
    const next = existing.replace(re, block);
    if (next === existing) return { created: false, updated: false, path: CLAUDE_GLOBAL_MD };
    await fs.writeFile(CLAUDE_GLOBAL_MD, next, 'utf8');
    return { created: false, updated: true, path: CLAUDE_GLOBAL_MD };
  }

  // append
  const next = existing.trimEnd() + '\n\n' + block + '\n';
  await fs.writeFile(CLAUDE_GLOBAL_MD, next, 'utf8');
  return { created: false, updated: true, path: CLAUDE_GLOBAL_MD };
}

async function unsyncFromClaude(): Promise<{ removed: boolean }> {
  if (!(await fs.pathExists(CLAUDE_GLOBAL_MD))) return { removed: false };
  const existing = await fs.readFile(CLAUDE_GLOBAL_MD, 'utf8');
  const re = new RegExp(`\\n*${SYNC_BLOCK_START}[\\s\\S]*?${SYNC_BLOCK_END}\\n*`, 'm');
  if (!re.test(existing)) return { removed: false };
  const next = existing.replace(re, '\n').trimEnd() + '\n';
  await fs.writeFile(CLAUDE_GLOBAL_MD, next, 'utf8');
  return { removed: true };
}

async function cmdInit(opts: { yes?: boolean }): Promise<void> {
  const created = await initProfileIfMissing();
  if (created) {
    log.success(`已创建: ${PROFILE_FILE}`);
    log.hint('编辑: vibeflow profile edit');
  } else {
    log.info(`已存在: ${PROFILE_FILE}`);
    if (!opts.yes) {
      const ans = await prompts({
        type: 'confirm',
        name: 'ok',
        message: '是否打开编辑器编辑现有 profile？',
        initial: false,
      });
      if (ans.ok) await runEditor(PROFILE_FILE);
    }
  }
}

async function cmdShow(): Promise<void> {
  const status = await loadProfile();
  if (!status.exists) {
    log.warn(`profile 文件不存在: ${PROFILE_FILE}`);
    log.hint('运行: vibeflow profile init');
    return;
  }
  console.log(chalk.gray(`# 路径: ${status.path}`));
  console.log(chalk.gray(`# 是否占位（>= 5 个 TODO）: ${status.isPlaceholder}`));
  console.log('');
  console.log(status.content);
}

async function cmdEdit(): Promise<void> {
  await ensureProfileDir();
  if (!(await fs.pathExists(PROFILE_FILE))) {
    await initProfileIfMissing();
    log.info('已创建默认 profile，将打开编辑器');
  }
  await runEditor(PROFILE_FILE);
  log.success('已退出编辑器');
}

async function cmdPath(): Promise<void> {
  console.log(PROFILE_FILE);
}

async function cmdSyncClaude(): Promise<void> {
  const status = await loadProfile();
  if (!status.exists || !status.content) {
    log.error('profile 不存在，请先运行 vibeflow profile init');
    process.exitCode = 1;
    return;
  }
  if (status.isPlaceholder) {
    log.warn('profile 主要还是 TODO 占位，依然同步');
  }
  const result = await syncToClaude(status.content);
  if (result.created) log.success(`已创建: ${result.path}`);
  else if (result.updated) log.success(`已更新: ${result.path}（标记块: ${SYNC_BLOCK_START}）`);
  else log.info(`无变化: ${result.path}`);
  log.hint('Claude Code 启动后会自动读取此文件。撤销同步: vibeflow profile unsync-claude');
}

async function cmdUnsyncClaude(): Promise<void> {
  const result = await unsyncFromClaude();
  if (result.removed) log.success(`已从 ${CLAUDE_GLOBAL_MD} 移除 vibeflow 同步块`);
  else log.info(`${CLAUDE_GLOBAL_MD} 中没有 vibeflow 同步块，无需操作`);
}

export function registerProfileCommand(program: Command): void {
  const profile = program
    .command('profile')
    .description('管理 ~/.vibeflow/profile.md 全局用户偏好（跨项目通用）');

  profile
    .command('init')
    .description('创建默认 profile 文件（如已存在则保持不动）')
    .option('-y, --yes', '跳过确认提示')
    .action(async (opts) => {
      try { await cmdInit(opts); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });

  profile
    .command('show')
    .description('打印 profile 文件路径和内容')
    .action(async () => {
      try { await cmdShow(); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });

  profile
    .command('edit')
    .description('用 $EDITOR 打开 profile 文件')
    .action(async () => {
      try { await cmdEdit(); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });

  profile
    .command('path')
    .description('打印 profile 文件绝对路径')
    .action(async () => {
      try { await cmdPath(); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });

  profile
    .command('sync-claude')
    .description('把 profile 同步到 ~/.claude/CLAUDE.md（让原生 Claude Code 也能读到）')
    .action(async () => {
      try { await cmdSyncClaude(); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });

  profile
    .command('unsync-claude')
    .description('从 ~/.claude/CLAUDE.md 移除 vibeflow 同步块')
    .action(async () => {
      try { await cmdUnsyncClaude(); }
      catch (err) { log.error((err as Error).message); process.exitCode = 1; }
    });
}
