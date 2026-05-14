/**
 * Simple spacing-based rate limiter for outbound OpenRouter calls.
 * Avoids bursty traffic that can trigger 429s.
 * Serializes callers so concurrent acquire() still respects spacing.
 */
export class OpenRouterRateLimiter {
  private minIntervalMs: number;
  private lastCallAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(minIntervalMs = 120) {
    this.minIntervalMs = minIntervalMs;
  }

  async acquire(): Promise<void> {
    this.chain = this.chain.then(() => this.waitForNextSlot());
    await this.chain;
  }

  private async waitForNextSlot(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.lastCallAt + this.minIntervalMs - now);
    if (wait > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, wait));
    }
    this.lastCallAt = Date.now();
  }
}
