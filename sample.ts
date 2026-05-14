/**
 * Local smoke test for the router (clone / PR branch).
 *
 *   export OPEN_ROUTER_API_KEY="your-key"
 *   optional: ENABLE_SAMPLE_ANALYTICS=1  (sends events to the default ingest URL)
 *   optional: SAMPLE_ALLOWED_PATTERNS="openai/*,anthropic/*"  (narrow catalog; comma-separated)
 *   pnpm exec tsx sample.ts
 *
 * Type-only imports avoid loading TensorFlow until your API key is validated.
 */

import type {
  RouterConfig,
  PromptProperties,
  ModelSelection,
} from './src/types.js';

function pickApiKey(): string {
  const fromEnv = process.env.OPEN_ROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  console.error(
    'Missing OPEN_ROUTER_API_KEY. Example:\n' +
      '  export OPEN_ROUTER_API_KEY="sk-or-..."\n' +
      '  pnpm exec tsx sample.ts\n'
  );
  process.exit(1);
}

function formatSelection(selection: ModelSelection): string {
  const lines = [
    `  model: ${selection.model}`,
    `  confidence: ${(selection.confidence * 100).toFixed(1)}%`,
    `  category: ${selection.category.type} (${(selection.category.confidence * 100).toFixed(1)}%)`,
    `  strategy: ${selection.selectionStrategy ?? 'deterministic (default)'}`,
  ];
  if (selection.selectionId) {
    lines.push(`  selectionId: ${selection.selectionId}`);
  }
  if (
    selection.categoryWeights &&
    Object.keys(selection.categoryWeights).length > 0
  ) {
    const w = Object.entries(selection.categoryWeights)
      .filter(([, v]) => (v ?? 0) > 0.05)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, v]) => `${k}:${((v ?? 0) * 100).toFixed(0)}%`)
      .join(', ');
    lines.push(`  categoryWeights: ${w || '(flat)'}`);
  }
  lines.push(`  reason: ${selection.reason}`);
  return lines.join('\n');
}

async function main() {
  const apiKey = pickApiKey();
  const analyticsEnabled = process.env.ENABLE_SAMPLE_ANALYTICS === '1';

  const { AutoPromptRouter } = await import('./src/index.js');

  console.log('Auto LLM selector — sample run\n');
  console.log(
    `Config: deterministic routing, multi-label classification on, analytics ${analyticsEnabled ? 'ON' : 'OFF'} (set ENABLE_SAMPLE_ANALYTICS=1 to enable)\n`
  );

  const config: RouterConfig = {
    OPEN_ROUTER_API_KEY: apiKey,
    /** Used only if selectionStrategy is 'llm' */
    selectorModel: 'openai/gpt-4o-mini',
    selectionStrategy: 'deterministic',
    enableLogging: true,
    multiLabelClassification: true,
    telemetry: {
      onModelSelected: ({ modelId, selectionStrategy, selectionId }) => {
        console.log(
          `  [telemetry] selected ${modelId} via ${selectionStrategy}${selectionId ? ` id=${selectionId}` : ''}`
        );
      },
    },
    ...(analyticsEnabled && {
      analytics: {
        enabled: true,
        collectPromptMetrics: true,
        collectModelPerformance: true,
        collectSemanticFeatures: true,
        collectSystemInfo: true,
        batchSize: 3,
        batchIntervalMs: 3000,
        debugMode: true,
      },
    }),
  };

  const router = new AutoPromptRouter(config);

  console.log('Initializing (OpenRouter model catalog + embeddings)…');
  await router.initialize();
  console.log('Ready.\n');

  const profiles = await router.getAvailableModels();
  console.log(`Catalog: ${profiles.length} models cached.\n`);

  const codingPrompt: PromptProperties = {
    accuracy: 0.9,
    cost: 0.4,
    speed: 0.6,
    tokenLimit: 16_000,
    reasoning: true,
  };

  const casualPrompt: PromptProperties = {
    accuracy: 0.55,
    cost: 0.15,
    speed: 0.85,
    tokenLimit: 4000,
    reasoning: false,
  };

  const multimodalProbe: PromptProperties = {
    accuracy: 0.75,
    cost: 0.35,
    speed: 0.5,
    tokenLimit: 32_000,
    reasoning: false,
    multimodal: true,
  };

  console.log('--- Single recommendation (coding, reasoning filter on) ---');
  const single = await router.getModelRecommendation(
    'Refactor this TypeScript function to use async iterators instead of buffering the full array in memory.',
    codingPrompt
  );
  console.log(formatSelection(single));
  if (single.selectionId) {
    router.reportOutcome(single.selectionId, 'good');
    console.log('  (reportOutcome recorded for selectionId)\n');
  } else {
    console.log('');
  }

  console.log('--- Batch recommendations (2 prompts) ---');
  const batch = await router.getModelRecommendations([
    {
      prompt: 'Hi — quick question about your return policy.',
      properties: casualPrompt,
    },
    {
      prompt:
        'Summarize differences between JWT and opaque session cookies for a security review.',
      properties: {
        accuracy: 0.85,
        cost: 0.45,
        speed: 0.55,
        tokenLimit: 8000,
        reasoning: true,
        qualityVsCost: 0.6,
      },
    },
  ]);
  batch.forEach((sel, i) => {
    console.log(`  [${i + 1}] ${sel.model} (${sel.category.type})`);
  });
  console.log('');

  console.log('--- Multimodal hard filter (vision-capable models only) ---');
  try {
    const vision = await router.getModelRecommendation(
      'Describe what to check in a UI screenshot attached as an image (assume image input).',
      multimodalProbe
    );
    console.log(formatSelection(vision));
  } catch (e) {
    console.log(
      `  (skipped or failed: ${e instanceof Error ? e.message : String(e)})`
    );
  }
  console.log('');

  const patternsNote = process.env.SAMPLE_ALLOWED_PATTERNS;
  if (patternsNote) {
    console.log(
      '--- Optional wildcard allow-list (SAMPLE_ALLOWED_PATTERNS) ---'
    );
    const narrowed = new AutoPromptRouter({
      ...config,
      allowedModelPatterns: patternsNote.split(',').map(s => s.trim()),
    });
    await narrowed.initialize();
    const sel = await narrowed.getModelRecommendation(
      'Short poem about the ocean.',
      casualPrompt
    );
    console.log(formatSelection(sel));
    await narrowed.shutdown();
    console.log('');
  }

  if (analyticsEnabled) {
    console.log('Waiting 4s for analytics batch flush…');
    await new Promise(r => setTimeout(r, 4000));
    console.log('Analytics status:', router.getAnalyticsStatus());
  }

  await router.shutdown();
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

export { main as testAutoPromptRouter };
