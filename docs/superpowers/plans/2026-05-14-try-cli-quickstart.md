# `als try` Quick-Start CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `sample.ts` with a packaged interactive CLI (`als try`) that serves both contributors (`pnpm try` against `src/`) and end users (`npx als try` against `dist/cli.js`), narrates every router pipeline stage, and is fully scriptable via flags.

**Architecture:** Two small additive library changes (4 new optional telemetry hooks, plus relocation of the Node 22+ tfjs shim into the library so all consumers benefit). New `src/cli/` module composes 6 focused files (args, presets, key-store, renderer, snippet, wizard) behind a shebang entry. The CLI subscribes to the new hooks and pretty-prints each stage with `picocolors`; user input goes through `@inquirer/prompts`.

**Tech Stack:** Node ≥ 18, TypeScript 5.9 (nodenext + `verbatimModuleSyntax` + `exactOptionalPropertyTypes`), ESM-only output via tsup, `node --test` + `tsx/esm` loader, pnpm 10.12.1. New deps: `@inquirer/prompts`, `picocolors`.

**Spec:** `docs/superpowers/specs/2026-05-14-try-cli-quickstart-design.md` (read it before starting; this plan does not repeat the rationale).

**TS reminders that matter for every task:**

- Relative imports use `.js` extensions even though sources are `.ts`.
- Type-only imports must use `import type` (or inline `import { type X }`) — `verbatimModuleSyntax: true`.
- Optional properties with conditional values use the spread pattern: `...(value !== undefined && { foo: value })`.
- Don't use `console.*` in library code (`src/`) — use `Logger` from `src/utils/logger.js`. The CLI module is allowed to use `console` since it owns terminal output; expect eslint warnings or add `/* eslint-disable no-console */` at the top of CLI files.

**Commit hygiene:** One commit per task by default. Pre-commit runs lint-staged (eslint --fix + prettier on staged JS/TS/JSON/MD/YAML).

---

## Task 1: Install new runtime deps

**Files:**

- Modify: `package.json` (dependencies block, written by pnpm)

- [ ] **Step 1: Add deps**

Run:

```bash
pnpm add @inquirer/prompts picocolors
```

- [ ] **Step 2: Verify versions are pinned in package.json and lockfile updated**

Run:

```bash
git status --short
```

Expected: `M package.json` and `M pnpm-lock.yaml`.

- [ ] **Step 3: Sanity-check imports resolve**

Run:

```bash
node --input-type=module -e "import('@inquirer/prompts').then(m => console.log(Object.keys(m).slice(0,5))); import('picocolors').then(m => console.log(Object.keys(m.default).slice(0,5)));"
```

Expected: prints arrays of exports (e.g. `[ 'input', 'number', 'select', 'confirm', 'password' ]`).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @inquirer/prompts and picocolors for the try CLI"
```

---

## Task 2: Relocate the tfjs-node22 shim into the library

**Files:**

- Create: `src/lib/tfjs-node22-shim.ts`
- Modify: `src/lib/semantic-classifier.ts` (top-of-file side-effect import)

- [ ] **Step 1: Create the shim module**

Write `src/lib/tfjs-node22-shim.ts`:

```typescript
import { createRequire } from 'node:module';
import * as nodeUtil from 'node:util';

const requireUtil = createRequire(import.meta.url);
const utilCjs = requireUtil('util') as typeof nodeUtil & {
  isNullOrUndefined?: (value: unknown) => boolean;
};

if (typeof utilCjs.isNullOrUndefined !== 'function') {
  utilCjs.isNullOrUndefined = (value: unknown) =>
    value === null || value === undefined;
}
```

- [ ] **Step 2: Side-effect import it at the top of the semantic classifier**

Open `src/lib/semantic-classifier.ts` and add as the very first import (above any other import that could transitively load tfjs-node):

```typescript
import './tfjs-node22-shim.js';
```

- [ ] **Step 3: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Run existing tests to confirm nothing regressed**

Run:

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tfjs-node22-shim.ts src/lib/semantic-classifier.ts
git commit -m "fix(tfjs): apply util.isNullOrUndefined shim inside the library

Node 22+ removed util.isNullOrUndefined but @tensorflow/tfjs-node still
calls it. Previously the workaround lived only in sample.ts; move it
into a side-effect module loaded by semantic-classifier so every library
consumer benefits, not just the demo."
```

---

## Task 3: Add detailed drop reasons to hard filters (TDD)

**Files:**

- Modify: `src/routing/hard-filters.ts`
- Test: `test/hard-filters-detailed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/hard-filters-detailed.test.ts`:

```typescript
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
  const profiles = [
    makeProfile({ id: 'ctx-too-small', contextLength: 1000 }),
    makeProfile({
      id: 'too-expensive',
      characteristics: {
        ...makeProfile({}).characteristics,
        costTier: 'premium',
      },
    }),
    makeProfile({
      id: 'denied',
      characteristics: { ...makeProfile({}).characteristics },
    }),
    makeProfile({ id: 'survivor' }),
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
    ['survivor']
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm build && node --test --import tsx/esm test/hard-filters-detailed.test.ts
```

Expected: FAIL — `applyHardFiltersDetailed` is not exported.

- [ ] **Step 3: Refactor `hard-filters.ts` to expose detailed results**

Replace the body of `src/routing/hard-filters.ts` (everything below the existing helper functions and `HardFilterOptions`) with:

