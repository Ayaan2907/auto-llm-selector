/* eslint-env node */
import type { AnalyticsEvent, AnalyticsConfig } from '../types.js';
import { Logger } from '../utils/logger.js';
import { AnalyticsUtils } from './utils.js';
import { fetchWithRetry } from '../http/retry-fetch.js';

const logger = new Logger('AnalyticsQueue');

const DEFAULT_ANALYTICS_ENDPOINT =
  'https://ucgblchamfvkillrznhk.supabase.co/functions/v1/analytics';

export class AnalyticsQueue {
  private queue: AnalyticsEvent[] = [];
  private isProcessing = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private config: Required<Omit<AnalyticsConfig, 'endpointUrl' | 'apiKey'>> & {
    endpointUrl: string;
    apiKey: string | undefined;
  };
  private sessionId: string;
  private userFingerprint: string;

  constructor(config: AnalyticsConfig) {
    this.config = {
      enabled: config.enabled,
      collectPromptMetrics: config.collectPromptMetrics,
      collectModelPerformance: config.collectModelPerformance,
      collectSemanticFeatures: config.collectSemanticFeatures,
      collectSystemInfo: config.collectSystemInfo,
      batchSize: config.batchSize ?? 50,
      batchIntervalMs: config.batchIntervalMs ?? 5000,
      debugMode: config.debugMode ?? false,
      endpointUrl: config.endpointUrl ?? DEFAULT_ANALYTICS_ENDPOINT,
      apiKey: config.apiKey,
    };

    this.sessionId = AnalyticsUtils.generateSessionId();
    this.userFingerprint = AnalyticsUtils.generateUserFingerprint();

    if (this.config.debugMode) {
      logger.info('Analytics queue initialized', {
        sessionId: this.sessionId,
        userFingerprint: this.userFingerprint,
      });
    }
  }

  enqueue(event: Omit<AnalyticsEvent, 'timestamp' | 'sessionId'>): void {
    if (!this.config.enabled) return;

    const analyticsEvent: AnalyticsEvent = {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    this.queue.push(analyticsEvent);

    if (this.config.debugMode) {
      logger.debug('Analytics event queued', {
        eventType: event.eventType,
        queueSize: this.queue.length,
      });
    }

    this.scheduleBatchFlush();
  }

  private scheduleBatchFlush(): void {
    if (this.queue.length >= this.config.batchSize) {
      void this.processBatch();
      return;
    }

    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      void this.processBatch();
      this.flushTimer = undefined;
    }, this.config.batchIntervalMs);
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const eventBatch = this.queue.splice(0, this.config.batchSize);

    try {
      if (this.config.debugMode) {
        logger.debug('Processing analytics batch', {
          batchSize: eventBatch.length,
        });
      }

      await this.sendAnalyticsBatch(eventBatch);

      if (this.config.debugMode) {
        logger.debug('Analytics batch processed successfully', {
          batchSize: eventBatch.length,
        });
      }
    } catch (error) {
      logger.error('Analytics batch processing failed', error);
    } finally {
      this.isProcessing = false;

      if (this.queue.length > 0) {
        this.scheduleBatchFlush();
      }
    }
  }

  private async sendAnalyticsBatch(events: AnalyticsEvent[]): Promise<void> {
    const payload = {
      events: events.map(event => ({
        event_type: event.eventType,
        timestamp: event.timestamp,
        session_id: event.sessionId,
        library_version: event.libraryVersion,
        data: event.data,
        user_fingerprint: this.userFingerprint,
      })),
    };

    if (this.config.debugMode) {
      logger.debug(
        'Analytics payload structure:',
        JSON.stringify(payload, null, 2)
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetchWithRetry(
      this.config.endpointUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      },
      { maxAttempts: 3, baseDelayMs: 1000 }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (this.config.debugMode) {
        logger.error('Edge function error details:', errorBody);
      }
      throw new Error(
        `Analytics upload failed: ${response.status} ${response.statusText} - ${errorBody}`
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.queue.length > 0) {
      await this.processBatch();
    }
  }

  getQueueStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      sessionId: this.sessionId,
      userFingerprint: this.userFingerprint,
    };
  }
}
