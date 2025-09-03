import { PromptType, type PromptCategory } from './types.js';
import { semanticClassifier } from './lib/semantic-classifier.js';
import { Logger } from './utils/logger.js';

const logger = new Logger('PromptClassifier');

/**
 * Keywords for prompt classification
 */
const CLASSIFICATION_KEYWORDS = {
  coding: {
    // High specificity - rarely used outside programming
    highSpecificity: [
      'algorithm',
      'compile',
      'syntax',
      'import',
      'export',
      'debug',
      'variable',
      'method',
    ],
    // Medium specificity - common in programming but may appear elsewhere
    mediumSpecificity: [
      'code',
      'function',
      'program',
      'api',
      'script',
      'class',
    ],
    // Lower specificity - could be ambiguous
    lowSpecificity: ['write', 'return'],
  },
  creative: {
    highSpecificity: [
      'poem',
      'novel',
      'character',
      'plot',
      'narrative',
      'fiction',
      'imagine',
    ],
    mediumSpecificity: ['creative', 'story', 'design', 'art'],
    lowSpecificity: ['write'],
  },
  analytical: {
    highSpecificity: [
      'analyze',
      'statistics',
      'trends',
      'insights',
      'evaluate',
      'assess',
    ],
    mediumSpecificity: [
      'data',
      'research',
      'study',
      'examine',
      'investigate',
      'compare',
    ],
    lowSpecificity: [],
  },
  reasoning: {
    highSpecificity: [
      'deduce',
      'infer',
      'proof',
      'theorem',
      'hypothesis',
      'conclude',
    ],
    mediumSpecificity: ['reason', 'logic', 'puzzle'],
    lowSpecificity: ['solve', 'problem', 'think'],
  },
  conversational: {
    highSpecificity: [
      'hi',
      'hello',
      'hey',
      'good morning',
      'good evening',
      'thanks',
      'thank you',
      'how are you',
    ],
    mediumSpecificity: ['chat', 'conversation'],
    lowSpecificity: ['talk'],
  },
} as const;

/**
 * Scoring weights for different specificity levels
 */
const SPECIFICITY_WEIGHTS = {
  high: 3,
  medium: 2,
  low: 1,
} as const;

/**
 * Hybrid scoring configuration
 */
const HYBRID_SCORING = {
  SEMANTIC_WEIGHT: 0.6, // 60% semantic
  KEYWORD_WEIGHT: 0.4, // 40% keyword
  MIN_COMBINED_CONFIDENCE: 0.3,
  FALLBACK_CONFIDENCE: 0.6,
} as const;

/**
 * Classifies prompts into categories based on content analysis
 */
export class PromptClassifier {
  /**
   * Classifies a prompt using hybrid semantic + keyword scoring
   * @param prompt The input prompt to classify
   * @returns PromptCategory with type and confidence score
   */
  static async classifyPrompt(prompt: string): Promise<PromptCategory> {
    try {
      logger.debug(
        `Classifying prompt with hybrid approach (${prompt.length} chars)`
      );

      // Run both semantic and keyword classification in parallel
      const [semanticResult, keywordResult] = await Promise.allSettled([
        this.performSemanticClassification(prompt),
        this.performKeywordClassification(prompt),
      ]);

      // Handle results and fallback logic
      return this.combineClassificationResults(semanticResult, keywordResult);
    } catch (error) {
      logger.error('Hybrid classification failed, using fallback:', error);
      return this.performKeywordClassification(prompt);
    }
  }

  /**
   * Legacy synchronous method for backward compatibility
   * Now uses keyword-only classification as fallback
   */
  static classifyPromptSync(prompt: string): PromptCategory {
    logger.debug('Using synchronous keyword-only classification');
    return this.performKeywordClassification(prompt);
  }

  /**
   * Perform semantic classification
   */
  private static async performSemanticClassification(
    prompt: string
  ): Promise<PromptCategory> {
    const result = await semanticClassifier.classifyPrompt(prompt);
    logger.debug(
      `Semantic classification: ${result.category.type} (${result.category.confidence.toFixed(3)})`
    );
    return result.category;
  }

  /**
   * Perform keyword-based classification (original logic)
   */
  private static performKeywordClassification(prompt: string): PromptCategory {
    const lowerPrompt = prompt.toLowerCase();

    // Calculate scores for all categories
    const scores = {
      coding: this.calculateCategoryScore(
        lowerPrompt,
        CLASSIFICATION_KEYWORDS.coding
      ),
      creative: this.calculateCategoryScore(
        lowerPrompt,
        CLASSIFICATION_KEYWORDS.creative
      ),
      analytical: this.calculateCategoryScore(
        lowerPrompt,
        CLASSIFICATION_KEYWORDS.analytical
      ),
      reasoning: this.calculateCategoryScore(
        lowerPrompt,
        CLASSIFICATION_KEYWORDS.reasoning
      ),
      conversational: this.calculateCategoryScore(
        lowerPrompt,
        CLASSIFICATION_KEYWORDS.conversational
      ),
    };

    // Find the category with highest score
    const maxScore = Math.max(...Object.values(scores));

    // If no significant matches found, return general
    if (maxScore === 0) {
      return {
        type: PromptType.General,
        confidence: HYBRID_SCORING.FALLBACK_CONFIDENCE,
      };
    }

    // Find the winning category - guaranteed to exist since maxScore > 0
    const winningEntry = Object.entries(scores).find(
      ([_, score]) => score === maxScore
    );
    const winningCategory = winningEntry![0] as PromptType;

    // Calculate confidence based on score strength and uniqueness
    const totalScore = Object.values(scores).reduce(
      (sum, score) => sum + score,
      0
    );
    const confidence = this.calculateKeywordConfidence(maxScore, totalScore);

    // Map category names to PromptType
    const categoryMap: Record<string, PromptType> = {
      coding: PromptType.Coding,
      creative: PromptType.Creative,
      analytical: PromptType.Analytical,
      reasoning: PromptType.Reasoning,
      conversational: PromptType.Conversational,
    };

    const result = {
      type: categoryMap[winningCategory] || PromptType.General,
      confidence,
    };

    logger.debug(
      `Keyword classification: ${result.type} (${result.confidence.toFixed(3)})`
    );
    return result;
  }

