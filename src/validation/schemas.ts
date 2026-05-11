import { z } from 'zod';
import { PromptType } from '../types.js';

const promptTypeEnum = z.nativeEnum(PromptType);

export const promptPropertiesSchema = z.object({
  accuracy: z.number().min(0).max(1),
  cost: z.number().min(0).max(1),
  speed: z.number().min(0).max(1),
  tokenLimit: z.number().finite().nonnegative(),
  reasoning: z.boolean(),
  multimodal: z.boolean().optional(),
  qualityVsCost: z.number().min(0).max(1).optional(),
});

export const routerConfigSchema = z.object({
  OPEN_ROUTER_API_KEY: z.string().min(1),
  selectorModel: z.string().min(1).optional(),
  selectionStrategy: z.enum(['deterministic', 'llm']).optional(),
  enableLogging: z.boolean().optional(),
  modelCatalogCacheTtlMs: z.number().positive().optional(),
  modelCatalogPersistentCachePath: z.string().min(1).optional(),
  allowedModelPatterns: z.array(z.string().min(1)).optional(),
  excludedModelPatterns: z.array(z.string().min(1)).optional(),
  multiLabelClassification: z.boolean().optional(),
});

export function assertValidPromptProperties(
  properties: unknown
): asserts properties is z.infer<typeof promptPropertiesSchema> {
  promptPropertiesSchema.parse(properties);
}

export function assertValidPrompt(prompt: string): void {
  if (typeof prompt !== 'string') {
    throw new TypeError('Prompt must be a string');
  }
  if (prompt.trim().length === 0) {
    throw new Error('Prompt must not be empty');
  }
  if (prompt.length > 200_000) {
    throw new Error(
      'Prompt exceeds maximum supported length (200000 characters)'
    );
  }
}

export { promptTypeEnum };
