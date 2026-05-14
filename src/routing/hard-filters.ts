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

export type HardFilterDropReason =
  | 'multimodal'
  | 'denyList'
  | 'allowList'
  | 'tokenLimit'
  | 'costTier'
  | 'speedTier'
  | 'accuracyTier';

export interface HardFilterResult {
  survivors: ModelProfile[];
  droppedReasons: Record<HardFilterDropReason, number>;
}

const ZERO_REASONS: Record<HardFilterDropReason, number> = {
  multimodal: 0,
  denyList: 0,
  allowList: 0,
  tokenLimit: 0,
  costTier: 0,
  speedTier: 0,
  accuracyTier: 0,
};

interface FilterContext {
  allowedModelPatterns: string[];
  excludedModelPatterns: string[];
  maxCostTierIdx: number;
  minSpeedIdx: number;
  minAccIdx: number;
}

function firstFailingReason(
  profile: ModelProfile,
  properties: PromptProperties,
  ctx: FilterContext
): HardFilterDropReason | null {
  if (properties.multimodal === true && !profile.characteristics.isMultimodal) {
    return 'multimodal';
  }
  if (
    ctx.excludedModelPatterns.length > 0 &&
    modelMatchesExcludedPatterns(profile.id, ctx.excludedModelPatterns)
  ) {
    return 'denyList';
  }
  if (
    ctx.allowedModelPatterns.length > 0 &&
    !modelMatchesAnyPattern(profile.id, ctx.allowedModelPatterns)
  ) {
    return 'allowList';
  }
  if (
    Number.isFinite(properties.tokenLimit) &&
    properties.tokenLimit > 0 &&
    profile.contextLength < properties.tokenLimit
  ) {
    return 'tokenLimit';
  }
  if (costTierIndex(profile.characteristics.costTier) > ctx.maxCostTierIdx) {
    return 'costTier';
  }
  if (
    SPEED_ORDER.indexOf(profile.characteristics.speedTier) < ctx.minSpeedIdx
  ) {
    return 'speedTier';
  }
  if (
    ACCURACY_ORDER.indexOf(profile.characteristics.accuracyTier) < ctx.minAccIdx
  ) {
    return 'accuracyTier';
  }
  return null;
}

/**
 * Hard filters that must pass before scoring or LLM selection. Returns survivors
 * plus a per-reason count of drops (first failing constraint attribution).
 */
export function applyHardFiltersDetailed(
  profiles: ModelProfile[],
  properties: PromptProperties,
  options: HardFilterOptions = {}
): HardFilterResult {
  const { allowedModelPatterns = [], excludedModelPatterns = [] } = options;
  const ctx: FilterContext = {
    allowedModelPatterns,
    excludedModelPatterns,
    maxCostTierIdx: maxCostTierIndexFromCost(properties.cost),
    minSpeedIdx: minSpeedIndexFromSpeed(properties.speed),
    minAccIdx: minAccuracyIndexFromAccuracy(properties.accuracy),
  };

  const survivors: ModelProfile[] = [];
  const droppedReasons: Record<HardFilterDropReason, number> = {
    ...ZERO_REASONS,
  };

  for (const profile of profiles) {
    const reason = firstFailingReason(profile, properties, ctx);
    if (reason === null) {
      survivors.push(profile);
    } else {
      droppedReasons[reason] += 1;
    }
  }

  return { survivors, droppedReasons };
}

/**
 * Backwards-compatible thin wrapper returning only the survivors.
 */
export function applyHardFilters(
  profiles: ModelProfile[],
  properties: PromptProperties,
  options: HardFilterOptions = {}
): ModelProfile[] {
  return applyHardFiltersDetailed(profiles, properties, options).survivors;
}
