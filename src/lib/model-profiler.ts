import { Logger } from '../utils/logger.js';
import { PromptType } from '../types.js';
import type {
  ModelInfo,
  ModelProfile,
  ModelCapabilities,
  ModelCharacteristics,
  CategoryModelRanking,
} from '../types.js';

const logger = new Logger('ModelProfiler');

/**
 * Model knowledge database - manually curated profiles for known models
 * This acts as ground truth for model capabilities
 */
const KNOWN_MODEL_PROFILES: Record<
  string,
  Partial<ModelCapabilities & ModelCharacteristics>
> = {
  // OpenAI Models
  'openai/gpt-4o': {
    coding: 0.95,
    creative: 0.9,
    analytical: 0.92,
    reasoning: 0.95,
    conversational: 0.9,
    general: 0.95,
    speedTier: 'medium',
    accuracyTier: 'excellent',
    isReasoning: true,
    isMultimodal: true,
  },
  'openai/gpt-4o-mini': {
    coding: 0.85,
    creative: 0.8,
    analytical: 0.82,
    reasoning: 0.85,
    conversational: 0.85,
    general: 0.85,
    speedTier: 'fast',
    accuracyTier: 'high',
    isReasoning: true,
    isMultimodal: true,
  },
  'openai/gpt-4-turbo': {
    coding: 0.9,
    creative: 0.88,
    analytical: 0.9,
    reasoning: 0.92,
    conversational: 0.88,
    general: 0.9,
    speedTier: 'medium',
    accuracyTier: 'excellent',
    isReasoning: true,
    isMultimodal: true,
  },
  'openai/gpt-3.5-turbo': {
    coding: 0.75,
    creative: 0.7,
    analytical: 0.72,
    reasoning: 0.75,
    conversational: 0.8,
    general: 0.75,
    speedTier: 'fast',
    accuracyTier: 'good',
    isReasoning: false,
    isMultimodal: false,
  },

  // Anthropic Models
  'anthropic/claude-3-opus': {
    coding: 0.92,
    creative: 0.95,
    analytical: 0.95,
    reasoning: 0.95,
    conversational: 0.95,
    general: 0.93,
    speedTier: 'slow',
    accuracyTier: 'excellent',
    isReasoning: true,
    isMultimodal: true,
  },
  'anthropic/claude-3-sonnet': {
    coding: 0.88,
    creative: 0.9,
    analytical: 0.9,
    reasoning: 0.9,
    conversational: 0.9,
    general: 0.88,
    speedTier: 'medium',
    accuracyTier: 'excellent',
    isReasoning: true,
    isMultimodal: true,
  },
  'anthropic/claude-3-haiku': {
    coding: 0.75,
    creative: 0.8,
    analytical: 0.78,
    reasoning: 0.8,
    conversational: 0.85,
    general: 0.78,
    speedTier: 'ultra-fast',
    accuracyTier: 'good',
    isReasoning: true,
    isMultimodal: true,
  },

  // Google Models
  'google/gemini-pro-1.5': {
    coding: 0.85,
    creative: 0.82,
    analytical: 0.88,
    reasoning: 0.85,
    conversational: 0.8,
    general: 0.85,
    speedTier: 'medium',
    accuracyTier: 'high',
    isReasoning: true,
    isMultimodal: true,
  },
  'google/gemini-flash-1.5': {
    coding: 0.8,
    creative: 0.75,
    analytical: 0.8,
    reasoning: 0.78,
    conversational: 0.75,
    general: 0.78,
    speedTier: 'ultra-fast',
    accuracyTier: 'good',
    isReasoning: true,
    isMultimodal: true,
  },

  // Meta Models
  'meta-llama/llama-3.1-405b': {
    coding: 0.88,
    creative: 0.85,
    analytical: 0.85,
    reasoning: 0.88,
    conversational: 0.82,
    general: 0.85,
    speedTier: 'slow',
    accuracyTier: 'high',
    isReasoning: true,
    isMultimodal: false,
  },
  'meta-llama/llama-3.1-70b': {
    coding: 0.82,
    creative: 0.8,
    analytical: 0.8,
    reasoning: 0.82,
    conversational: 0.78,
    general: 0.8,
    speedTier: 'medium',
    accuracyTier: 'high',
    isReasoning: true,
    isMultimodal: false,
  },
  'meta-llama/llama-3.1-8b': {
    coding: 0.7,
    creative: 0.65,
    analytical: 0.68,
    reasoning: 0.7,
    conversational: 0.7,
    general: 0.68,
    speedTier: 'fast',
    accuracyTier: 'good',
    isReasoning: true,
    isMultimodal: false,
  },

  // Free/OSS Models
  'gryphe/mythomist-7b:free': {
    coding: 0.6,
    creative: 0.75,
    analytical: 0.5,
    reasoning: 0.55,
    conversational: 0.7,
    general: 0.6,
    speedTier: 'fast',
    accuracyTier: 'basic',
    isReasoning: false,
    isMultimodal: false,
  },
  'microsoft/wizardlm-2-8x22b': {
    coding: 0.78,
    creative: 0.75,
    analytical: 0.75,
    reasoning: 0.8,
    conversational: 0.75,
    general: 0.75,
    speedTier: 'medium',
    accuracyTier: 'good',
    isReasoning: true,
    isMultimodal: false,
  },
};

