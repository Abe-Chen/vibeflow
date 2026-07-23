import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptArtifact,
  allocateArtifact,
  commitReadyArtifact,
  ensureExploreState,
  registerArtifact,
  resetDownstreamForExplore,
} from '../dist/core/explore-state.js';
import { adviseNext } from '../dist/core/next-advisor.js';

function makeState(overrides = {}) {
  return {
    version: 1,
    run_id: 'run_test',
    feature_name: 'test-feature',
    workflow: 'standard_feature',
    status: 'in_progress',
    current_stage: 'requirement',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    stages: [
      { id: 'requirement', role: 'product_analyst', status: 'pending', human_gate: true },
      { id: 'plan', role: 'planner', status: 'pending' },
      { id: 'plan_review', role: 'plan_reviewer', status: 'pending' },
      { id: 'finalize', role: 'finalizer', status: 'pending', human_gate: true },
      { id: 'develop', role: 'developer', status: 'pending' },
    ],
    meta: {},
    ...overrides,
  };
}

test('next advisor prioritizes human gates and completed states', () => {
  const finalizeState = makeState({
    current_stage: 'finalize',
    stages: makeState().stages.map((stage) => (
      stage.id === 'finalize' ? { ...stage, status: 'in_progress' } : stage
    )),
  });
  const finalizeAdvice = adviseNext(finalizeState);
  assert.deepEqual(finalizeAdvice.commands, ['vibeflow advance', 'vibeflow deliver']);
  assert.equal(finalizeAdvice.finished, false);

  const deliveredAdvice = adviseNext(makeState({ status: 'delivered', current_stage: 'develop' }));
  assert.deepEqual(deliveredAdvice.commands, ['vibeflow develop']);
  assert.equal(deliveredAdvice.finished, true);

  const doneAdvice = adviseNext(makeState({ status: 'done', current_stage: null }));
  assert.match(doneAdvice.commands[0], /change-request/);
  assert.equal(doneAdvice.finished, true);
});

test('explore state allocates stable ids and accepts only eligible artifacts', () => {
  const state = makeState();
  const explore = ensureExploreState(state);
  const allocated = allocateArtifact(explore, 'plan', 'codex');

  assert.deepEqual(allocated, {
    seq: 1,
    id: 'plan_001',
    file: 'explore/plans/plan_001_codex.md',
  });
  assert.equal(explore.next_seq, 2);

  commitReadyArtifact(explore, {
    id: allocated.id,
    kind: 'plan',
    model: 'codex',
    file: allocated.file,
  });
  const accepted = acceptArtifact(explore, allocated.id);
  assert.equal(accepted.id, 'plan_001');
  assert.equal(explore.status, 'accepted');
  assert.equal(explore.accepted?.target_file, '01_plan_v1.md');

  const consult = registerArtifact(explore, { kind: 'consult', model: 'claude' });
  assert.throws(() => acceptArtifact(explore, consult.id), /只能 accept plan 或 synthesis/);
});

test('explore plan changes reset every downstream non-pending stage', () => {
  const state = makeState({
    current_stage: 'finalize',
    stages: [
      { id: 'requirement', role: 'product_analyst', status: 'completed' },
      { id: 'plan', role: 'planner', status: 'in_progress' },
      { id: 'plan_review', role: 'plan_reviewer', status: 'completed', completed_at: '2026-01-01' },
      { id: 'finalize', role: 'finalizer', status: 'skipped' },
      { id: 'develop', role: 'developer', status: 'blocked', started_at: '2026-01-01' },
    ],
  });

  const reset = resetDownstreamForExplore(state);
  assert.deepEqual(reset, ['plan_review', 'finalize', 'develop']);
  assert.equal(state.stages[2].status, 'pending');
  assert.equal(state.stages[2].completed_at, undefined);
  assert.equal(state.stages[4].started_at, undefined);
});
