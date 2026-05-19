# How It Works

A detailed look at the intelligent routing process that powers Auto Prompt Router.

## Overview

The router selects which OpenRouter model should back each **AI surface** in your application — agent chat, inline completion, planners, etc. You pass that surface’s **system prompt** plus a **budget** (`PromptProperties`); the library returns a model id. End-user messages are not the routing input.

When you call `getModelRecommendation()`:

```
System prompt + budget → Classification → Hard Filters → Deterministic Ranking (default) → Best Model
```

Optional legacy path: `selectionStrategy: 'llm'` uses a meta-LLM on OpenRouter to pick among candidates (slower, non-deterministic).

## Stage 1: Prompt Classification

### Hybrid Classification Approach

The system uses two complementary methods to understand your **system prompt** (the role instructions for a surface):

#### 1. Semantic Analysis

- Uses Google's Universal Sentence Encoder to create embeddings of your prompt
- Compares against pre-computed reference embeddings for each category
- Calculates cosine similarity to find the best semantic match
- Highly accurate for understanding meaning and context

#### 2. Keyword Analysis

- Scans your prompt for category-specific keywords and patterns
- Uses weighted scoring based on keyword frequency and importance
- Fast and reliable for clear, explicit task indicators
- Serves as a fallback when semantic analysis is unclear

#### 3. Hybrid combination

When `multiLabelClassification` is disabled (default), the router picks a single winning category:

- If semantic + keyword agree, confidence is boosted slightly.
- If they disagree, the winner is chosen using a **60% semantic / 40% keyword** confidence-weighted comparison (see `src/classifier.ts`).

When `multiLabelClassification` is enabled, the router builds a **normalized weight vector** across categories by blending semantic similarity and keyword scores, then ranks models using a weighted blend of per-category capability scores.

### Classification Categories

Your **system prompt** gets classified into one of these categories:

- **Coding** - Programming, debugging, technical implementation
- **Creative** - Writing, storytelling, content creation
- **Analytical** - Data analysis, research, business insights
- **Reasoning** - Logic puzzles, math, complex problem-solving
- **Conversational** - Chat, Q&A, customer support
- **General** - Factual queries, explanations, how-to guides

## Stage 2: Model Profiling

### Comprehensive Model Database

The library builds profiles for **all models returned by OpenRouter’s `/models` endpoint**.

#### Capability Scores (0-1 scale)

Each model gets scored on all six categories using:

- A small curated map for a handful of well-known model IDs (`KNOWN_MODEL_PROFILES`)
- Heuristic inference for everything else (provider/family cues + pricing-derived adjustments)

These scores are **not** sourced from live benchmark leaderboards inside the library; they are best-effort priors meant for routing, not ground-truth evaluations.

Example profile:

```typescript
{
  id: 'openai/gpt-4',
  capabilities: {
    coding: 0.95,      // Excellent at programming
    creative: 0.90,    // Very strong creative writing
    analytical: 0.92,  // Outstanding analysis
    reasoning: 0.95,   // Top-tier logical reasoning
    conversational: 0.90, // Natural dialogue
    general: 0.95      // Broad knowledge
  }
}
```

#### Performance Characteristics

- **Speed Tier**: Response time classification (ultra-fast to slow)
- **Cost Tier**: Pricing classification (free to premium)
- **Accuracy Tier**: Output quality classification (basic to excellent)
- **Context Tier**: Maximum input length (small to huge)
- **Special Capabilities**: Reasoning, multimodal, moderation, etc.

### Dynamic Profiling

For new or unknown models, the system:

1. Extracts provider and model family information
2. Applies heuristics based on naming patterns
3. Uses cost as a proxy for capability (expensive models tend to be better)
4. Assigns conservative confidence scores

## Stage 3: Intelligent Filtering

### Requirements-Based Filtering

Before selection, models are filtered using **hard constraints** derived from `PromptProperties` (see `src/routing/hard-filters.ts`):

