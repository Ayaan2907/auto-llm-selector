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
  yellow: Painter;
}

function palette(color: boolean): Palette {
  if (color) {
    return {
      bold: pc.bold,
      dim: pc.dim,
      cyan: pc.cyan,
      green: pc.green,
      yellow: pc.yellow,
    };
  }
  const id: Painter = s => s;
  return { bold: id, dim: id, cyan: id, green: id, yellow: id };
}

const FILTER_COACHING: Record<string, string> = {
  multimodal: 'try unchecking "Multimodal?"',
  denyList: 'loosen --deny (too many models match the deny patterns)',
  allowList: 'loosen --allow (no allowed models survived earlier filters)',
  tokenLimit: 'lower the minimum context tokens',
  costTier: 'raise the cost knob (allow pricier tiers)',
  speedTier: 'lower the speed knob (accept slower tiers)',
  accuracyTier: 'lower the accuracy knob (accept lower-tier models)',
};

const HUMAN_DROP_REASON: Record<string, string> = {
  multimodal: 'multimodal',
  denyList: 'deny list',
  allowList: 'allow list',
  tokenLimit: 'context window',
  costTier: 'cost tier',
  speedTier: 'speed tier',
  accuracyTier: 'accuracy tier',
};

export function buildTelemetryHooks(
  opts: RendererOptions
): RouterTelemetryHooks {
  const c = palette(opts.color);
  const arrow = c.cyan('▸');
  // Dedupe the back-to-back catalog line (initialize + first recommendation
  // fire within ~1 ms of each other on the first run). If a second emission
  // arrives within DEDUPE_MS, skip it.
  const DEDUPE_MS = 200;
  let lastCatalogPrintedAt = 0;

  return {
    onCatalogLoaded: e => {
      const now = Date.now();
      if (now - lastCatalogPrintedAt < DEDUPE_MS) return;
      lastCatalogPrintedAt = now;

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

      if (e.after === 0 && e.before > 0) {
        printZeroSurvivorHelp(c, e.stage, e.droppedReasons);
      }
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

function printZeroSurvivorHelp(
  c: Palette,
  stage: 'reasoning' | 'category-threshold' | 'hard-filters',
  droppedReasons: Record<string, number> | undefined
): void {
  console.log('');
  console.log(c.yellow('  ⚠ No candidates survived this stage.'));

  if (stage === 'reasoning') {
    console.log(
      c.dim(
        '    Reason: the reasoning-only filter eliminated every model. Try unchecking "Reasoning-only" or lowering accuracy.'
      )
    );
    return;
  }

  if (stage === 'category-threshold') {
    console.log(
      c.dim(
        '    Reason: no model scored ≥0.3 for the classified category. The classifier may have misrouted the prompt — try --multi-label or rephrase.'
      )
    );
    return;
  }

  if (!droppedReasons) return;
  const ranked = Object.entries(droppedReasons)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return;

  const [reason, count] = top;
  const label = HUMAN_DROP_REASON[reason] ?? reason;
  const suggestion = FILTER_COACHING[reason];
  const tail = suggestion ? ` — ${suggestion}` : '';
  console.log(
    c.dim(`    Biggest blocker: ${c.bold(label)} (${count} dropped)${tail}`)
  );
  if (ranked.length > 1) {
    const others = ranked
      .slice(1)
      .map(([k, n]) => `${HUMAN_DROP_REASON[k] ?? k} (${n})`)
      .join(' · ');
    console.log(c.dim(`    Other drops: ${others}`));
  }
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
