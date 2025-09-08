# Auto Prompt Router to LLM

Ever found yourself wondering which AI model to use for your specific task? Should you use GPT-4 for that complex coding problem, or would Claude be better for creative writing? This package takes the guesswork out of model selection.

**Auto Prompt Router** intelligently analyzes your prompts and automatically selects the best language model based on what you're trying to accomplish, your performance needs, and your budget.

## Why This Exists

With so many great AI models available (GPT-4, Claude, Gemini, Llama, etc.), choosing the right one for each task has become a real challenge. Each model has its strengths - some excel at coding, others at creative tasks. Some are lightning fast but less accurate, others are incredibly smart but slower and more expensive.

This router solves that problem by:

- Understanding what type of task you're doing (coding, writing, analysis, etc.)
- Knowing the strengths and weaknesses of 80+ different models
- Considering your specific needs (speed, accuracy, cost)
- Making the optimal choice for you automatically

## Installation

```bash
npm install auto-prompt-router-to-llm
```

## Quick Example

> simply run `npx tsx sample.ts` after cloning and check the output

```typescript
import {
  AutoPromptRouter,
  type RouterConfig,
  type PromptProperties,
} from 'auto-prompt-router-to-llm';

// Set up the router
const router = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: 'your-api-key', // Get one from openrouter.ai
});

await router.initialize();

// Ask for help with a coding problem
const result = await router.getModelRecommendation(
  'Help me fix this Python bug - my function keeps returning None',
  {
    accuracy: 0.9, // I need this to be right
    cost: 0.5, // Moderate budget
    speed: 0.7, // Fairly quick response needed
    tokenLimit: 4000, // Not a huge response needed
    reasoning: true, // This requires some thinking
  }
);

console.log(`Best model: ${result.model}`);
console.log(`Why: ${result.reason}`);
// Might output: "Selected GPT-4 for its excellent coding capabilities and reasoning skills"
```

### Provider Filtering Example

```typescript
// Only use premium providers (OpenAI and Anthropic)
const premiumRouter = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: 'your-api-key',
  allowedProviders: ['openai', 'anthropic'],
});

// Avoid expensive models by blocking certain providers
const budgetRouter = new AutoPromptRouter({
  OPEN_ROUTER_API_KEY: 'your-api-key',
  blockedProviders: ['openai'], // Skip OpenAI's premium models
});

await premiumRouter.initialize();
const premiumRecommendation = await premiumRouter.getModelRecommendation(
  'Write complex business logic in Python',
  { accuracy: 0.95, cost: 0.8, speed: 0.6, tokenLimit: 5000, reasoning: true }
);
// Will only consider OpenAI and Anthropic models
```

## Real-World Examples

### When You Need Help Coding

```typescript
const codingHelp = await router.getModelRecommendation(
  'Write a function to validate email addresses with regex',
  {
    accuracy: 0.95, // Code needs to be correct
    cost: 0.4, // Keep costs reasonable
    speed: 0.8, // Want a quick answer
    tokenLimit: 3000,
    reasoning: true, // Logic is important
  }
);
// Likely picks: GPT-4 or Claude Sonnet (great at coding)
```

### Creative Writing Tasks

```typescript
const storyWriting = await router.getModelRecommendation(
  'Write a short story about a robot learning to paint',
  {
    accuracy: 0.7, // Creativity over perfect grammar
    cost: 0.3, // Budget-conscious
    speed: 0.4, // Quality over speed
    tokenLimit: 8000, // Longer creative content
    reasoning: false, // Pure creativity
  }
);
// Likely picks: Claude (excellent for creative tasks) or GPT-4
```

### Quick Questions

```typescript
const quickChat = await router.getModelRecommendation(
  "What's the weather like in Tokyo right now?",
  {
    accuracy: 0.6, // Simple question
    cost: 0.1, // Keep it cheap
    speed: 0.9, // Want instant response
    tokenLimit: 500,
    reasoning: false,
  }
);
// Likely picks: GPT-3.5-turbo or Claude Haiku (fast and cheap)
```

## How It Actually Works

The magic happens in a few steps:

1. **Understanding Your Prompt**: The system reads your prompt and figures out what category it falls into - is this a coding question? Creative writing? Data analysis? It uses both AI embeddings and keyword matching to be really accurate.

2. **Knowing the Models**: We've tested and profiled over many different AI models. Each one gets scored on things like:
   - How good is it at coding vs creative tasks?
   - How fast does it respond?
   - How much does it cost?
   - Can it handle complex reasoning?

3. **Making the Choice**: An AI looks at your prompt, your requirements, and all the model profiles, then picks the best match. It even explains why it made that choice.

4. **Learning Over Time**: The system gets smarter as it sees more examples of what works well. // TODO: NOT YET FULLY IMPLEMENTED

## What You Get Back

Every recommendation includes:

- **The best model** for your specific prompt and needs
- **A clear explanation** of why this model was chosen
- **Confidence scores** so you know how sure the system is
- **Category classification** showing how your prompt was understood

