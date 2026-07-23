import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDeliverability, markDelivered } from '../dist/core/deliver.js';
import { getFeatureDir } from '../dist/utils/paths.js';

function makeState() {
  return {
    version: 1,
    run_id: 'run_deliver',
    feature_name: 'deliver-test',
    workflow: 'standard_feature',
    status: 'in_progress',
    current_stage: 'develop',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    stages: [
      { id: 'requirement', role: 'product_analyst', status: 'completed' },
      { id: 'plan', role: 'planner', status: 'completed' },
      { id: 'plan_review', role: 'plan_reviewer', status: 'completed' },
      { id: 'finalize', role: 'finalizer', status: 'completed', locked: true },
      { id: 'develop', role: 'developer', status: 'pending' },
      { id: 'code_review', role: 'code_reviewer', status: 'pending' },
    ],
    meta: {},
  };
}

test('deliver requires a locked plan and untouched development stages', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vibeflow-deliver-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const feature = 'deliver-test';
  const featureDir = getFeatureDir(root, feature);
  await mkdir(featureDir, { recursive: true });

  const state = makeState();
  const missingPlan = await getDeliverability(root, feature, state);
  assert.equal(missingPlan.reasonCode, 'not_locked');

  await writeFile(
    path.join(featureDir, '03_final_plan.md'),
    '# 最终方案\n\n这是一份超过五十个字符、已经由人工确认并锁定的最终方案，用于验证 deliver 门禁行为。',
    'utf8',
  );
  const deliverable = await getDeliverability(root, feature, state);
  assert.equal(deliverable.deliverable, true);

  state.stages.find((stage) => stage.id === 'develop').status = 'completed';
  const started = await getDeliverability(root, feature, state);
  assert.equal(started.reasonCode, 'in_development');
});

test('deliver writes a stable timestamp and is idempotent', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vibeflow-deliver-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const feature = 'deliver-test';
  const featureDir = getFeatureDir(root, feature);
  await mkdir(featureDir, { recursive: true });
  await writeFile(
    path.join(featureDir, '03_final_plan.md'),
    '# 最终方案\n\n这是一份超过五十个字符、已经由人工确认并锁定的最终方案，用于验证 deliver 幂等写入行为。',
    'utf8',
  );

  const state = makeState();
  const first = await markDelivered(root, feature, state);
  const firstTimestamp = state.meta.delivered_at;
  assert.equal(first.idempotent, false);
  assert.equal(state.status, 'delivered');
  assert.ok(firstTimestamp);

  const second = await markDelivered(root, feature, state);
  assert.equal(second.idempotent, true);
  assert.equal(state.meta.delivered_at, firstTimestamp);

  const persisted = JSON.parse(await readFile(path.join(featureDir, 'run.json'), 'utf8'));
  assert.equal(persisted.status, 'delivered');
  assert.equal(persisted.meta.delivered_at, firstTimestamp);
});
