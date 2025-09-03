import { Logger } from './utils/logger.js';
import { modelCache } from './cache.js';
import { PromptClassifier } from './classifier.js';
import type {
  RouterConfig,
  PromptProperties,
  ModelSelection,
  PromptCategory,
  ModelProfile,
} from './types.js';

export class AutoPromptRouter {
  private logger: Logger;
  private config: RouterConfig;
  private isInitialized: boolean = false;

  constructor(config: RouterConfig) {
    this.config = {
      selectorModel: 'openai/gpt-oss-20b:free',
      enableLogging: false,
      ...config,
    };

    this.logger = new Logger('AutoPromptRouter');

    // Set environment variables for cache to use
    process.env.OPEN_ROUTER_API_KEY = this.config.OPEN_ROUTER_API_KEY;
  }

  /**
   * Initialize the router by fetching and caching model data
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing AutoPromptRouter');

      // Pre-fetch and cache model profiles
      await modelCache.getModelProfiles();

      this.isInitialized = true;
      this.logger.info('AutoPromptRouter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AutoPromptRouter', error);
      throw new Error(
        'Failed to initialize router. Please check your OpenRouter API key.'
      );
    }
  }

  /**
   * Get model recommendation for a prompt
   */
  async getModelRecommendation(
    prompt: string,
    properties: PromptProperties
  ): Promise<ModelSelection> {
    if (!this.isInitialized) {
      throw new Error('Router not initialized. Call initialize() first.');
    }

    this.logger.info('Getting model recommendation', {
      promptLength: prompt.length,
      properties,
    });

    try {
      // Step 1: Get all model profiles from cache
      const allProfiles = await modelCache.getModelProfiles();
      this.logger.debug(
        `Retrieved ${allProfiles.length} model profiles from cache`
      );

      // Step 2: Filter by reasoning requirement ONLY (if needed)
      let availableProfiles = allProfiles;
      if (properties.reasoning) {
        availableProfiles = allProfiles.filter(
          profile => profile.characteristics.isReasoning
        );
        this.logger.debug(
          `Filtered to ${availableProfiles.length} reasoning-capable models`
        );
      }

      // Step 3: Process prompt through classifier → ML → Category
      const category = await this.classifyPrompt(prompt);
      this.logger.info(
        `Prompt classified as: ${category.type} (confidence: ${category.confidence.toFixed(2)})`
      );

      // Step 4: Filter profiles by category capability
      const categoryKey =
        category.type.toLowerCase() as keyof ModelProfile['capabilities'];
      const categoryProfiles = availableProfiles.filter(
        profile => profile.capabilities[categoryKey] >= 0.3 // Minimum capability threshold
      );
      this.logger.debug(
        `Filtered to ${categoryProfiles.length} models suitable for ${category.type}`
      );

      if (categoryProfiles.length === 0) {
        throw new Error(
          `No suitable models found for category: ${category.type}`
        );
      }

      // Step 5: Pass to LLM decision with profiles
      const finalSelection = await this.getLLMDecisionWithProfiles(
        prompt,
        properties,
        categoryProfiles,
        category
      );

      this.logger.info('Model recommendation generated', { finalSelection });
      return finalSelection;
    } catch (error) {
      this.logger.error('Failed to get model recommendation', error);
      throw new Error('Failed to generate model recommendation');
    }
  }

  /**
   * Get available models (for debugging/inspection)
   */
  async getAvailableModels(): Promise<ModelProfile[]> {
    return await modelCache.getModelProfiles();
  }

  /**
   * Clear model cache
   */
  clearCache(): void {
    modelCache.clearCache();
    this.logger.info('Model cache cleared');
  }

  // Private methods
  private async classifyPrompt(prompt: string): Promise<PromptCategory> {
    return await PromptClassifier.classifyPrompt(prompt);
  }

