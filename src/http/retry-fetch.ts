/* eslint-env node */
import { Logger } from '../utils/logger.js';

const logger = new Logger('RetryFetch');

export type RetryFetchOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** HTTP status codes that trigger a retry */
  retryOnStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * fetch with exponential backoff for transient failures.
 */
export async function fetchWithRetry(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  options: RetryFetchOptions = {}
): Promise<Awaited<ReturnType<typeof fetch>>> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const retryOnStatuses = new Set(
    options.retryOnStatuses ?? DEFAULT_RETRY_STATUSES
  );

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(input, init);

      if (retryOnStatuses.has(response.status) && attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        logger.warn(
          `HTTP ${response.status} on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        logger.warn(
          `Network error on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`,
          error
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
