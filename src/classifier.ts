import { PromptType, type PromptCategory } from './types.js'

/**
 * Keywords for prompt classification
 */
const CLASSIFICATION_KEYWORDS = {
    coding: {
        // High specificity - rarely used outside programming
        highSpecificity: ['algorithm', 'compile', 'syntax', 'import', 'export', 'debug', 'variable', 'method'],
        // Medium specificity - common in programming but may appear elsewhere
        mediumSpecificity: ['code', 'function', 'program', 'api', 'script', 'class'],
        // Lower specificity - could be ambiguous
        lowSpecificity: ['write', 'return']
    },
    creative: {
        highSpecificity: ['poem', 'novel', 'character', 'plot', 'narrative', 'fiction', 'imagine'],
        mediumSpecificity: ['creative', 'story', 'design', 'art'],
        lowSpecificity: ['write']
    },
    analytical: {
        highSpecificity: ['analyze', 'statistics', 'trends', 'insights', 'evaluate', 'assess'],
        mediumSpecificity: ['data', 'research', 'study', 'examine', 'investigate', 'compare'],
        lowSpecificity: []
    },
    reasoning: {
        highSpecificity: ['deduce', 'infer', 'proof', 'theorem', 'hypothesis', 'conclude'],
        mediumSpecificity: ['reason', 'logic', 'puzzle'],
        lowSpecificity: ['solve', 'problem', 'think']
    },
    conversational: {
        highSpecificity: ['hi', 'hello', 'hey', 'good morning', 'good evening', 'thanks', 'thank you', 'how are you'],
        mediumSpecificity: ['chat', 'conversation'],
        lowSpecificity: ['talk']
    }
} as const

/**
 * Scoring weights for different specificity levels
 */
const SPECIFICITY_WEIGHTS = {
    high: 3,
    medium: 2,
    low: 1
} as const


/**
 * Classifies prompts into categories based on content analysis
 */
export class PromptClassifier {
    /**
     * Classifies a prompt
     * @param prompt The input prompt to classify
     * @returns PromptCategory with type and confidence score
     */
    static classifyPrompt(prompt: string): PromptCategory {
        const lowerPrompt = prompt.toLowerCase()
        
        // Calculate scores for all categories
        const scores = {
            coding: this.calculateCategoryScore(lowerPrompt, CLASSIFICATION_KEYWORDS.coding),
            creative: this.calculateCategoryScore(lowerPrompt, CLASSIFICATION_KEYWORDS.creative),
            analytical: this.calculateCategoryScore(lowerPrompt, CLASSIFICATION_KEYWORDS.analytical),
            reasoning: this.calculateCategoryScore(lowerPrompt, CLASSIFICATION_KEYWORDS.reasoning),
            conversational: this.calculateCategoryScore(lowerPrompt, CLASSIFICATION_KEYWORDS.conversational)
        }
        
        // Find the category with highest score
        const maxScore = Math.max(...Object.values(scores))
        
        // If no significant matches found, return general
        if (maxScore === 0) {
            return { type: PromptType.General, confidence: 0.6 }
        }
        
        // Find the winning category - guaranteed to exist since maxScore > 0
        const winningEntry = Object.entries(scores).find(([_, score]) => score === maxScore)
        const winningCategory = winningEntry![0] as PromptType
        
        // Calculate confidence based on score strength and uniqueness
        const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0)
        const confidence = this.calculateConfidence(maxScore, totalScore)
        
        // Map category names to PromptType
        const categoryMap: Record<string, PromptType> = {
            coding: PromptType.Coding,
            creative: PromptType.Creative,
            analytical: PromptType.Analytical,
            reasoning: PromptType.Reasoning,
            conversational: PromptType.Conversational
        }
        
        if (!winningCategory || !(winningCategory in categoryMap)) {
            return { type: PromptType.General, confidence: 0.6 }
        }
        
        return {
            type: categoryMap[winningCategory] || PromptType.General,
            confidence
        }
    }
    
    /**
     * Calculates weighted score for a category based on keyword matches
     * @param prompt Lowercase prompt text
     * @param keywords Category keywords with specificity levels
     * @returns Weighted score for the category
     */
    private static calculateCategoryScore(
        prompt: string, 
        keywords: {
            highSpecificity: readonly string[]
            mediumSpecificity: readonly string[]
            lowSpecificity: readonly string[]
        }
    ): number {
        let score = 0
        
        // Count matches for each specificity level
        const highMatches = keywords.highSpecificity.filter(keyword => prompt.includes(keyword)).length
        const mediumMatches = keywords.mediumSpecificity.filter(keyword => prompt.includes(keyword)).length
        const lowMatches = keywords.lowSpecificity.filter(keyword => prompt.includes(keyword)).length
        
        // Apply weighted scoring
        score += highMatches * SPECIFICITY_WEIGHTS.high
        score += mediumMatches * SPECIFICITY_WEIGHTS.medium
        score += lowMatches * SPECIFICITY_WEIGHTS.low
        
        return score
    }
    
    /**
     * Calculates confidence score based on winning score strength and uniqueness
     * @param maxScore Highest category score
     * @param totalScore Sum of all category scores
     * @returns Confidence value between 0 and 1
     */
    private static calculateConfidence(maxScore: number, totalScore: number): number {
        if (totalScore === 0) return 0.6 // Default confidence for general category
        
        // Base confidence from score strength (normalized)
        const scoreStrength = Math.min(maxScore / 10, 1) // Cap at 1.0
        
        // Uniqueness factor - how much the winning score dominates
        const uniqueness = maxScore / totalScore
        
        // Combine factors with weights
        const confidence = (scoreStrength * 0.6) + (uniqueness * 0.4)
        
        // Ensure minimum confidence and cap at reasonable maximum
        return Math.max(0.3, Math.min(confidence, 0.95))
    }
    
    /**
     * Checks if prompt contains any of the specified keywords
     * @param prompt Lowercase prompt text
     * @param keywords Array of keywords to check
     * @returns True if any keyword is found
     */
    private static containsKeywords(prompt: string, keywords: readonly string[]): boolean {
        return keywords.some(keyword => prompt.includes(keyword))
    }
    
    /**
     * Enhanced classification that considers context and patterns
     * Future enhancement: Could use ML models or more sophisticated NLP
     */
    static classifyPromptAdvanced(prompt: string): PromptCategory {
        // For now, use the basic classifier
        // TODO: Implement ML-based classification or more sophisticated pattern matching
        return this.classifyPrompt(prompt)
    }
}