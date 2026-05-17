import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoPromptRouter } from '../src/router.js';
import type { ModelInfo } from '../src/types.js';

const FIXTURE: { data: ModelInfo[] } = {
  data: [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      description: 'flagship',
      context_length: 128000,
      pricing: { prompt: '0.000005', completion: '0.000015' },
      top_provider: { max_completion_tokens: 4096, is_moderated: false },
    },
    {
      id: 'anthropic/claude-3-haiku',
      name: 'Haiku',
      description: 'fast',
      context_length: 200000,
      pricing: { prompt: '0.00000025', completion: '0.000001' },
      top_provider: { is_moderated: false },
    },
  ],
};

const originalFetch = globalThis.fetch;

test('initialize fires onCatalogLoaded with profile count', async t => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(FIXTURE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const events: Array<Record<string, unknown>> = [];
  const router = new AutoPromptRouter({
    OPEN_ROUTER_API_KEY: 'test',
    enableLogging: false,
    telemetry: {
      onCatalogLoaded: e => events.push({ kind: 'catalog', ...e }),
    },
  });

  await router.initialize();

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, 'catalog');
  assert.equal(events[0]?.totalProfiles, 2);
  assert.equal(typeof events[0]?.fromCache, 'boolean');
});