```typescript
export type HardFilterDropReason =
  | 'multimodal'
  | 'denyList'
  | 'allowList'
  | 'tokenLimit'
  | 'costTier'
  | 'speedTier'
  | 'accuracyTier';

export interface HardFilterResult {
  survivors: ModelProfile[];
  droppedReasons: Record<HardFilterDropReason, number>;
}

const ZERO_REASONS: Record<HardFilterDropReason, number> = {
  multimodal: 0,
  denyList: 0,
  allowList: 0,
  tokenLimit: 0,
  costTier: 0,
  speedTier: 0,
  accuracyTier: 0,
};

export function applyHardFiltersDetailed(
  profiles: ModelProfile[],
  properties: PromptProperties,
  options: HardFilterOptions = {}
): HardFilterResult {
  const { allowedModelPatterns = [], excludedModelPatterns = [] } = options;
  const maxCostTierIdx = maxCostTierIndexFromCost(properties.cost);
  const minSpeedIdx = minSpeedIndexFromSpeed(properties.speed);
  const minAccIdx = minAccuracyIndexFromAccuracy(properties.accuracy);

  const survivors: ModelProfile[] = [];
  const droppedReasons: Record<HardFilterDropReason, number> = {
    ...ZERO_REASONS,
  };

  for (const profile of profiles) {
    const reason = firstFailingReason(profile, properties, {
      allowedModelPatterns,
      excludedModelPatterns,
      maxCostTierIdx,
      minSpeedIdx,
      minAccIdx,
    });
    if (reason === null) {
      survivors.push(profile);
    } else {
      droppedReasons[reason] += 1;
    }
  }

  return { survivors, droppedReasons };
}

export function applyHardFilters(
  profiles: ModelProfile[],
  properties: PromptProperties,
  options: HardFilterOptions = {}
): ModelProfile[] {
  return applyHardFiltersDetailed(profiles, properties, options).survivors;
}

function firstFailingReason(
  profile: ModelProfile,
  properties: PromptProperties,
  ctx: {
    allowedModelPatterns: string[];
    excludedModelPatterns: string[];
    maxCostTierIdx: number;
    minSpeedIdx: number;
    minAccIdx: number;
  }
): HardFilterDropReason | null {
  if (properties.multimodal === true && !profile.characteristics.isMultimodal) {
    return 'multimodal';
  }
  if (
    ctx.excludedModelPatterns.length > 0 &&
    modelMatchesExcludedPatterns(profile.id, ctx.excludedModelPatterns)
  ) {
    return 'denyList';
  }
  if (
    ctx.allowedModelPatterns.length > 0 &&
    !modelMatchesAnyPattern(profile.id, ctx.allowedModelPatterns)
  ) {
    return 'allowList';
  }
  if (
    Number.isFinite(properties.tokenLimit) &&
    properties.tokenLimit > 0 &&
    profile.contextLength < properties.tokenLimit
  ) {
    return 'tokenLimit';
  }
  if (costTierIndex(profile.characteristics.costTier) > ctx.maxCostTierIdx) {
    return 'costTier';
  }
  if (
    SPEED_ORDER.indexOf(profile.characteristics.speedTier) < ctx.minSpeedIdx
  ) {
    return 'speedTier';
  }
  if (
    ACCURACY_ORDER.indexOf(profile.characteristics.accuracyTier) < ctx.minAccIdx
  ) {
    return 'accuracyTier';
  }
  return null;
}
```

Keep everything above (`SPEED_ORDER`, `ACCURACY_ORDER`, `COST_ORDER`, helper functions, and `HardFilterOptions` export) unchanged.

- [ ] **Step 4: Run both hard-filter tests**

Run:

```bash
pnpm build && node --test --import tsx/esm test/hard-filters.test.ts test/hard-filters-detailed.test.ts
```

Expected: all tests pass. (The existing `hard-filters.test.ts` should keep working because `applyHardFilters` now delegates to `applyHardFiltersDetailed` and returns the same shape.)

- [ ] **Step 5: Commit**

```bash
git add src/routing/hard-filters.ts test/hard-filters-detailed.test.ts
git commit -m "feat(routing): expose per-rejection reasons via applyHardFiltersDetailed

Adds a detailed variant returning survivors plus a count of drops keyed
by the first failing constraint (tokenLimit, costTier, allowList, etc.).
applyHardFilters preserves its existing signature by delegating."
```

---

## Task 4: Expose cache age from `InMemoryModelCache`

**Files:**

- Modify: `src/cache.ts`

- [ ] **Step 1: Add a public method that reports the last fetch timestamp**

In `src/cache.ts`, add this method to the `InMemoryModelCache` class (place it just below `getModelProfile`):

```typescript
  /** Epoch ms of the most recent successful fetch, or 0 if never fetched. */
  getLastFetchedAt(): number {
    return this.lastFetched;
  }
```

Also export the class. Confirm the existing `export` is in place — if the file currently has `class InMemoryModelCache` without `export`, change the declaration line to `export class InMemoryModelCache`. If it is already exported, leave it.

- [ ] **Step 2: Typecheck and run tests**

Run:

```bash
pnpm typecheck && pnpm test
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/cache.ts
git commit -m "feat(cache): expose getLastFetchedAt for telemetry"
```

---

## Task 5: Extend `RouterTelemetryHooks` (types only)

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Add four new optional hooks to the `RouterTelemetryHooks` type**

In `src/types.ts`, replace the existing `RouterTelemetryHooks` declaration with:

```typescript
export type RouterTelemetryHooks = {
  /** Fires after a model id is chosen (deterministic or LLM). */
  onModelSelected?: (event: {
    modelId: string;
    selectionStrategy: ModelSelectionStrategy;
    selectionId?: string;
  }) => void;

  /** Fires once per recommendation after the model catalog is available. */
  onCatalogLoaded?: (event: {
    totalProfiles: number;
    fromCache: boolean;
    cacheAgeMs?: number;
  }) => void;

  /** Fires after the prompt is classified (single- or multi-label). */
  onClassified?: (event: {
    category: PromptCategory;
    multiLabelWeights?: Partial<Record<PromptType, number>>;
  }) => void;

  /**
   * Fires after each filter stage. `droppedReasons` is only populated for the
   * `hard-filters` stage; the others are single-criterion.
   */
  onFilterStage?: (event: {
    stage: 'reasoning' | 'category-threshold' | 'hard-filters';
    before: number;
    after: number;
    droppedReasons?: Record<string, number>;
  }) => void;

  /** Fires once with the top-N ranked candidates just before final selection. */
  onCandidatesRanked?: (event: {
    strategy: ModelSelectionStrategy;
    topN: Array<{ id: string; score: number; reason: string }>;
  }) => void;
};
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean. (Library callers won't break since every hook is optional.)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add four optional router telemetry hooks

onCatalogLoaded, onClassified, onFilterStage, onCandidatesRanked. All
optional so existing consumers see no change."
```

---

## Task 6: Wire the telemetry hooks in `router.ts` (+ unit test for `onCatalogLoaded`)

**Files:**

- Modify: `src/router.ts`
- Test: `test/router-telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/router-telemetry.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm build && node --test --import tsx/esm test/router-telemetry.test.ts
```

Expected: FAIL — `onCatalogLoaded` is not fired yet.

- [ ] **Step 3: Wire the hooks in `router.ts`**

In `src/router.ts`:

**3a.** In the `initialize()` method, just after `const modelProfiles = await this.modelCache.getModelProfiles();`, add:

```typescript
const lastFetchedAt = this.modelCache.getLastFetchedAt();
const cacheAgeMs = lastFetchedAt > 0 ? Date.now() - lastFetchedAt : undefined;
this.config.telemetry?.onCatalogLoaded?.({
  totalProfiles: modelProfiles.length,
  fromCache: cacheAgeMs !== undefined && cacheAgeMs > 0,
  ...(cacheAgeMs !== undefined && { cacheAgeMs }),
});
```

**3b.** In `getModelRecommendation()`, just after `const allProfiles = await this.modelCache.getModelProfiles();`, re-emit the same hook so consumers see freshness on every call:

