# `als try` Quick-Start CLI — Design

**Date:** 2026-05-14
**Branch:** `cursor/production-hardening-1fc2`
**Status:** Draft for review

## Problem

`sample.ts` is the only end-to-end way to exercise the router today, and its DX is poor on every axis:

1. The prompt is hardcoded in the file — trying your own text means editing source.
2. `PromptProperties` (accuracy / cost / speed / tokenLimit / reasoning / multimodal / qualityVsCost) are hardcoded.
3. Logs are noisy _and_ incomplete — you cannot tell from the output why a particular model won (no filter-survivor counts, no top-N candidates with scores).
4. The env-var ceremony (`export OPEN_ROUTER_API_KEY=…`) repeats every shell.
5. It is undiscoverable — a new contributor does not know `pnpm exec tsx sample.ts` exists without reading the README.
6. End users of the published npm package have no way to try the library before writing TypeScript glue code.
7. Local edits to `src/` have no obvious verification path — there is no "did my change actually do what I think it did?" loop.

These are all manifestations of the same gap: there is no first-class playground for the router.

## Goals

- One binary, `als`, with subcommand `try`, that is the quick-start for **both** contributors and end users of the published package.
- Interactive wizard for every router knob, with sensible defaults and a small set of named presets.
- Per-stage narration of the router pipeline so users learn _why_ a model was selected.
- Fully scriptable via flags (`als try --prompt "…" --preset coding --non-interactive`) so the CLI replaces `sample.ts`'s smoke-test role.
- Local-dev script (`pnpm try`) runs against `src/` via `tsx` so contributors verify edits without a build.
- Published binary (`npx als try`) runs the bundled `dist/cli.js`.

## Non-goals

- Not a chat client — the CLI shows which model would be recommended, it does not then call that model. (A future `--execute` flag could; out of scope today.)
- No subcommands beyond `try` in this iteration. Structure leaves room for future `als models`, `als selftest`, etc., but they are not built now.
- No analytics endpoint config in the wizard — analytics stays an in-code concern via `RouterConfig.analytics`.
- No TTY-harness tests for the wizard itself. The underlying logic is unit-tested with a mock router.

## Distribution shape

- **Bin entry:** `package.json#bin.als = "dist/cli.js"`.
- **Local-dev script:** `package.json#scripts.try = "tsx src/cli/index.ts try"` — runs against working-tree source, no build.
- **Build:** `tsup.config.ts` gets a second entry, `src/cli/index.ts` → `dist/cli.js`, with a `#!/usr/bin/env node` banner and the output file marked executable.
- **`files` field:** unchanged (`["dist"]`); the new bundle is shipped automatically.

## Library changes (additive, opt-in)

Two changes inside the library proper:

### 1. New telemetry hooks (`src/types.ts` + `src/router.ts`)

Extend `RouterTelemetryHooks` with four optional hooks. Library consumers who pass no hooks see no change. The CLI subscribes to all of them to render the pipeline.

```typescript
type RouterTelemetryHooks = {
  onModelSelected?: (event: {
    modelId: string;
    selectionStrategy: ModelSelectionStrategy;
    selectionId?: string;
  }) => void;

  // NEW:
  onCatalogLoaded?: (event: {
    totalProfiles: number;
    fromCache: boolean;
    cacheAgeMs?: number;
  }) => void;

  onClassified?: (event: {
    category: PromptCategory;
    multiLabelWeights?: Partial<Record<PromptType, number>>;
  }) => void;

  onFilterStage?: (event: {
    stage: 'reasoning' | 'category-threshold' | 'hard-filters';
    before: number;
    after: number;
    /** Populated only for `hard-filters`; keys like `tokenLimit`, `costTier`, `allowList`. */
    droppedReasons?: Record<string, number>;
  }) => void;

  onCandidatesRanked?: (event: {
    strategy: ModelSelectionStrategy;
    topN: Array<{ id: string; score: number; reason: string }>;
  }) => void;
};
```

