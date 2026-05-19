import type { PromptProperties } from '../types.js';
import type { PresetName } from './args.js';

/** Default PromptProperties budgets per internal AI surface (see README preset table). */
export const PRESETS: Record<PresetName, PromptProperties> = {
  coding: {
    accuracy: 0.85,
    cost: 0.45,
    speed: 0.6,
    tokenLimit: 16000,
    reasoning: true,
  },
  creative: {
    accuracy: 0.7,
    cost: 0.4,
    speed: 0.4,
    tokenLimit: 8000,
    reasoning: false,
  },
  quick: {
    accuracy: 0.55,
    cost: 0.15,
    speed: 0.85,
    tokenLimit: 4000,
    reasoning: false,
  },
  analytical: {
    accuracy: 0.85,
    cost: 0.5,
    speed: 0.55,
    tokenLimit: 12000,
    reasoning: true,
  },
};

export function presetToProperties(name: PresetName): PromptProperties {
  return { ...PRESETS[name] };
}

export const PRESET_NAMES: ReadonlyArray<PresetName> = [
  'coding',
  'creative',
  'quick',
  'analytical',
];