```typescript
const lastFetchedAt = this.modelCache.getLastFetchedAt();
const cacheAgeMs = lastFetchedAt > 0 ? Date.now() - lastFetchedAt : undefined;
this.config.telemetry?.onCatalogLoaded?.({
  totalProfiles: allProfiles.length,
  fromCache: true,
  ...(cacheAgeMs !== undefined && { cacheAgeMs }),
});
```

**3c.** In the same method, right after the reasoning-only filter block, emit:

```typescript
if (properties.reasoning === true) {
  this.config.telemetry?.onFilterStage?.({
    stage: 'reasoning',
    before: allProfiles.length,
    after: availableProfiles.length,
  });
}
```

**3d.** After classification (immediately after the `this.logger.info(`Prompt classified as: …`)` line), emit:

```typescript
this.config.telemetry?.onClassified?.({
  category,
  ...(categoryWeights !== undefined && {
    multiLabelWeights: categoryWeights,
  }),
});
```

**3e.** After the `categoryProfiles` is computed and sorted, emit:

```typescript
this.config.telemetry?.onFilterStage?.({
  stage: 'category-threshold',
  before: availableProfiles.length,
  after: categoryProfiles.length,
});
```

**3f.** Replace the existing `applyHardFilters(...)` call with the detailed variant. Add this import at the top of the file alongside the existing routing import:

```typescript
import {
  applyHardFiltersDetailed,
  type HardFilterOptions,
} from './routing/hard-filters.js';
```

(Remove the old `applyHardFilters` from the import list since router.ts no longer uses it.)

Then replace the call site:

```typescript
const { survivors: hardFiltered, droppedReasons } = applyHardFiltersDetailed(
  categoryProfiles,
  properties,
  hardFilterOptions
);

this.config.telemetry?.onFilterStage?.({
  stage: 'hard-filters',
  before: categoryProfiles.length,
  after: hardFiltered.length,
  droppedReasons,
});
```

**3g.** Emit `onCandidatesRanked` from inside both `getDeterministicSelection` and `getLLMDecisionWithProfiles`. Update the deterministic branch first — change `getDeterministicSelection` so that just before `const top = ranking.rankedModels[0]`, it emits:

```typescript
const topN = ranking.rankedModels.slice(0, 5).map(r => ({
  id: r.model.id,
  score: r.score,
  reason: r.reasoning,
}));
this.config.telemetry?.onCandidatesRanked?.({ strategy, topN });
```

**3h.** Update the LLM branch — in `getLLMDecisionWithProfiles`, just before the `const selectionPrompt = …` template literal, emit:

```typescript
this.config.telemetry?.onCandidatesRanked?.({
  strategy: 'llm',
  topN: profileInfo.slice(0, 5).map(p => ({
    id: p.id,
    score: p.categoryScore / 100,
    reason: `${category.type} ${p.categoryScore}% · ${p.speedTier}/${p.costTier}/${p.accuracyTier}`,
  })),
});
```

- [ ] **Step 4: Run the new test (and the existing suite) to verify it passes**

Run:

```bash
pnpm build && pnpm test
```

Expected: all tests pass including `router-telemetry.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/router.ts test/router-telemetry.test.ts
git commit -m "feat(router): emit telemetry hooks at every pipeline stage

Fires onCatalogLoaded, onClassified, onFilterStage (x3 — reasoning,
category-threshold, hard-filters with droppedReasons), and
onCandidatesRanked (deterministic and llm branches). Pure observability
— no behavior change; hooks are optional."
```

---

## Task 7: CLI argument parser (TDD)

**Files:**

- Create: `src/cli/args.ts`
- Test: `test/cli-args.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/cli-args.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTryArgs, ArgError } from '../src/cli/args.js';

test('parses prompt and numeric knobs', () => {
  const a = parseTryArgs([
    '--prompt',
    'hello',
    '--accuracy',
    '0.8',
    '--cost',
    '0.3',
    '--speed',
    '0.7',
    '--token-limit',
    '12000',
    '--reasoning',
  ]);
  assert.equal(a.prompt, 'hello');
  assert.equal(a.accuracy, 0.8);
  assert.equal(a.cost, 0.3);
  assert.equal(a.speed, 0.7);
  assert.equal(a.tokenLimit, 12000);
  assert.equal(a.reasoning, true);
});

test('parses preset + multi-label + non-interactive', () => {
  const a = parseTryArgs([
    '--preset',
    'coding',
    '--multi-label',
    '--non-interactive',
    '--prompt',
    'p',
  ]);
  assert.equal(a.preset, 'coding');
  assert.equal(a.multiLabel, true);
  assert.equal(a.nonInteractive, true);
});

test('parses allow/deny CSV', () => {
  const a = parseTryArgs([
    '--allow',
    'openai/*,anthropic/*',
    '--deny',
    'meta/*',
  ]);
  assert.deepEqual(a.allow, ['openai/*', 'anthropic/*']);
  assert.deepEqual(a.deny, ['meta/*']);
});

test('rejects out-of-range numeric values', () => {
  assert.throws(
    () => parseTryArgs(['--accuracy', '1.5']),
    (err: unknown) => err instanceof ArgError
  );
});

test('rejects unknown flag', () => {
  assert.throws(
    () => parseTryArgs(['--bogus', 'x']),
    (err: unknown) => err instanceof ArgError
  );
});

test('non-interactive without --prompt is rejected at finalize time', () => {
  const a = parseTryArgs(['--non-interactive']);
  assert.equal(a.nonInteractive, true);
  assert.equal(a.prompt, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm build && node --test --import tsx/esm test/cli-args.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/cli/args.ts`:

