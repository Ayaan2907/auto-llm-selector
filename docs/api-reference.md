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

## Interfaces

### RouterConfig

Configuration for the AutoPromptRouter.

```typescript
interface RouterConfig {
  OPEN_ROUTER_API_KEY: string; // Required: Your OpenRouter API key
  selectorModel?: string; // Optional: Model to use for selection (default: 'openai/gpt-oss-20b:free')
  enableLogging?: boolean; // Optional: Enable detailed logging (default: false)
}
```

**Properties:**

- `OPEN_ROUTER_API_KEY` - Get yours at [openrouter.ai](https://openrouter.ai)
- `selectorModel` - Which model makes the final selection decision
- `enableLogging` - Shows detailed logs of classification and selection process

### PromptProperties

Your requirements and preferences for the AI response.

```typescript
interface PromptProperties {
  accuracy: number; // 0-1: How accurate/precise the response needs to be
  cost: number; // 0-1: Cost sensitivity (0=very cost sensitive, 1=cost no object)
  speed: number; // 0-1: Speed requirement (0=slow ok, 1=need fast response)
  tokenLimit: number; // Maximum tokens you expect in the response
  reasoning: boolean; // Whether the task requires complex reasoning/logic
}
```

**Guidelines:**

- **accuracy**: `0.9+` for code/analysis, `0.6-0.8` for creative/casual tasks
- **cost**: `0.1` for budget-conscious, `0.5` for moderate, `0.8+` for premium quality
- **speed**: `0.9+` for real-time chat, `0.5` for moderate, `0.3` for quality-focused
- **tokenLimit**: Estimate your expected response length (500=short, 3000=medium, 8000+=long)
- **reasoning**: `true` for coding, math, analysis; `false` for creative, simple questions

### ModelSelection

The result returned by `getModelRecommendation()`.

```typescript
interface ModelSelection {
  model: string; // The selected model ID (e.g., 'openai/gpt-4')
  reason: string; // Human-readable explanation of why this model was chosen
  confidence: number; // 0-1: How confident the selection system is in this choice
  category: PromptCategory; // How your prompt was classified
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

- **Initialization**: ~1-3 seconds to fetch and profile all models
- **Classification**: ~100-300ms for hybrid semantic + keyword analysis
- **Selection**: ~500-1500ms depending on the selector model used
- **Caching**: Model profiles are cached in memory for optimal performance
- **Rate Limits**: Respects OpenRouter API rate limits automatically
