import type { PromptProperties } from '../types.js';
import type { ModelCharacteristics } from '../types.js';

export type RankRequirements = {
  maxCost?: number;
  minSpeed?: ModelCharacteristics['speedTier'];
  minAccuracy?: ModelCharacteristics['accuracyTier'];
  needsReasoning?: boolean;
};

/**
 * Map normalized PromptProperties (0-1) to discrete filter thresholds
 * used by ModelProfiler ranking / filtering.
 */
export function buildRankRequirementsFromProperties(
  properties: PromptProperties
): RankRequirements {
  const req: RankRequirements = {};

  if (properties.reasoning === true) {
    req.needsReasoning = true;
  }

  // cost: 0 = very cost sensitive, 1 = cost no object
  if (properties.cost <= 0.15) {
    req.maxCost = 0.000015;
  } else if (properties.cost <= 0.35) {
    req.maxCost = 0.00008;
  } else if (properties.cost <= 0.55) {
    req.maxCost = 0.00035;
  } else if (properties.cost <= 0.75) {
    req.maxCost = 0.002;
  } else {
    // high budget: no max cost cap
  }

  // speed: 0 = slow ok, 1 = need fast
  if (properties.speed >= 0.85) {
    req.minSpeed = 'ultra-fast';
  } else if (properties.speed >= 0.6) {
    req.minSpeed = 'fast';
  } else if (properties.speed >= 0.35) {
    req.minSpeed = 'medium';
  }

  // accuracy: 0 = basic ok, 1 = highest accuracy needed
  if (properties.accuracy >= 0.9) {
    req.minAccuracy = 'excellent';
  } else if (properties.accuracy >= 0.75) {
    req.minAccuracy = 'high';
  } else if (properties.accuracy >= 0.55) {
    req.minAccuracy = 'good';
  }

  return req;
}