  private async getLLMDecisionWithProfiles(
    prompt: string,
    properties: PromptProperties,
    categoryProfiles: ModelProfile[],
    category: PromptCategory
  ): Promise<ModelSelection> {
    // Create enhanced prompt with model profiles
    const profileInfo = categoryProfiles
      .map(profile => {
        const categoryScore =
          profile.capabilities[
            category.type.toLowerCase() as keyof ModelProfile['capabilities']
          ];
        return {
          id: profile.id,
          name: profile.name,
          description: profile.description,
          categoryScore: Math.round(categoryScore * 100),
          speedTier: profile.characteristics.speedTier,
          costTier: profile.characteristics.costTier,
          accuracyTier: profile.characteristics.accuracyTier,
          contextLength: profile.contextLength,
          promptCost: profile.promptCostPerToken,
          completionCost: profile.completionCostPerToken,
          provider: profile.characteristics.provider,
          isReasoning: profile.characteristics.isReasoning,
          confidence: Math.round(profile.profileConfidence * 100),
        };
      })
      .sort((a, b) => b.categoryScore - a.categoryScore); // Sort by category performance

    // Create system prompt with model profiles
    const selectionPrompt = `You are an expert LLM selection system. Based on the user's prompt and requirements, select the best model from the available profiles.

PROMPT ANALYSIS:
- Classified Category: ${category.type} (${Math.round(category.confidence * 100)}% confidence)
- User Input: "${prompt}"

USER REQUIREMENTS:
- Accuracy Priority: ${properties.accuracy}/1 (1 = highest accuracy needed)
- Cost Sensitivity: ${properties.cost}/1 (0 = very cost-sensitive, 1 = cost no object)
- Speed Priority: ${properties.speed}/1 (1 = fastest response needed)
- Context Length: ${properties.tokenLimit} tokens minimum
- Reasoning Required: ${properties.reasoning}

AVAILABLE MODEL PROFILES (filtered for ${category.type} tasks):
${profileInfo
  .map(
    p =>
      `${p.id}:
  - ${category.type} Performance: ${p.categoryScore}%
  - Speed: ${p.speedTier} | Cost: ${p.costTier} | Accuracy: ${p.accuracyTier}
  - Context: ${p.contextLength.toLocaleString()} tokens
  - Pricing: $${p.promptCost.toFixed(6)}/$${p.completionCost.toFixed(6)} per token
  - Provider: ${p.provider} | Reasoning: ${p.isReasoning ? 'Yes' : 'No'}
  - Profile Confidence: ${p.confidence}%`
  )
  .join('\n\n')}

Select the optimal model considering the user's priorities (accuracy/cost/speed) and the models' ${category.type} capabilities.

You must respond with valid JSON in this EXACT format:
{
  "model": "exact_model_id_from_list",
  "reason": "brief explanation of why this model was selected",
  "confidence": 0.85
}

Important: The "model" field must exactly match one of the model IDs from the list above. and in response i do not want any extra char like \`\`\` json or any other char`;

    try {
      // Make API call to selector model
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPEN_ROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.selectorModel,
            messages: [{ role: 'system', content: selectionPrompt }],
            temperature: 0.1,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`LLM selection failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const llmResponse = data.choices[0]?.message.content;
      if (!llmResponse) {
        throw new Error('No response content from LLM');
      }

      // Parse LLM response
      const selection = JSON.parse(llmResponse);

      return {
        model: selection.model,
        reason: selection.reason,
        confidence: selection.confidence,
        category,
      };
    } catch (error) {
      this.logger.error(
        'LLM decision failed, falling back to first suitable model',
        error
      );

      // Fallback to first suitable model
      if (categoryProfiles.length === 0) {
        throw new Error('No suitable models found for the given requirements');
      }

      const fallbackModel = categoryProfiles[0];

      return {
        model: fallbackModel?.id || '',
        reason: `Fallback selection: ${fallbackModel?.name} (LLM selection failed)`,
        confidence: 0.5,
        category,
      };
    }
  }
}
