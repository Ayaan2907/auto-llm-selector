import { input, number, confirm, select } from '@inquirer/prompts';
import type { PromptProperties, ModelSelectionStrategy } from '../types.js';
import { PRESETS } from './presets.js';
import type { ParsedTryArgs, PresetName } from './args.js';

export interface ResolvedRunConfig {
  prompt: string;
  properties: PromptProperties;
  strategy: ModelSelectionStrategy;
  selectorModel?: string;
  multiLabel: boolean;
  allow: string[];
  deny: string[];
}

/** Fields that can change between REPL iterations. */
export interface RepeatRunInput {
  prompt: string;
  properties: PromptProperties;
}

const CUSTOM_BASE: PromptProperties = {
  accuracy: 0.7,
  cost: 0.5,
  speed: 0.6,
  tokenLimit: 8000,
  reasoning: false,
};

export async function resolveRunConfig(
  args: ParsedTryArgs
): Promise<ResolvedRunConfig> {
  if (args.nonInteractive) return resolveNonInteractive(args);

  const preset =
    args.preset ??
    (await select<PresetName | 'custom'>({
      message: 'Use a preset?',
      choices: [
        { name: 'coding', value: 'coding' as const },
        { name: 'creative', value: 'creative' as const },
        { name: 'quick', value: 'quick' as const },
        { name: 'analytical', value: 'analytical' as const },
        { name: 'custom', value: 'custom' as const },
      ],
      default: 'custom' as const,
    }));

  const base: PromptProperties =
    preset === 'custom' ? { ...CUSTOM_BASE } : { ...PRESETS[preset] };

  const prompt =
    args.prompt ??
    (await input({
      message: 'Prompt:',
      validate: v => (v.trim().length === 0 ? 'Prompt is required' : true),
    }));

  const accuracy =
    args.accuracy ?? (await askUnit('Accuracy (0-1)', base.accuracy));
  const cost = args.cost ?? (await askUnit('Cost (0-1)', base.cost));
  const speed = args.speed ?? (await askUnit('Speed (0-1)', base.speed));
  const tokenLimit =
    args.tokenLimit ??
    (await number({
      message: 'Min context (tokens):',
      default: base.tokenLimit,
      min: 1,
    })) ??
    base.tokenLimit;
  const reasoning =
    args.reasoning ??
    (await confirm({
      message: 'Reasoning-only models?',
      default: base.reasoning,
    }));
  const multimodal =
    args.multimodal ??
    (await confirm({ message: 'Multimodal?', default: false }));
  const strategy =
    args.strategy ??
    (await select<ModelSelectionStrategy>({
      message: 'Selection strategy',
      choices: [
        { name: 'deterministic (fast, reproducible)', value: 'deterministic' },
        { name: 'llm (legacy meta-LLM chooser)', value: 'llm' },
      ],
      default: 'deterministic',
    }));
  const selectorModel =
    strategy === 'llm'
      ? (args.selectorModel ??
        (await input({
          message: 'Selector model id:',
          default: 'openai/gpt-4o-mini',
        })))
      : undefined;
  const multiLabel =
    args.multiLabel ??
    (await confirm({
      message: 'Multi-label classification?',
      default: false,
    }));
  const allow =
    args.allow ??
    (await csvPrompt('Allowed model patterns (CSV, blank for none):'));
  const deny =
    args.deny ??
    (await csvPrompt('Excluded model patterns (CSV, blank for none):'));

  return {
    prompt,
    properties: {
      accuracy,
      cost,
      speed,
      tokenLimit,
      reasoning,
      ...(multimodal && { multimodal: true }),
    },
    strategy,
    ...(selectorModel !== undefined && { selectorModel }),
    multiLabel,
    allow,
    deny,
  };
}

/**
 * Smaller wizard used on REPL iterations after the first run. Only re-prompts
 * prompt + PromptProperties; strategy / multi-label / allow / deny are fixed
 * for the session.
 */
export async function resolveRepeatRun(
  base: PromptProperties
): Promise<RepeatRunInput> {
  const prompt = await input({
    message: 'Prompt:',
    validate: v => (v.trim().length === 0 ? 'Prompt is required' : true),
  });
  const accuracy = await askUnit('Accuracy (0-1)', base.accuracy);
  const cost = await askUnit('Cost (0-1)', base.cost);
  const speed = await askUnit('Speed (0-1)', base.speed);
  const tokenLimit =
    (await number({
      message: 'Min context (tokens):',
      default: base.tokenLimit,
      min: 1,
    })) ?? base.tokenLimit;
  const reasoning = await confirm({
    message: 'Reasoning-only models?',
    default: base.reasoning,
  });
  const multimodal = await confirm({
    message: 'Multimodal?',
    default: base.multimodal ?? false,
  });
  return {
    prompt,
    properties: {
      accuracy,
      cost,
      speed,
      tokenLimit,
      reasoning,
      ...(multimodal && { multimodal: true }),
    },
  };
}

function resolveNonInteractive(args: ParsedTryArgs): ResolvedRunConfig {
  if (args.prompt === undefined) {
    throw new Error('--prompt is required in --non-interactive mode');
  }
  const base: PromptProperties = args.preset
    ? { ...PRESETS[args.preset] }
    : { ...CUSTOM_BASE };

  return {
    prompt: args.prompt,
    properties: {
      accuracy: args.accuracy ?? base.accuracy,
      cost: args.cost ?? base.cost,
      speed: args.speed ?? base.speed,
      tokenLimit: args.tokenLimit ?? base.tokenLimit,
      reasoning: args.reasoning ?? base.reasoning,
      ...(args.multimodal === true && { multimodal: true }),
    },
    strategy: args.strategy ?? 'deterministic',
    ...(args.selectorModel !== undefined && {
      selectorModel: args.selectorModel,
    }),
    multiLabel: args.multiLabel ?? false,
    allow: args.allow ?? [],
    deny: args.deny ?? [],
  };
}

async function askUnit(message: string, dflt: number): Promise<number> {
  const n = await number({
    message: `${message}:`,
    default: dflt,
    min: 0,
    max: 1,
  });
  return n ?? dflt;
}

async function csvPrompt(message: string): Promise<string[]> {
  const raw = await input({ message, default: '' });
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
