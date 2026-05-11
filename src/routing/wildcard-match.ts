/**
 * Match OpenRouter-style model patterns (e.g. anthropic/*, openai/gpt-5*).
 * `*` matches any substring; other regex metacharacters are escaped.
 */
export function modelMatchesAnyPattern(
  modelId: string,
  patterns: string[]
): boolean {
  if (patterns.length === 0) return true;
  return patterns.some(pattern => modelMatchesPattern(modelId, pattern));
}

export function modelMatchesExcludedPatterns(
  modelId: string,
  patterns: string[]
): boolean {
  if (patterns.length === 0) return false;
  return patterns.some(pattern => modelMatchesPattern(modelId, pattern));
}

function modelMatchesPattern(modelId: string, pattern: string): boolean {
  const regex = patternToRegex(pattern);
  return regex.test(modelId);
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
