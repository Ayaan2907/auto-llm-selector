import * as tf from '@tensorflow/tfjs-node';
import { Logger } from '../utils/logger.js';
import { embeddingCache } from '../cache.js';

const logger = new Logger('SemanticEmbedder');

/**
 * SemanticEmbedder class using Universal Sentence Encoder
 * Provides text embeddings and similarity calculations for semantic classification
 */
export class SemanticEmbedder {
  private model: tf.GraphModel | null = null;
  private isLoading = false;
  private loadingPromise: Promise<void> | null = null;

  /**
   * Initialize and load the Universal Sentence Encoder model
   */
  async initialize(): Promise<void> {
    if (this.model) {
      logger.debug('Model already loaded');
      return;
    }

    if (this.isLoading && this.loadingPromise) {
      logger.debug('Model loading in progress, waiting...');
      return this.loadingPromise;
    }

    this.isLoading = true;
    this.loadingPromise = this.loadModel();

    try {
      await this.loadingPromise;
    } finally {
      this.isLoading = false;
      this.loadingPromise = null;
    }
  }

  /**
   * Load the Universal Sentence Encoder model
   */
  private async loadModel(): Promise<void> {
    try {
      logger.info('Loading Universal Sentence Encoder model...');

      // Load the model from TensorFlow Hub
      // Note: For USE, we need to use tf.loadGraphModel instead of loadLayersModel
      const modelUrl = 'https://tfhub.dev/google/universal-sentence-encoder/4';
      this.model = await tf.loadGraphModel(modelUrl, { fromTFHub: true });

      logger.info('Universal Sentence Encoder model loaded successfully');
    } catch (error) {
      logger.error('Failed to load Universal Sentence Encoder model:', error);
      throw new Error('Failed to load semantic embedding model');
    }
  }

  /**
   * Generate embedding for a text string
   */
  async getEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cachedEmbedding = embeddingCache.getEmbedding(text);
    if (cachedEmbedding) {
      logger.debug(`Using cached embedding for text (${text.length} chars)`);
      return cachedEmbedding;
    }

    // Ensure model is loaded
    await this.initialize();

    if (!this.model) {
      throw new Error('Semantic embedding model not available');
    }

    try {
      logger.debug(`Generating embedding for text (${text.length} chars)`);

      // Preprocess text
      const processedText = this.preprocessText(text);

      // Generate embedding using the model
      const embedding = await this.generateEmbedding(processedText);

      // Cache the result
      embeddingCache.setEmbedding(text, embedding);

      logger.debug('Embedding generated successfully');
      return embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw new Error('Failed to generate semantic embedding');
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensionality');
    }

    // Calculate dot product
    let dotProduct = 0;
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i]! * embedding2[i]!;
    }

    // Calculate magnitudes
    let magnitude1 = 0;
    let magnitude2 = 0;
    for (let i = 0; i < embedding1.length; i++) {
      magnitude1 += embedding1[i]! * embedding1[i]!;

      magnitude2 += embedding2[i]! * embedding2[i]!;
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    // Avoid division by zero
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Find the most similar category embedding
   */
  async findMostSimilarCategory(
    textEmbedding: number[],
    categoryEmbeddings: Map<string, number[]>
  ): Promise<{ category: string; similarity: number } | null> {
    if (categoryEmbeddings.size === 0) {
      return null;
    }

    let bestMatch: { category: string; similarity: number } = {
      category: '',
      similarity: -1,
    };

    for (const [category, referenceEmbedding] of categoryEmbeddings) {
      try {
        const similarity = this.cosineSimilarity(
          textEmbedding,
          referenceEmbedding
        );

        if (similarity > bestMatch.similarity) {
          bestMatch = { category, similarity };
        }
      } catch (error) {
        logger.warn(
          `Failed to calculate similarity for category ${category}:`,
          error
        );
        continue;
      }
    }

    return bestMatch.similarity >= 0 ? bestMatch : null;
  }

  /**
   * Preprocess text before embedding generation
   */
  private preprocessText(text: string): string {
    // Basic text preprocessing
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .toLowerCase();
  }

  /**
   * Generate embedding using the loaded model
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Convert text to tensor (USE expects 1D string tensor)
      const textTensor = tf.tensor([text], [1], 'string');

      // Generate embedding using the model

      const embeddingTensor = this.model!.predict(textTensor) as tf.Tensor;

      // Convert to array and flatten if needed
      const embedding = await embeddingTensor.data();

      // Cleanup tensors
      textTensor.dispose();
      embeddingTensor.dispose();

      return Array.from(embedding);
    } catch (error) {
      logger.error('Error in generateEmbedding:', error);
      throw error;
    }
  }

  /**
   * Check if the model is ready to use
   */
  isReady(): boolean {
    return this.model !== null && !this.isLoading;
  }

  /**
   * Dispose of the model and free resources
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      logger.info('Semantic embedding model disposed');
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): { isLoaded: boolean; isLoading: boolean } {
    return {
      isLoaded: this.model !== null,
      isLoading: this.isLoading,
    };
  }
}

// Export singleton instance
export const semanticEmbedder = new SemanticEmbedder();
