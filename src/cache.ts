import { Logger } from "./utils/logger.js";
import { env } from "./config/env.js";
import type { ModelInfo } from "./types.js";

const logger = new Logger("Cache:ModelStore");

interface llmModelProviderResponse {
  data: ModelInfo[];
}

class InMemoryModelCache {
  private cache: Map<string, ModelInfo> = new Map();
  private lastFetched: number = 0;
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

  async getModels(): Promise<ModelInfo[]> {
    const now = Date.now();
    
    if (this.cache.size === 0 || now - this.lastFetched > this.CACHE_TTL) {
      await this.fetchAndCacheModels();
    }
    
    return Array.from(this.cache.values());
  }

  async getModel(modelId: string): Promise<ModelInfo | undefined> {
    const models = await this.getModels();
    return this.cache.get(modelId);
  }

  private async fetchAndCacheModels(): Promise<void> {
    try {
      logger.info("Fetching models from OpenRouter");
      
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${env.OPEN_ROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const data = await response.json() as llmModelProviderResponse;
    //   TODO: We can later set to accept popular provider models only
      this.cache.clear();
      data.data.forEach(model => {
        this.cache.set(model.id, model);
      });
      
      this.lastFetched = Date.now();
      logger.info(`Cached ${data.data.length} models from OpenRouter`);
      
    } catch (error) {
      logger.error("Failed to fetch models from OpenRouter", error);
      throw error;
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.lastFetched = 0;
    logger.info("Model cache cleared");
  }
}

export const modelCache = new InMemoryModelCache();
export type { ModelInfo };
