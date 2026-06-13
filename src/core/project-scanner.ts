import path from 'node:path';
import fs from 'fs-extra';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ProjectSnapshot {
  rootPath: string;
  isGitRepo: boolean;
  isLikelyNewProject: boolean;       // 没有任何源码 + 没有 manifest → 视为新项目
  detectedStack: string[];           // 例如 ['nodejs', 'typescript', 'flutter']
  directoryTree: string;             // 目录树（已过滤）
  manifests: Array<{ path: string; content: string }>;
  readme: string | null;
  codeSamples: Array<{ path: string; lines: number; content: string }>;
  gitLog: string | null;             // 最近 20 条 commit subject
  stats: {
    sourceFileCount: number;
    sampledFileCount: number;
    totalSampleBytes: number;
  };
}

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.dart_tool', '.idea', '.vscode', '__pycache__', 'venv', '.venv',
  'target', '.gradle', '.cargo', 'coverage', '.parcel-cache',
  'ios/Pods', 'android/.gradle', 'DerivedData', 'Pods',
]);

const IGNORED_FILE_PATTERNS = [
  /\.lock$/i, /-lock\.json$/i, /\.lockb?$/i,
  /\.(env|env\..*)$/i, /\.pem$/i, /\.key$/i,
  /id_rsa/i, /id_ed25519/i,
  /\.(sqlite|db|sqlite3)$/i,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|mp4|mov|mp3|wav|otf|ttf|woff2?)$/i,
  /\.(zip|tar|tar\.gz|tgz|rar|7z|jar)$/i,
];

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.dart',
  '.py',
  '.go', '.rs',
  '.java', '.kt', '.kts',
  '.swift', '.m', '.mm',
  '.rb', '.php', '.cs',
  '.vue', '.svelte', '.astro',
  '.cpp', '.cc', '.c', '.h', '.hpp',
]);

// 文本型 manifest：内容可塞进 prompt（含子目录探测）
const MANIFEST_FILES = new Set([
  'package.json', 'pnpm-workspace.yaml', 'tsconfig.json',
  'pubspec.yaml',
  'pyproject.toml', 'requirements.txt', 'Pipfile',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  'composer.json',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle',
  'Podfile', 'Package.swift',
  'deno.json', 'deno.jsonc',
  'CMakeLists.txt',
  '.tool-versions', '.nvmrc',
]);

// 源码采样优先目录（无论代码在哪层都会被收集，这些目录里的优先）
const PRIORITY_DIRS = new Set([
  'src', 'lib', 'app', 'pages', 'components', 'cmd', 'pkg', 'main',
  'ios', 'android', 'Sources', 'supabase', 'functions',
  'server', 'backend', 'frontend', 'packages', 'core',
]);

interface ScanLimits {
  maxSampledFiles: number;
  maxFileLines: number;
  maxFileBytes: number;
  maxTreeEntries: number;
  maxDepth: number;
  maxManifests: number;
  maxCodeFiles: number;
}

const DEFAULT_LIMITS: ScanLimits = {
  maxSampledFiles: 30,
  maxFileLines: 200,
  maxFileBytes: 32 * 1024,
  maxTreeEntries: 250,
  maxDepth: 5,
  maxManifests: 12,
  maxCodeFiles: 800,
};

function shouldSkipDir(name: string): boolean {
  if (name.startsWith('.') && name !== '.github' && name !== '.ai-dev') return true;
  return IGNORED_DIRS.has(name);
}

/** 是否为敏感或二进制文件（.env/.pem/.key/id_rsa/数据库/媒体/压缩等）。探索池 consult/synthesize 安全读取也复用此判断。 */
export function isSensitiveOrBinaryFile(name: string): boolean {
  return IGNORED_FILE_PATTERNS.some((re) => re.test(name));
}

function shouldSkipFile(name: string): boolean {
  return isSensitiveOrBinaryFile(name);
}