/**
 * ModelProfiler creates detailed profiles of LLM models for intelligent routing decisions
 */
export class ModelProfiler {
  /**
   * Create a comprehensive profile for a model
   */
  static createModelProfile(modelInfo: ModelInfo): ModelProfile {
    logger.debug(`Creating profile for model: ${modelInfo.id}`);

    const knownProfile = KNOWN_MODEL_PROFILES[modelInfo.id];
    const provider = this.extractProvider(modelInfo.id);
    const modelFamily = this.extractModelFamily(modelInfo.id);

    // Generate capabilities (use known profile or infer from model characteristics)
    const capabilities = knownProfile
      ? this.buildCapabilitiesFromKnown(knownProfile)
      : this.inferCapabilities(modelInfo, provider, modelFamily);

    // Generate characteristics
    const characteristics = this.buildCharacteristics(
      modelInfo,
      knownProfile,
      provider,
      modelFamily
    );

    // Calculate profile confidence
    const profileConfidence = knownProfile
      ? 0.95
      : this.calculateInferredConfidence(modelInfo);

    const profile: ModelProfile = {
      id: modelInfo.id,
      name: modelInfo.name,
      description: modelInfo.description || '',
      capabilities,
      characteristics,
      contextLength: modelInfo.context_length,
      promptCostPerToken: parseFloat(modelInfo.pricing.prompt),
      completionCostPerToken: parseFloat(modelInfo.pricing.completion),
      maxCompletionTokens: modelInfo.top_provider.max_completion_tokens || 0,
      isModerated: modelInfo.top_provider.is_moderated,
      profileConfidence,
    };

    logger.info(
      `Created profile for ${modelInfo.id} (confidence: ${profileConfidence.toFixed(2)})`
    );
    return profile;
  }

  /**
   * Rank models by their suitability for a specific category
   */
  static rankModelsForCategory(
    models: ModelProfile[],
    category: PromptType,
    requirements?: {
      maxCost?: number;
      minSpeed?: 'ultra-fast' | 'fast' | 'medium' | 'slow';
      minAccuracy?: 'basic' | 'good' | 'high' | 'excellent';
      needsReasoning?: boolean;
    }
  ): CategoryModelRanking {
    logger.debug(`Ranking ${models.length} models for category: ${category}`);

    const rankedModels = models
      .filter(model => this.meetsRequirements(model, requirements))
      .map(model => {
        const score = this.calculateCategoryScore(
          model,
          category,
          requirements
        );
        const reasoning = this.generateScoreReasoning(model, category, score);

        return { model, score, reasoning };
      })
      .sort((a, b) => b.score - a.score); // Descending order

    logger.info(
      `Ranked ${rankedModels.length} suitable models for ${category}`
    );

    return {
      category,
      rankedModels: rankedModels.slice(0, 10), // Top 10 models
    };
  }

