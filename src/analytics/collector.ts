import { AnalyticsQueue } from './queue.js';
import { AnalyticsUtils } from './utils.js';
import type {
  AnalyticsConfig,
  PromptCategory,
  ModelSelection,
  PromptType,
} from '../types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('AnalyticsCollector');

export class AnalyticsCollector {
  private queue: AnalyticsQueue;
  private config: AnalyticsConfig;
  private libraryVersion: string;
  private systemInfo: Record<string, unknown> | undefined;

  constructor(config: AnalyticsConfig) {
    this.config = config;
    this.queue = new AnalyticsQueue(config);
    this.libraryVersion = AnalyticsUtils.getLibraryVersion();
    this.systemInfo = this.config.collectSystemInfo
      ? AnalyticsUtils.collectSystemInfo()
      : undefined;

    if (config.debugMode) {
      logger.info('Analytics collector initialized', {
        libraryVersion: this.libraryVersion,
        systemInfo: this.systemInfo,
      });
    }
  }

  /**
   * Track complete prompt request with all context
   */
  trackPromptRequest(data: {
    prompt: string;
    promptProperties: Record<string, unknown>;
    classification: PromptCategory;
    modelSelection: ModelSelection;
    responseTimeMs: number;
    semanticConfidence?: number;
    keywordConfidence?: number;
  }): void {
    if (!this.config.enabled || !this.config.collectPromptMetrics) return;

    // const promptHash = AnalyticsUtils.generateContentHash(data.prompt);
    const promptHash = data.prompt; // getting the prompt directyl for testing purposed for limited time
    const analyticsData = {
      promptHash,
      promptLength: data.prompt.length,
      promptType: data.classification.type,
      classificationConfidence: data.classification.confidence,
      modelSelected: data.modelSelection.model,
      selectionConfidence: data.modelSelection.confidence,
      selectionReason: data.modelSelection.reason,
      responseTimeMs: data.responseTimeMs,
      // Capture user requirements - crucial for ML training
      userRequirements: {
        accuracy: data.promptProperties.accuracy,
        cost: data.promptProperties.cost,
        speed: data.promptProperties.speed,
        tokenLimit: data.promptProperties.tokenLimit,
        reasoning: data.promptProperties.reasoning,
      },
      ...(data.semanticConfidence !== undefined && {
        semanticConfidence: data.semanticConfidence,
      }),
      ...(data.keywordConfidence !== undefined && {
        keywordConfidence: data.keywordConfidence,
      }),
    };

    this.queue.enqueue({
      eventType: 'prompt_request',
      libraryVersion: this.libraryVersion,
      data: analyticsData,
    });

    if (this.config.debugMode) {
      logger.debug('Prompt request tracked', {
        promptHash,
        promptType: data.classification.type,
        modelSelected: data.modelSelection.model,
        userRequirements: analyticsData.userRequirements,
      });
    }
  }

  /**
   * Track semantic classification metrics (lightweight - no system info)
   */
  trackSemanticMetrics(data: {
    promptHash: string;
    embeddingComputeTimeMs: number;
    semanticCategory: PromptType;
    semanticConfidence: number;
    keywordCategory: PromptType;
    keywordConfidence: number;
    agreementScore: number;
    embeddingCacheHit: boolean;
  }): void {
    if (!this.config.enabled || !this.config.collectSemanticFeatures) return;

    this.queue.enqueue({
      eventType: 'semantic_classification',
      libraryVersion: this.libraryVersion,
      data: data, // No system info - reference session
    });
  }

  /**
   * Track session start (once per user session) - includes system info
   */
  trackSessionStart(data: {
    configOptions: Record<string, unknown>;
    initializationTimeMs: number;
    modelCacheSize: number;
  }): void {
    if (!this.config.enabled) return;

    this.queue.enqueue({
      eventType: 'session_start',
      libraryVersion: this.libraryVersion,
      data: {
        configOptions: AnalyticsUtils.sanitizeConfig(data.configOptions),
        initializationTimeMs: data.initializationTimeMs,
        modelCacheSize: data.modelCacheSize,
        // Only include system info in session_start event
        systemInfo: this.systemInfo,
      },
    });
  }

  /**
   * Track error events (no system info - reference session)
   */
  trackError(data: {
    errorType: string;
    errorMessage: string;
    context: string;
    promptHash?: string;
  }): void {
    if (!this.config.enabled) return;

    this.queue.enqueue({
      eventType: 'error_event',
      libraryVersion: this.libraryVersion,
      data: data, // No system info - reference session
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    await this.queue.shutdown();
  }

  /**
   * Get analytics status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      libraryVersion: this.libraryVersion,
      queueStatus: this.queue.getQueueStatus(),
    };
  }
}
