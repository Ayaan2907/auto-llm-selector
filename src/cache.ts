import { Logger } from './utils/logger.js';
import { ModelProfiler } from './lib/model-profiler.js';
import type { ModelInfo, PromptCategory, ModelProfile } from './types.js';

const logger = new Logger('Cache:ModelStore');
const embeddingLogger = new Logger('Cache:EmbeddingStore');

interface llmModelProviderResponse {
  data: ModelInfo[];
}

class InMemoryModelCache {
  private profileCache: Map<string, ModelProfile> = new Map();
  private lastFetched: number = 0;
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week
  private OPEN_ROUTER_API_KEY = '';

  constructor(OPEN_ROUTER_API_KEY: string) {
    this.OPEN_ROUTER_API_KEY = OPEN_ROUTER_API_KEY;
  }

  async getModelProfiles(): Promise<ModelProfile[]> {
    const now = Date.now();

    if (
      this.profileCache.size === 0 ||
      now - this.lastFetched > this.CACHE_TTL
    ) {
      await this.fetchAndCacheProfiles();
    }

    return Array.from(this.profileCache.values());
  }

  async getModelProfile(modelId: string): Promise<ModelProfile | undefined> {
    await this.getModelProfiles();
    return this.profileCache.get(modelId);
  }

  /**
   * Get profiles filtered by category performance
   */
  async getTopModelsForCategory(
    category: string,
    limit: number = 10,
    requirements?: {
      maxCost?: number;
      minSpeed?: 'ultra-fast' | 'fast' | 'medium' | 'slow';
      minAccuracy?: 'basic' | 'good' | 'high' | 'excellent';
    }
  ): Promise<ModelProfile[]> {
    const profiles = await this.getModelProfiles();
    const categoryKey =
      category.toLowerCase() as keyof ModelProfile['capabilities'];

    return profiles
      .filter(profile => {
        // Basic capability threshold
        if (profile.capabilities[categoryKey] < 0.3) return false;

        // Requirements filtering
        if (
          requirements?.maxCost &&
          profile.promptCostPerToken > requirements.maxCost
        )
          return false;

        if (requirements?.minSpeed) {
          const speedOrder = ['slow', 'medium', 'fast', 'ultra-fast'];
          const profileSpeedIndex = speedOrder.indexOf(
            profile.characteristics.speedTier
          );
          const requiredSpeedIndex = speedOrder.indexOf(requirements.minSpeed);
          if (profileSpeedIndex < requiredSpeedIndex) return false;
        }

        if (requirements?.minAccuracy) {
          const accuracyOrder = ['basic', 'good', 'high', 'excellent'];
          const profileAccuracyIndex = accuracyOrder.indexOf(
            profile.characteristics.accuracyTier
          );
          const requiredAccuracyIndex = accuracyOrder.indexOf(
            requirements.minAccuracy
          );
          if (profileAccuracyIndex < requiredAccuracyIndex) return false;
        }

        return true;
      })
      .sort((a, b) => b.capabilities[categoryKey] - a.capabilities[categoryKey])
      .slice(0, limit);
  }

  private async fetchAndCacheProfiles(): Promise<void> {
    try {
      logger.info('Fetching models from doer and generating profiles');

      // Use dynamic import to get env after it's been set by router
      // const { env } = await import('./config/env.js');

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${this.OPEN_ROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = (await response.json()) as llmModelProviderResponse;

      // Clear existing profiles and generate new ones
      this.profileCache.clear();
      let profilesGenerated = 0;

      for (const modelInfo of data.data) {
        try {
          const profile = ModelProfiler.createModelProfile(modelInfo);
          this.profileCache.set(modelInfo.id, profile);
          profilesGenerated++;
        } catch (error) {
          logger.warn(`Failed to generate profile for ${modelInfo.id}:`, error);
        }
      }

      this.lastFetched = Date.now();
      logger.info(
        `Generated and cached ${profilesGenerated} model profiles from ${data.data.length} OpenRouter models`
      );
    } catch (error) {
      logger.error('Failed to fetch models from OpenRouter', error);
      throw error;
    }
  }

  clearCache(): void {
    this.profileCache.clear();
    this.lastFetched = 0;
    logger.info('Model cache cleared');
  }
}

/**
 * Cache for storing text embeddings and classification results
 */
class InMemoryEmbeddingCache {
  private embeddingCache: Map<
    string,
    { embedding: number[]; timestamp: number }
  > = new Map();
  private classificationCache: Map<
    string,
    { result: PromptCategory; timestamp: number }
  > = new Map();
  private referenceEmbeddings: Map<string, number[]> = new Map();

