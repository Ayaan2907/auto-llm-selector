/**
 * Simple spacing-based rate limiter for outbound OpenRouter calls.
 * Avoids bursty traffic that can trigger 429s.
 */
export class OpenRouterRateLimiter {
  private minIntervalMs: number;
  private lastCallAt = 0;

  constructor(minIntervalMs = 120) {
    this.minIntervalMs = minIntervalMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - now);
    if (wait > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, wait));
    }
    this.lastCallAt = Date.now();
  }
}
