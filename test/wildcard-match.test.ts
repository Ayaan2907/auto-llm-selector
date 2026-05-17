import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modelMatchesAnyPattern,
  modelMatchesExcludedPatterns,
} from '../src/routing/wildcard-match.js';

test('wildcard allow patterns', () => {
  assert.equal(
    modelMatchesAnyPattern('anthropic/claude-3.5-sonnet', ['anthropic/*']),
    true
  );
  assert.equal(modelMatchesAnyPattern('openai/gpt-4o', ['anthropic/*']), false);
  assert.equal(modelMatchesAnyPattern('openai/gpt-4o', []), true);
});

test('wildcard exclusions', () => {
  assert.equal(
    modelMatchesExcludedPatterns('openai/gpt-4o-mini', ['openai/*']),
    true
  );
  assert.equal(
    modelMatchesExcludedPatterns('anthropic/claude-3.5-sonnet', ['openai/*']),
    false
  );
});
