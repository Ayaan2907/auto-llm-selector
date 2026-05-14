# Auto Prompt Router to LLM

**auto-llm-selector** helps you pick an **OpenRouter model id** from a user prompt plus numeric priorities: it classifies the task, loads the live model catalog, applies **hard filters** (context, multimodal, tiers, optional allow/deny patterns), then ranks candidates. **Default selection is deterministic** (fast, reproducible). Set `selectionStrategy: 'llm'` if you want the optional legacy meta-LLM chooser instead.

## Who it is for

Teams already using (or planning to use) **OpenRouter** who want a small library: **prompt + `PromptProperties` → recommended model id** and human-readable metadata (`reason`, category, confidence, optional `selectionId`).

**Requirements:** Node **≥ 16**, an [OpenRouter](https://openrouter.ai) API key, and network access for catalog/classification.

## Install

```bash
npm install auto-llm-selector
```

Equivalents: `pnpm add auto-llm-selector` · `yarn add auto-llm-selector`

---

## Use in your application

Import from **`auto-llm-selector`** (published `dist/`). Call **`initialize()`** once before recommendations.

```typescript
import { AutoPromptRouter, type PromptProperties } from 'auto-llm-selector';

const router = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
  // selectionStrategy defaults to 'deterministic'
});

await router.initialize();

const result = await router.getModelRecommendation(
  'Help me fix this Python bug — my function keeps returning None',
  {
    accuracy: 0.9,
    cost: 0.5,
    speed: 0.7,
    tokenLimit: 4000,
    reasoning: true, // when true, only reasoning-capable models pass this step
  } satisfies PromptProperties
);

console.log(result.model);
console.log(result.reason);
console.log(result.category.type, result.category.confidence);
console.log(result.selectionStrategy ?? 'deterministic');
if (result.selectionId) console.log('selectionId', result.selectionId);
```

The exact **model id** depends on OpenRouter’s current catalog and your properties, not on a fixed “always GPT-4” table.

**More API surface** (details in [docs/api-reference.md](docs/api-reference.md) and [docs/how-it-works.md](docs/how-it-works.md)):

- **`getModelRecommendations`** — batch multiple `{ prompt, properties }` pairs.
- **`reportOutcome`** — optional in-process feedback keyed by `selectionId`.
- **`multiLabelClassification`** — blend category weights instead of a single winning label.
- **`allowedModelPatterns` / `excludedModelPatterns`** — OpenRouter-style wildcards (e.g. `anthropic/*`).
- **`modelCatalogPersistentCachePath`** — JSON cache path for catalog fallback when the API is flaky.
- **`telemetry`** — hooks such as `onModelSelected` for logging or experiments.

---

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

The wizard asks for the prompt and any unset `PromptProperties`, then narrates each router stage — catalog size, classified category, filter survivors with drop-reason breakdown, top-5 ranked candidates with scores, and the final selection. It ends by printing the equivalent TypeScript snippet you can paste into your own app.

Contributors can run the same CLI against the working tree, with no build step:

```bash
git clone https://github.com/Ayaan2907/auto-llm-selector.git
cd auto-llm-selector
pnpm install
export OPEN_ROUTER_API_KEY="sk-or-..."
pnpm try                               # tsx on src/, edits picked up immediately
```

If you hit **`tfjs_binding.node` missing** errors after install, see [Troubleshooting](#troubleshooting) and [CONTRIBUTING.md](CONTRIBUTING.md) (native TensorFlow addon).

---

## How it works (short)

1. **Classify** the prompt (hybrid embeddings + keywords; optional **multi-label** weighting).
2. **Profile** models from OpenRouter’s catalog (curated overrides plus heuristics for unknown ids).
3. **Hard-filter** by context window, multimodal flag, tier constraints, and optional allow/deny patterns.
4. **Rank** with the default **deterministic** scorer, or with **`selectionStrategy: 'llm'`** via an extra chat completion to a selector model.

---

## What you get back

Each **`ModelSelection`** includes:

- **`model`** — OpenRouter model id to call next.
- **`reason`** — short explanation of the ranking choice.
- **`confidence`** — how strong the match is (0–1).
- **`category`** — classified task type and confidence.
- **`selectionStrategy`** — how the pick was made (`deterministic` or `llm`).
- **`selectionId`** (optional) — stable id for **`reportOutcome`**.
- **`categoryWeights`** (optional) — when multi-label mode is on, normalized category weights.

## Task categories

The classifier maps prompts toward categories such as **coding**, **creative**, **analytical**, **reasoning**, **conversational**, and **general** (see types and docs for the full enum).

## Common imports

```typescript
import {
  AutoPromptRouter,
  type RouterConfig,
  type PromptProperties,
  type ModelSelection,
  type PromptCategory,
  type ModelProfile,
  PromptType,
} from 'auto-llm-selector';
```

Most integrations need **`AutoPromptRouter`**, **`RouterConfig`**, **`PromptProperties`**, and **`ModelSelection`**.

## Configuration example

```typescript
import type { RouterConfig } from 'auto-llm-selector';

const config: RouterConfig = {
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,

  // Default is 'deterministic'. Uncomment for legacy meta-LLM selection:
  // selectionStrategy: 'llm',
  // selectorModel: 'openai/gpt-4o-mini', // used only when strategy is 'llm'

  enableLogging: true,

  // Optional analytics — fully opt-in; prompts are hashed, not stored raw.
  // Custom ingest URLs must use HTTPS (localhost http allowed for dev).
  // analytics: {
  //   enabled: true,
  //   collectPromptMetrics: true,
  //   collectModelPerformance: true,
  //   collectSemanticFeatures: true,
  //   collectSystemInfo: true,
  //   endpointUrl: 'https://your.example/functions/v1/analytics',
  //   apiKey: 'optional-bearer-for-your-endpoint',
  // },
};
```

## Verify locally (contributors)

After cloning:

```bash
pnpm run test:install
```

With dependencies already installed:

```bash
pnpm run verify
```

More detail: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Environment variables

Typical local setup:

```text
OPEN_ROUTER_API_KEY=your-key
NODE_ENV=development
```

You can also read keys in app code from your own secret store; the library does not require a `.env` file by itself.

## Troubleshooting

### TensorFlow / `@tensorflow/tfjs-node`

Classification uses TensorFlow.js native bindings. If install scripts were blocked:

```bash
pnpm approve-builds   # when pnpm asks to allow package build scripts
pnpm install
```

If errors persist, try reinstalling the TensorFlow packages or matching your **Node version** to a build that provides a prebuilt binary for your OS. See also [CONTRIBUTING.md — First-time setup](CONTRIBUTING.md#first-time-setup).

## Performance and privacy

- **Classification** is usually on the order of **tens to a few hundreds of ms** once embeddings are warm; the first run can be slower while models load.
- **Selection** with the default **deterministic** path is local ranking after filters (no extra OpenRouter chat for routing). **`selectionStrategy: 'llm'`** adds a **chat completion** latency similar to any other OpenRouter call.
- **Catalog** reflects whatever OpenRouter exposes at init time, cached with a TTL (and optional persistent JSON cache).

### Analytics (optional)

If you enable **`analytics`**, events use **hashed** prompt content for metrics, batching, and opt-in behavior. Configure **`endpointUrl`** (HTTPS; localhost http allowed) and an optional **`apiKey`** for your own ingest. Do not enable analytics toward an endpoint you do not control unless you accept that metadata will leave your system.

## Curated vs live catalog

Known models get **curated** capability hints; everything else is still ranked using **heuristics** from OpenRouter listing and pricing. On each **`initialize()`**, the catalog is refreshed according to cache TTL settings.

## Contributing

Issues and pull requests are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, commands, code layout, and PR expectations.

## License

MIT © Ayaan Kaifullah

## Keywords

auto-llm-selector, OpenRouter, model routing, prompt classification, LLM selection
