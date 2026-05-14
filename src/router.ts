import { randomUUID } from 'node:crypto';
import { Logger } from './utils/logger.js';
import { InMemoryModelCache } from './cache.js';
import { PromptClassifier } from './classifier.js';
import { AnalyticsCollector } from './analytics/collector.js';
import { ModelProfiler } from './lib/model-profiler.js';
import { fetchWithRetry } from './http/retry-fetch.js';
import { OpenRouterRateLimiter } from './http/openrouter-rate-limit.js';
import {
  applyHardFilters,
  type HardFilterOptions,
} from './routing/hard-filters.js';
import { buildRankRequirementsFromProperties } from './routing/requirements-from-properties.js';
import {
  assertValidPrompt,
  assertValidPromptProperties,
} from './validation/schemas.js';
import {
  OutcomeFeedbackStore,
  type OutcomeQuality,
} from './feedback/outcome-store.js';
import type {
  RouterConfig,
  PromptProperties,
  ModelSelection,
  PromptCategory,
  ModelProfile,
  ModelSelectionStrategy,
} from './types.js';
import { PromptType } from './types.js';

export class AutoPromptRouter {
  private logger: Logger;
  private config: RouterConfig;
  private isInitialized: boolean = false;
  private analytics: AnalyticsCollector | null = null;
  private modelCache: InMemoryModelCache;
  private readonly rateLimiter: OpenRouterRateLimiter;
  private readonly outcomes: OutcomeFeedbackStore;

  constructor(config: RouterConfig) {
    this.config = {
      selectorModel: 'openai/gpt-oss-20b:free',
      selectionStrategy: 'deterministic',
      ...config,
    };

    this.logger = new Logger('AutoPromptRouter', {
      enabled: this.config.enableLogging !== false,
    });

    this.rateLimiter = new OpenRouterRateLimiter();
    this.modelCache = new InMemoryModelCache(this.config.OPEN_ROUTER_API_KEY, {
      ...(this.config.modelCatalogCacheTtlMs !== undefined && {
        catalogCacheTtlMs: this.config.modelCatalogCacheTtlMs,
      }),
      ...(this.config.modelCatalogPersistentCachePath !== undefined && {
        persistentCatalogPath: this.config.modelCatalogPersistentCachePath,
      }),
      rateLimiter: this.rateLimiter,
      logHttpRetries: this.config.enableLogging !== false,
    });

    this.outcomes = new OutcomeFeedbackStore();

    if (this.config.analytics?.enabled) {
      this.analytics = new AnalyticsCollector(this.config.analytics);
    }
  }

  async initialize(): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info('Initializing AutoPromptRouter');

      const modelProfiles = await this.modelCache.getModelProfiles();

      this.isInitialized = true;
      this.logger.info('AutoPromptRouter initialized successfully');

