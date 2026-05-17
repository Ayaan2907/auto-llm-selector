import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHardFiltersDetailed,
  type HardFilterDropReason,
} from '../src/routing/hard-filters.js';
import type { ModelProfile, PromptProperties } from '../src/types.js';

function makeProfile(overrides: Partial<ModelProfile>): ModelProfile {
  return {
    id: 'openai/gpt-test',
    name: 'Test',
    description: '',
    capabilities: {
      coding: 0.9,
      creative: 0.5,
      analytical: 0.5,
      reasoning: 0.8,
      conversational: 0.5,
      general: 0.7,
    },
    characteristics: {
      speedTier: 'fast',
      costTier: 'cheap',
      accuracyTier: 'high',
      contextTier: 'large',
      provider: 'openai',
      modelFamily: 'gpt-4',
      isReasoning: true,
      isMultimodal: true,
    },
    contextLength: 128000,
    promptCostPerToken: 0.00001,
    completionCostPerToken: 0.00003,
    maxCompletionTokens: 4096,
    isModerated: false,
    profileConfidence: 0.9,
    ...overrides,
  };
}

test('applyHardFiltersDetailed reports drop reasons by first-failure', () => {
  const baseChars = makeProfile({}).characteristics;
  const profiles = [
    makeProfile({ id: 'ctx-too-small', contextLength: 1000 }),
    makeProfile({
      id: 'too-expensive',
      characteristics: { ...baseChars, costTier: 'premium' },
    }),
    makeProfile({ id: 'openai/denied' }),
    makeProfile({ id: 'openai/survivor' }),
  ];

  const properties: PromptProperties = {
    accuracy: 0.5,
    cost: 0.1,
    speed: 0,
    tokenLimit: 8000,
    reasoning: false,
  };

  const result = applyHardFiltersDetailed(profiles, properties, {
    excludedModelPatterns: ['*/denied'],
  });

  assert.deepEqual(
    result.survivors.map(p => p.id),
    ['openai/survivor']
  );
  assert.equal(result.droppedReasons.tokenLimit, 1);
  assert.equal(result.droppedReasons.costTier, 1);
  assert.equal(result.droppedReasons.denyList, 1);
  const total = Object.values(result.droppedReasons).reduce((s, n) => s + n, 0);
  assert.equal(total, 3);
});

test('HardFilterDropReason union is exported and assignable', () => {
  const r: HardFilterDropReason = 'tokenLimit';
  assert.equal(r, 'tokenLimit');
});