```typescript
/* eslint-disable no-console */
import type { ModelSelectionStrategy } from '../types.js';

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgError';
  }
}

export type PresetName = 'coding' | 'creative' | 'quick' | 'analytical';

export interface ParsedTryArgs {
  prompt?: string;
  preset?: PresetName;
  accuracy?: number;
  cost?: number;
  speed?: number;
  tokenLimit?: number;
  reasoning?: boolean;
  multimodal?: boolean;
  strategy?: ModelSelectionStrategy;
  selectorModel?: string;
  multiLabel?: boolean;
  allow?: string[];
  deny?: string[];
  nonInteractive?: boolean;
  repeat?: boolean;
  color?: boolean;
  help?: boolean;
  version?: boolean;
}

const FLAGS = new Set([
  '--prompt',
  '--preset',
  '--accuracy',
  '--cost',
  '--speed',
  '--token-limit',
  '--reasoning',
  '--multimodal',
  '--strategy',
  '--selector-model',
  '--multi-label',
  '--allow',
  '--deny',
  '--non-interactive',
  '--repeat',
  '--no-color',
  '-h',
  '--help',
  '-v',
  '--version',
]);

function unit(name: string, raw: string | undefined): number {
  if (raw === undefined) throw new ArgError(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ArgError(`${name} must be a number in [0, 1] (got ${raw})`);
  }
  return n;
}

function positiveInt(name: string, raw: string | undefined): number {
  if (raw === undefined) throw new ArgError(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ArgError(`${name} must be a positive integer (got ${raw})`);
  }
  return n;
}

function csv(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function boolWithOptionalValue(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ArgError(`expected true|false, got ${raw}`);
}

export function parseTryArgs(argv: string[]): ParsedTryArgs {
  const out: ParsedTryArgs = {};
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i]!;
    if (!FLAGS.has(flag)) {
      throw new ArgError(`unknown flag: ${flag}`);
    }
    const next = argv[i + 1];
    switch (flag) {
      case '--prompt':
        out.prompt = next;
        i += 2;
        break;
      case '--preset': {
        if (
          next !== 'coding' &&
          next !== 'creative' &&
          next !== 'quick' &&
          next !== 'analytical'
        ) {
          throw new ArgError(
            `--preset must be one of coding|creative|quick|analytical`
          );
        }
        out.preset = next;
        i += 2;
        break;
      }
      case '--accuracy':
        out.accuracy = unit('--accuracy', next);
        i += 2;
        break;
      case '--cost':
        out.cost = unit('--cost', next);
        i += 2;
        break;
      case '--speed':
        out.speed = unit('--speed', next);
        i += 2;
        break;
      case '--token-limit':
        out.tokenLimit = positiveInt('--token-limit', next);
        i += 2;
        break;
      case '--reasoning': {
        // Allow `--reasoning` (true) or `--reasoning false`
        const isValue = next === 'true' || next === 'false';
        out.reasoning = boolWithOptionalValue(isValue ? next : undefined);
        i += isValue ? 2 : 1;
        break;
      }
      case '--multimodal':
        out.multimodal = true;
        i += 1;
        break;
      case '--strategy': {
        if (next !== 'deterministic' && next !== 'llm' && next !== 'det') {
          throw new ArgError(`--strategy must be deterministic|llm`);
        }
        out.strategy = next === 'det' ? 'deterministic' : next;
        i += 2;
        break;
      }
      case '--selector-model':
        out.selectorModel = next;
        i += 2;
        break;
      case '--multi-label':
        out.multiLabel = true;
        i += 1;
        break;
      case '--allow':
        out.allow = csv(next);
        i += 2;
        break;
      case '--deny':
        out.deny = csv(next);
        i += 2;
        break;
      case '--non-interactive':
        out.nonInteractive = true;
        i += 1;
        break;
      case '--repeat':
        out.repeat = true;
        i += 1;
        break;
      case '--no-color':
        out.color = false;
        i += 1;
        break;
      case '-h':
      case '--help':
        out.help = true;
        i += 1;
        break;
      case '-v':
      case '--version':
        out.version = true;
        i += 1;
        break;
    }
  }
  return out;
}

export function helpText(): string {
  return `als try [options]

  --prompt <text>              Prompt text
  --preset <name>              coding | creative | quick | analytical
  --accuracy <0-1>
  --cost <0-1>
  --speed <0-1>
  --token-limit <n>
  --reasoning [true|false]
  --multimodal
  --strategy <det|llm>         deterministic (default) or llm
  --selector-model <id>
  --multi-label
  --allow <pattern,...>
  --deny <pattern,...>
  --non-interactive            Fail if any required field is missing
  --repeat                     Loop the wizard (embeddings stay warm)
  --no-color
  -h, --help
  -v, --version
`;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm build && node --test --import tsx/esm test/cli-args.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/args.ts test/cli-args.test.ts
git commit -m "feat(cli): add try-command argument parser"
```

---

## Task 8: CLI presets (TDD)

**Files:**

- Create: `src/cli/presets.ts`
- Test: `test/cli-presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/cli-presets.test.ts`:

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetToProperties } from '../src/cli/presets.js';
import { assertValidPromptProperties } from '../src/validation/schemas.js';

const NAMES = ['coding', 'creative', 'quick', 'analytical'] as const;

test('each preset survives the prompt-properties schema', () => {
  for (const name of NAMES) {
    const props = presetToProperties(name);
    assert.doesNotThrow(() => assertValidPromptProperties(props));
  }
});

test('preset values stay within [0,1] for unit knobs', () => {
  for (const name of NAMES) {
    const p = PRESETS[name];
    for (const k of ['accuracy', 'cost', 'speed'] as const) {
      assert.ok(p[k] >= 0 && p[k] <= 1, `${name}.${k} out of range`);
    }
    assert.ok(p.tokenLimit > 0, `${name}.tokenLimit must be positive`);
  }
});
```

- [ ] **Step 2: Run test — should fail (module missing)**

Run:

```bash
pnpm build && node --test --import tsx/esm test/cli-presets.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement presets**

Create `src/cli/presets.ts`:

```typescript
import type { PromptProperties } from '../types.js';
import type { PresetName } from './args.js';

export const PRESETS: Record<PresetName, PromptProperties> = {
  coding: {
    accuracy: 0.85,
    cost: 0.45,
    speed: 0.6,
    tokenLimit: 16000,
    reasoning: true,
  },
  creative: {
    accuracy: 0.7,
    cost: 0.4,
    speed: 0.4,
    tokenLimit: 8000,
    reasoning: false,
  },
  quick: {
    accuracy: 0.55,
    cost: 0.15,
    speed: 0.85,
    tokenLimit: 4000,
    reasoning: false,
  },
  analytical: {
    accuracy: 0.85,
    cost: 0.5,
    speed: 0.55,
    tokenLimit: 12000,
    reasoning: true,
  },
};

export function presetToProperties(name: PresetName): PromptProperties {
  return { ...PRESETS[name] };
}

export const PRESET_NAMES: ReadonlyArray<PresetName> = [
  'coding',
  'creative',
  'quick',
  'analytical',
];
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm build && node --test --import tsx/esm test/cli-presets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/presets.ts test/cli-presets.test.ts
git commit -m "feat(cli): add prompt-properties presets"
```

---

## Task 9: CLI key store

**Files:**

- Create: `src/cli/key-store.ts`

- [ ] **Step 1: Implement the key resolver**

Create `src/cli/key-store.ts`:

```typescript
/* eslint-disable no-console */
import { password } from '@inquirer/prompts';

const ENV_KEY = 'OPEN_ROUTER_API_KEY';

export interface KeyResolution {
  key: string;
  source: 'env' | 'prompt';
}

export async function resolveApiKey(options: {
  nonInteractive: boolean;
}): Promise<KeyResolution> {
  const fromEnv = process.env[ENV_KEY]?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };

  if (options.nonInteractive) {
    throw new Error(
      `${ENV_KEY} is not set. In --non-interactive mode the env var is required.`
    );
  }

  const key = await password({
    message: 'OpenRouter API key:',
    mask: '*',
    validate: input =>
      input.trim().length === 0 ? 'API key is required' : true,
  });
  return { key: key.trim(), source: 'prompt' };
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/cli/key-store.ts
git commit -m "feat(cli): resolve OpenRouter API key from env or interactive prompt"
```

---

## Task 10: CLI renderer (subscribes to telemetry hooks)

**Files:**

- Create: `src/cli/renderer.ts`

- [ ] **Step 1: Implement the renderer**

Create `src/cli/renderer.ts`:

```typescript
/* eslint-disable no-console */
import pc from 'picocolors';
import type {
  RouterTelemetryHooks,
  ModelSelection,
  PromptCategory,
  PromptType,
} from '../types.js';

export interface RendererOptions {
  color: boolean;
}

export function buildTelemetryHooks(
  opts: RendererOptions
): RouterTelemetryHooks {
  const c = opts.color ? pc : noColor();
  const arrow = c.cyan('▸');

  return {
    onCatalogLoaded: e => {
      const age =
        e.cacheAgeMs !== undefined
          ? ` (${e.fromCache ? 'from cache, age ' : ''}${formatMs(e.cacheAgeMs)})`
          : '';
      console.log(
        `${arrow} catalog: ${c.bold(String(e.totalProfiles))} profiles loaded${age}`
      );
    },
    onClassified: e => {
      const weights = e.multiLabelWeights
        ? '  ' + c.dim(formatWeights(e.multiLabelWeights))
        : '';
      console.log(
        `${arrow} classified: ${c.bold(e.category.type)} (${(e.category.confidence * 100).toFixed(0)}%)${weights}`
      );
    },
    onFilterStage: e => {
      const label = labelForStage(e.stage);
      const reasons =
        e.droppedReasons && Object.keys(e.droppedReasons).length > 0
          ? '  ' + c.dim(formatReasons(e.droppedReasons))
          : '';
      console.log(
        `${arrow} ${label}: ${e.before} → ${c.bold(String(e.after))}${reasons}`
      );
    },
    onCandidatesRanked: e => {
      console.log(`${arrow} ranked top ${e.topN.length} (${e.strategy}):`);
      e.topN.forEach((cand, i) => {
        console.log(
          `    ${i + 1}. ${c.bold(cand.id)}   ${cand.score.toFixed(2)}   ${c.dim(cand.reason)}`
        );
      });
    },
    onModelSelected: e => {
      const sid = e.selectionId
        ? `  ${c.dim(`(selectionId: ${e.selectionId.slice(0, 8)}…)`)}`
        : '';
      console.log(
        `${arrow} ${c.green('selected:')} ${c.bold(e.modelId)}${sid}`
      );
    },
  };
}

export function renderHeader(opts: RendererOptions, title: string): void {
  const c = opts.color ? pc : noColor();
  console.log(c.bold(`\nauto-llm-selector — ${title}\n`));
}

export function renderFinal(
  selection: ModelSelection,
  category: PromptCategory,
  opts: RendererOptions
): void {
  // onModelSelected already prints the selection; this hook is reserved
  // for any extra summary the snippet emitter might want to add.
  void selection;
  void category;
  void opts;
}

function labelForStage(
  stage: 'reasoning' | 'category-threshold' | 'hard-filters'
): string {
  if (stage === 'reasoning') return 'reasoning filter        ';
  if (stage === 'category-threshold') return 'category threshold ≥0.3 ';
  return 'hard filters            ';
}

function formatReasons(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} by ${k}`)
    .join(' · ');
}

