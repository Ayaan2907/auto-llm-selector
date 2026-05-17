import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyticsUtils } from '../src/analytics/utils.js';

test('sanitizeConfig removes top-level secrets and nested analytics.apiKey', () => {
  const raw = {
    OPEN_ROUTER_API_KEY: 'sk-or',
    selectorModel: 'x/y',
    analytics: {
      enabled: true,
      apiKey: 'should-not-leak',
      endpointUrl: 'https://example.com',
    },
  };

  const sanitized = AnalyticsUtils.sanitizeConfig(
    raw as unknown as Record<string, unknown>
  );

  assert.equal(sanitized.OPEN_ROUTER_API_KEY, undefined);
  const nested = sanitized.analytics as Record<string, unknown>;
  assert.ok(nested);
  assert.equal(nested.apiKey, undefined);
  assert.equal(nested.enabled, true);
  assert.equal(nested.endpointUrl, 'https://example.com');
});
