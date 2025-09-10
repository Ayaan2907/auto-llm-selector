/* eslint-env node */
import type { AnalyticsEvent, AnalyticsConfig } from '../types.js';
import { Logger } from '../utils/logger.js';
import { AnalyticsUtils } from './utils.js';
import { env } from '../config/env.js';

const logger = new Logger('AnalyticsQueue');

const SUPABASE_ANALYTICS_ENDPOINT = env.SUPABASE_ANALYTICS_ENDPOINT;

export class AnalyticsQueue {
  private queue: AnalyticsEvent[] = [];
  private isProcessing = false;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private config: Required<AnalyticsConfig>;
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

  /**
   * Add analytics event to processing queue (non-blocking)
   */
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

  /**
   * Schedule batch processing with configurable intervals
   */
  private scheduleBatchFlush(): void {
    // Immediate flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.processBatch();
      return;
    }

    // Schedule flush if not already scheduled
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.processBatch();
      this.flushTimer = undefined;
    }, this.config.batchIntervalMs);
  }

  /**
   * Process and send analytics batch to backend
   */
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

      // TODO: Add retry logic with exponential backoff
      // For now, events are lost on failure to prevent memory leaks
    } finally {
      this.isProcessing = false;

      // Continue processing remaining queue
      if (this.queue.length > 0) {
        this.scheduleBatchFlush();
      }
    }
  }

  /**
   * Send analytics batch to Supabase backend
   */
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

    const response = await fetch(SUPABASE_ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (this.config.debugMode) {
        logger.error('Edge function error details:', errorBody);
      }
      throw new Error(
        `Analytics upload failed: ${response.status} ${response.statusText} - 
${errorBody}`
      );
    }
  }

  /**
   * Graceful shutdown - flush remaining analytics events
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.queue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Get current queue status for monitoring
   */
  getQueueStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.isProcessing,
      sessionId: this.sessionId,
      userFingerprint: this.userFingerprint,
    };
  }
}
