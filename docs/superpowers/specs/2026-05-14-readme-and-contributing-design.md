# README and contributing documentation — design spec

**Status:** Approved for implementation  
**Date:** 2026-05-14  
**Scope:** `README.md`, new `CONTRIBUTING.md`, cross-links to `/docs`. No application code changes unless README examples expose a bug.

## Goals

1. **Two clear reader paths** (equal visibility above the fold): install and use the **npm package** in an application vs **clone the repo** and run **`sample.ts`** as the smallest runnable demo.
2. **Accurate alignment** with the current implementation (deterministic default routing, hard filters, optional LLM selector, analytics behavior, verification scripts).
3. **Actionable contribution** instructions: setup, commands, where to edit, PR expectations.

## Non-goals

- Rewriting long-form architecture (keep pointers to `docs/how-it-works.md` and `docs/api-reference.md`).
- Marketing superlatives or competitor claims not grounded in code.
- Changing package name, exports, or runtime behavior as part of this doc work.

## Information architecture — `README.md`

### Order (top to bottom)

1. **Title and one-sentence value proposition**  
   OpenRouter-backed catalog, hybrid classification, hard constraints, **default deterministic** model choice; optional **`selectionStrategy: 'llm'`** for legacy meta-LLM selection.

2. **Who it is for**  
   Teams that already use (or plan to use) OpenRouter and want a **library-level** helper: prompt + `PromptProperties` → recommended model id + explanation metadata.

3. **Install**  
   Primary: `npm install auto-llm-selector`. Note equivalent: `pnpm add auto-llm-selector` / `yarn add`. State **Node ≥ 16** and **OpenRouter API key** requirement.

4. **Path A — Use in your application**
   - Minimal code block: `AutoPromptRouter` with `OPEN_ROUTER_API_KEY`, `await router.initialize()`, `getModelRecommendation(...)`.
   - Show logging of at least: `model`, `reason`, `category`, `selectionStrategy`, `selectionId` (when present).
   - One short paragraph on optional features with links to API docs: `getModelRecommendations`, `reportOutcome`, `multiLabelClassification`, `allowedModelPatterns` / `excludedModelPatterns`, `modelCatalogPersistentCachePath`, `telemetry`.
   - Link: `docs/api-reference.md`, `docs/how-it-works.md`.

5. **Path B — Run the demo (`sample.ts`)**
   - Explicitly **clone** workflow (demo is maintained for repo-local run; document `pnpm exec tsx sample.ts` after `export OPEN_ROUTER_API_KEY=...`).
   - If the sample documents env toggles (`ENABLE_SAMPLE_ANALYTICS`, `SAMPLE_ALLOWED_PATTERNS`), mirror them here in one line each.
   - **TensorFlow / `@tensorflow/tfjs-node`**: short honest note — install may require allowing postinstall scripts or rebuild; point to README troubleshooting subsection (keep or tighten existing troubleshooting).

6. **How it works (compressed)**  
   Four bullets max: classify (optional multi-label) → profile from catalog → hard filter → rank (deterministic default or LLM). No duplicate of full design doc.

7. **What you get back**  
   Align field list with `ModelSelection`: model, reason, confidence, category, optional `selectionId`, `categoryWeights`, `selectionStrategy`.

8. **Configuration example**  
   Trim to a representative `RouterConfig`; remove any stale or misleading comments (e.g. analytics must reflect **hashed** prompts, opt-in, optional `endpointUrl` / HTTPS for custom ingest). Do not claim raw prompt collection.

9. **Verify locally (contributors and PR reviewers)**  
   Single block: `pnpm run test:install` for clean clone + full gate; `pnpm run verify` when `node_modules` already present. Link to `CONTRIBUTING.md` for detail.

10. **Requirements, troubleshooting, privacy/analytics, supported models**  
    Refresh numbers only if we have a defensible source; otherwise use qualitative language (“full OpenRouter catalog” vs a fixed count). Fix **performance** wording: deterministic path vs optional LLM path latency. Replace “Likely picks:” style with neutral “depends on catalog and your properties.”

11. **Contributing**  
    Two sentences + link: **See `CONTRIBUTING.md`**.

12. **License, keywords**  
    Unchanged unless factual correction needed.

## New file — `CONTRIBUTING.md`

### Sections

1. **Welcome** — who should read this (clone contributors, doc fixes, tests).

2. **Prerequisites** — Node, **pnpm** (match `packageManager` in `package.json`), OpenRouter key for anything that hits the network.

3. **First-time setup**  
   `git clone`, `pnpm install`, note on tfjs native addon if install scripts were skipped (`pnpm approve-builds` or platform-specific rebuild where applicable).

4. **Commands**  
   | Command | Purpose |
   |---------|--------|
   | `pnpm run test:install` | Install deps + build + test + typecheck + lint |
   | `pnpm run verify` | Same gate without reinstall |
   | `pnpm test` | Build (via `pretest`) + unit tests |
   | `pnpm run build` | Produce `dist/` |
   | `pnpm run lint` / `pnpm run typecheck` | Quality |

5. **Project map (where to change things)**  
   Short bullets: `src/router.ts`, `src/classifier.ts`, `src/lib/model-profiler.ts`, `src/routing/*`, `src/cache.ts`, `src/analytics/*`, `src/validation/*`, `test/*`, `docs/*`.

6. **Pull request expectations**  
   Focused diffs, tests for behavior changes, update docs when public API or default semantics change; do not commit secrets.

7. **Link back** to README Path A/B.

## Consistency checklist (implementation pass)

- [ ] Remove or replace any line implying **raw prompt** analytics storage.
- [ ] Default selection: **deterministic**; LLM mode explicitly optional.
- [ ] Dev instructions prefer **pnpm**; one-line npm equivalent where helpful.
- [ ] `sample.ts` instructions match actual file (env vars, clone vs published import).
- [ ] No contradictory statements between README, `CONTRIBUTING.md`, and `docs/api-reference.md` for the same option.

## Self-review (spec quality)

| Check                | Result                                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| Placeholders / TBD   | None intentional; implementation may adjust table formatting.                   |
| Internal consistency | README defers depth to `/docs`; CONTRIBUTING defers product story to README.    |
| Scope                | Documentation only; single new file `CONTRIBUTING.md`.                          |
| Ambiguity            | “Clone for sample” vs “npm for app” is explicit; no dual meaning for “install.” |

## Implementation order (suggested)

1. Add `CONTRIBUTING.md` (full content).
2. Rewrite `README.md` sections per IA above; fix stale lines in one pass.
3. Quick link scan: root README ↔ CONTRIBUTING ↔ `docs/api-reference.md` headings.

## Approval

User approval recorded: **approve** (2026-05-14). Proceed to implement README and `CONTRIBUTING.md` per this spec, then optional follow-up PR description snippet if desired.
