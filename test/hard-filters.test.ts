import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHardFilters } from '../src/routing/hard-filters.js';
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

test('hard filter enforces context length', () => {
  const profiles = [
    makeProfile({ id: 'a', contextLength: 4096 }),
    makeProfile({ id: 'b', contextLength: 200000 }),
  ];

  const properties: PromptProperties = {
    accuracy: 0.5,
    cost: 1,
    speed: 0,
    tokenLimit: 100000,
    reasoning: false,
  };

  const filtered = applyHardFilters(profiles, properties, {});
  assert.deepEqual(
    filtered.map(p => p.id),
    ['b']
  );
});

test('hard filter multimodal', () => {
  const profiles = [
    makeProfile({
      id: 'text-only',
      characteristics: {
        ...makeProfile({}).characteristics,
        isMultimodal: false,
      },
    }),
    makeProfile({
      id: 'mm',
      characteristics: {
        ...makeProfile({}).characteristics,
        isMultimodal: true,
      },
    }),
  ];

  const properties: PromptProperties = {
    accuracy: 0.5,
    cost: 1,
    speed: 0,
    tokenLimit: 1000,
    reasoning: false,
    multimodal: true,
  };

  const filtered = applyHardFilters(profiles, properties, {});
  assert.deepEqual(
    filtered.map(p => p.id),
    ['mm']
  );
});
