# Production readiness design (2026-05-11)

## Goals

- Make routing **deterministic by default** (no mandatory extra LLM call).
- Enforce user constraints as **hard filters** (context window, tiers, multimodal, wildcards).
- Align documentation with the implementation (remove unverifiable performance claims).
- Improve reliability (retries, optional persistent catalog cache, safer embedding cache keys).
- Improve privacy defaults for analytics (hashed prompts; configurable endpoint + optional auth).

## Non-goals

- Shipping a hosted training pipeline or benchmark-driven score updates inside this repo.
- Replacing TensorFlow.js semantic classification in this iteration (kept for compatibility).

## Architecture decisions

1. **Selection strategies**: `deterministic` uses `ModelProfiler` ranking; `llm` preserves the legacy OpenRouter meta-model path with strict candidate validation.
2. **Hard filters vs soft ranking**: tier filters are applied before ranking to prevent impossible picks (for example, a tiny context window for a huge `tokenLimit`).
3. **Multi-label routing**: optional; implemented as a normalized weight vector blended into capability scores.
4. **Feedback**: `selectionId` + `reportOutcome` + optional `RouterDatasetRecorder` provide local-only primitives for future calibration workflows.

## Risks / follow-ups

- Heuristic capability scores remain approximate; production teams should validate routing on their own traffic.
- Persistent catalog snapshots are best-effort JSON; schema drift should be handled by refreshing from OpenRouter when online.