## Available Model Categories

The router recognizes these types of tasks:

- **Coding & Development** - Programming, debugging, code reviews, technical docs
- **Creative Writing** - Stories, poems, creative content, marketing copy
- **Data Analysis** - Research, comparisons, insights, business analysis
- **Complex Reasoning** - Logic puzzles, math problems, strategic thinking
- **Conversation** - Chat, Q&A, customer support, casual discussion
- **General Knowledge** - Facts, explanations, how-to guides

## Exports & Imports

```typescript
import {
  // Main class - does all the intelligent routing
  AutoPromptRouter,

  // Core types for configuration and responses
  type RouterConfig, // Settings for API key, model selection, logging
  type PromptProperties, // Your requirements: accuracy, cost, speed, etc.
  type ModelSelection, // The recommendation result with model and reasoning
  type PromptCategory, // Classification result with type and confidence

  // Advanced types (optional, for custom integrations)
  type ModelProfile, // Complete model capability and characteristic data
  type ModelCapabilities, // Scores for coding, creative, analytical, etc.
  type ModelCharacteristics, // Speed, cost, accuracy tiers and provider info
  type ModelInfo, // Raw model data from OpenRouter API

  // Enums
  PromptType, // Available categories: coding, creative, analytical, etc.
} from 'auto-prompt-router-to-llm';
```

**Most users only need**: `AutoPromptRouter`, `RouterConfig`, `PromptProperties`, and `ModelSelection`.

## Getting Started

1. **Get an API Key**: Sign up at [OpenRouter.ai](https://openrouter.ai) - they provide access to all the major AI models through one API
2. **Install the package**: `npm install auto-prompt-router-to-llm`
3. **Try the examples** above to see how it works
4. **Check out the full API docs** in the `/docs` folder

## Configuration Options

```typescript
const config: RouterConfig = {
  OPEN_ROUTER_API_KEY: 'your-key', // Required
  selectorModel: 'anthropic/claude-3-sonnet', // Optional: which model makes the selection
  allowedProviders: ['openai', 'anthropic'], // Optional: whitelist specific providers
  blockedProviders: ['meta-llama'], // Optional: blacklist specific providers
};
```

### Provider Filtering

Control which AI providers can be used for model selection:

- **`allowedProviders`**: Array of provider names to include (whitelist approach)
- **`blockedProviders`**: Array of provider names to exclude (blacklist approach)

**Provider Names**: Common providers include `openai`, `anthropic`, `google`, `meta-llama`, `microsoft`, `gryphe`, `nousresearch`

**Priority**: If both `allowedProviders` and `blockedProviders` are specified, `allowedProviders` takes precedence.

**Examples**:
```typescript
// Only use OpenAI models
{ allowedProviders: ['openai'] }

// Use any provider except Meta Llama
{ blockedProviders: ['meta-llama'] }

// Use only premium providers
{ allowedProviders: ['openai', 'anthropic', 'google'] }

// Avoid free/community models
{ blockedProviders: ['gryphe', 'nousresearch'] }
```

## Requirements

- Node.js 16 or higher
- An OpenRouter API key (free tier available)
- Internet connection (for model data and AI classification)

## Development

```bash
# Get started
npm install
npm run build

# Development mode
npm run dev

# Code quality
npm run lint
npm run typecheck
npm run format
```

## Environment Variables

Create a `.env` file and add the following:

```text
OPEN_ROUTER_API_KEY=your-key
NODE_ENV=development
```

## Troubleshooting

### TensorFlow Dependencies

If you encounter TensorFlow-related errors:

```bash
npm uninstall @tensorflow/tfjs-node @tensorflow-models/universal-sentence-encoder
npm install @tensorflow/tfjs-node @tensorflow-models/universal-sentence-encoder
```

## Performance & Analytics

- **Classification Speed**: ~100-300ms for hybrid semantic + keyword analysis
- **Selection Speed**: ~500-1500ms depending on selected LLM model
- **Model Coverage**: 80+ models from OpenAI, Anthropic, Google, Meta, and others
- **Cache Efficiency**: Model profiles cached for optimal performance

## Supported Models

The router includes pre-curated profiles for popular models from:

- **OpenAI**: GPT-4, GPT-4-Turbo, GPT-4o, GPT-3.5-Turbo
- **Anthropic**: Claude-3 (Opus, Sonnet, Haiku)
- **Google**: Gemini Pro, Gemini Flash
- **Meta**: Llama 3.1 (405B, 70B, 8B)
- **Open Source**: Mixtral, Wizard, and many more

Apart from these everytime we initialize the library new models are fetched from OpenRouter API and cached for optimal performance.

## Contributing

Found a bug? Have an idea? Pull requests welcome! This is an open source project and we'd love your help making it better.

## License

MIT © Ayaan Kaifullah

## Keywords

Auto Prompt Router To LLM,