Wire them into `AutoPromptRouter.getModelRecommendation` at the existing stage boundaries:

- `onCatalogLoaded` — after `this.modelCache.getModelProfiles()`. `fromCache` derived from whether the cache TTL was hit; `cacheAgeMs` from `now - lastFetched` (requires exposing the timestamp from `InMemoryModelCache`, or returning it from `getModelProfiles`).
- `onClassified` — after `classifyPrompt` / `pickPrimaryCategoryFromWeights`.
- `onFilterStage` — three calls, one after each filter step (reasoning filter, category-threshold filter, `applyHardFilters`). Emit `before` / `after` counts. For `hard-filters`, also emit `droppedReasons` by attributing each dropped model to the first constraint it failed (`tokenLimit` / `costTier` / `speedTier` / `accuracyTier` / `multimodal` / `allowList` / `denyList`). This requires a small refactor in `src/routing/hard-filters.ts` to return per-rejection reasons alongside survivors (or a parallel `categorize` helper); the existing return type stays the same for non-CLI callers.
- `onCandidatesRanked` — for deterministic strategy, top 5 from `ModelProfiler.rankModelsFor…`; for LLM strategy, emit the candidate list passed to the selector.

This is observability only — zero behavior change. Existing tests must still pass unchanged.

### 2. Relocate the tfjs-node22 shim

Currently in `sample.ts`. Move to `src/lib/tfjs-node22-shim.ts` and have `src/lib/semantic-classifier.ts` import it as a side effect at the top of the file (the only module that actually triggers tfjs-node loading). Two benefits:

- The CLI inherits the fix automatically.
- Library consumers running Node 22+ stop hitting the same crash that today only `sample.ts` works around. This is a latent bug fix.

The CLAUDE.md note "If you're touching the sample, keep the shim" becomes obsolete and is removed in the docs pass.

## CLI module layout

```
src/cli/
  index.ts        # shebang entry; dispatches `try`; bottom of file: process exit codes
  args.ts         # manual arg parser (no yargs / commander dep)
  wizard.ts       # @inquirer/prompts wizard; skips fields already supplied via flags
  presets.ts      # named PromptProperties presets
  renderer.ts     # picocolors-based stage narrator; constructs telemetry hooks for the router
  snippet.ts      # emits equivalent TS snippet for the run that just happened
  key-store.ts    # API key resolution: env → .env (Node --env-file friendly) → wizard prompt
```

Why no command framework: the surface is small (one subcommand, ~12 flags). A manual parser keeps deps minimal and avoids fighting an opinionated framework.

## Wizard flow

Each field is offered in this order, skipped if already supplied via a flag. Defaults shown in brackets are applied when the user hits Enter on an interactive prompt; in `--non-interactive` mode they are NOT auto-applied for required-but-missing fields (the CLI exits 2 with a clear message).

```
1. API key                  — only if env OPEN_ROUTER_API_KEY is not set
2. Use a preset?            — coding | creative | quick | analytical | custom
3. Prompt                   — required, no default
4. accuracy (0-1)           — default by preset, else 0.7
5. cost (0-1)               — default by preset, else 0.5
6. speed (0-1)              — default by preset, else 0.6
7. tokenLimit (int ≥ 1)     — default 8000
8. reasoning (Y/n)          — default false
9. multimodal (y/N)         — default false
10. selectionStrategy       — deterministic | llm; default deterministic
11. selectorModel           — only when strategy=llm; default openai/gpt-4o-mini
12. multiLabelClassification (y/N) — default false
13. allowedModelPatterns    — CSV; default empty
14. excludedModelPatterns   — CSV; default empty
```

Validation happens at parse time using the same `zod` schemas as the library (`src/validation/schemas.ts`) so wizard errors and programmatic errors are identical.

## Flag surface

```
als try [options]

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
  --non-interactive            Fail if any required field is missing (no prompts)
  --repeat                     After each run, ask for another prompt (keeps embeddings warm)
  --no-color                   Disable picocolors output
  -h, --help
  -v, --version
```

