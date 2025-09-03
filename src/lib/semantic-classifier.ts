import { Logger } from '../utils/logger.js'
import { embeddingCache } from '../cache.js'
import { semanticEmbedder } from './semantic-embedder.js'
import { referenceEmbeddingManager } from '../reference-embeddings.js'
import { PromptType, type PromptCategory } from '../types.js'

const logger = new Logger('SemanticClassifier')

/**
 * Semantic classification configuration
 */
const SEMANTIC_CONFIG = {
    // Minimum similarity threshold for classification
    MIN_SIMILARITY_THRESHOLD: 0.3,
    
    // Confidence score calculation parameters
    CONFIDENCE_BASE: 0.5,
    CONFIDENCE_SCALE: 0.4,
    
    // Maximum confidence cap
    MAX_CONFIDENCE: 0.95,
    
    // Fallback confidence for low similarity scores
    FALLBACK_CONFIDENCE: 0.4
} as const

/**
 * Classification result with similarity scores
 */
export interface SemanticClassificationResult {
    category: PromptCategory
    similarities: Map<string, number>
    processingTimeMs: number
}

/**
 * SemanticClassifier uses Universal Sentence Encoder embeddings
 * and cosine similarity to classify prompts semantically
 */
export class SemanticClassifier {
    private initialized = false
    private initializationPromise: Promise<void> | null = null

    /**
     * Initialize the semantic classifier
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.debug('Semantic classifier already initialized')
            return
        }

        if (this.initializationPromise) {
            logger.debug('Semantic classifier initialization in progress')
            return this.initializationPromise
        }

        this.initializationPromise = this.performInitialization()
        
        try {
            await this.initializationPromise
            this.initialized = true
            logger.info('Semantic classifier initialized successfully')
        } catch (error) {
            logger.error('Failed to initialize semantic classifier:', error)
            throw error
        } finally {
            this.initializationPromise = null
        }
    }

    /**
     * Perform the actual initialization
     */
    private async performInitialization(): Promise<void> {
        logger.info('Initializing semantic classifier components')
        
        // Initialize semantic embedder and reference embeddings
        await Promise.all([
            semanticEmbedder.initialize(),
            referenceEmbeddingManager.initialize()
        ])
        
        // Verify reference embeddings are available
        const stats = referenceEmbeddingManager.getStats()
        if (stats.initializedCategories === 0) {
            throw new Error('No reference embeddings available for classification')
        }
        
        logger.info(`Semantic classifier ready with ${stats.initializedCategories} category embeddings`)
    }

    /**
     * Classify a prompt using semantic similarity
     */
    async classifyPrompt(prompt: string): Promise<SemanticClassificationResult> {
        const startTime = Date.now()
        
        // Check cache first
        const cachedResult = embeddingCache.getClassification(prompt)
        if (cachedResult) {
            logger.debug('Using cached semantic classification')
            return {
                category: cachedResult,
                similarities: new Map(), // Don't cache similarity details
                processingTimeMs: Date.now() - startTime
            }
        }

        // Ensure classifier is initialized
        await this.initialize()

        try {
            logger.debug(`Classifying prompt semantically (${prompt.length} chars)`)

            // Generate embedding for the input prompt
            const promptEmbedding = await semanticEmbedder.getEmbedding(prompt)
            
            // Get reference embeddings
            const referenceEmbeddings = referenceEmbeddingManager.getAllReferenceEmbeddings()
            
            if (referenceEmbeddings.size === 0) {
                throw new Error('No reference embeddings available')
            }

            // Calculate similarities with all categories
            const similarities = this.calculateSimilarities(promptEmbedding, referenceEmbeddings)
            
            // Find best match and calculate confidence
            const bestMatch = this.findBestMatch(similarities)
            const category = this.createCategoryResult(bestMatch, similarities)
            
            // Cache the result
            embeddingCache.setClassification(prompt, category)
            
            const processingTime = Date.now() - startTime
            logger.debug(`Semantic classification completed in ${processingTime}ms: ${category.type} (${category.confidence.toFixed(3)})`)
            
            return {
                category,
                similarities,
                processingTimeMs: processingTime
            }
            
        } catch (error) {
            logger.error('Semantic classification failed:', error)
            throw new Error('Failed to perform semantic classification')
        }
    }

    /**
     * Calculate cosine similarities with all reference embeddings
     */
    private calculateSimilarities(
        promptEmbedding: number[], 
        referenceEmbeddings: Map<string, number[]>
    ): Map<string, number> {
        const similarities = new Map<string, number>()
        
        for (const [category, referenceEmbedding] of referenceEmbeddings) {
            try {
                const similarity = semanticEmbedder.cosineSimilarity(promptEmbedding, referenceEmbedding)
                similarities.set(category, similarity)
                
                logger.debug(`Similarity with ${category}: ${similarity.toFixed(4)}`)
            } catch (error) {
                logger.warn(`Failed to calculate similarity with ${category}:`, error)
                similarities.set(category, 0)
            }
        }
        
        return similarities
    }

