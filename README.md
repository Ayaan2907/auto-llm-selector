# Auto Prompt Router to LLM

**auto-llm-selector** helps you pick an **OpenRouter model id** from a user prompt plus numeric priorities: it classifies the task, loads the live model catalog, applies **hard filters** (context, multimodal, tiers, optional allow/deny patterns), then ranks candidates. **Default selection is deterministic** (fast, reproducible). Set `selectionStrategy: 'llm'` if you want the optional legacy meta-LLM chooser instead.

## Who it is for

Teams already using (or planning to use) **OpenRouter** who want a small library: **prompt + `PromptProperties` → recommended model id** and human-readable metadata (`reason`, category, confidence, optional `selectionId`).

**Requirements:**

- **Node 18, 20, or 22** (supported Node majors). Node 23+ is not yet supported because our semantic-classification dependency `@tensorflow/tfjs-node` does not ship prebuilt native binaries for Node 23/24/25. If you're on a newer Node, run `nvm install 22 && nvm use 22` before installing.
- An [OpenRouter](https://openrouter.ai) API key.
- Network access for catalog/classification.

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

## Sample CLI runs

Real captures from `npx als try --non-interactive` against the current OpenRouter catalog (364 models at the time of recording). The CLI narrates every pipeline stage so you can see _why_ a model was selected.

### Coding preset — `--preset coding`

```
$ npx als try --prompt "Refactor this regex to ASCII-only" --preset coding --non-interactive

▸ catalog: 364 profiles loaded (0ms)
▸ reasoning filter        : 364 → 68
▸ classified: coding (47%)
▸ category threshold ≥0.3 : 68 → 68
▸ hard filters            : 68 → 19  3 by tokenLimit · 40 by speedTier · 6 by accuracyTier
▸ ranked top 5 (deterministic):
    1. anthropic/claude-sonnet-4.5     0.95   strong coding · excellent accuracy
    2. deepseek/deepseek-chat          0.88   88% coding · cost-effective
    3. openai/gpt-4-turbo-preview      0.87   ultra-fast · cheap · high
    4. openai/gpt-4o-mini              0.85   solid coding · cheap
    5. google/gemini-2.0-flash-001     0.84   ultra-fast · cheap · high
▸ selected: anthropic/claude-sonnet-4.5  (selectionId: dd79a51b…)
```

### Quick chat — `--preset quick`

```
$ npx als try --prompt "Hi quick question about return policy" --preset quick --non-interactive

▸ catalog: 364 profiles loaded (0ms)
▸ classified: general (71%)
▸ category threshold ≥0.3 : 364 → 361
▸ hard filters            : 361 → 21  1 by tokenLimit · 3 by costTier · 287 by speedTier · 49 by accuracyTier
▸ ranked top 5 (deterministic):
    ...
▸ selected: google/gemini-2.0-flash-001  (selectionId: fc16a70c…)
```

### Multi-label classification — mixed-intent prompt

```
$ npx als try --prompt "Help me debug some Python and brainstorm marketing copy" \
    --accuracy 0.7 --cost 0.4 --speed 0.6 --token-limit 4000 \
    --multi-label --non-interactive

▸ classified: coding (39%)  coding:39% · conversational:29% · reasoning:11% · creative:8% · analytical:7% · general:7%
▸ hard filters            : 361 → 24
▸ selected: openai/gpt-4o-mini
```

The classifier returns a normalized weight vector across all categories; ranking blends per-category capability scores against those weights instead of picking one winner.

### Wildcard allow-list — `--allow "anthropic/*"`

```
$ npx als try --prompt "Write a SQL query to find duplicate rows by email" \
    --preset coding --allow "anthropic/*" --non-interactive

▸ reasoning filter        : 364 → 68
▸ hard filters            : 68 → 3  62 by allowList · 3 by speedTier
▸ ranked top 3 (deterministic):
    1. anthropic/claude-sonnet-4.5   0.95
    2. anthropic/claude-sonnet-4     0.94
    3. anthropic/claude-haiku-4.5    0.86
▸ selected: anthropic/claude-sonnet-4.5
```

### Zero-survivor coaching — when filters over-constrain

Cranking every knob to 1.0 with both `reasoning` and `multimodal` produces an empty candidate set. Instead of a bare error, the CLI surfaces the biggest blocker:

```
$ npx als try --prompt "I need a function to generate random palindromes in Rust" \
    --accuracy 1 --cost 1 --speed 1 --token-limit 16000 \
    --reasoning --multimodal --strategy llm --multi-label --non-interactive

▸ reasoning filter        : 364 → 53
▸ classified: coding (57%)  coding:57% · reasoning:13% · general:11% · ...
▸ hard filters            : 53 → 0  38 by multimodal · 2 by tokenLimit · 11 by speedTier · 2 by accuracyTier

  ⚠ No candidates survived this stage.
    Biggest blocker: multimodal (38 dropped) — try unchecking "Multimodal?"
    Other drops: speed tier (11) · context window (2) · accuracy tier (2)
```

### LLM-strategy selection — `--strategy llm`

For comparison with the deterministic ranker, `--strategy llm` sends the candidate list to a meta-LLM (defaults to `openai/gpt-4o-mini`) and parses the JSON pick:

```
$ npx als try --prompt "Same palindromes prompt, sensible knobs" \
    --accuracy 0.85 --cost 0.6 --speed 0.6 --token-limit 16000 \
    --reasoning --strategy llm --multi-label --non-interactive

▸ hard filters            : 53 → 4
▸ ranked top 4 (llm):
    1. deepseek/deepseek-chat       0.88   coding 88% · fast/cheap/high
    2. openai/gpt-4-turbo-preview   0.87   coding 87% · ultra-fast/cheap/high
    3. openai/gpt-4o-mini           0.85
    4. google/gemini-2.0-flash-001  0.84
▸ selected: deepseek/deepseek-chat
```

Every run ends with the equivalent TypeScript snippet for the exact config you ran, so the "I tried this in the CLI" → "I'm using it in my app" transition is one copy-paste:

```typescript
import { AutoPromptRouter } from 'auto-llm-selector';

const router = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
});
await router.initialize();

const result = await router.getModelRecommendation(
  'Refactor this regex to ASCII-only',
  { accuracy: 0.85, cost: 0.45, speed: 0.6, tokenLimit: 16000, reasoning: true }
);
console.log(result.model);
```

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

Classification uses TensorFlow.js native bindings. The most common failure is a Node-version mismatch:

```
Error: The Node.js native addon module (tfjs_binding.node) can not be found at path:
.../@tensorflow/tfjs-node/lib/napi-v8/tfjs_binding.node
```

**Fix:** use Node 18, 20, or 22. `@tensorflow/tfjs-node@4.22.x` only ships prebuilt binaries up to Node 22 (NAPI v8). Node 23/24/25 are not yet supported by the upstream package.

```bash
nvm install 22
nvm use 22
# then re-run npx auto-llm-selector try (or your install)
```

If install scripts were blocked rather than the Node version being wrong:

```bash
pnpm approve-builds   # when pnpm asks to allow package build scripts
pnpm install
```

See also [CONTRIBUTING.md — First-time setup](CONTRIBUTING.md#first-time-setup).

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
