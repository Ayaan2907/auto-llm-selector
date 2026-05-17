import { createHash } from 'node:crypto';

/**
 * Stable cache key for arbitrary text (embeddings, classifications).
 * Uses SHA-256 to avoid birthday collisions from short hashes.
 */
export function createStableTextCacheKey(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