    /**
     * Find the best matching category from similarities
     */
    private findBestMatch(similarities: Map<string, number>): { category: string; similarity: number } {
        let bestCategory = ''
        let bestSimilarity = -1
        
        for (const [category, similarity] of similarities) {
            if (similarity > bestSimilarity) {
                bestCategory = category
                bestSimilarity = similarity
            }
        }
        
        return { category: bestCategory, similarity: bestSimilarity }
    }

    /**
     * Create PromptCategory result from best match
     */
    private createCategoryResult(
        bestMatch: { category: string; similarity: number },
        allSimilarities: Map<string, number>
    ): PromptCategory {
        const { category, similarity } = bestMatch
        
        // Check if similarity meets minimum threshold
        if (similarity < SEMANTIC_CONFIG.MIN_SIMILARITY_THRESHOLD) {
            logger.debug(`Low similarity (${similarity.toFixed(4)}) - falling back to general category`)
            return {
                type: PromptType.General,
                confidence: SEMANTIC_CONFIG.FALLBACK_CONFIDENCE
            }
        }
        
        // Calculate confidence score
        const confidence = this.calculateConfidence(similarity, allSimilarities)
        
        // Map category string to PromptType
        const promptType = this.mapCategoryToPromptType(category)
        
        return {
            type: promptType,
            confidence
        }
    }

    /**
     * Calculate confidence score based on similarity and distribution
     */
    private calculateConfidence(
        bestSimilarity: number, 
        allSimilarities: Map<string, number>
    ): number {
        // Base confidence from similarity strength
        const baseConfidence = Math.min(bestSimilarity, 1.0)
        
        // Calculate uniqueness factor (how much the best similarity stands out)
        const similarities = Array.from(allSimilarities.values()).sort((a, b) => b - a)
        let uniqueness = 1.0
        
        if (similarities.length >= 2) {
            const bestSim = similarities[0] ?? 0
            const secondBest = similarities[1] ?? 0
            
            // Uniqueness is higher when there's a clear winner
            uniqueness = Math.max(0, (bestSim - secondBest) / Math.max(bestSim, 0.1))
        }
        
        // Combine base confidence with uniqueness
        const combinedConfidence = (baseConfidence * 0.7) + (uniqueness * 0.3)
        
        // Apply scaling and bounds
        const scaledConfidence = SEMANTIC_CONFIG.CONFIDENCE_BASE + 
                                (combinedConfidence * SEMANTIC_CONFIG.CONFIDENCE_SCALE)
        
        return Math.max(0.1, Math.min(scaledConfidence, SEMANTIC_CONFIG.MAX_CONFIDENCE))
    }

    /**
     * Map category string to PromptType enum
     */
    private mapCategoryToPromptType(category: string): PromptType {
        // Handle both enum values and string keys
        const normalizedCategory = category.toLowerCase()
        
        switch (normalizedCategory) {
            case 'coding':
            case PromptType.Coding.toLowerCase():
                return PromptType.Coding
            case 'creative':
            case PromptType.Creative.toLowerCase():
                return PromptType.Creative
            case 'analytical':
            case PromptType.Analytical.toLowerCase():
                return PromptType.Analytical
            case 'reasoning':
            case PromptType.Reasoning.toLowerCase():
                return PromptType.Reasoning
            case 'conversational':
            case PromptType.Conversational.toLowerCase():
                return PromptType.Conversational
            case 'general':
            case PromptType.General.toLowerCase():
                return PromptType.General
            default:
                logger.warn(`Unknown category: ${category}, defaulting to General`)
                return PromptType.General
        }
    }

    /**
     * Get detailed similarity scores for debugging
     */
    async getDetailedSimilarities(prompt: string): Promise<Map<string, number>> {
        await this.initialize()
        
        const promptEmbedding = await semanticEmbedder.getEmbedding(prompt)
        const referenceEmbeddings = referenceEmbeddingManager.getAllReferenceEmbeddings()
        
        return this.calculateSimilarities(promptEmbedding, referenceEmbeddings)
    }

    /**
     * Check if the classifier is ready
     */
    isReady(): boolean {
        return this.initialized && 
               semanticEmbedder.isReady() && 
               referenceEmbeddingManager.isInitialized()
    }

    /**
     * Get classifier statistics
     */
    getStats(): {
        isReady: boolean
        embedderReady: boolean
        referenceEmbeddings: { totalCategories: number; initializedCategories: number }
        cacheStats: { embeddings: number; classifications: number; referenceEmbeddings: number }
    } {
        return {
            isReady: this.isReady(),
            embedderReady: semanticEmbedder.isReady(),
            referenceEmbeddings: referenceEmbeddingManager.getStats(),
            cacheStats: embeddingCache.getStats()
        }
    }

    /**
     * Clear classification cache
     */
    clearCache(): void {
        embeddingCache.clearCache()
        logger.info('Semantic classification cache cleared')
    }
}

// Export singleton instance
export const semanticClassifier = new SemanticClassifier()