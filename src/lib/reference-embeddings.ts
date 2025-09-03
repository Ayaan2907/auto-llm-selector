import { Logger } from '../utils/logger.js';
import { embeddingCache } from '../cache.js';
import { semanticEmbedder } from './semantic-embedder.js';
import { PromptType } from '../types.js';

const logger = new Logger('ReferenceEmbeddings');

/**
 * Representative text samples for each category
 * These samples are used to generate reference embeddings for classification
 */
const CATEGORY_REFERENCE_TEXTS = {
  [PromptType.Coding]: [
    'Write a Python function that sorts an array using quicksort algorithm',
    'Debug this JavaScript code that has a syntax error in the for loop',
    'Create a REST API endpoint with proper error handling and validation',
    'Implement a binary search tree class with insert and delete methods',
    'Write unit tests for this React component using Jest and testing library',
  ],
  [PromptType.Creative]: [
    'Write a short story about a time traveler who gets stuck in the past',
    'Create a poem about the beauty of autumn leaves falling in the wind',
    'Design a fantasy character with unique magical abilities and backstory',
    'Imagine what life would be like on a planet with two suns',
    'Write dialogue between two characters meeting for the first time',
  ],
  [PromptType.Analytical]: [
    'Analyze the sales trends from this quarterly data and identify patterns',
    'Compare and contrast the economic impacts of remote work policies',
    'Evaluate the effectiveness of different marketing strategies based on metrics',
    'Examine the correlation between education levels and income distribution',
    'Assess the risks and benefits of investing in renewable energy stocks',
  ],
  [PromptType.Reasoning]: [
    'Solve this logic puzzle using deductive reasoning steps',
    'If all roses are flowers and some flowers are red, what can we conclude',
    'Given these premises, determine the logical conclusion using syllogism',
    'Explain the reasoning behind the solution to this mathematical proof',
    'What would be the most logical approach to solve this complex problem',
  ],
  [PromptType.Conversational]: [
    "Hello, how are you doing today? I hope you're having a great morning",
    'Thank you so much for your help, I really appreciate your assistance',
    'Could you please tell me more about your weekend plans and activities',
    "Good evening! What's your favorite way to relax after a long day",
    "I'd love to chat about movies, do you have any recommendations for comedies",
  ],
  [PromptType.General]: [
    'What is the capital of France and its population',
    'Explain how photosynthesis works in simple terms',
    'What are the main causes of climate change',
    'How does the internet work at a basic level',
    'What is the difference between weather and climate',
  ],
} as const;

/**
 * ReferenceEmbeddingManager handles creation and management of reference embeddings
 * for each prompt category used in semantic classification
 */
