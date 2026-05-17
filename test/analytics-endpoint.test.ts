import assert from 'node:assert/strict';
import test from 'node:test';
import { AnalyticsQueue } from '../src/analytics/queue.js';
import type { AnalyticsConfig } from '../src/types.js';

const baseConfig: AnalyticsConfig = {
  enabled: true,
  collectPromptMetrics: true,
  collectModelPerformance: true,
  collectSemanticFeatures: true,
  collectSystemInfo: true,
};

test('AnalyticsQueue rejects non-HTTPS endpoint except localhost', () => {
  assert.throws(
    () =>
      new AnalyticsQueue({
        ...baseConfig,
        endpointUrl: 'http://example.com/collect',
      }),
    /HTTPS/
  );
});

test('AnalyticsQueue allows HTTP for localhost', () => {
  assert.doesNotThrow(
    () =>
      new AnalyticsQueue({
        ...baseConfig,
        endpointUrl: 'http://localhost:9999/analytics',
      })
  );
});