  private readonly EMBEDDING_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CLASSIFICATION_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Store text embedding in cache
   */
  setEmbedding(text: string, embedding: number[]): void {
    const key = this.createKey(text);
    this.embeddingCache.set(key, {
      embedding: [...embedding], // Clone array
      timestamp: Date.now(),
    });
    embeddingLogger.debug(`Cached embedding for text (${text.length} chars)`);
  }

  /**
   * Retrieve text embedding from cache
   */
  getEmbedding(text: string): number[] | null {
    const key = this.createKey(text);
    const cached = this.embeddingCache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.EMBEDDING_TTL) {
      this.embeddingCache.delete(key);
      return null;
    }

    embeddingLogger.debug(
      `Retrieved cached embedding for text (${text.length} chars)`
    );
    return [...cached.embedding]; // Return copy
  }

  /**
   * Store classification result in cache
   */
  setClassification(text: string, result: PromptCategory): void {
    const key = this.createKey(text);
    this.classificationCache.set(key, {
      result: { ...result }, // Clone object
      timestamp: Date.now(),
    });
    embeddingLogger.debug(
      `Cached classification: ${result.type} (confidence: ${result.confidence})`
    );
  }

  /**
   * Retrieve classification result from cache
   */
  getClassification(text: string): PromptCategory | null {
    const key = this.createKey(text);
    const cached = this.classificationCache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.CLASSIFICATION_TTL) {
      this.classificationCache.delete(key);
      return null;
    }

    embeddingLogger.debug(
      `Retrieved cached classification: ${cached.result.type}`
    );
    return { ...cached.result }; // Return copy
  }

  /**
   * Store reference embedding for a category
   */
  setReferenceEmbedding(category: string, embedding: number[]): void {
    this.referenceEmbeddings.set(category, [...embedding]);
    embeddingLogger.info(
      `Stored reference embedding for category: ${category}`
    );
  }

  /**
   * Retrieve reference embedding for a category
   */
  getReferenceEmbedding(category: string): number[] | null {
    const embedding = this.referenceEmbeddings.get(category);
    return embedding ? [...embedding] : null;
  }

  /**
   * Get all reference embeddings
   */
  getAllReferenceEmbeddings(): Map<string, number[]> {
    const result = new Map<string, number[]>();
    for (const [category, embedding] of this.referenceEmbeddings.entries()) {
      result.set(category, [...embedding]);
    }
    return result;
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.embeddingCache.clear();
    this.classificationCache.clear();
    // Don't clear reference embeddings as they're expensive to recreate
    embeddingLogger.info('Embedding and classification caches cleared');
  }

  /**
   * Clear only expired entries
   */
  cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedEmbeddings = 0;
    let cleanedClassifications = 0;

    // Clean embedding cache
    for (const [key, data] of this.embeddingCache.entries()) {
      if (now - data.timestamp > this.EMBEDDING_TTL) {
        this.embeddingCache.delete(key);
        cleanedEmbeddings++;
      }
    }

    // Clean classification cache
    for (const [key, data] of this.classificationCache.entries()) {
      if (now - data.timestamp > this.CLASSIFICATION_TTL) {
        this.classificationCache.delete(key);
        cleanedClassifications++;
      }
    }

    if (cleanedEmbeddings > 0 || cleanedClassifications > 0) {
      embeddingLogger.info(
        `Cleaned up ${cleanedEmbeddings} embeddings and ${cleanedClassifications} classifications`
      );
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      embeddings: this.embeddingCache.size,
      classifications: this.classificationCache.size,
      referenceEmbeddings: this.referenceEmbeddings.size,
    };
  }

  /**
   * Create consistent cache key from text
   */
  private createKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${hash}_${text.length}`;
  }
}

// Create and export a singleton instance of embedding cache
// But the model cacher requires API key and passing that API key on initialization via a singleton approach was problematic. So exporting the class.
export const embeddingCache = new InMemoryEmbeddingCache();
export { InMemoryModelCache, InMemoryEmbeddingCache };
export type { ModelInfo };
