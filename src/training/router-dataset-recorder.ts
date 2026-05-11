import type { PromptProperties } from '../types.js';

export type RouterTrainingSample = {
  prompt: string;
  properties: PromptProperties;
  selectedModelId: string;
  /** Optional numeric score (higher is better) for offline router training */
  score?: number;
};

/**
 * Collects local training samples for future custom router training workflows.
 * This is intentionally in-memory and bounded to avoid unbounded memory growth.
 */
export class RouterDatasetRecorder {
  private readonly samples: RouterTrainingSample[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 1000) {
    this.maxSamples = maxSamples;
  }

  record(sample: RouterTrainingSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
  }

  exportSamples(): RouterTrainingSample[] {
    return [...this.samples];
  }

  clear(): void {
    this.samples.length = 0;
  }
}
