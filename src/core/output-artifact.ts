import path from 'node:path';
import fs from 'fs-extra';
import { AgentRunResult } from '../adapters/types.js';

const PLACEHOLDER_RE = /由 vibeflow new 占位生成/;

/** 文件是否为 vibeflow new 生成的占位（用于判断产物是否"有意义"） */
export async function isPlaceholderFile(file: string): Promise<boolean> {
  try {
    const content = await fs.readFile(file, 'utf8');
    return PLACEHOLDER_RE.test(content);
  } catch {
    return false;
  }
}

/**
 * 把模型产物写到 outputPath：
 * - 目标已存在且有"有意义"内容（非占位）→ 保留，返回 true；
 * - 否则用 result.stdoutText 兜底写入；
 * - stdout 也为空 → 返回 false（未写成）。
 *
 * 从 stage-runner 抽取为共享 helper，供普通阶段与探索 runner（parallel-plan / consult / synthesize）复用。
 */
export async function ensureOutputWritten(outputPath: string, result: AgentRunResult): Promise<boolean> {
  await fs.ensureDir(path.dirname(outputPath));
  const existed = await fs.pathExists(outputPath);
  const meaningfullyExisted = existed ? !(await isPlaceholderFile(outputPath)) : false;
  if (meaningfullyExisted) return true;
  const stdoutText = result.stdoutText?.trim();
  if (stdoutText && stdoutText.length > 0) {
    await fs.writeFile(outputPath, stdoutText + '\n', 'utf8');
    return true;
  }
  return false;
}
