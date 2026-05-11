export type OutcomeQuality = 'good' | 'bad' | number;

/**
 * Lightweight in-process store for optional selection outcome feedback.
 * Useful for future calibration / training loops without requiring network I/O.
 */
export class OutcomeFeedbackStore {
  private readonly outcomes = new Map<
    string,
    { quality: number; recordedAt: number }
  >();

  report(selectionId: string, quality: OutcomeQuality): void {
    const numeric =
      typeof quality === 'number' ? quality : quality === 'good' ? 1 : 0;

    this.outcomes.set(selectionId, {
      quality: Math.max(0, Math.min(1, numeric)),
      recordedAt: Date.now(),
    });
  }

  get(
    selectionId: string
  ): { quality: number; recordedAt: number } | undefined {
    return this.outcomes.get(selectionId);
  }

  clear(): void {
    this.outcomes.clear();
  }
}
