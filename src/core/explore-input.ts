import path from 'node:path';
import fs from 'fs-extra';
import { redactSecrets, isSensitiveOrBinaryFile } from './project-scanner.js';
import { ExploreState } from './run.js';
import { findArtifact } from './explore-state.js';

const MAX_SINGLE_FILE_BYTES = 64 * 1024;
const MAX_TOTAL_BYTES = 192 * 1024;

export interface ResolvedInput {
  /** 用户给的原始引用（artifact id 或路径） */
  ref: string;
  /** 展示名 */
  label: string;
  /** 脱敏后的内容 */
  content: string;
}

export interface ResolveInputCtx {
  projectRoot: string;
  /** 当前 feature 目录的绝对路径（artifact.file 相对它） */
  featureDir: string;
  explore: ExploreState;
}

/**
 * 解析单个输入引用（consult --about / synthesize --base）：
 * - 先按 explore artifact id 匹配 → 读其登记的产物文件；
 * - 否则视为文件路径：realpath 必须仍在 projectRoot 内，拒绝敏感/二进制文件，限单文件大小，内容脱敏。
 */
async function resolveOne(ref: string, ctx: ResolveInputCtx): Promise<ResolvedInput> {
  const artifact = findArtifact(ctx.explore, ref);
  let absPath: string;
  let label: string;

  if (artifact) {
    absPath = path.join(ctx.featureDir, artifact.file);
    label = `${artifact.id} (${artifact.kind}, ${artifact.model})`;
  } else {
    const resolved = path.resolve(ctx.projectRoot, ref);
    const realRoot = await fs.realpath(ctx.projectRoot).catch(() => ctx.projectRoot);
    let realPath: string;
    try {
      realPath = await fs.realpath(resolved);
    } catch {
      throw new Error(`输入不存在（既不是探索产物 id，也不是可读文件）: ${ref}`);
    }
    if (realPath !== realRoot && !realPath.startsWith(realRoot + path.sep)) {
      throw new Error(`拒绝读取项目根目录之外的文件: ${ref}`);
    }
    if (isSensitiveOrBinaryFile(path.basename(realPath))) {
      throw new Error(`拒绝读取敏感/二进制文件: ${ref}`);
    }
    absPath = realPath;
    label = path.relative(ctx.projectRoot, realPath);
  }

  const stat = await fs.stat(absPath).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error(`输入不是可读文件: ${ref}`);
  if (stat.size > MAX_SINGLE_FILE_BYTES) {
    throw new Error(
      `输入文件过大（${Math.round(stat.size / 1024)}KB > ${MAX_SINGLE_FILE_BYTES / 1024}KB）: ${ref}，请缩小范围`,
    );
  }
  const raw = await fs.readFile(absPath, 'utf8');
  return { ref, label, content: redactSecrets(raw) };
}

/**
 * 解析一组输入引用，累计大小超限报错。所有内容均已过 redactSecrets 脱敏。
 * 这是 consult / synthesize 把用户指定文件注入 prompt 前的安全闸门（设计 §M2）。
 */
export async function resolveInputs(refs: string[], ctx: ResolveInputCtx): Promise<ResolvedInput[]> {
  const out: ResolvedInput[] = [];
  let total = 0;
  for (const ref of refs) {
    const resolved = await resolveOne(ref.trim(), ctx);
    total += Buffer.byteLength(resolved.content, 'utf8');
    if (total > MAX_TOTAL_BYTES) {
      throw new Error(`输入总量超过 ${MAX_TOTAL_BYTES / 1024}KB 上限，请减少 --about/--base 的文件数量或体积`);
    }
    out.push(resolved);
  }
  return out;
}