  /**
   * Get the best model profile for a specific category and requirements
   */
  static getBestModelForCategory(
    models: ModelProfile[],
    category: PromptType,
    requirements?: Parameters<typeof ModelProfiler.rankModelsForCategory>[2]
  ): ModelProfile | null {
    const ranking = this.rankModelsForCategory(models, category, requirements);
    return ranking.rankedModels.length > 0
      ? (ranking.rankedModels[0]?.model ?? null)
      : null;
  }

  // Private helper methods

  private static extractProvider(modelId: string): string {
    return modelId.split('/')[0] || 'unknown';
  }

  private static extractModelFamily(modelId: string): string {
    const id = modelId.toLowerCase();

    if (id.includes('gpt-4')) return 'gpt-4';
    if (id.includes('gpt-3')) return 'gpt-3.5';
    if (id.includes('claude-3')) return 'claude-3';
    if (id.includes('claude-2')) return 'claude-2';
    if (id.includes('gemini')) return 'gemini';
    if (id.includes('llama-3')) return 'llama-3';
    if (id.includes('llama-2')) return 'llama-2';
    if (id.includes('wizard')) return 'wizard';
    if (id.includes('mixtral')) return 'mixtral';

    return 'unknown';
  }

  private static buildCapabilitiesFromKnown(
    knownProfile: Partial<ModelCapabilities>
  ): ModelCapabilities {
    return {
      coding: knownProfile.coding ?? 0.5,
      creative: knownProfile.creative ?? 0.5,
      analytical: knownProfile.analytical ?? 0.5,
      reasoning: knownProfile.reasoning ?? 0.5,
      conversational: knownProfile.conversational ?? 0.5,
      general: knownProfile.general ?? 0.5,
    };
  }

  private static inferCapabilities(
    modelInfo: ModelInfo,
    provider: string,
    modelFamily: string
  ): ModelCapabilities {
    // Base capabilities inference from provider and model family
    let coding = 0.5,
      creative = 0.5,
      analytical = 0.5,
      reasoning = 0.5,
      conversational = 0.5,
      general = 0.5;

    // Provider-based adjustments
    switch (provider) {
      case 'openai':
        coding += 0.2;
        reasoning += 0.15;
        general += 0.1;
        break;
      case 'anthropic':
        creative += 0.2;
        conversational += 0.2;
        reasoning += 0.15;
        break;
      case 'google':
        analytical += 0.15;
        general += 0.1;
        break;
      case 'meta-llama':
        coding += 0.1;
        reasoning += 0.1;
        break;
    }

    // Model family adjustments
    if (modelFamily.includes('gpt-4')) {
      coding += 0.15;
      reasoning += 0.2;
    } else if (modelFamily.includes('claude-3')) {
      creative += 0.15;
      conversational += 0.15;
    }

    // Cost-based inference (expensive models tend to be better)
    const avgCost =
      (parseFloat(modelInfo.pricing.prompt) +
        parseFloat(modelInfo.pricing.completion)) /
      2;
    const costBonus = Math.min(avgCost * 1000, 0.15); // Scale cost to capability bonus

    return {
      coding: Math.min(coding + costBonus, 1.0),
      creative: Math.min(creative + costBonus, 1.0),
      analytical: Math.min(analytical + costBonus, 1.0),
      reasoning: Math.min(reasoning + costBonus, 1.0),
      conversational: Math.min(conversational + costBonus, 1.0),
      general: Math.min(general + costBonus, 1.0),
    };
  }

