/* eslint-env node */
import type { AnalyticsEvent, AnalyticsConfig } from '../types.js';
import { Logger } from '../utils/logger.js';
import { AnalyticsUtils } from './utils.js';

const logger = new Logger('AnalyticsQueue');

// Supabase configuration (anon key with RLS - safe to expose)
const SUPABASE_URL = 'https://ucgblchamfvkillrznhk.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjZ2JsY2hhbWZ2a2lsbHJ6bmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0NjkzMDgsImV4cCI6MjA3MzA0NTMwOH0.xuXYjGGXjiNQ2uJGDtBh_Q4ucrV30KTzA3q-QpBWrrU';

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
    const response = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        events.map(event => ({
          ...event,
          user_fingerprint: this.userFingerprint,
        }))
      ),
    });

    if (!response.ok) {
      throw new Error(
        `Analytics upload failed: ${response.status} ${response.statusText}`
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