export class ReferenceEmbeddingManager {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize reference embeddings for all categories
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('Reference embeddings already initialized');
      return;
    }

    if (this.initializationPromise) {
      logger.debug('Reference embeddings initialization in progress');
      return this.initializationPromise;
    }

    this.initializationPromise = this.createReferenceEmbeddings();

    try {
      await this.initializationPromise;
      this.initialized = true;
      logger.info('Reference embeddings initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize reference embeddings:', error);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Create and store reference embeddings for all categories
   */
  private async createReferenceEmbeddings(): Promise<void> {
    logger.info('Creating reference embeddings for all categories');

    // Initialize the semantic embedder first
    await semanticEmbedder.initialize();

    const categories = Object.keys(CATEGORY_REFERENCE_TEXTS) as PromptType[];

    for (const category of categories) {
      await this.createCategoryEmbedding(category);
    }
  }

  /**
   * Create reference embedding for a specific category
   */
  private async createCategoryEmbedding(category: PromptType): Promise<void> {
    try {
      logger.debug(`Creating reference embedding for category: ${category}`);

      // Check if embedding already exists in cache
      const existingEmbedding = embeddingCache.getReferenceEmbedding(category);
      if (existingEmbedding && existingEmbedding.length > 0) {
        logger.debug(
          `Reference embedding for ${category} already exists in cache`
        );
        return;
      }

      const referenceTexts = CATEGORY_REFERENCE_TEXTS[category];

      // Generate embeddings for all reference texts
      const embeddings: number[][] = [];
      for (const text of referenceTexts) {
        try {
          const embedding = await semanticEmbedder.getEmbedding(text);
          embeddings.push(embedding);
        } catch (error) {
          logger.warn(
            `Failed to generate embedding for reference text in ${category}:`,
            error
          );
          continue;
        }
      }

      if (embeddings.length === 0) {
        throw new Error(
          `No valid embeddings generated for category ${category}`
        );
      }

      // Calculate average embedding (centroid) for the category
      const avgEmbedding = this.calculateCentroid(embeddings);

      // Store in cache
      embeddingCache.setReferenceEmbedding(category, avgEmbedding);

      logger.info(
        `Created reference embedding for ${category} (${embeddings.length} samples)`
      );
    } catch (error) {
      logger.error(
        `Failed to create reference embedding for ${category}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate centroid (average) of multiple embeddings
   */
  private calculateCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      throw new Error('Cannot calculate centroid of empty embeddings array');
    }

    const dimensions = embeddings[0]?.length ?? 0;
    const centroid = new Array(dimensions).fill(0);

    // Sum all embeddings element-wise
    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += embedding[i];
      }
    }

    // Calculate average
    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Get reference embedding for a specific category
   */
  getReferenceEmbedding(category: PromptType): number[] | null {
    return embeddingCache.getReferenceEmbedding(category);
  }

  /**
   * Get all reference embeddings
   */
  getAllReferenceEmbeddings(): Map<string, number[]> {
    return embeddingCache.getAllReferenceEmbeddings();
  }

  /**
   * Refresh reference embeddings (useful for updates or cache invalidation)
   */
  async refreshReferenceEmbeddings(): Promise<void> {
    logger.info('Refreshing reference embeddings');

    // Clear existing reference embeddings from cache
    // Note: We don't have a method to clear just reference embeddings,
    // but they will be overwritten when we recreate them

    this.initialized = false;
    await this.initialize();
  }

  /**
   * Add custom reference texts for a category (for fine-tuning)
   */
  async addCustomReferenceTexts(
    category: PromptType,
    texts: string[]
  ): Promise<void> {
    logger.info(
      `Adding ${texts.length} custom reference texts for ${category}`
    );

    // Generate embeddings for new texts
    const newEmbeddings: number[][] = [];
    for (const text of texts) {
      try {
        const embedding = await semanticEmbedder.getEmbedding(text);
        newEmbeddings.push(embedding);
      } catch (error) {
        logger.warn('Failed to generate embedding for custom text:', error);
        continue;
      }
    }

    if (newEmbeddings.length === 0) {
      logger.warn(
        `No valid embeddings generated from custom texts for ${category}`
      );
      return;
    }

    // Get existing reference embedding
    const existingEmbedding = this.getReferenceEmbedding(category);

    if (existingEmbedding) {
      // Combine with existing embedding (weighted average)
      const allEmbeddings = [existingEmbedding, ...newEmbeddings];
      const updatedEmbedding = this.calculateCentroid(allEmbeddings);
      embeddingCache.setReferenceEmbedding(category, updatedEmbedding);

      logger.info(
        `Updated reference embedding for ${category} with ${newEmbeddings.length} custom samples`
      );
    } else {
      // Create new reference embedding from custom texts only
      const newEmbedding = this.calculateCentroid(newEmbeddings);
      embeddingCache.setReferenceEmbedding(category, newEmbedding);

      logger.info(
        `Created new reference embedding for ${category} from ${newEmbeddings.length} custom samples`
      );
    }
  }

  /**
   * Check if reference embeddings are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get statistics about reference embeddings
   */
  getStats(): { totalCategories: number; initializedCategories: number } {
    const allEmbeddings = this.getAllReferenceEmbeddings();
    return {
      totalCategories: Object.keys(CATEGORY_REFERENCE_TEXTS).length,
      initializedCategories: allEmbeddings.size,
    };
  }
}

// Export singleton instance
export const referenceEmbeddingManager = new ReferenceEmbeddingManager();