Any flag provided skips the wizard's question for that field. `--non-interactive` makes the CLI scriptable for CI / regression — this is how `sample.ts`'s role gets replaced.

## Presets

`src/cli/presets.ts` exports:

```typescript
export const PRESETS = {
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
} as const;
```

Selecting a preset pre-fills defaults for subsequent prompts; the user can still override any field.

## Rendered output (example)

```
$ pnpm try

auto-llm-selector — interactive try

? OpenRouter API key: ********  (only asked if env missing)
? Use a preset?  coding
? Prompt: Refactor this regex to be ASCII-only

▸ catalog: 312 profiles loaded (from cache, age 14m)
▸ classified: coding (84%)   semantic 0.81 · keyword 0.67
▸ reasoning filter:        312 → 198
▸ category threshold ≥0.3: 198 → 142
▸ hard filters:            142 → 27   (60 by tokenLimit · 41 by cost tier · 14 by allow-list)
▸ ranked top 5 (deterministic):
    1. anthropic/claude-3-sonnet     0.87   strong coding · good cost
    2. openai/gpt-4o                  0.83   excellent coding · premium cost
    3. anthropic/claude-3-haiku       0.78   solid coding · cheap · fast
    4. openai/gpt-4o-mini             0.76   solid coding · cheap
    5. mistralai/mixtral-8x22b        0.72   strong coding · moderate cost
▸ selected: anthropic/claude-3-sonnet   (selectionId: 6f3a9b…)

Equivalent code:
─────────────────────────────────────────
import { AutoPromptRouter } from 'auto-llm-selector';

const router = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
});
await router.initialize();

const result = await router.getModelRecommendation(
  'Refactor this regex to be ASCII-only',
  { accuracy: 0.85, cost: 0.45, speed: 0.6, tokenLimit: 16000, reasoning: true },
);
console.log(result.model);
─────────────────────────────────────────

? Try another prompt?  N
```

In `--repeat` mode, the router instance and its loaded TF embeddings stay in memory across iterations; only steps 3-end of the wizard re-run. All telemetry hooks fire again per iteration (so each run shows fresh `onClassified` / `onFilterStage` / `onCandidatesRanked` output), but `onCatalogLoaded` typically reports `fromCache: true` on the second and later runs because the in-memory profile cache is already populated.

## Dependencies

Two new runtime deps (both in `dependencies`, not `devDependencies`, because they ship as part of the published CLI):

- `@inquirer/prompts` — modern, ESM-native, modular wizard primitives. Used for `input`, `number`, `select`, `confirm`. Tree-shaken to only what we import.
- `picocolors` — ~1 KB terminal coloring, zero deps. Used in `renderer.ts` and `snippet.ts`.

No dev-deps added beyond what already exists.

## Tests

Three new test files:

- `test/cli-args.test.ts` — arg parser:
  - Long-flag parsing (`--prompt "x"`, `--accuracy 0.8`, boolean toggles).
  - Validation errors for out-of-range numbers, unknown flags, conflicting options (e.g. `--non-interactive` without required `--prompt`).
- `test/cli-presets.test.ts` — every preset's `PromptProperties` satisfies the zod schema in `src/validation/schemas.ts`.
- `test/router-telemetry.test.ts` — calls `getModelRecommendation` against a mock catalog and asserts each new hook fires exactly once with the expected shape.

No test for the interactive wizard itself: piping fake input through a `@inquirer/prompts` wizard is fragile in `node --test`. Coverage is preserved by testing args + presets + the renderer's hook-shape contract in isolation.

## Files deleted

- `sample.ts` — replaced by `als try --non-interactive` with explicit flags for the same scenarios. The README and CONTRIBUTING references update accordingly.

## Documentation updates (same PR)

