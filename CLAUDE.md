# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`auto-llm-selector` is an ESM-only TypeScript library published to npm. It takes a user prompt + a `PromptProperties` requirements object and returns a recommended OpenRouter model id. Entry point is `src/index.ts`; build output lives in `dist/`.

## Package manager

This repo uses **pnpm 10.12.1** (declared as `packageManager` in `package.json`). CI and the husky pre-commit hook both run pnpm. Don't introduce `npm install` / `yarn` invocations.

## Commands

```bash
pnpm install              # install deps
pnpm build                # tsup bundle to dist/ (ESM + .d.ts + sourcemaps)
pnpm dev                  # tsup --watch
pnpm test                 # node --test with tsx/esm loader; `pretest` rebuilds first
pnpm test:watch           # same, in watch mode
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint src/**/*.ts (use lint:fix to auto-fix)
pnpm format               # prettier --write .
pnpm verify               # test + typecheck + lint (run before pushing)
pnpm test:install         # full install + verify (CI-equivalent local check)
pnpm try                  # interactive CLI against working-tree src/ (no build)
pnpm try --prompt "..." --preset coding --non-interactive   # scriptable smoke test
```

Single-test runs go through `node --test` directly (the npm script globs everything):

```bash
pnpm build && node --test --import tsx/esm test/hard-filters.test.ts
```

`src/cli/` is the interactive try CLI. `pnpm try` runs it against the working tree via `tsx`; the published `npx als try` (or `npx auto-llm-selector try`) runs the bundled `dist/cli.js`. `--non-interactive` makes it scriptable for CI / smoke runs.

## TypeScript constraints that catch people

`tsconfig.json` is strict and module resolution is `nodenext`. When editing:

- **Use `.js` extensions on relative imports** (e.g. `import { Logger } from './utils/logger.js'`) — required by nodenext + ESM output even though the source is `.ts`.
- **`verbatimModuleSyntax: true`** — type-only imports must use `import type { ... }` (or inline `import { type X }`). A regular import of a pure type will fail compilation.
- **`noUncheckedIndexedAccess: true`** — array/record indexing returns `T | undefined`. Don't blindly `.foo` on indexed results; narrow first.
- **`exactOptionalPropertyTypes: true`** — `{ foo?: string }` and `{ foo: string | undefined }` are distinct. Conditionally-set optional fields use the `...(value !== undefined && { foo: value })` spread pattern (see `router.ts` constructor and `getModelRecommendation`).

ESLint warns on `no-console` and `@typescript-eslint/no-explicit-any`; the project uses the `Logger` class in `src/utils/logger.ts` instead of `console.*`.

## Architecture

The router is a pipeline that runs inside `AutoPromptRouter.getModelRecommendation` (`src/router.ts`):

1. **Validate** — `src/validation/schemas.ts` (zod) asserts prompt + properties shape.
2. **Catalog** — `InMemoryModelCache` (`src/cache.ts`) fetches OpenRouter `/models`, builds `ModelProfile`s via `ModelProfiler` (`src/lib/model-profiler.ts`), and caches them (in-memory TTL + optional JSON snapshot at `modelCatalogPersistentCachePath`). HTTP goes through `fetchWithRetry` + `OpenRouterRateLimiter` (`src/http/`).
3. **Classify** — `PromptClassifier` (`src/classifier.ts`) combines a keyword scorer with a semantic classifier (`src/lib/semantic-classifier.ts` → TensorFlow Universal Sentence Encoder over `reference-embeddings.ts`). Single-label picks one `PromptType`; `multiLabelClassification: true` returns a weight distribution that gets blended into capability scoring.
4. **Filter** — Reasoning-only filter (if requested), per-category capability threshold (`>= 0.3`), then `applyHardFilters` (`src/routing/hard-filters.ts`) for tokenLimit / cost-speed-accuracy tiers / multimodal / wildcard allow & deny lists from `wildcard-match.ts`.
5. **Rank/select** — `selectionStrategy: 'deterministic'` (default) calls `ModelProfiler.rankModelsForCategory` (or `rankModelsForWeightedCategories` under multi-label). `selectionStrategy: 'llm'` POSTs a structured prompt to OpenRouter via `selectorModel` and parses strict JSON; unknown-model or invalid-JSON responses fall back to deterministic ranking.
6. **Post-selection** — `selectionId` (UUID) is returned for optional `reportOutcome(selectionId, quality)` feedback (`src/feedback/outcome-store.ts`), telemetry hooks fire, and `AnalyticsCollector` (`src/analytics/`) records events if explicitly enabled.

`KNOWN_MODEL_PROFILES` in `model-profiler.ts` is the curated capability map for well-known model ids; everything else gets heuristic priors derived from id/provider/pricing. These are routing priors, not benchmark numbers — when adding a new known model, edit this map.

`src/cli/` is the interactive `als try` CLI; it composes `args.ts`, `wizard.ts`, `presets.ts`, `key-store.ts`, `renderer.ts`, and `snippet.ts`, subscribing to the router's optional telemetry hooks (`onCatalogLoaded`, `onClassified`, `onFilterStage`, `onCandidatesRanked`, `onModelSelected`) to narrate each pipeline stage.

`src/training/router-dataset-recorder.ts` accumulates labeled samples for offline analysis; it's a side-channel and not on the hot path.

## Public API surface

`src/index.ts` is the only re-export point. The npm package only ships `dist/` (see `"files"` in `package.json`), so anything not exported from `src/index.ts` is internal and can be refactored freely. Re-exports include `AutoPromptRouter` (default + named), the `PromptType` enum, `parseRouterEnvironment`, `RouterDatasetRecorder`, and the public types from `src/types.ts`.

## Git, commits, and CI

- Husky `pre-commit` runs `pnpm pre-commit` → lint-staged (eslint --fix + prettier on staged JS/TS/JSON/MD/YAML).
- `.github/workflows/publish.yml` runs `pnpm build` + `pnpm test` on push to `main`, then publishes to npm with `NPM_TOKEN`. Bumping `package.json#version` on `main` triggers a publish — coordinate version bumps deliberately.
- Tests depend on a fresh build via the `pretest` script. If you change source and run a test directly with `node --test` (bypassing `pnpm test`), rebuild first or imports from `dist/` will be stale.