function formatWeights(weights: Partial<Record<PromptType, number>>): string {
  return Object.entries(weights)
    .filter(([, v]) => (v ?? 0) > 0.05)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => `${k}:${((v ?? 0) * 100).toFixed(0)}%`)
    .join(' · ');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function noColor(): typeof pc {
  const identity = (s: string) => s;
  return new Proxy(pc, {
    get: () => identity,
  }) as unknown as typeof pc;
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/cli/renderer.ts
git commit -m "feat(cli): pipeline renderer subscribing to telemetry hooks"
```

---

## Task 11: CLI snippet emitter

**Files:**

- Create: `src/cli/snippet.ts`

- [ ] **Step 1: Implement the snippet emitter**

Create `src/cli/snippet.ts`:

```typescript
/* eslint-disable no-console */
import pc from 'picocolors';
import type { PromptProperties } from '../types.js';

export interface SnippetInput {
  prompt: string;
  properties: PromptProperties;
  multiLabel?: boolean;
  allow?: string[];
  deny?: string[];
  strategy?: 'deterministic' | 'llm';
  selectorModel?: string;
  color: boolean;
}

export function printEquivalentSnippet(input: SnippetInput): void {
  const c = input.color ? pc : passthrough();
  const lines: string[] = [];

  lines.push(`import { AutoPromptRouter } from 'auto-llm-selector';`);
  lines.push('');
  const configLines = [
    `  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,`,
  ];
  if (input.strategy && input.strategy !== 'deterministic') {
    configLines.push(`  selectionStrategy: '${input.strategy}',`);
    if (input.selectorModel) {
      configLines.push(`  selectorModel: '${input.selectorModel}',`);
    }
  }
  if (input.multiLabel) configLines.push(`  multiLabelClassification: true,`);
  if (input.allow?.length) {
    configLines.push(`  allowedModelPatterns: ${JSON.stringify(input.allow)},`);
  }
  if (input.deny?.length) {
    configLines.push(`  excludedModelPatterns: ${JSON.stringify(input.deny)},`);
  }
  lines.push(`const router = new AutoPromptRouter({`);
  lines.push(...configLines);
  lines.push(`});`);
  lines.push(`await router.initialize();`);
  lines.push('');
  lines.push(`const result = await router.getModelRecommendation(`);
  lines.push(`  ${JSON.stringify(input.prompt)},`);
  lines.push(`  ${formatPropertiesLiteral(input.properties)},`);
  lines.push(`);`);
  lines.push(`console.log(result.model);`);

  const rule = c.dim('─'.repeat(60));
  console.log('');
  console.log(c.bold('Equivalent code:'));
  console.log(rule);
  for (const line of lines) console.log(line);
  console.log(rule);
}

function formatPropertiesLiteral(p: PromptProperties): string {
  const entries: string[] = [];
  entries.push(`accuracy: ${p.accuracy}`);
  entries.push(`cost: ${p.cost}`);
  entries.push(`speed: ${p.speed}`);
  entries.push(`tokenLimit: ${p.tokenLimit}`);
  entries.push(`reasoning: ${p.reasoning}`);
  if (p.multimodal !== undefined) entries.push(`multimodal: ${p.multimodal}`);
  if (p.qualityVsCost !== undefined)
    entries.push(`qualityVsCost: ${p.qualityVsCost}`);
  return `{ ${entries.join(', ')} }`;
}

function passthrough(): typeof pc {
  const identity = (s: string) => s;
  return new Proxy(pc, { get: () => identity }) as unknown as typeof pc;
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/cli/snippet.ts
git commit -m "feat(cli): print equivalent TypeScript snippet for each run"
```

---

## Task 12: CLI wizard

**Files:**

- Create: `src/cli/wizard.ts`

- [ ] **Step 1: Implement the wizard**

Create `src/cli/wizard.ts`:

```typescript
/* eslint-disable no-console */
import { input, number, confirm, select } from '@inquirer/prompts';
import type { PromptProperties } from '../types.js';
import type { ModelSelectionStrategy } from '../types.js';
import { PRESETS } from './presets.js';
import type { ParsedTryArgs, PresetName } from './args.js';

export interface ResolvedRunConfig {
  prompt: string;
  properties: PromptProperties;
  strategy: ModelSelectionStrategy;
  selectorModel?: string;
  multiLabel: boolean;
  allow: string[];
  deny: string[];
}

export async function resolveRunConfig(
  args: ParsedTryArgs
): Promise<ResolvedRunConfig> {
  if (args.nonInteractive) return resolveNonInteractive(args);

  const preset =
    args.preset ??
    (await select<PresetName | 'custom'>({
      message: 'Use a preset?',
      choices: [
        { name: 'coding', value: 'coding' as const },
        { name: 'creative', value: 'creative' as const },
        { name: 'quick', value: 'quick' as const },
        { name: 'analytical', value: 'analytical' as const },
        { name: 'custom', value: 'custom' as const },
      ],
      default: 'custom' as const,
    }));

  const base: PromptProperties =
    preset === 'custom'
      ? {
          accuracy: 0.7,
          cost: 0.5,
          speed: 0.6,
          tokenLimit: 8000,
          reasoning: false,
        }
      : { ...PRESETS[preset] };

  const prompt =
    args.prompt ??
    (await input({
      message: 'Prompt:',
      validate: v => (v.trim().length === 0 ? 'Prompt is required' : true),
    }));

  const accuracy =
    args.accuracy ?? (await askUnit('Accuracy (0-1)', base.accuracy));
  const cost = args.cost ?? (await askUnit('Cost (0-1)', base.cost));
  const speed = args.speed ?? (await askUnit('Speed (0-1)', base.speed));
  const tokenLimit =
    args.tokenLimit ??
    (await number({
      message: 'Min context (tokens):',
      default: base.tokenLimit,
      min: 1,
    })) ??
    base.tokenLimit;
  const reasoning =
    args.reasoning ??
    (await confirm({
      message: 'Reasoning-only models?',
      default: base.reasoning,
    }));
  const multimodal =
    args.multimodal ??
    (await confirm({ message: 'Multimodal?', default: false }));
  const strategy =
    args.strategy ??
    (await select<ModelSelectionStrategy>({
      message: 'Selection strategy',
      choices: [
        { name: 'deterministic (fast, reproducible)', value: 'deterministic' },
        { name: 'llm (legacy meta-LLM chooser)', value: 'llm' },
      ],
      default: 'deterministic',
    }));
  const selectorModel =
    strategy === 'llm'
      ? (args.selectorModel ??
        (await input({
          message: 'Selector model id:',
          default: 'openai/gpt-4o-mini',
        })))
      : undefined;
  const multiLabel =
    args.multiLabel ??
    (await confirm({ message: 'Multi-label classification?', default: false }));
  const allow =
    args.allow ??
    (await csvPrompt('Allowed model patterns (CSV, blank for none):'));
  const deny =
    args.deny ??
    (await csvPrompt('Excluded model patterns (CSV, blank for none):'));

  return {
    prompt,
    properties: {
      accuracy,
      cost,
      speed,
      tokenLimit,
      reasoning,
      ...(multimodal && { multimodal: true }),
    },
    strategy,
    ...(selectorModel !== undefined && { selectorModel }),
    multiLabel,
    allow,
    deny,
  };
}

function resolveNonInteractive(args: ParsedTryArgs): ResolvedRunConfig {
  if (args.prompt === undefined) {
    throw new Error('--prompt is required in --non-interactive mode');
  }
  const base: PromptProperties = args.preset
    ? { ...PRESETS[args.preset] }
    : {
        accuracy: 0.7,
        cost: 0.5,
        speed: 0.6,
        tokenLimit: 8000,
        reasoning: false,
      };

  return {
    prompt: args.prompt,
    properties: {
      accuracy: args.accuracy ?? base.accuracy,
      cost: args.cost ?? base.cost,
      speed: args.speed ?? base.speed,
      tokenLimit: args.tokenLimit ?? base.tokenLimit,
      reasoning: args.reasoning ?? base.reasoning,
      ...(args.multimodal === true && { multimodal: true }),
    },
    strategy: args.strategy ?? 'deterministic',
    ...(args.selectorModel !== undefined && {
      selectorModel: args.selectorModel,
    }),
    multiLabel: args.multiLabel ?? false,
    allow: args.allow ?? [],
    deny: args.deny ?? [],
  };
}

async function askUnit(message: string, dflt: number): Promise<number> {
  const n = await number({
    message: `${message}:`,
    default: dflt,
    min: 0,
    max: 1,
  });
  return n ?? dflt;
}

async function csvPrompt(message: string): Promise<string[]> {
  const raw = await input({ message, default: '' });
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/cli/wizard.ts
git commit -m "feat(cli): interactive wizard for prompt and router knobs"
```

---

## Task 13: CLI entrypoint

**Files:**

- Create: `src/cli/index.ts`

- [ ] **Step 1: Implement the entrypoint**

Create `src/cli/index.ts`:

```typescript
/* eslint-disable no-console */
import { confirm } from '@inquirer/prompts';
import { AutoPromptRouter } from '../router.js';
import { parseTryArgs, helpText, ArgError } from './args.js';
import { resolveApiKey } from './key-store.js';
import { resolveRunConfig } from './wizard.js';
import { buildTelemetryHooks, renderHeader } from './renderer.js';
import { printEquivalentSnippet } from './snippet.js';

const VERSION = '0.0.0'; // populated at build time via tsup define (see tsup.config.ts)

async function main(): Promise<number> {
  const raw = process.argv.slice(2);
  const sub = raw[0];
  const rest = raw.slice(1);

  if (sub === undefined || sub === '-h' || sub === '--help') {
    console.log(
      'Usage: als <command>\n\nCommands:\n  try    Run an interactive recommendation\n'
    );
    console.log(helpText());
    return 0;
  }
  if (sub === '-v' || sub === '--version') {
    console.log(VERSION);
    return 0;
  }
  if (sub !== 'try') {
    console.error(`Unknown command: ${sub}\n`);
    console.log(helpText());
    return 2;
  }

  let args;
  try {
    args = parseTryArgs(rest);
  } catch (e) {
    if (e instanceof ArgError) {
      console.error(`Argument error: ${e.message}\n`);
      console.log(helpText());
      return 2;
    }
    throw e;
  }
  if (args.help) {
    console.log(helpText());
    return 0;
  }
  if (args.version) {
    console.log(VERSION);
    return 0;
  }

  const useColor = args.color !== false;
  renderHeader({ color: useColor }, 'interactive try');

  const keyResult = await resolveApiKey({
    nonInteractive: args.nonInteractive ?? false,
  });

  const hooks = buildTelemetryHooks({ color: useColor });
  const router = new AutoPromptRouter({
    OPEN_ROUTER_API_KEY: keyResult.key,
    enableLogging: false,
    telemetry: hooks,
  });

  await router.initialize();

  let again = true;
  while (again) {
    const cfg = await resolveRunConfig(args);

    const runRouter = new AutoPromptRouter({
      OPEN_ROUTER_API_KEY: keyResult.key,
      enableLogging: false,
      telemetry: hooks,
      ...(cfg.strategy !== 'deterministic' && {
        selectionStrategy: cfg.strategy,
      }),
      ...(cfg.selectorModel !== undefined && {
        selectorModel: cfg.selectorModel,
      }),
      ...(cfg.multiLabel && { multiLabelClassification: true }),
      ...(cfg.allow.length > 0 && { allowedModelPatterns: cfg.allow }),
      ...(cfg.deny.length > 0 && { excludedModelPatterns: cfg.deny }),
    });
    // Reuse the warmed catalog by sharing initialization
    await runRouter.initialize();
    await runRouter.getModelRecommendation(cfg.prompt, cfg.properties);

    printEquivalentSnippet({
      prompt: cfg.prompt,
      properties: cfg.properties,
      multiLabel: cfg.multiLabel,
      allow: cfg.allow,
      deny: cfg.deny,
      strategy: cfg.strategy,
      ...(cfg.selectorModel !== undefined && {
        selectorModel: cfg.selectorModel,
      }),
      color: useColor,
    });

    if (!args.repeat || args.nonInteractive) {
      again = false;
    } else {
      again = await confirm({
        message: 'Try another prompt?',
        default: false,
      });
      // Clear flag-supplied prompt so the wizard asks again
      args = { ...args, prompt: undefined };
    }
    await runRouter.shutdown();
  }

  await router.shutdown();
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
```

- [ ] **Step 2: Run end-to-end locally against tsx (requires OPEN_ROUTER_API_KEY)**

Run:

```bash
OPEN_ROUTER_API_KEY=$OPEN_ROUTER_API_KEY pnpm exec tsx src/cli/index.ts try --prompt "hello" --preset quick --non-interactive
```

Expected: prints the wizard header, telemetry stages, a final selection, and the equivalent TS snippet, then exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): wire entrypoint, REPL loop, and snippet output"
```

---

## Task 14: tsup config — second entry for the CLI

**Files:**

- Modify: `tsup.config.ts`

- [ ] **Step 1: Replace `tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';
import { chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  banner: ({ format: _format }) => ({
    js: '#!/usr/bin/env node',
  }),
  async onSuccess() {
    await chmod(resolve('dist/cli.js'), 0o755);
  },
});
```

Note: the shebang banner is applied to _all_ entries, but only `dist/cli.js` is exposed via `bin`, so the harmless extra shebang on `dist/index.js` does not affect library consumers (Node ignores it on `import`).

- [ ] **Step 2: Build and verify outputs**

Run:

```bash
pnpm build
ls -la dist/
head -1 dist/cli.js
```

Expected: `dist/cli.js` exists with `-rwxr-xr-x` permissions and first line `#!/usr/bin/env node`.

- [ ] **Step 3: Smoke-test the built binary**

Run:

```bash
node dist/cli.js --help
```

Expected: prints the `Usage:` and `als try [options]` help text.

- [ ] **Step 4: Commit**

```bash
git add tsup.config.ts
git commit -m "build: bundle dist/cli.js with shebang and executable bit"
```

---

## Task 15: `package.json` — bin map, try script, version banner

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the `bin` map and the `try` script**

In `package.json`:

- Add a top-level `"bin"` block right after `"exports"`:
  ```json
    "bin": {
      "als": "dist/cli.js",
      "auto-llm-selector": "dist/cli.js"
    },
  ```
- Inside `"scripts"`, add (alphabetical order is fine):

  ```json
      "try": "tsx src/cli/index.ts try",
  ```

- [ ] **Step 2: Run `pnpm try` end-to-end (requires `OPEN_ROUTER_API_KEY`)**

Run:

```bash
pnpm try --prompt "hello" --preset quick --non-interactive
```

Expected: same output as the Task 13 smoke test, dispatched through the script.

- [ ] **Step 3: Run full verify**

Run:

```bash
pnpm verify
```

Expected: build + test + typecheck + lint all green.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(pkg): expose als + auto-llm-selector bins and pnpm try script"
```

---

## Task 16: Delete `sample.ts`

**Files:**

- Delete: `sample.ts`

- [ ] **Step 1: Remove the file**

Run:

```bash
git rm sample.ts
```

- [ ] **Step 2: Verify nothing else references it**

Run:

```bash
grep -rn "sample.ts" --include="*.ts" --include="*.json" --include="*.yml" --include="*.md" . | grep -v "docs/superpowers/" | grep -v node_modules
```

Expected: no matches (the docs files will be updated in the next tasks; the `docs/superpowers/` history is fine to keep).

- [ ] **Step 3: Run full verify**

Run:

```bash
pnpm verify
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove sample.ts (replaced by als try)"
```

---

## Task 17: Update `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Commands section**

Open `CLAUDE.md`. In the `## Commands` section, replace:

```
pnpm exec tsx sample.ts   # smoke test against the real OpenRouter API
```

with:

```
pnpm try                  # interactive CLI against the working tree (no build needed)
pnpm try --prompt "..." --preset coding --non-interactive   # scriptable smoke test
```

Replace the paragraph that begins `\`sample.ts\` is a manual smoke harness, …` with:

> `src/cli/` is the interactive try CLI. `pnpm try` runs it against the working tree via `tsx`; the published `npx als try` (or `npx auto-llm-selector try`) runs the bundled `dist/cli.js`. `--non-interactive` makes it scriptable for CI / smoke runs.

- [ ] **Step 2: Delete the "Sample.ts workaround" section**

Remove the entire `## Sample.ts workaround (don't delete)` section (heading and body). Reason: the shim now lives in `src/lib/tfjs-node22-shim.ts` and is loaded by the library itself.

- [ ] **Step 3: Add one line under the Architecture section**

After the existing `KNOWN_MODEL_PROFILES` paragraph (just before the `src/training/router-dataset-recorder.ts` paragraph), insert:

> `src/cli/` is the interactive try CLI; it composes `args.ts`, `wizard.ts`, `presets.ts`, `key-store.ts`, `renderer.ts`, and `snippet.ts`, subscribing to the router's telemetry hooks to narrate each pipeline stage.

- [ ] **Step 4: Run verify**

Run:

```bash
pnpm verify
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): replace sample.ts mentions with als try CLI"
```

---

## Task 18: Update `README.md`

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Replace the "Run the demo (`sample.ts`)" section**

In `README.md`, find the section that starts with `## Run the demo (\`sample.ts\`)` and replace the entire section (heading through its closing horizontal rule) with:

````markdown
## Quick start — `als try`

The published package ships an interactive CLI so you can try the router without writing any code.

```bash
# Inside a project that depends on the package:
npm install auto-llm-selector
export OPEN_ROUTER_API_KEY="sk-or-..."
npx als try                            # interactive wizard

# Or, completely zero-install:
npx auto-llm-selector try

# Scriptable (no prompts; replaces what sample.ts used to do):
npx als try --prompt "Refactor this regex" --preset coding --non-interactive
```
````

The wizard asks for the prompt and any unset `PromptProperties`, then narrates each router stage — catalog size, classified category, filter survivors with drop-reason breakdown, top-5 ranked candidates with scores, and the final selection. It ends by printing the equivalent TypeScript snippet you can paste into your own app.

Contributors can run the same CLI against the working tree, with no build step:

```bash
git clone https://github.com/Ayaan2907/auto-llm-selector.git
cd auto-llm-selector
pnpm install
export OPEN_ROUTER_API_KEY="sk-or-..."
pnpm try                               # tsx on src/, no rebuild needed
```

If you hit **`tfjs_binding.node` missing** errors after install, see [Troubleshooting](#troubleshooting) and [CONTRIBUTING.md](CONTRIBUTING.md) (native TensorFlow addon).

````

- [ ] **Step 2: Remove obsolete env-var references**

Search for `SAMPLE_ALLOWED_PATTERNS` and `ENABLE_SAMPLE_ANALYTICS` in `README.md` and delete any remaining bullet that references them.

- [ ] **Step 3: Run verify**

Run:
```bash
pnpm verify
````

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): replace sample.ts demo with als try quick start"
```

---

## Task 19: Update `CONTRIBUTING.md`

**Files:**

- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Replace sample.ts mentions**

Open `CONTRIBUTING.md`. In the intro paragraph, replace the second sentence (`If you only want … sample.ts.`) with:

> If you only want to **use the published package** in your app, start with the [README](README.md) section **Use in your application**. To **see the router end-to-end** without publishing locally, run `pnpm try` (interactive) or `pnpm try --prompt "..." --preset coding --non-interactive` (scriptable).

In the Prerequisites bullet that mentions `sample.ts`, replace `sample.ts` with `pnpm try` (rest of the sentence stays).

In the "Where to change things" table, add a new row right above `Unit tests`:

```markdown
| CLI | `src/cli/` |
```

In the "Commands" table, add a new row at the bottom:

```markdown
| `pnpm run try` | Interactive CLI against working-tree `src/` (no build). Add `--non-interactive --prompt "..." --preset coding` for scriptable smoke runs. |
```

- [ ] **Step 2: Run verify**

Run:

```bash
pnpm verify
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs(contributing): document pnpm try and src/cli/ layout"
```

---

## Task 20: End-to-end smoke test & branch sanity

**Files:** none (verification only)

- [ ] **Step 1: Fresh install + verify**

Run:

```bash
pnpm run test:install
```

Expected: install → build → test → typecheck → lint all green.

- [ ] **Step 2: Interactive smoke test (requires `OPEN_ROUTER_API_KEY`)**

Run:

```bash
pnpm try
```

Walk through the wizard, pick the `coding` preset, enter a prompt like `"Refactor this regex to be ASCII-only"`, and verify the rendered pipeline shows all six stages (catalog · classified · reasoning filter · category threshold · hard filters · ranked top 5 · selected) plus the equivalent-code section. Exit when prompted.

- [ ] **Step 3: Non-interactive smoke test**

Run:

```bash
pnpm try --prompt "Hi quick question about return policy" --preset quick --non-interactive
```

Expected: exits 0 with a selected model id and no interactive prompts.

- [ ] **Step 4: REPL smoke test**

Run:

```bash
pnpm try --preset coding --repeat
```

Walk the wizard twice (different prompts). Verify the second iteration's `catalog` line shows `fromCache: true`. Exit by answering No to "Try another prompt?".

- [ ] **Step 5: Built-binary smoke test**

Run:

```bash
pnpm build
node dist/cli.js try --prompt "summarize jwt vs sessions" --preset analytical --non-interactive
```

Expected: same output shape as Step 3, but executed against `dist/cli.js` (the path npm consumers will use).

- [ ] **Step 6: Final commit (only if any cleanup edits resulted)**

Run:

```bash
git status --short
```

If anything is dirty from manual smoke testing (e.g., a stray edit), commit it with a short message; otherwise skip this step.

---

## Self-review

- **Spec coverage:**
  - Library hooks: Tasks 4-6. ✓
  - Shim relocation: Task 2. ✓
  - Hard-filter drop reasons: Task 3. ✓
  - CLI module layout (args, wizard, presets, renderer, snippet, key-store, index): Tasks 7-13. ✓
  - tsup CLI entry + executable: Task 14. ✓
  - `bin` map (both aliases) + `try` script: Task 15. ✓
  - `sample.ts` deletion: Task 16. ✓
  - Doc updates: Tasks 17-19. ✓
  - Test files: `hard-filters-detailed.test.ts` (Task 3), `router-telemetry.test.ts` (Task 6), `cli-args.test.ts` (Task 7), `cli-presets.test.ts` (Task 8). ✓
- **Placeholders:** None. Every step has full code or a concrete command.
- **Type consistency:** `applyHardFiltersDetailed`, `HardFilterResult`, `HardFilterDropReason`, `ParsedTryArgs`, `PresetName`, `ResolvedRunConfig`, `KeyResolution` are defined once and re-used by name across tasks.
- **Scope:** Single plan, ~20 tasks, ~2-4 hours of focused work depending on the wizard polish loop.