  private static buildCharacteristics(
    modelInfo: ModelInfo,
    knownProfile: Partial<ModelCapabilities & ModelCharacteristics> | undefined,
    provider: string,
    modelFamily: string
  ): ModelCharacteristics {
    // Use known characteristics if available
    if (knownProfile) {
      return {
        speedTier: knownProfile.speedTier ?? this.inferSpeedTier(modelInfo),
        costTier: this.inferCostTier(modelInfo),
        accuracyTier:
          knownProfile.accuracyTier ??
          this.inferAccuracyTier(modelInfo, provider),
        contextTier: this.inferContextTier(modelInfo.context_length),
        provider,
        modelFamily,
        isReasoning:
          knownProfile.isReasoning ??
          this.inferReasoningCapability(modelFamily),
        isMultimodal:
          knownProfile.isMultimodal ??
          this.inferMultimodalCapability(modelInfo.id),
      };
    }

    // Infer all characteristics
    return {
      speedTier: this.inferSpeedTier(modelInfo),
      costTier: this.inferCostTier(modelInfo),
      accuracyTier: this.inferAccuracyTier(modelInfo, provider),
      contextTier: this.inferContextTier(modelInfo.context_length),
      provider,
      modelFamily,
      isReasoning: this.inferReasoningCapability(modelFamily),
      isMultimodal: this.inferMultimodalCapability(modelInfo.id),
    };
  }

  private static inferSpeedTier(
    modelInfo: ModelInfo
  ): ModelCharacteristics['speedTier'] {
    const id = modelInfo.id.toLowerCase();

    if (
      id.includes('turbo') ||
      id.includes('flash') ||
      id.includes('haiku') ||
      id.includes('mini')
    ) {
      return 'ultra-fast';
    }
    if (id.includes('3.5') || id.includes('-8b') || id.includes('small')) {
      return 'fast';
    }
    if (id.includes('opus') || id.includes('405b')) {
      return 'slow';
    }

    return 'medium';
  }

  private static inferCostTier(
    modelInfo: ModelInfo
  ): ModelCharacteristics['costTier'] {
    const avgCost =
      (parseFloat(modelInfo.pricing.prompt) +
        parseFloat(modelInfo.pricing.completion)) /
      2;

    if (avgCost === 0) return 'free';
    if (avgCost < 0.0001) return 'cheap';
    if (avgCost < 0.001) return 'moderate';
    if (avgCost < 0.01) return 'expensive';

    return 'premium';
  }

  private static inferAccuracyTier(
    modelInfo: ModelInfo,
    provider: string
  ): ModelCharacteristics['accuracyTier'] {
    const id = modelInfo.id.toLowerCase();

    if (id.includes('opus') || id.includes('gpt-4o') || id.includes('405b')) {
      return 'excellent';
    }
    if (id.includes('sonnet') || id.includes('gpt-4') || id.includes('70b')) {
      return 'high';
    }
    if (provider === 'openai' || provider === 'anthropic') {
      return 'good';
    }

    return 'basic';
  }

  private static inferContextTier(
    contextLength: number
  ): ModelCharacteristics['contextTier'] {
    if (contextLength >= 1000000) return 'huge';
    if (contextLength >= 100000) return 'large';
    if (contextLength >= 32000) return 'medium';

    return 'small';
  }

  private static inferReasoningCapability(modelFamily: string): boolean {
    return ['gpt-4', 'claude-3', 'claude-2', 'llama-3', 'gemini'].some(family =>
      modelFamily.includes(family)
    );
  }

  private static inferMultimodalCapability(modelId: string): boolean {
    const id = modelId.toLowerCase();
    return (
      id.includes('vision') ||
      id.includes('gpt-4') ||
      id.includes('claude-3') ||
      id.includes('gemini') ||
      id.includes('gpt-4o')
    );
  }

