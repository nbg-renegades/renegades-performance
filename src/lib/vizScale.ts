/**
 * The mapping from a number to a colour, in one place.
 *
 * Kept apart from the components that use it so that the scale is a value a test can assert
 * on, and so no screen can quietly invent its own thresholds. The tokens themselves, and the
 * reasoning behind choosing them, live in src/index.css.
 */

import type { MetricStatus } from './analytics';

/** The ordinal ramp, bottom of the squad first. */
export const RANK_STEPS = [
  'var(--viz-rank-1)',
  'var(--viz-rank-2)',
  'var(--viz-rank-3)',
  'var(--viz-rank-4)',
  'var(--viz-rank-5)',
] as const;

/**
 * Which step of the ramp a percentile falls in, in even fifths.
 *
 * Five buckets rather than a continuous interpolation: the steps were validated as a set for
 * monotone lightness and visible gaps between neighbours, and interpolating between them
 * would produce values nothing has checked.
 */
export function rankStep(percentile: number): string {
  const clamped = Math.max(0, Math.min(100, percentile));
  const bucket = Math.min(RANK_STEPS.length - 1, Math.floor(clamped / 20));
  return RANK_STEPS[bucket];
}

/** Plain-language bands, so a percentile is never colour-only. */
export function rankLabel(percentile: number): string {
  if (percentile >= 80) return 'Top of squad';
  if (percentile >= 60) return 'Upper half';
  if (percentile >= 40) return 'Mid squad';
  if (percentile >= 20) return 'Lower half';
  return 'Bottom of squad';
}

export interface StatusPresentation {
  label: string;
  /** A CSS colour for the icon or dot. Never used for small text. */
  color: string;
}

export function statusPresentation(status: MetricStatus): StatusPresentation {
  switch (status) {
    case 'current':
      return { label: 'Up to date', color: 'var(--viz-good)' };
    case 'stale':
      return { label: 'Stale', color: 'var(--viz-warning)' };
    case 'missing':
      return { label: 'Never tested', color: 'var(--viz-critical)' };
  }
}

/**
 * Improvement is good, regression is "serious" rather than "critical".
 *
 * That is not a euphemism: critical does not clear the 4.5:1 contrast a small number needs
 * on this app's surfaces, and it is reserved for a metric that was never measured at all.
 */
export function deltaColor(improvement: number): string {
  if (improvement > 0) return 'var(--viz-good)';
  if (improvement < 0) return 'var(--viz-serious)';
  return 'var(--muted-foreground-color, hsl(var(--muted-foreground)))';
}
