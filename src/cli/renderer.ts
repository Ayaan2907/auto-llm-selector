/* eslint-disable no-console */
import pc from 'picocolors';
import type { RouterTelemetryHooks, PromptType } from '../types.js';

export interface RendererOptions {
  color: boolean;
}

type Painter = (s: string) => string;
interface Palette {
  bold: Painter;
  dim: Painter;
  cyan: Painter;
  green: Painter;
}

function palette(color: boolean): Palette {
  if (color) {
    return { bold: pc.bold, dim: pc.dim, cyan: pc.cyan, green: pc.green };
  }
  const id: Painter = s => s;
  return { bold: id, dim: id, cyan: id, green: id };
}

export function buildTelemetryHooks(
  opts: RendererOptions
): RouterTelemetryHooks {
  const c = palette(opts.color);
  const arrow = c.cyan('▸');

  return {
    onCatalogLoaded: e => {
      const age =
        e.cacheAgeMs !== undefined
          ? ` (${e.fromCache ? 'from cache, age ' : ''}${formatMs(e.cacheAgeMs)})`
          : '';
      console.log(
        `${arrow} catalog: ${c.bold(String(e.totalProfiles))} profiles loaded${age}`
      );
    },
    onClassified: e => {
      const weights = e.multiLabelWeights
        ? '  ' + c.dim(formatWeights(e.multiLabelWeights))
        : '';
      console.log(
        `${arrow} classified: ${c.bold(e.category.type)} (${(e.category.confidence * 100).toFixed(0)}%)${weights}`
      );
    },
    onFilterStage: e => {
      const label = labelForStage(e.stage);
      const reasons =
        e.droppedReasons && Object.keys(e.droppedReasons).length > 0
          ? '  ' + c.dim(formatReasons(e.droppedReasons))
          : '';
      console.log(
        `${arrow} ${label}: ${e.before} → ${c.bold(String(e.after))}${reasons}`
      );
    },
    onCandidatesRanked: e => {
      console.log(`${arrow} ranked top ${e.topN.length} (${e.strategy}):`);
      e.topN.forEach((cand, i) => {
        console.log(
          `    ${i + 1}. ${c.bold(cand.id)}   ${cand.score.toFixed(2)}   ${c.dim(cand.reason)}`
        );
      });
    },
    onModelSelected: e => {
      const sid = e.selectionId
        ? `  ${c.dim(`(selectionId: ${e.selectionId.slice(0, 8)}…)`)}`
        : '';
      console.log(
        `${arrow} ${c.green('selected:')} ${c.bold(e.modelId)}${sid}`
      );
    },
  };
}

export function renderHeader(opts: RendererOptions, title: string): void {
  const c = palette(opts.color);
  console.log(c.bold(`\nauto-llm-selector — ${title}\n`));
}

function labelForStage(
  stage: 'reasoning' | 'category-threshold' | 'hard-filters'
): string {
  if (stage === 'reasoning') return 'reasoning filter        ';
  if (stage === 'category-threshold') return 'category threshold ≥0.3 ';
  return 'hard filters            ';
}

function formatReasons(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} by ${k}`)
    .join(' · ');
}

function formatWeights(weights: Partial<Record<PromptType, number>>): string {
  return Object.entries(weights)
    .filter(([, v]) => (v ?? 0) > 0.05)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => `${k}:${((v ?? 0) * 100).toFixed(0)}%`)
    .join(' · ');
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}
