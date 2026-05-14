import type { ModelSelectionStrategy } from '../types.js';

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgError';
  }
}

export type PresetName = 'coding' | 'creative' | 'quick' | 'analytical';

export interface ParsedTryArgs {
  prompt?: string;
  preset?: PresetName;
  accuracy?: number;
  cost?: number;
  speed?: number;
  tokenLimit?: number;
  reasoning?: boolean;
  multimodal?: boolean;
  strategy?: ModelSelectionStrategy;
  selectorModel?: string;
  multiLabel?: boolean;
  allow?: string[];
  deny?: string[];
  nonInteractive?: boolean;
  repeat?: boolean;
  color?: boolean;
  help?: boolean;
  version?: boolean;
}

const FLAGS = new Set([
  '--prompt',
  '--preset',
  '--accuracy',
  '--cost',
  '--speed',
  '--token-limit',
  '--reasoning',
  '--multimodal',
  '--strategy',
  '--selector-model',
  '--multi-label',
  '--allow',
  '--deny',
  '--non-interactive',
  '--repeat',
  '--no-color',
  '-h',
  '--help',
  '-v',
  '--version',
]);

function unit(name: string, raw: string | undefined): number {
  if (raw === undefined) throw new ArgError(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new ArgError(`${name} must be a number in [0, 1] (got ${raw})`);
  }
  return n;
}

function positiveInt(name: string, raw: string | undefined): number {
  if (raw === undefined) throw new ArgError(`${name} requires a value`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ArgError(`${name} must be a positive integer (got ${raw})`);
  }
  return n;
}

function csv(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function parseTryArgs(argv: string[]): ParsedTryArgs {
  const out: ParsedTryArgs = {};
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i]!;
    if (!FLAGS.has(flag)) {
      throw new ArgError(`unknown flag: ${flag}`);
    }
    const next = argv[i + 1];
    switch (flag) {
      case '--prompt':
        if (next === undefined) throw new ArgError('--prompt requires a value');
        out.prompt = next;
        i += 2;
        break;
      case '--preset': {
        if (
          next !== 'coding' &&
          next !== 'creative' &&
          next !== 'quick' &&
          next !== 'analytical'
        ) {
          throw new ArgError(
            '--preset must be one of coding|creative|quick|analytical'
          );
        }
        out.preset = next;
        i += 2;
        break;
      }
      case '--accuracy':
        out.accuracy = unit('--accuracy', next);
        i += 2;
        break;
      case '--cost':
        out.cost = unit('--cost', next);
        i += 2;
        break;
      case '--speed':
        out.speed = unit('--speed', next);
        i += 2;
        break;
      case '--token-limit':
        out.tokenLimit = positiveInt('--token-limit', next);
        i += 2;
        break;
      case '--reasoning': {
        const isValue = next === 'true' || next === 'false';
        out.reasoning = isValue ? next === 'true' : true;
        i += isValue ? 2 : 1;
        break;
      }
      case '--multimodal':
        out.multimodal = true;
        i += 1;
        break;
      case '--strategy': {
        if (next !== 'deterministic' && next !== 'llm' && next !== 'det') {
          throw new ArgError('--strategy must be deterministic|llm');
        }
        out.strategy = next === 'det' ? 'deterministic' : next;
        i += 2;
        break;
      }
      case '--selector-model':
        if (next === undefined)
          throw new ArgError('--selector-model requires a value');
        out.selectorModel = next;
        i += 2;
        break;
      case '--multi-label':
        out.multiLabel = true;
        i += 1;
        break;
      case '--allow':
        out.allow = csv(next);
        i += 2;
        break;
      case '--deny':
        out.deny = csv(next);
        i += 2;
        break;
      case '--non-interactive':
        out.nonInteractive = true;
        i += 1;
        break;
      case '--repeat':
        out.repeat = true;
        i += 1;
        break;
      case '--no-color':
        out.color = false;
        i += 1;
        break;
      case '-h':
      case '--help':
        out.help = true;
        i += 1;
        break;
      case '-v':
      case '--version':
        out.version = true;
        i += 1;
        break;
    }
  }
  return out;
}

export function helpText(): string {
  return `als try [options]

  --prompt <text>              Prompt text
  --preset <name>              coding | creative | quick | analytical
  --accuracy <0-1>
  --cost <0-1>
  --speed <0-1>
  --token-limit <n>
  --reasoning [true|false]
  --multimodal
  --strategy <det|llm>         deterministic (default) or llm
  --selector-model <id>
  --multi-label
  --allow <pattern,...>
  --deny <pattern,...>
  --non-interactive            Fail if any required field is missing
  --repeat                     Loop the wizard (embeddings stay warm)
  --no-color
  -h, --help
  -v, --version
`;
}