      if (this.analytics) {
        this.analytics.trackSessionStart({
          configOptions: { ...this.config },
          initializationTimeMs: Date.now() - startTime,
          modelCacheSize: modelProfiles.length,
        });
      }
    } catch (error) {
      if (this.analytics) {
        this.analytics.trackError({
          errorType: 'initialization_failed',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          context: 'router_initialize',
        });
      }

      this.logger.error('Failed to initialize AutoPromptRouter', error);
      throw new Error(
        'Failed to initialize router. Please check your OpenRouter API key.'
      );
    }
  }

  async getModelRecommendation(
    prompt: string,
    properties: PromptProperties
  ): Promise<ModelSelection> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      throw new Error('Router not initialized. Call initialize() first.');
    }

    assertValidPrompt(prompt);
    assertValidPromptProperties(properties);

    this.logger.info('Getting model recommendation', {
      promptLength: prompt.length,
      properties,
    });

    try {
      const allProfiles = await this.modelCache.getModelProfiles();
      this.logger.debug(
        `Retrieved ${allProfiles.length} model profiles from cache`
      );

      let availableProfiles = allProfiles;
      if (properties.reasoning === true) {
        availableProfiles = allProfiles.filter(
          profile => profile.characteristics.isReasoning
        );
        this.logger.debug(
          `Filtered to ${availableProfiles.length} reasoning-capable models`
        );
      }

      const multiLabel = this.config.multiLabelClassification === true;
      const categoryWeights = multiLabel
        ? await PromptClassifier.getCategoryWeightDistribution(prompt)
        : undefined;

      const category = multiLabel
        ? this.pickPrimaryCategoryFromWeights(categoryWeights!)
        : await this.classifyPrompt(prompt);

      this.logger.info(
        `Prompt classified as: ${category.type} (confidence: ${category.confidence.toFixed(2)})`
      );

      const categoryKey =
        category.type.toLowerCase() as keyof ModelProfile['capabilities'];

      const categoryProfiles = availableProfiles.filter(profile => {
        if (!categoryWeights) {
          return profile.capabilities[categoryKey] >= 0.3;
        }
        const blended = this.blendedCapabilityScore(profile, categoryWeights);
        return blended >= 0.3;
      });

      categoryProfiles.sort((a, b) => {
        if (!categoryWeights) {
          return b.capabilities[categoryKey] - a.capabilities[categoryKey];
        }
        return (
          this.blendedCapabilityScore(b, categoryWeights) -
          this.blendedCapabilityScore(a, categoryWeights)
        );
      });

      this.logger.debug(
        `Filtered to ${categoryProfiles.length} models suitable for ${category.type}`
      );

      if (categoryProfiles.length === 0) {
        throw new Error(
          `No suitable models found for category: ${category.type}`
        );
      }

      const hardFilterOptions: HardFilterOptions = {};
      if (this.config.allowedModelPatterns !== undefined) {
        hardFilterOptions.allowedModelPatterns =
          this.config.allowedModelPatterns;
      }
      if (this.config.excludedModelPatterns !== undefined) {
        hardFilterOptions.excludedModelPatterns =
          this.config.excludedModelPatterns;
      }

      const hardFiltered = applyHardFilters(
        categoryProfiles,
        properties,
        hardFilterOptions
      );

      if (hardFiltered.length === 0) {
        throw new Error(
          'No models matched hard filters (context window, cost/speed/accuracy tiers, patterns, multimodal).'
        );
      }

      const rankRequirements = buildRankRequirementsFromProperties(properties);
      const strategy: ModelSelectionStrategy =
        this.config.selectionStrategy ?? 'deterministic';

      const selectionId = randomUUID();

      const finalSelection =
        strategy === 'llm'
          ? await this.getLLMDecisionWithProfiles(
              prompt,
              properties,
              hardFiltered,
              category,
              selectionId
            )
          : this.getDeterministicSelection(
              hardFiltered,
              category,
              rankRequirements,
              properties,
              categoryWeights,
              selectionId,
              strategy
            );

      this.config.telemetry?.onModelSelected?.({
        modelId: finalSelection.model,
        selectionStrategy: strategy,
        ...(finalSelection.selectionId !== undefined && {
          selectionId: finalSelection.selectionId,
        }),
      });

      const responseTime = Date.now() - startTime;

      if (this.analytics) {
        this.analytics.trackPromptRequest({
          prompt,
          promptProperties: { ...properties },
          classification: category,
          modelSelection: finalSelection,
          responseTimeMs: responseTime,
        });
      }

      this.logger.info('Model recommendation generated', { finalSelection });
      return finalSelection;
    } catch (error) {
      if (this.analytics) {
        this.analytics.trackError({
          errorType: 'model_recommendation_failed',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          context: 'get_model_recommendation',
        });
      }

      this.logger.error('Failed to get model recommendation', error);
      throw new Error('Failed to generate model recommendation');
    }
  }

  async getModelRecommendations(
    items: Array<{ prompt: string; properties: PromptProperties }>
  ): Promise<ModelSelection[]> {
    const results: ModelSelection[] = [];
    for (const item of items) {
      assertValidPrompt(item.prompt);
      assertValidPromptProperties(item.properties);
      results.push(
        await this.getModelRecommendation(item.prompt, item.properties)
      );
    }
    return results;
  }

  reportOutcome(selectionId: string, quality: OutcomeQuality): void {
    this.outcomes.report(selectionId, quality);
  }

  async getAvailableModels(): Promise<ModelProfile[]> {
    return await this.modelCache.getModelProfiles();
  }

  clearCache(): void {
    this.modelCache.clearCache();
    this.logger.info('Model cache cleared');
  }

  getAnalyticsStatus() {
    return this.analytics ? this.analytics.getStatus() : { enabled: false };
  }

  async shutdown(): Promise<void> {
    if (this.analytics) {
      await this.analytics.shutdown();
      this.logger.info('Analytics system shut down');
    }
  }

  private async classifyPrompt(prompt: string): Promise<PromptCategory> {
    return await PromptClassifier.classifyPrompt(prompt);
  }

  private pickPrimaryCategoryFromWeights(
    weights: Partial<Record<PromptType, number>>
  ): PromptCategory {
    let best: PromptType = PromptType.General;
    let bestScore = 0;

    for (const [type, weight] of Object.entries(weights)) {
      const w = weight ?? 0;
      if (w > bestScore) {
        bestScore = w;
        best = type as PromptType;
      }
    }

    return {
      type: best,
      confidence: Math.max(0.1, Math.min(0.95, bestScore)),
    };
  }

  private blendedCapabilityScore(
    profile: ModelProfile,
    weights: Partial<Record<PromptType, number>>
  ): number {
    let sum = 0;
    for (const [type, weight] of Object.entries(weights)) {
      const w = weight ?? 0;
      if (w <= 0) continue;
      const key = type.toLowerCase() as keyof ModelProfile['capabilities'];
      sum += w * profile.capabilities[key];
    }
    return sum;
  }

  private getDeterministicSelection(
    profiles: ModelProfile[],
    category: PromptCategory,
    rankRequirements: ReturnType<typeof buildRankRequirementsFromProperties>,
    properties: PromptProperties,
    categoryWeights: Partial<Record<PromptType, number>> | undefined,
    selectionId: string,
    strategy: ModelSelectionStrategy
  ): ModelSelection {
    const qvc = properties.qualityVsCost ?? 0.5;

    const ranking = this.config.multiLabelClassification
      ? ModelProfiler.rankModelsForWeightedCategories(
          profiles,
          categoryWeights ?? { [category.type]: 1 },
          rankRequirements,
          qvc
        )
      : {
          rankedModels: ModelProfiler.rankModelsForCategory(
            profiles,
            category.type,
            rankRequirements
          ).rankedModels,
        };

    const top = ranking.rankedModels[0];
    if (!top) {
      throw new Error('Deterministic ranking produced no candidates');
    }

    const confidence = Math.max(0.05, Math.min(0.95, top.score));

    const selection: ModelSelection = {
      model: top.model.id,
      reason: top.reasoning,
      confidence,
      category,
      selectionId,
      selectionStrategy: strategy,
    };

    if (this.config.multiLabelClassification && categoryWeights) {
      selection.categoryWeights = categoryWeights;
    }

    return selection;
  }

  private async getLLMDecisionWithProfiles(
    prompt: string,
    properties: PromptProperties,
    categoryProfiles: ModelProfile[],
    category: PromptCategory,
    selectionId: string
  ): Promise<ModelSelection> {
    const allowedIds = new Set(categoryProfiles.map(p => p.id));

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
      .sort((a, b) => b.categoryScore - a.categoryScore);

    const selectionPrompt = `You are an expert LLM selection system. Based on the user's prompt and requirements, select the best model from the available profiles.

PROMPT ANALYSIS:
- Classified Category: ${category.type} (${Math.round(category.confidence * 100)}% confidence)
- User Input: "${prompt}"

USER REQUIREMENTS:
- Accuracy priority: ${properties.accuracy}/1 (higher = need higher-quality outputs)
- Cost budget: ${properties.cost}/1 (lower = more cost sensitive; higher = premium models allowed)
- Speed priority: ${properties.speed}/1 (higher = prefer faster models)
- Minimum context window: ${properties.tokenLimit} tokens
- Reasoning-capable models only: ${properties.reasoning ? 'yes' : 'no (no extra filter; any eligible model)'}

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

Important: The "model" field must exactly match one of the model IDs from the list above. Do not wrap the JSON in markdown fences.`;

    try {
      await this.rateLimiter.acquire();

      const response = await fetchWithRetry(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.OPEN_ROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.selectorModel,
            messages: [{ role: 'system', content: selectionPrompt }],
            temperature: 0,
          }),
        },
        { logRetries: this.config.enableLogging !== false }
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

      const selection = this.parseSelectorJson(llmResponse);

      if (!allowedIds.has(selection.model)) {
        throw new Error(
          `Selector returned unknown model id: ${String(selection.model)}`
        );
      }

      return {
        model: selection.model,
        reason: selection.reason,
        confidence: selection.confidence,
        category,
        selectionId,
        selectionStrategy: 'llm',
      };
    } catch (error) {
      this.logger.error(
        'LLM decision failed, falling back to highest deterministic candidate',
        error
      );

      const rankRequirements = buildRankRequirementsFromProperties(properties);
      const ranking = ModelProfiler.rankModelsForCategory(
        categoryProfiles,
        category.type,
        rankRequirements
      );

      const fallbackModel = ranking.rankedModels[0]?.model;
      if (!fallbackModel) {
        throw new Error('No suitable models found for the given requirements');
      }

      return {
        model: fallbackModel.id,
        reason: `Fallback selection: ${fallbackModel.name} (LLM selection failed)`,
        confidence: 0.5,
        category,
        selectionId,
        selectionStrategy: 'llm',
      };
    }
  }

  private parseSelectorJson(raw: string): {
    model: string;
    reason: string;
    confidence: number;
  } {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed) as {
        model: string;
        reason: string;
        confidence: number;
      };
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start === -1 || end === -1 || end <= start) {
        throw new Error('Selector response was not valid JSON');
      }
      return JSON.parse(trimmed.slice(start, end + 1)) as {
        model: string;
        reason: string;
        confidence: number;
      };
    }
  }
}
