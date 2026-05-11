# API Reference

Complete reference for all classes, interfaces, and methods in Auto Prompt Router.

## AutoPromptRouter

The main class that handles intelligent model selection.

### Constructor

```typescript
new AutoPromptRouter(config: RouterConfig)
```

Creates a new router instance with the provided configuration.

**Parameters:**

- `config: RouterConfig` - Configuration object containing API key and options

### Methods

#### `initialize(): Promise<void>`

Initializes the router by fetching and caching model profiles from OpenRouter.

**Must be called** before using `getModelRecommendation()`.

```typescript
const router = new AutoPromptRouter(config);
await router.initialize(); // Required!
```

**Throws:** `Error` if API key is invalid or network request fails.

#### `getModelRecommendation(prompt: string, properties: PromptProperties): Promise<ModelSelection>`

Gets the best model recommendation for your prompt and requirements.

**Parameters:**

- `prompt: string` - The text you want to send to an AI model
- `properties: PromptProperties` - Your requirements and preferences

**Returns:** `Promise<ModelSelection>` - The recommended model with reasoning

**Example:**

```typescript
const result = await router.getModelRecommendation(
  'Write a Python function to parse JSON',
  {
    accuracy: 0.9,
    cost: 0.5,
    speed: 0.7,
    tokenLimit: 3000,
    reasoning: true,
  }
);
```

#### `getAvailableModels(): Promise<ModelProfile[]>`

Gets all available model profiles with their capabilities and characteristics.

**Returns:** `Promise<ModelProfile[]>` - Array of all cached model profiles

**Example:**

```typescript
const models = await router.getAvailableModels();
console.log(`Found ${models.length} models`);
```

#### `clearCache(): void`

Clears the internal model cache. Useful for testing or forcing a refresh of model data.

```typescript
router.clearCache();
await router.initialize(); // Re-fetch model data
```

#### `getModelRecommendations(items): Promise<ModelSelection[]>`

Batch helper that calls `getModelRecommendation` sequentially for each item.

#### `reportOutcome(selectionId, quality)`

Stores lightweight in-process feedback keyed by `selectionId` from `ModelSelection`.

## Interfaces

### RouterConfig

Configuration for the AutoPromptRouter.

```typescript
type ModelSelectionStrategy = 'deterministic' | 'llm';

interface RouterConfig {
  OPEN_ROUTER_API_KEY: string;
  selectorModel?: string; // Used when selectionStrategy is 'llm'
  selectionStrategy?: ModelSelectionStrategy; // default: 'deterministic'
  enableLogging?: boolean; // default: true
  analytics?: AnalyticsConfig;
  modelCatalogCacheTtlMs?: number; // default: 24h
  modelCatalogPersistentCachePath?: string; // optional JSON snapshot path
  allowedModelPatterns?: string[]; // e.g. ['anthropic/*']
  excludedModelPatterns?: string[];
  multiLabelClassification?: boolean; // default: false
  telemetry?: RouterTelemetryHooks;
}
```

**Properties:**

