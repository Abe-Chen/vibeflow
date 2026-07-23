import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildBridgeBlock } from '../dist/templates/bridges.js';
import { DEFAULT_CONFIG_YAML } from '../dist/templates/config.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'dist', 'cli', 'index.js');

test('CLI version stays aligned with package.json', async () => {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version'], { cwd: repoRoot });
  assert.equal(stdout.trim(), pkg.version);
});

test('CLI help exposes the core positioning and workflow commands', async () => {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, '--help'], { cwd: repoRoot });
  assert.match(stdout, /避免同一个模型自写自审/);
  assert.match(stdout, /plan-review/);
  assert.match(stdout, /code-review/);
  assert.match(stdout, /accept-plan/);
  assert.match(stdout, /deliver/);
});

test('generated templates link to the public vibeflow repository', () => {
  const repositoryUrl = 'https://github.com/Abe-Chen/vibeflow';
  assert.equal(DEFAULT_CONFIG_YAML.includes(repositoryUrl), true);
  assert.equal(buildBridgeBlock().includes(repositoryUrl), true);
  assert.equal(DEFAULT_CONFIG_YAML.includes('your' + '-org'), false);
});
