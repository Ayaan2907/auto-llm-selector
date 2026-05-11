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
  ModelSelectionStrategy,
  RouterTelemetryHooks,
} from './types.js';

export { PromptType } from './types.js';

export { parseRouterEnvironment } from './config/env.js';
export type { ParsedRouterEnvironment } from './config/env.js';

export type { OutcomeQuality } from './feedback/outcome-store.js';

export { RouterDatasetRecorder } from './training/router-dataset-recorder.js';
export type { RouterTrainingSample } from './training/router-dataset-recorder.js';

// Default export for convenience
export { AutoPromptRouter as default } from './router.js';