- **README.md**
  - Replace the entire **"Run the demo (`sample.ts`)"** section with **"Quick start"** that documents `npx als try` for end users and `pnpm try` for contributors.
  - Note that `--non-interactive` exists for scripting.
  - Drop `SAMPLE_ALLOWED_PATTERNS` / `ENABLE_SAMPLE_ANALYTICS` env-var documentation.
- **CONTRIBUTING.md**
  - Replace `sample.ts` references with `pnpm try` (interactive) and the non-interactive variant for regression.
  - Update the "Where to change things" table: add row `CLI` → `src/cli/`.
- **CLAUDE.md**
  - In the commands section: add `pnpm try`, remove `pnpm exec tsx sample.ts`.
  - Remove the "Sample.ts workaround (don't delete)" section — obsolete after shim relocation.
  - Add one line under Architecture: `CLI: src/cli/ — interactive playground subscribing to telemetry hooks for stage-by-stage narration`.

## File-level inventory of changes

| File                             | Change                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `src/types.ts`                   | Add 4 optional hooks to `RouterTelemetryHooks`.                                  |
| `src/router.ts`                  | Emit the new hooks at existing pipeline stage boundaries.                        |
| `src/lib/tfjs-node22-shim.ts`    | **New.** Holds the `util.isNullOrUndefined` patch.                               |
| `src/lib/semantic-classifier.ts` | Side-effect import of the shim at top.                                           |
| `src/cli/index.ts`               | **New.** Shebang entrypoint, dispatches `try`.                                   |
| `src/cli/args.ts`                | **New.** Manual parser.                                                          |
| `src/cli/wizard.ts`              | **New.** @inquirer/prompts flow.                                                 |
| `src/cli/presets.ts`             | **New.** PromptProperties presets.                                               |
| `src/cli/renderer.ts`            | **New.** Picocolors pipeline narrator.                                           |
| `src/cli/snippet.ts`             | **New.** TS-snippet emitter.                                                     |
| `src/cli/key-store.ts`           | **New.** API-key resolution.                                                     |
| `tsup.config.ts`                 | Add second entry, shebang banner, executable output.                             |
| `package.json`                   | Add `bin.als`, add `scripts.try`, add deps `@inquirer/prompts` and `picocolors`. |
| `sample.ts`                      | **Deleted.**                                                                     |
| `test/cli-args.test.ts`          | **New.**                                                                         |
| `test/cli-presets.test.ts`       | **New.**                                                                         |
| `test/router-telemetry.test.ts`  | **New.**                                                                         |
| `README.md`                      | Quick-start section replaces sample.ts section.                                  |
| `CONTRIBUTING.md`                | Replace sample.ts references with `pnpm try`.                                    |
| `CLAUDE.md`                      | Update commands and architecture sections.                                       |

## Risk and mitigation

- **`@inquirer/prompts` is now a runtime dep.** Acceptable: it is widely used, ESM-native, MIT-licensed, and tree-shakable.
- **Shim relocation could subtly change library load order on Node 22+.** Covered by the existing test suite running on the CI's Node 20 matrix; verify locally on Node 22+ before merging.
- **Wizard not tested via TTY harness.** Mitigation: pure-function decomposition — args parsing, presets, renderer hook shapes, and key-store resolution are each unit-testable without TTY.
- **New telemetry hooks add minor maintenance surface.** They are opt-in; if a future router refactor changes a stage boundary, the hook just emits at the new boundary or is removed (semver minor).

## Success criteria

- `pnpm try` launches the wizard against `src/` with no build step required.
- `npx als try` launches the wizard against `dist/cli.js` from a fresh `npm install auto-llm-selector` in a scratch project.
- `als try --prompt "..." --preset coding --non-interactive` runs end-to-end and exits 0 with a selection.
- Every existing `pnpm test`, `pnpm typecheck`, `pnpm lint` passes unchanged.
- New tests (`cli-args`, `cli-presets`, `router-telemetry`) pass.
- README's Quick-start section is reachable in under three steps for a new user (install → set key → `npx als try`).