- `tokenLimit` requires `contextLength >= tokenLimit`
- `cost`, `speed`, and `accuracy` map to discrete tier thresholds (cost tier, minimum speed tier, minimum accuracy tier)
- Optional `multimodal: true` requires `isMultimodal`
- Optional `allowedModelPatterns` / `excludedModelPatterns` apply OpenRouter-style wildcard filters

Additionally, the router enforces the existing category capability threshold (`>= 0.3` for the primary category, or a blended threshold when multi-label is enabled) and optional reasoning-model filtering.

### Category-Specific Filtering

Models must meet a minimum capability threshold for your prompt's category:

```typescript
const categoryKey = promptCategory.type; // e.g., 'coding'
const suitableModels = eligibleModels.filter(
  model => model.capabilities[categoryKey] >= 0.3 // Minimum 30% capability
);
```

## Stage 4: Model selection

### Default: deterministic ranking (fast + reproducible)

By default (`selectionStrategy: 'deterministic'`), the router uses `ModelProfiler` ranking:

- Single-label: `rankModelsForCategory(...)`
- Multi-label: `rankModelsForWeightedCategories(...)`

This avoids an extra LLM call for routing and makes selection stable for the same inputs and catalog snapshot.

### Optional: LLM-powered selection (`selectionStrategy: 'llm'`)

If enabled, the router sends a structured prompt to OpenRouter (`selectorModel`) and expects strict JSON:

```json
{
  "model": "anthropic/claude-3-sonnet",
  "reason": "Excellent creative writing capabilities (90%) with good cost-effectiveness",
  "confidence": 0.87
}
```

The returned `model` must exactly match one of the candidate IDs; otherwise the router falls back to deterministic ranking.

### Fallback logic

If LLM selection fails (API error, invalid JSON, unknown model id), the router falls back to deterministic ranking from the same candidate set.

## Stage 5: Response Assembly

The final `ModelSelection` includes:

- **Selected model ID** - Ready to use with OpenRouter
- **Human-readable reasoning** - Why this model was chosen
- **Confidence scores** - For both classification and selection
- **Category information** - How your prompt was understood

## Performance Optimizations

### Caching Strategy

- **Model profiles**: Cached for the session (1-3 second startup)
- **Classifications**: LRU cache for repeated prompts
- **Embeddings**: Reference embeddings cached for semantic analysis

### Parallel Processing

- Semantic and keyword classification run in parallel
- Model filtering happens concurrently with classification
- TensorFlow operations are optimized for CPU/GPU acceleration

## Accuracy & reliability

Routing quality depends on:

- How representative your prompts are for the classifier’s categories
- How accurate OpenRouter’s catalog metadata is at a given time
- How well the heuristic capability priors match your workload

The library does **not** ship a benchmark-driven calibration loop. Optional analytics (explicitly enabled) can help you collect routing outcomes for offline evaluation.

## Continuous improvement (operational)

Practical improvement paths:

- Expand `KNOWN_MODEL_PROFILES` for models you care about most
- Use `telemetry` hooks + `reportOutcome()` to build evaluation datasets
- Use `RouterDatasetRecorder` to accumulate labeled samples for future training workflows

## Technical Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your Prompt   │ -> │  Classification  │ -> │ Model Selection │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              v
                    ┌──────────────────────┐
                    │  Semantic Analysis   │
                    │  - USE Embeddings    │
                    │  - Cosine Similarity │
                    │  - Reference Vectors │
                    └──────────────────────┘
                              │
                              v
                    ┌──────────────────────┐
                    │  Keyword Analysis    │
                    │  - Pattern Matching  │
                    │  - Weighted Scoring  │
                    │  - Category Mapping  │
                    └──────────────────────┘
                              │
                              v
                    ┌──────────────────────┐
                    │   Model Database     │
                    │  - 80+ Model Profiles│
                    │  - Capability Scores │
                    │  - Performance Data  │
                    └──────────────────────┘
                              │
                              v
                    ┌──────────────────────┐
                    │  LLM Decision Engine │
                    │  - Requirements Match│
                    │  - Context Analysis  │
                    │  - Optimal Selection │
                    └──────────────────────┘
```

This architecture ensures reliable, fast, and intelligent model selection that adapts to your specific needs while maintaining high accuracy and performance.