  private static calculateInferredConfidence(modelInfo: ModelInfo): number {
    // Base confidence for inferred profiles
    let confidence = 0.4;

    // Increase confidence for well-known providers
    const provider = this.extractProvider(modelInfo.id);
    if (['openai', 'anthropic', 'google'].includes(provider)) {
      confidence += 0.2;
    }

    // Increase confidence for models with detailed descriptions
    if (modelInfo.description && modelInfo.description.length > 50) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.8); // Cap inferred confidence at 0.8
  }

  private static meetsRequirements(
    model: ModelProfile,
    requirements?: Parameters<typeof ModelProfiler.rankModelsForCategory>[2]
  ): boolean {
    if (!requirements) return true;

    if (
      requirements.maxCost &&
      model.promptCostPerToken > requirements.maxCost
    ) {
      return false;
    }

    if (requirements.needsReasoning && !model.characteristics.isReasoning) {
      return false;
    }

    // Speed tier filtering (ultra-fast > fast > medium > slow)
    if (requirements.minSpeed) {
      const speedOrder = ['slow', 'medium', 'fast', 'ultra-fast'];
      const modelSpeedIndex = speedOrder.indexOf(
        model.characteristics.speedTier
      );
      const requiredSpeedIndex = speedOrder.indexOf(requirements.minSpeed);

      if (modelSpeedIndex < requiredSpeedIndex) {
        return false;
      }
    }

    // Accuracy tier filtering
    if (requirements.minAccuracy) {
      const accuracyOrder = ['basic', 'good', 'high', 'excellent'];
      const modelAccuracyIndex = accuracyOrder.indexOf(
        model.characteristics.accuracyTier
      );
      const requiredAccuracyIndex = accuracyOrder.indexOf(
        requirements.minAccuracy
      );

      if (modelAccuracyIndex < requiredAccuracyIndex) {
        return false;
      }
    }

    return true;
  }

  private static calculateCategoryScore(
    model: ModelProfile,
    category: PromptType,
    requirements?: Parameters<typeof ModelProfiler.rankModelsForCategory>[2]
  ): number {
    // Get base capability score for the category
    let score = model.capabilities[category];

    // Apply characteristic bonuses/penalties

    // Cost consideration (if specified)
    if (requirements?.maxCost) {
      const costRatio = model.promptCostPerToken / requirements.maxCost;
      if (costRatio <= 0.5)
        score += 0.1; // Bonus for being well under budget
      else if (costRatio > 0.8) score -= 0.1; // Penalty for being close to limit
    }

    // Speed bonus for fast models
    const speedBonus = {
      'ultra-fast': 0.05,
      fast: 0.03,
      medium: 0,
      slow: -0.02,
    }[model.characteristics.speedTier];
    score += speedBonus;

    // Accuracy bonus
    const accuracyBonus = {
      excellent: 0.1,
      high: 0.05,
      good: 0,
      basic: -0.05,
    }[model.characteristics.accuracyTier];
    score += accuracyBonus;

    // Reasoning bonus for reasoning tasks
    if (
      category === PromptType.Reasoning &&
      model.characteristics.isReasoning
    ) {
      score += 0.1;
    }

    // Context length bonus (useful for all tasks)
    if (model.contextLength >= 100000) score += 0.05;
    else if (model.contextLength >= 32000) score += 0.02;

    // Profile confidence weighting
    score *= model.profileConfidence;

    return Math.max(0, Math.min(1, score)); // Clamp between 0 and 1
  }

  private static generateScoreReasoning(
    model: ModelProfile,
    category: PromptType,
    score: number
  ): string {
    const reasons: string[] = [];

    // Primary capability
    const capabilityScore = model.capabilities[category];
    reasons.push(
      `${(capabilityScore * 100).toFixed(0)}% ${category} capability`
    );

    // Key characteristics
    if (model.characteristics.accuracyTier === 'excellent') {
      reasons.push('excellent accuracy');
    } else if (model.characteristics.accuracyTier === 'high') {
      reasons.push('high accuracy');
    }

    if (model.characteristics.speedTier === 'ultra-fast') {
      reasons.push('ultra-fast response');
    } else if (model.characteristics.speedTier === 'fast') {
      reasons.push('fast response');
    }

    if (
      model.characteristics.costTier === 'free' ||
      model.characteristics.costTier === 'cheap'
    ) {
      reasons.push('cost-effective');
    }

    if (
      model.characteristics.contextTier === 'huge' ||
      model.characteristics.contextTier === 'large'
    ) {
      reasons.push('large context window');
    }

    if (
      category === PromptType.Reasoning &&
      model.characteristics.isReasoning
    ) {
      reasons.push('reasoning optimized');
    }

    return reasons.join(', ') + ` (${(score * 100).toFixed(0)}% overall)`;
  }
}
