import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenRouterRateLimiter } from '../src/http/openrouter-rate-limit.js';

test('OpenRouterRateLimiter serializes concurrent acquire calls', async () => {
  const interval = 40;
  const limiter = new OpenRouterRateLimiter(interval);
  const started = Date.now();
  await Promise.all([
    limiter.acquire(),
    limiter.acquire(),
    limiter.acquire(),
    limiter.acquire(),
  ]);
  const elapsed = Date.now() - started;
  assert.ok(
    elapsed >= interval * 3 - 5,
    `expected ~${interval * 3}ms spacing, got ${elapsed}ms`
  );
});