  /**
   * Combine semantic and keyword classification results with weighted scoring
   */
  private static combineClassificationResults(
    semanticResult: PromiseSettledResult<PromptCategory>,
    keywordResult: PromiseSettledResult<PromptCategory>
  ): PromptCategory {
    // Extract results, handling failures
    const semantic =
      semanticResult.status === 'fulfilled' ? semanticResult.value : null;
    const keyword =
      keywordResult.status === 'fulfilled' ? keywordResult.value : null;

    // If both failed, return general category
    if (!semantic && !keyword) {
      logger.warn('Both semantic and keyword classification failed');
      return {
        type: PromptType.General,
        confidence: HYBRID_SCORING.FALLBACK_CONFIDENCE,
      };
    }

    // If only keyword succeeded, use it
    if (!semantic && keyword) {
      logger.debug('Using keyword-only result (semantic failed)');
      return keyword;
    }

    // If only semantic succeeded, use it
    if (semantic && !keyword) {
      logger.debug('Using semantic-only result (keyword failed)');
      return semantic;
    }

    // Both succeeded - combine using weighted scoring
    return this.calculateHybridScore(semantic!, keyword!);
  }

  /**
   * Calculate hybrid score combining semantic and keyword results
   */
  private static calculateHybridScore(
    semantic: PromptCategory,
    keyword: PromptCategory
  ): PromptCategory {
    // If both methods agree on category, increase confidence
    if (semantic.type === keyword.type) {
      const combinedConfidence = Math.min(
        semantic.confidence * HYBRID_SCORING.SEMANTIC_WEIGHT +
          keyword.confidence * HYBRID_SCORING.KEYWORD_WEIGHT +
          0.1, // Bonus for agreement
        0.95
      );

      logger.debug(
        `Methods agree on ${semantic.type}, combined confidence: ${combinedConfidence.toFixed(3)}`
      );
      return {
        type: semantic.type,
        confidence: combinedConfidence,
      };
    }

    // Methods disagree - use weighted scoring to decide
    const semanticScore = semantic.confidence * HYBRID_SCORING.SEMANTIC_WEIGHT;
    const keywordScore = keyword.confidence * HYBRID_SCORING.KEYWORD_WEIGHT;

    if (semanticScore >= keywordScore) {
      const adjustedConfidence = Math.max(
        semanticScore,
        HYBRID_SCORING.MIN_COMBINED_CONFIDENCE
      );

      logger.debug(
        `Semantic wins: ${semantic.type} (${semanticScore.toFixed(3)}) vs keyword: ${keyword.type} (${keywordScore.toFixed(3)})`
      );
      return {
        type: semantic.type,
        confidence: adjustedConfidence,
      };
    } else {
      const adjustedConfidence = Math.max(
        keywordScore,
        HYBRID_SCORING.MIN_COMBINED_CONFIDENCE
      );

      logger.debug(
        `Keyword wins: ${keyword.type} (${keywordScore.toFixed(3)}) vs semantic: ${semantic.type} (${semanticScore.toFixed(3)})`
      );
      return {
        type: keyword.type,
        confidence: adjustedConfidence,
      };
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
      highSpecificity: readonly string[];
      mediumSpecificity: readonly string[];
      lowSpecificity: readonly string[];
    }
  ): number {
    let score = 0;

    // Count matches for each specificity level
    const highMatches = keywords.highSpecificity.filter(keyword =>
      prompt.includes(keyword)
    ).length;
    const mediumMatches = keywords.mediumSpecificity.filter(keyword =>
      prompt.includes(keyword)
    ).length;
    const lowMatches = keywords.lowSpecificity.filter(keyword =>
      prompt.includes(keyword)
    ).length;

    // Apply weighted scoring
    score += highMatches * SPECIFICITY_WEIGHTS.high;
    score += mediumMatches * SPECIFICITY_WEIGHTS.medium;
    score += lowMatches * SPECIFICITY_WEIGHTS.low;

    return score;
  }

  /**
   * Calculates confidence score for keyword classification
   * @param maxScore Highest category score
   * @param totalScore Sum of all category scores
   * @returns Confidence value beatween 0 and 1
   */
  private static calculateKeywordConfidence(
    maxScore: number,
    totalScore: number
  ): number {
    if (totalScore === 0) return HYBRID_SCORING.FALLBACK_CONFIDENCE;

    // Base confidence from score strength (normalized)
    const scoreStrength = Math.min(maxScore / 10, 1); // Cap at 1.0

    // Uniqueness factor - how much the winning score dominates
    const uniqueness = maxScore / totalScore;

    // Combine factors with weights
    const confidence = scoreStrength * 0.6 + uniqueness * 0.4;

    // Ensure minimum confidence and cap at reasonable maximum
    return Math.max(0.3, Math.min(confidence, 0.95));
  }
}
