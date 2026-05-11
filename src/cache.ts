import { readFile, writeFile } from 'node:fs/promises';
import { Logger } from './utils/logger.js';
import { ModelProfiler } from './lib/model-profiler.js';
import { createStableTextCacheKey } from './lib/text-cache-key.js';
import { fetchWithRetry } from './http/retry-fetch.js';
import type { OpenRouterRateLimiter } from './http/openrouter-rate-limit.js';
import type { ModelInfo, PromptCategory, ModelProfile } from './types.js';

const logger = new Logger('Cache:ModelStore');
const embeddingLogger = new Logger('Cache:EmbeddingStore');

const DEFAULT_MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface llmModelProviderResponse {
  data: ModelInfo[];
}

export type ModelCacheOptions = {
  catalogCacheTtlMs?: number;
  persistentCatalogPath?: string;
  rateLimiter?: OpenRouterRateLimiter;
};

class InMemoryModelCache {
  private profileCache: Map<string, ModelProfile> = new Map();
  private lastFetched: number = 0;
  private readonly cacheTtlMs: number;
  private readonly persistentCatalogPath: string | undefined;
  private readonly rateLimiter: OpenRouterRateLimiter | undefined;
  private OPEN_ROUTER_API_KEY = '';

  constructor(OPEN_ROUTER_API_KEY: string, options?: ModelCacheOptions) {
    this.OPEN_ROUTER_API_KEY = OPEN_ROUTER_API_KEY;
    this.cacheTtlMs = options?.catalogCacheTtlMs ?? DEFAULT_MODEL_CACHE_TTL_MS;
    this.persistentCatalogPath = options?.persistentCatalogPath;
    this.rateLimiter = options?.rateLimiter;
  }

  async getModelProfiles(): Promise<ModelProfile[]> {
    const now = Date.now();

    if (this.profileCache.size === 0 && this.persistentCatalogPath) {
      await this.tryLoadProfilesFromDisk();
    }

    if (
      this.profileCache.size === 0 ||
      now - this.lastFetched > this.cacheTtlMs
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
        if (profile.capabilities[categoryKey] < 0.3) return false;

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
    const previousProfiles = new Map(this.profileCache);
    const previousLastFetched = this.lastFetched;

    try {
      logger.info('Fetching models from OpenRouter and generating profiles');

      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      const response = await fetchWithRetry(
        'https://openrouter.ai/api/v1/models',
        {
          headers: {
            Authorization: `Bearer ${this.OPEN_ROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = (await response.json()) as llmModelProviderResponse;

      const nextCache = new Map<string, ModelProfile>();
      let profilesGenerated = 0;

      for (const modelInfo of data.data) {
        try {
          const profile = ModelProfiler.createModelProfile(modelInfo);
          nextCache.set(modelInfo.id, profile);
          profilesGenerated++;
        } catch (error) {
          logger.warn(`Failed to generate profile for ${modelInfo.id}:`, error);
        }
      }

      this.profileCache = nextCache;
      this.lastFetched = Date.now();
      logger.info(
        `Generated and cached ${profilesGenerated} model profiles from ${data.data.length} OpenRouter models`
      );

      if (this.persistentCatalogPath) {
        await this.persistProfilesToDisk();
      }
    } catch (error) {
      logger.error('Failed to fetch models from OpenRouter', error);

      if (previousProfiles.size > 0) {
        logger.warn(
          'Using stale in-memory model catalog after OpenRouter fetch failure'
        );
        this.profileCache = previousProfiles;
        this.lastFetched = previousLastFetched;
        return;
      }

      if (this.persistentCatalogPath) {
        const loaded = await this.tryLoadProfilesFromDisk();
        if (loaded) {
          logger.warn(
            'Loaded model catalog from persistent cache after OpenRouter fetch failure'
          );
          return;
        }
      }

      throw error;
    }
  }

  private async persistProfilesToDisk(): Promise<void> {
    if (!this.persistentCatalogPath) return;
    try {
      const payload = {
        savedAt: Date.now(),
        profiles: Object.fromEntries(this.profileCache.entries()),
      };
      await writeFile(
        this.persistentCatalogPath,
        JSON.stringify(payload),
        'utf8'
      );
    } catch (error) {
      logger.warn('Failed to persist model catalog cache', error);
    }
  }

  private async tryLoadProfilesFromDisk(): Promise<boolean> {
    if (!this.persistentCatalogPath) return false;
    try {
      const raw = await readFile(this.persistentCatalogPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        profiles?: Record<string, ModelProfile>;
      };
      const entries = Object.entries(parsed.profiles ?? {});
      if (entries.length === 0) return false;

      this.profileCache = new Map(entries);
      this.lastFetched = 0;
      return true;
    } catch (error) {
      logger.warn('Failed to load persistent model catalog cache', error);
      return false;
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

  setEmbedding(text: string, embedding: number[]): void {
    const key = createStableTextCacheKey(text);
    this.embeddingCache.set(key, {
      embedding: [...embedding],
      timestamp: Date.now(),
    });
    embeddingLogger.debug(`Cached embedding for text (${text.length} chars)`);
  }

  getEmbedding(text: string): number[] | null {
    const key = createStableTextCacheKey(text);
    const cached = this.embeddingCache.get(key);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.EMBEDDING_TTL) {
      this.embeddingCache.delete(key);
      return null;
    }

    embeddingLogger.debug(
      `Retrieved cached embedding for text (${text.length} chars)`
    );
    return [...cached.embedding];
  }

  setClassification(text: string, result: PromptCategory): void {
    const key = createStableTextCacheKey(text);
    this.classificationCache.set(key, {
      result: { ...result },
      timestamp: Date.now(),
    });
    embeddingLogger.debug(
      `Cached classification: ${result.type} (confidence: ${result.confidence})`
    );
  }

  getClassification(text: string): PromptCategory | null {
    const key = createStableTextCacheKey(text);
    const cached = this.classificationCache.get(key);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.CLASSIFICATION_TTL) {
      this.classificationCache.delete(key);
      return null;
    }

    embeddingLogger.debug(
      `Retrieved cached classification: ${cached.result.type}`
    );
    return { ...cached.result };
  }

  setReferenceEmbedding(category: string, embedding: number[]): void {
    this.referenceEmbeddings.set(category, [...embedding]);
    embeddingLogger.info(
      `Stored reference embedding for category: ${category}`
    );
  }

  getReferenceEmbedding(category: string): number[] | null {
    const embedding = this.referenceEmbeddings.get(category);
    return embedding ? [...embedding] : null;
  }

  getAllReferenceEmbeddings(): Map<string, number[]> {
    const result = new Map<string, number[]>();
    for (const [category, embedding] of this.referenceEmbeddings.entries()) {
      result.set(category, [...embedding]);
    }
    return result;
  }

  clearCache(): void {
    this.embeddingCache.clear();
    this.classificationCache.clear();
    embeddingLogger.info('Embedding and classification caches cleared');
  }

  cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedEmbeddings = 0;
    let cleanedClassifications = 0;

    for (const [key, data] of this.embeddingCache.entries()) {
      if (now - data.timestamp > this.EMBEDDING_TTL) {
        this.embeddingCache.delete(key);
        cleanedEmbeddings++;
      }
    }

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

  getStats() {
    return {
      embeddings: this.embeddingCache.size,
      classifications: this.classificationCache.size,
      referenceEmbeddings: this.referenceEmbeddings.size,
    };
  }
}

export const embeddingCache = new InMemoryEmbeddingCache();
export { InMemoryModelCache, InMemoryEmbeddingCache };
export type { ModelInfo };
