import type { ModelProfile, PromptProperties } from '../types.js';
import type { ModelCharacteristics } from '../types.js';
import {
  modelMatchesAnyPattern,
  modelMatchesExcludedPatterns,
} from './wildcard-match.js';

const SPEED_ORDER: ModelCharacteristics['speedTier'][] = [
  'slow',
  'medium',
  'fast',
  'ultra-fast',
];

const ACCURACY_ORDER: ModelCharacteristics['accuracyTier'][] = [
  'basic',
  'good',
  'high',
  'excellent',
];

const COST_ORDER: ModelCharacteristics['costTier'][] = [
  'free',
  'cheap',
  'moderate',
  'expensive',
  'premium',
];

function costTierIndex(tier: ModelCharacteristics['costTier']): number {
  return COST_ORDER.indexOf(tier);
}

/**
 * Maximum allowed cost tier index derived from cost sensitivity (0 = strict).
 */
function maxCostTierIndexFromCost(cost: number): number {
  if (cost <= 0.15) return 1; // free or cheap
  if (cost <= 0.35) return 2; // up to moderate
  if (cost <= 0.55) return 3; // up to expensive
  if (cost <= 0.75) return 4; // premium allowed
  return 4;
}

function minSpeedIndexFromSpeed(speed: number): number {
  if (speed >= 0.85) return SPEED_ORDER.indexOf('ultra-fast');
  if (speed >= 0.6) return SPEED_ORDER.indexOf('fast');
  if (speed >= 0.35) return SPEED_ORDER.indexOf('medium');
  return 0; // any speed
}

function minAccuracyIndexFromAccuracy(accuracy: number): number {
  if (accuracy >= 0.9) return ACCURACY_ORDER.indexOf('excellent');
  if (accuracy >= 0.75) return ACCURACY_ORDER.indexOf('high');
  if (accuracy >= 0.55) return ACCURACY_ORDER.indexOf('good');
  return ACCURACY_ORDER.indexOf('basic');
}

export type HardFilterOptions = {
  allowedModelPatterns?: string[];
  excludedModelPatterns?: string[];
};

/**
 * Hard filters that must pass before scoring or LLM selection.
 */
export function applyHardFilters(
  profiles: ModelProfile[],
  properties: PromptProperties,
  options: HardFilterOptions = {}
): ModelProfile[] {
  const { allowedModelPatterns = [], excludedModelPatterns = [] } = options;

  const maxCostTierIdx = maxCostTierIndexFromCost(properties.cost);
  const minSpeedIdx = minSpeedIndexFromSpeed(properties.speed);
  const minAccIdx = minAccuracyIndexFromAccuracy(properties.accuracy);

  return profiles.filter(profile => {
    if (
      properties.multimodal === true &&
      !profile.characteristics.isMultimodal
    ) {
      return false;
    }

    if (excludedModelPatterns.length > 0) {
      if (modelMatchesExcludedPatterns(profile.id, excludedModelPatterns)) {
        return false;
      }
    }

    if (allowedModelPatterns.length > 0) {
      if (!modelMatchesAnyPattern(profile.id, allowedModelPatterns)) {
        return false;
      }
    }

    if (
      Number.isFinite(properties.tokenLimit) &&
      properties.tokenLimit > 0 &&
      profile.contextLength < properties.tokenLimit
    ) {
      return false;
    }

    if (costTierIndex(profile.characteristics.costTier) > maxCostTierIdx) {
      return false;
    }

    const speedIdx = SPEED_ORDER.indexOf(profile.characteristics.speedTier);
    if (speedIdx < minSpeedIdx) {
      return false;
    }

    const accIdx = ACCURACY_ORDER.indexOf(profile.characteristics.accuracyTier);
    if (accIdx < minAccIdx) {
      return false;
    }

    return true;
  });
}
