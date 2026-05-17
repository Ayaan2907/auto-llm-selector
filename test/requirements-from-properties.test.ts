import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankRequirementsFromProperties } from '../src/routing/requirements-from-properties.js';
import type { PromptProperties } from '../src/types.js';

test('maps strict cost sensitivity to maxCost', () => {
  const properties: PromptProperties = {
    accuracy: 0.5,
    cost: 0,
    speed: 0,
    tokenLimit: 1000,
    reasoning: false,
  };

  const req = buildRankRequirementsFromProperties(properties);
  assert.ok(req.maxCost !== undefined);
  assert.ok(req.maxCost! > 0);
});

test('maps high accuracy to minAccuracy', () => {
  const properties: PromptProperties = {
    accuracy: 0.95,
    cost: 1,
    speed: 0,
    tokenLimit: 1000,
    reasoning: true,
  };

  const req = buildRankRequirementsFromProperties(properties);
  assert.equal(req.needsReasoning, true);
  assert.equal(req.minAccuracy, 'excellent');
});