// 内容级密钥脱敏：文件名过滤拦不住"源码里硬编码的密钥"，这里在内容进入 prompt/日志前再过一道。
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]'],
  [/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_KEY]'],
  [/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]'],
  [/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GOOGLE_KEY]'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_GITHUB_TOKEN]'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED_SLACK_TOKEN]'],
];
// 赋值给敏感变量名的长字面量（保留变量名，只脱敏值）
const ASSIGN_SECRET =
  /((?:api[_-]?key|secret|token|password|passwd|access[_-]?key|service[_-]?role(?:[_-]?key)?|anon[_-]?key|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*)["'`][^"'`\n]{12,}["'`]/gi;

export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  out = out.replace(ASSIGN_SECRET, (_m, prefix: string) => `${prefix}"[REDACTED]"`);
  return out;
}

function isCodeFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

interface WalkResult {
  tree: string;
  /** 收集到的源码文件相对路径 + 优先级（0 = 优先目录内，1 = 其他） */
  codeFiles: Array<{ rel: string; priority: number }>;
  /** 匹配到的文本 manifest 相对路径（含子目录） */
  manifestPaths: string[];
  /** 通过目录/文件特征识别出的技术栈线索 */
  features: Set<string>;
  sourceFileCount: number;
}

/**
 * 一次遍历同时产出：目录树、源码文件清单、manifest 清单、技术栈特征。
 * 相比旧版（深度 3 + 只认 src/lib/app + 只看根目录 manifest），
 * 能正确处理 iOS 原生（ios/App/App/*.swift）、Supabase/Deno monorepo 等"代码在深层子目录"的项目。
 */
async function walkProject(rootPath: string, limits: ScanLimits): Promise<WalkResult> {
  const treeLines: string[] = [];
  const codeFiles: Array<{ rel: string; priority: number }> = [];
  const manifestPaths: string[] = [];
  const features = new Set<string>();
  let entryCount = 0;
  let sourceFileCount = 0;

  async function walk(dir: string, depth: number, indent: string, inPriority: boolean): Promise<void> {
    if (depth > limits.maxDepth) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (entryCount >= limits.maxTreeEntries) {
        treeLines.push(`${indent}... (达到目录树条目上限)`);
        return;
      }

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) continue;

        // Xcode 工程目录：标记特征但不深入（pbxproj 是噪声）
        if (entry.name.endsWith('.xcodeproj') || entry.name.endsWith('.xcworkspace')) {
          features.add('swift');
          features.add('ios');
          treeLines.push(`${indent}${entry.name}/`);
          entryCount += 1;
          continue;
        }
        if (entry.name === 'supabase') features.add('supabase');

        treeLines.push(`${indent}${entry.name}/`);
        entryCount += 1;
        const childPriority = inPriority || PRIORITY_DIRS.has(entry.name);
        await walk(path.join(dir, entry.name), depth + 1, indent + '  ', childPriority);
      } else if (entry.isFile()) {
        if (shouldSkipFile(entry.name)) continue;
        treeLines.push(`${indent}${entry.name}`);
        entryCount += 1;

        const rel = path.relative(rootPath, path.join(dir, entry.name));
        if (MANIFEST_FILES.has(entry.name) && manifestPaths.length < limits.maxManifests) {
          manifestPaths.push(rel);
        }
        if (entry.name === 'deno.json' || entry.name === 'deno.jsonc') features.add('deno');

        if (isCodeFile(entry.name)) {
          sourceFileCount += 1;
          if (codeFiles.length < limits.maxCodeFiles) {
            codeFiles.push({ rel, priority: inPriority ? 0 : 1 });
          }
        }
      }
    }
  }

  await walk(rootPath, 1, '', false);
  return { tree: treeLines.join('\n'), codeFiles, manifestPaths, features, sourceFileCount };
}

async function readManifests(rootPath: string, manifestPaths: string[]): Promise<ProjectSnapshot['manifests']> {
  const result: ProjectSnapshot['manifests'] = [];
  // 根目录 manifest 排前面，更能代表主技术栈
  const sorted = [...manifestPaths].sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  for (const rel of sorted) {
    try {
      const content = await fs.readFile(path.join(rootPath, rel), 'utf8');
      const truncated = content.length > 8192 ? content.slice(0, 8192) + '\n...(truncated)' : content;
      result.push({ path: rel, content: redactSecrets(truncated) });
    } catch {
      // skip
    }
  }
  return result;
}

async function collectCodeSamples(
  rootPath: string,
  codeFiles: WalkResult['codeFiles'],
  limits: ScanLimits,
): Promise<{ samples: ProjectSnapshot['codeSamples']; totalBytes: number }> {
  const samples: ProjectSnapshot['codeSamples'] = [];
  let totalBytes = 0;

  // 优先目录内的代码排前面，其余按路径
  const ordered = [...codeFiles].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.rel.localeCompare(b.rel);
  });

  for (const { rel } of ordered) {
    if (samples.length >= limits.maxSampledFiles) break;
    const full = path.join(rootPath, rel);
    try {
      const stat = await fs.stat(full);
      if (stat.size === 0) continue;
      const raw = await fs.readFile(full, 'utf8');
      const allLines = raw.split('\n');
      const truncated = allLines.slice(0, limits.maxFileLines).join('\n');
      const bytes = Buffer.byteLength(truncated, 'utf8');
      if (bytes > limits.maxFileBytes) continue;
      const body = redactSecrets(truncated + (allLines.length > limits.maxFileLines ? '\n...(truncated)' : ''));
      samples.push({
        path: rel,
        lines: allLines.length,
        content: body,
      });
      totalBytes += bytes;
    } catch {
      // skip unreadable
    }
  }

  return { samples, totalBytes };
}

async function readReadme(rootPath: string): Promise<string | null> {
  const candidates = ['README.md', 'README.MD', 'README', 'README.rst', 'readme.md'];
  for (const name of candidates) {
    const full = path.join(rootPath, name);
    if (await fs.pathExists(full)) {
      try {
        const content = await fs.readFile(full, 'utf8');
        return content.length > 8192 ? content.slice(0, 8192) + '\n...(truncated)' : content;
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function readGitLog(rootPath: string): Promise<string | null> {
  try {
    await execFileAsync('git', ['-C', rootPath, 'rev-parse', '--git-dir'], { timeout: 5000 });
  } catch {
    return null;
  }
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', rootPath, 'log', '--pretty=format:%h %ad %s', '--date=short', '-n', '20'],
      { timeout: 5000, maxBuffer: 256 * 1024 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function detectStack(manifests: ProjectSnapshot['manifests'], features: Set<string>): string[] {
  const stack: string[] = [];
  const hasManifest = (name: string) => manifests.some((m) => path.basename(m.path) === name);
  const manifestContent = (name: string) =>
    manifests.find((m) => path.basename(m.path) === name)?.content || '';

  if (hasManifest('package.json')) {
    stack.push('nodejs');
    const pkg = manifestContent('package.json');
    if (/typescript/i.test(pkg)) stack.push('typescript');
    if (/"react"/.test(pkg)) stack.push('react');
    if (/"next"/.test(pkg)) stack.push('nextjs');
    if (/"vue"/.test(pkg)) stack.push('vue');
    if (/"fastify"/.test(pkg)) stack.push('fastify');
    if (/"express"/.test(pkg)) stack.push('express');
  }
  if (hasManifest('tsconfig.json') && !stack.includes('typescript')) stack.push('typescript');
  if (hasManifest('pubspec.yaml')) stack.push('flutter');
  if (hasManifest('pyproject.toml') || hasManifest('requirements.txt') || hasManifest('Pipfile')) stack.push('python');
  if (hasManifest('Cargo.toml')) stack.push('rust');
  if (hasManifest('go.mod')) stack.push('go');
  if (hasManifest('Gemfile')) stack.push('ruby');
  if (hasManifest('composer.json')) stack.push('php');
  if (hasManifest('pom.xml') || hasManifest('build.gradle') || hasManifest('build.gradle.kts')) stack.push('java/kotlin');
  if (hasManifest('Podfile') || hasManifest('Package.swift')) { stack.push('swift'); stack.push('ios'); }

  // 基于目录/文件特征补充（manifest 缺失时仍能识别）
  if (features.has('swift')) stack.push('swift');
  if (features.has('ios')) stack.push('ios');
  if (features.has('supabase')) stack.push('supabase');
  if (features.has('deno')) stack.push('deno');

  return Array.from(new Set(stack));
}

export async function scanProject(
  rootPath: string,
  overrides: Partial<ScanLimits> = {},
): Promise<ProjectSnapshot> {
  const limits: ScanLimits = { ...DEFAULT_LIMITS, ...overrides };

  const [walkResult, readme, gitLog] = await Promise.all([
    walkProject(rootPath, limits),
    readReadme(rootPath),
    readGitLog(rootPath),
  ]);

  const manifests = await readManifests(rootPath, walkResult.manifestPaths);
  const { samples, totalBytes } = await collectCodeSamples(rootPath, walkResult.codeFiles, limits);
  const detectedStack = detectStack(manifests, walkResult.features);
  const isGitRepo = gitLog !== null;
  const isLikelyNewProject =
    walkResult.sourceFileCount === 0 && manifests.length === 0 && (readme?.length ?? 0) < 200;

  return {
    rootPath,
    isGitRepo,
    isLikelyNewProject,
    detectedStack,
    directoryTree: walkResult.tree,
    manifests,
    readme,
    codeSamples: samples,
    gitLog,
    stats: {
      sourceFileCount: walkResult.sourceFileCount,
      sampledFileCount: samples.length,
      totalSampleBytes: totalBytes,
    },
  };
}

export function formatSnapshotForPrompt(s: ProjectSnapshot): string {
  const lines: string[] = [];
  lines.push(`## 项目根目录\n${s.rootPath}`);
  lines.push(`\n## 元信息\n- 是否 Git 仓库: ${s.isGitRepo}\n- 推测技术栈: ${s.detectedStack.join(', ') || '(未识别)'}\n- 源码文件数（粗略）: ${s.stats.sourceFileCount}\n- 已采样文件: ${s.stats.sampledFileCount}\n- 总采样字节: ${s.stats.totalSampleBytes}`);
  lines.push(`\n## 项目目录树\n\`\`\`\n${s.directoryTree || '(空目录)'}\n\`\`\``);

  if (s.readme) {
    lines.push(`\n## README\n\`\`\`\n${s.readme}\n\`\`\``);
  } else {
    lines.push(`\n## README\n(无)`);
  }

  if (s.manifests.length) {
    lines.push(`\n## Manifest 文件`);
    for (const m of s.manifests) {
      lines.push(`\n### ${m.path}\n\`\`\`\n${m.content}\n\`\`\``);
    }
  } else {
    lines.push(`\n## Manifest 文件\n(无)`);
  }

  if (s.gitLog) {
    lines.push(`\n## Git 最近 20 条提交\n\`\`\`\n${s.gitLog}\n\`\`\``);
  }

  if (s.codeSamples.length) {
    lines.push(`\n## 源码采样（共 ${s.codeSamples.length} 个文件）`);
    for (const sample of s.codeSamples) {
      lines.push(`\n### ${sample.path}（${sample.lines} 行）\n\`\`\`\n${sample.content}\n\`\`\``);
    }
  }

  return lines.join('\n');
}