- `OPEN_ROUTER_API_KEY` - Get yours at [openrouter.ai](https://openrouter.ai)
- `selectionStrategy` - `deterministic` avoids an extra routing LLM call; `llm` uses OpenRouter chat completions
- `selectorModel` - Only used for `selectionStrategy: 'llm'`
- `enableLogging` - When `false`, suppresses routine logs (errors may still emit on server runtimes)
- `modelCatalogPersistentCachePath` - Optional local JSON cache used as a cold-start / offline fallback
- `allowedModelPatterns` / `excludedModelPatterns` - Wildcard filters applied as hard constraints
- `multiLabelClassification` - Enables weighted multi-category routing
- `telemetry` - Optional hooks (for example `onModelSelected`)

### PromptProperties

Your requirements and preferences for the AI response.

```typescript
interface PromptProperties {
  accuracy: number; // 0-1
  cost: number; // 0 = very cost sensitive, 1 = cost no object
  speed: number; // 0-1
  tokenLimit: number; // minimum required context window (tokens)
  reasoning: boolean;
  multimodal?: boolean;
  qualityVsCost?: number; // 0-1 (used by multi-label deterministic ranking)
}
```

**Guidelines:**

- **accuracy**: higher values tighten the minimum accuracy tier filter
- **cost**: lower values tighten the maximum cost tier filter
- **speed**: higher values tighten the minimum speed tier filter
- **tokenLimit**: treated as a **minimum context window** requirement (`contextLength >= tokenLimit`)
- **reasoning**: when `true`, only models flagged as reasoning-capable are eligible
- **multimodal**: when `true`, only multimodal models are eligible
- **qualityVsCost**: biases multi-label deterministic ranking toward quality vs cost efficiency

### ModelSelection

The result returned by `getModelRecommendation()`.

```typescript
interface ModelSelection {
  model: string;
  reason: string;
  confidence: number;
  category: PromptCategory;
  selectionId?: string;
  categoryWeights?: Partial<Record<PromptType, number>>;
  selectionStrategy?: ModelSelectionStrategy;
}
```

**Example Result:**

```typescript
{
  model: 'openai/gpt-4',
  reason: 'Selected for excellent coding capabilities (95%) and strong reasoning skills',
  confidence: 0.92,
  category: {
    type: 'coding',
    confidence: 0.89
  }
}
```

### PromptCategory

How your prompt was classified by the system.

```typescript
interface PromptCategory {
  type: PromptType; // The detected category (coding, creative, etc.)
  confidence: number; // 0-1: How confident the classifier is
}
```

### ModelProfile

Complete profile of an AI model's capabilities and characteristics.

```typescript
interface ModelProfile {
  id: string; // Model identifier
  name: string; // Human-readable name
  description: string; // Model description
  capabilities: ModelCapabilities; // Performance scores by category
  characteristics: ModelCharacteristics; // Speed, cost, accuracy tiers
  contextLength: number; // Maximum context window
  promptCostPerToken: number; // Cost per input token
  completionCostPerToken: number; // Cost per output token
  maxCompletionTokens: number; // Maximum response length
  isModerated: boolean; // Whether content is moderated
  profileConfidence: number; // 0-1: How reliable this profile data is
}
```

### ModelCapabilities

Performance scores for different task categories.

```typescript
interface ModelCapabilities {
  coding: number; // 0-1: Programming, debugging, code review
  creative: number; // 0-1: Writing, storytelling, content creation
  analytical: number; // 0-1: Data analysis, research, insights
  reasoning: number; // 0-1: Logic, math, complex problem-solving
  conversational: number; // 0-1: Chat, Q&A, dialogue quality
  general: number; // 0-1: General knowledge, explanations
}
```

**Score Interpretation:**

- `0.9+` - Excellent, top-tier performance
- `0.8-0.9` - Very good, reliable for most tasks
- `0.6-0.8` - Good, suitable for many use cases
- `0.4-0.6` - Fair, adequate for simple tasks
- `<0.4` - Limited capability in this area

### ModelCharacteristics

Operational characteristics of the model.

```typescript
interface ModelCharacteristics {
  speedTier: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  costTier: 'free' | 'cheap' | 'moderate' | 'expensive' | 'premium';
  accuracyTier: 'basic' | 'good' | 'high' | 'excellent';
  contextTier: 'small' | 'medium' | 'large' | 'huge';
  provider: string; // e.g., 'openai', 'anthropic', 'google'
  modelFamily: string; // e.g., 'gpt-4', 'claude-3', 'gemini'
  isReasoning: boolean; // Has chain-of-thought capabilities
  isMultimodal: boolean; // Supports images/other modalities
}
```

## Enums

### PromptType

Available prompt categories the system can detect.

```typescript
enum PromptType {
  Creative = 'creative',
  Analytical = 'analytical',
  Coding = 'coding',
  Conversational = 'conversational',
  Reasoning = 'reasoning',
  General = 'general',
}
```

## Error Handling

The router throws descriptive errors for common issues:

```typescript
try {
  const router = new AutoPromptRouter({ OPEN_ROUTER_API_KEY: 'invalid' });
  await router.initialize();
} catch (error) {
  if (error.message.includes('OpenRouter API key')) {
    console.error('Please check your API key');
  }
}

try {
  const result = await router.getModelRecommendation(prompt, properties);
} catch (error) {
  if (error.message.includes('not initialized')) {
    console.error('Call router.initialize() first');
  }
}
```

## Performance Notes

- **Initialization**: dominated by downloading OpenRouter’s model list and building profiles (network + CPU)
- **Classification**: first semantic classification may pay a one-time TensorFlow.js model load cost; later calls are much faster due to caching
- **Selection**:
  - `deterministic`: typically milliseconds (no extra routing LLM call)
  - `llm`: adds a chat-completions round trip similar to any other OpenRouter call
- **Caching**: model catalog TTL defaults to 24 hours; embedding/classification caches use stable SHA-256 keys
- **Retries**: OpenRouter HTTP calls use bounded exponential backoff for transient failures
