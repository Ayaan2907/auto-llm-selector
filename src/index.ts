// Main entry point for auto-prompt-router-to-llm library
export { AutoPromptRouter } from './router.js';

// Export types for TypeScript users
export type {
  RouterConfig,
  PromptProperties,
  ModelSelection,
  PromptCategory,
  ProcessedModel,
  ModelInfo,
  ModelScore,
  ModelProfile,
  ModelCapabilities,
  ModelCharacteristics,
} from './types.js';

export { PromptType } from './types.js';

// Default export for convenience
export { AutoPromptRouter as default } from './router.js';
