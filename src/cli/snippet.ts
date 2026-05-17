/* eslint-disable no-console */
import pc from 'picocolors';
import type { PromptProperties } from '../types.js';

type Painter = (s: string) => string;
interface Palette {
  bold: Painter;
  dim: Painter;
}

function palette(color: boolean): Palette {
  if (color) return { bold: pc.bold, dim: pc.dim };
  const id: Painter = s => s;
  return { bold: id, dim: id };
}

export interface SnippetInput {
  prompt: string;
  properties: PromptProperties;
  multiLabel?: boolean;
  allow?: string[];
  deny?: string[];
  strategy?: 'deterministic' | 'llm';
  selectorModel?: string;
  color: boolean;
}

export function printEquivalentSnippet(input: SnippetInput): void {
  const c = palette(input.color);
  const lines: string[] = [];

  lines.push(`import { AutoPromptRouter } from 'auto-llm-selector';`);
  lines.push('');
  const configLines: string[] = [
    `  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,`,
  ];
  if (input.strategy && input.strategy !== 'deterministic') {
    configLines.push(`  selectionStrategy: '${input.strategy}',`);
    if (input.selectorModel) {
      configLines.push(`  selectorModel: '${input.selectorModel}',`);
    }
  }
  if (input.multiLabel) configLines.push(`  multiLabelClassification: true,`);
  if (input.allow?.length) {
    configLines.push(`  allowedModelPatterns: ${JSON.stringify(input.allow)},`);
  }
  if (input.deny?.length) {
    configLines.push(`  excludedModelPatterns: ${JSON.stringify(input.deny)},`);
  }
  lines.push(`const router = new AutoPromptRouter({`);
  lines.push(...configLines);
  lines.push(`});`);
  lines.push(`await router.initialize();`);
  lines.push('');
  lines.push(`const result = await router.getModelRecommendation(`);
  lines.push(`  ${JSON.stringify(input.prompt)},`);
  lines.push(`  ${formatPropertiesLiteral(input.properties)},`);
  lines.push(`);`);
  lines.push(`console.log(result.model);`);

  const rule = c.dim('─'.repeat(60));
  console.log('');
  console.log(c.bold('Equivalent code:'));
  console.log(rule);
  for (const line of lines) console.log(line);
  console.log(rule);
}

function formatPropertiesLiteral(p: PromptProperties): string {
  const entries: string[] = [];
  entries.push(`accuracy: ${p.accuracy}`);
  entries.push(`cost: ${p.cost}`);
  entries.push(`speed: ${p.speed}`);
  entries.push(`tokenLimit: ${p.tokenLimit}`);
  entries.push(`reasoning: ${p.reasoning}`);
  if (p.multimodal !== undefined) entries.push(`multimodal: ${p.multimodal}`);
  if (p.qualityVsCost !== undefined)
    entries.push(`qualityVsCost: ${p.qualityVsCost}`);
  return `{ ${entries.join(', ')} }`;
}
