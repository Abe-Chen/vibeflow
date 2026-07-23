import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInputs } from '../dist/core/explore-input.js';
import { isSensitiveOrBinaryFile, redactSecrets } from '../dist/core/project-scanner.js';

function emptyExplore() {
  return {
    version: 1,
    status: 'idle',
    next_seq: 1,
    artifacts: [],
    failures: [],
    accept_history: [],
  };
}

test('secret redaction and sensitive file detection cover common cases', () => {
  const assignment = 'api' + '_key = "' + 'abcdefghijklmnop' + '"';
  assert.equal(redactSecrets(assignment), 'api_key = "[REDACTED]"');
  assert.equal(isSensitiveOrBinaryFile('.env.local'), true);
  assert.equal(isSensitiveOrBinaryFile('server.pem'), true);
  assert.equal(isSensitiveOrBinaryFile('preview.png'), true);
  assert.equal(isSensitiveOrBinaryFile('README.md'), false);
});

test('explore inputs stay inside the project and redact content', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vibeflow-security-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'vibeflow-outside-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  const featureDir = path.join(root, 'docs', 'ai-workflow', 'feature');
  await mkdir(featureDir, { recursive: true });
  await writeFile(path.join(root, 'safe.md'), 'token = "' + 'abcdefghijklmnop' + '"', 'utf8');
  await writeFile(path.join(root, '.env'), 'NOT_A_REAL_SECRET=value', 'utf8');
  const outsideFile = path.join(outside, 'outside.md');
  await writeFile(outsideFile, 'outside', 'utf8');

  const ctx = { projectRoot: root, featureDir, explore: emptyExplore() };
  const [safe] = await resolveInputs(['safe.md'], ctx);
  assert.equal(safe.content, 'token = "[REDACTED]"');

  await assert.rejects(() => resolveInputs(['.env'], ctx), /拒绝读取敏感\/二进制文件/);
  await assert.rejects(() => resolveInputs([outsideFile], ctx), /拒绝读取项目根目录之外的文件/);

  ctx.explore.artifacts.push({
    id: 'plan_001',
    kind: 'plan',
    status: 'ready',
    model: 'codex',
    file: path.relative(featureDir, outsideFile),
    created_at: '2026-01-01T00:00:00.000Z',
  });
  await assert.rejects(() => resolveInputs(['plan_001'], ctx), /拒绝读取项目根目录之外的文件/);
});
