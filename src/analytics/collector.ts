import { AnalyticsQueue } from './queue.js';
import { AnalyticsUtils } from './utils.js';
import type {
  AnalyticsConfig,
  PromptAnalyticsData,
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
   * Track prompt classification and model selection event
   */
  trackPromptClassification(data: {
    prompt: string;
    promptProperties: Record<string, unknown>;
    classification: PromptCategory;
    modelSelection: ModelSelection;
    responseTimeMs: number;
    semanticConfidence?: number;
    keywordConfidence?: number;
  }): void {
    if (!this.config.enabled || !this.config.collectPromptMetrics) return;

    const promptHash = AnalyticsUtils.generateContentHash(data.prompt);
    const analyticsData: PromptAnalyticsData = {
      promptHash,
      promptLength: data.prompt.length,
      promptType: data.classification.type,
      classificationConfidence: data.classification.confidence,
      semanticConfidence: data.semanticConfidence,
      keywordConfidence: data.keywordConfidence,
      modelSelected: data.modelSelection.model,
      selectionConfidence: data.modelSelection.confidence,
      responseTimeMs: data.responseTimeMs,
      systemInfo: this.systemInfo,
    };

    this.queue.enqueue({
      eventType: 'prompt_classification',
      libraryVersion: this.libraryVersion,
      data: analyticsData,
    });

    if (this.config.debugMode) {
      logger.debug('Prompt classification tracked', {
        promptHash,
        promptType: data.classification.type,
        modelSelected: data.modelSelection.model,
      });
    }
  }

  /**
   * Track model performance metrics
   */
  trackModelPerformance(data: {
    modelId: string;
    promptType: PromptType;
    responseTimeMs: number;
    success: boolean;
    errorType?: string;
    confidence: number;
  }): void {
    if (!this.config.enabled || !this.config.collectModelPerformance) return;

    this.queue.enqueue({
      eventType: 'model_performance',
      libraryVersion: this.libraryVersion,
      data: {
        ...data,
        systemInfo: this.systemInfo,
      },
    });
  }

  /**
   * Track semantic classification metrics
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
      data: {
        ...data,
        systemInfo: this.systemInfo,
      },
    });
  }

  /**
   * Track library initialization
   */
  trackLibraryInitialization(data: {
    configOptions: Record<string, unknown>;
    initializationTimeMs: number;
    modelCacheSize: number;
  }): void {
    if (!this.config.enabled) return;

    this.queue.enqueue({
      eventType: 'library_initialization',
      libraryVersion: this.libraryVersion,
      data: {
        configOptions: AnalyticsUtils.sanitizeConfig(data.configOptions),
        initializationTimeMs: data.initializationTimeMs,
        modelCacheSize: data.modelCacheSize,
        systemInfo: this.systemInfo,
      },
    });
  }

  /**
   * Track error events
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
      data: {
        ...data,
        systemInfo: this.systemInfo,
      },
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
