# Auto Prompt Router to LLM

**auto-llm-selector** picks an **OpenRouter model id** for each **AI surface inside your product** — not for one-off end-user chat messages like “help me debug this” or “what’s the return policy?”

Pass the **system prompt** (or system + developer instruction bundle) that defines a role — main IDE chat, inline tab completion, background summarizer, tool planner, copy generator — together with that surface’s **latency, cost, accuracy, and context budget**. The router classifies that role, loads the live catalog, applies **hard filters**, then ranks survivors. **Default selection is deterministic** (fast, reproducible). Set `selectionStrategy: 'llm'` if you want the optional legacy meta-LLM chooser instead.

## Who it is for

Teams building **multi-model AI applications** on **OpenRouter** who need a small routing layer: **system prompt for a surface + `PromptProperties` → recommended model id**, plus metadata (`reason`, category, confidence, optional `selectionId`).

Typical use: you already run several models internally (agent chat vs autocomplete vs planner) and want to **stop guessing** or using one flagship model for every call site.

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

Import from **`auto-llm-selector`** (published `dist/`). Call **`initialize()`** once, then call **`getModelRecommendation`** once per **surface** (or when a surface’s instructions or budget change).

The first argument is the **system-level instructions** for that surface — the same text you would inject as `system` (or equivalent) before user messages arrive — not an example user utterance.

```typescript
import { AutoPromptRouter, type PromptProperties } from 'auto-llm-selector';

const router = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
  // selectionStrategy defaults to 'deterministic'
});

await router.initialize();

// Example: primary coding-agent chat surface (sidebar / Cmd+K), not a user question.
const agentChatSystemPrompt = [
  'You are the primary coding agent embedded in the IDE.',
  'You receive the active file, selection, diagnostics, and recent edits.',
  'Respond with concise, actionable guidance; prefer minimal diffs.',
  'Do not invent APIs or files that are not in context.',
].join(' ');

const result = await router.getModelRecommendation(agentChatSystemPrompt, {
  accuracy: 0.9,
  cost: 0.5,
  speed: 0.7,
  tokenLimit: 16000,
  reasoning: true, // when true, only reasoning-capable models pass this step
} satisfies PromptProperties);

console.log(result.model); // OpenRouter id to wire into this surface
console.log(result.reason);
console.log(result.category.type, result.category.confidence);
console.log(result.selectionStrategy ?? 'deterministic');
if (result.selectionId) console.log('selectionId', result.selectionId);
```

Route other surfaces the same way — e.g. pass your **inline completion** system prompt with a `quick`-style budget (high speed, lower cost) and your **planner / tool-use** system prompt with an `analytical`-style budget.

The exact **model id** depends on OpenRouter’s current catalog and your properties, not on a fixed “always GPT-4” table.

### CLI presets → product surfaces

| Preset           | Typical surface                                  | Budget shape                              |
| ---------------- | ------------------------------------------------ | ----------------------------------------- |
| **`coding`**     | Main agent / IDE chat / code review              | Higher accuracy, reasoning, large context |
| **`quick`**      | Inline tab completion, titles, micro-classifiers | Latency-first, smaller context            |
| **`analytical`** | Planner, RAG synthesis, structured tool routing  | High accuracy, reasoning, moderate speed  |
| **`creative`**   | In-app copy, variants, UX strings                | Balanced cost; reasoning usually off      |

Use `als try --preset …` with a **representative system prompt** for the surface you are wiring up.

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

# Scriptable — pass a system prompt for the surface you are routing:
npx als try --prompt "You are the primary coding agent in the IDE. You see the active file, selection, and diagnostics. Reply with concise, actionable guidance and minimal diffs." --preset coding --non-interactive
```

The wizard asks for the **system prompt** and any unset `PromptProperties`, then narrates each router stage — catalog size, classified category, filter survivors with drop-reason breakdown, top-5 ranked candidates with scores, and the final selection. It ends by printing the equivalent TypeScript snippet you can paste into your own app.

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

Examples below use **system prompts for internal surfaces**, not sample user messages. Captures are from `npx als try --non-interactive` against a live OpenRouter catalog; exact model ids and counts change as the catalog updates. The CLI narrates every pipeline stage so you can see _why_ a model was selected.

### Agent chat — `--preset coding`

Route the **primary coding-agent** system prompt (sidebar / Cmd+K style):

```
$ npx als try --prompt "You are the primary coding agent embedded in the IDE. You receive the active file, selection, diagnostics, and recent edits. Respond with concise, actionable guidance; prefer minimal diffs. Do not invent APIs." --preset coding --non-interactive

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

### Inline completion — `--preset quick`

Route the **fill-in-the-middle / tab completion** system prompt — a different surface, different budget:

```
$ npx als try --prompt "You are an inline fill-in-the-middle code completion engine. Given PREFIX and SUFFIX, output only the middle tokens. No prose, no markdown fences unless completing inside a string. Match indentation and style exactly." --preset quick --non-interactive

▸ catalog: 364 profiles loaded (0ms)
▸ classified: coding (62%)
▸ category threshold ≥0.3 : 364 → 361
▸ hard filters            : 361 → 21  1 by tokenLimit · 3 by costTier · 287 by speedTier · 49 by accuracyTier
▸ ranked top 5 (deterministic):
    ...
▸ selected: google/gemini-2.0-flash-001  (selectionId: fc16a70c…)
```

### Multi-label — hybrid agent system prompt

Some surfaces blend roles (pair-programming + product Q&A). Pass the combined system instructions and enable **`--multi-label`**:

```
$ npx als try --prompt "You are a pair-programming copilot embedded in the product. When the user asks to change code, output minimal patches. When they ask about architecture or behavior, cite files from context. Keep answers short unless asked to expand." \
    --accuracy 0.7 --cost 0.4 --speed 0.6 --token-limit 4000 \
    --multi-label --non-interactive

▸ classified: coding (39%)  coding:39% · conversational:29% · reasoning:11% · creative:8% · analytical:7% · general:7%
▸ hard filters            : 361 → 24
▸ selected: openai/gpt-4o-mini
```

The classifier returns a normalized weight vector across all categories; ranking blends per-category capability scores against those weights instead of picking one winner.

### Wildcard allow-list — `--allow "anthropic/*"`

Restrict a **read-only SQL assistant** surface to Anthropic models only:

```
$ npx als try --prompt "You are a read-only SQL assistant in an analytics dashboard. Generate SELECT queries against the documented schema only. Never emit DDL, mutations, or queries against tables not in the schema appendix." \
    --preset analytical --allow "anthropic/*" --non-interactive

▸ reasoning filter        : 364 → 68
▸ hard filters            : 68 → 3  62 by allowList · 3 by speedTier
▸ ranked top 3 (deterministic):
    1. anthropic/claude-sonnet-4.5   0.95
    2. anthropic/claude-sonnet-4     0.94
    3. anthropic/claude-haiku-4.5    0.86
▸ selected: anthropic/claude-sonnet-4.5
```

### Zero-survivor coaching — when filters over-constrain

Over-tightening a **vision + reasoning agent** surface’s budget produces an empty candidate set. The CLI surfaces the biggest blocker instead of a bare error:

```
$ npx als try --prompt "You are a multimodal code-review agent. You receive source files and UI screenshots. Flag accessibility regressions and suggest minimal CSS fixes." \
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
$ npx als try --prompt "You are the tool-planning stage of an agent. Given the user goal and prior tool results, emit the next action as strict JSON: { tool, arguments }." \
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

const inlineCompletionSystemPrompt =
  'You are an inline fill-in-the-middle code completion engine. Given PREFIX and SUFFIX, output only the middle tokens.';

const result = await router.getModelRecommendation(
  inlineCompletionSystemPrompt,
  {
    accuracy: 0.55,
    cost: 0.15,
    speed: 0.85,
    tokenLimit: 4000,
    reasoning: false,
  }
);
console.log(result.model);
```

---

## How it works (short)

1. **Classify** the system prompt (hybrid embeddings + keywords; optional **multi-label** weighting).
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

The classifier maps **system prompts** toward categories such as **coding**, **creative**, **analytical**, **reasoning**, **conversational**, and **general** (see types and docs for the full enum). These describe the _role_ of the surface, not a single user utterance.

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
