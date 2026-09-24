/**
 * The metric table for the edge functions.
 *
 * Deno cannot import from src/, so this is a transcription of src/lib/metrics.ts rather
 * than a re-export. Change one, change the other - and note that `direction` also has to
 * agree with the ordering CASE in
 * supabase/migrations/20260924110000_best_daily_entries_time_metrics.sql. That migration
 * exists because those three encodings had already drifted apart: the SQL was still
 * ranking '40yd_dash', a name the enum had replaced, so "best of day" returned the
 * slowest 30-Yard Dash and 3-Cone Drill instead of the fastest.
 *
 * Before this file, get-dashboard-stats, get-performance-benchmarks,
 * get-performance-averages and get-player-neighborhood each carried their own list.
 */

export type MetricType =
  | 'vertical_jump'
  | 'jump_gather'
  | '30yd_dash'
  | '3_cone_drill'
  | 'shuttle_5_10_5'
  | 'pushups_1min';

export interface MetricDefinition {
  key: MetricType;
  label: string;
  unit: 'cm' | 's' | 'reps';
  direction: 'higher' | 'lower';
}

export const METRICS: Record<MetricType, MetricDefinition> = {
  vertical_jump: { key: 'vertical_jump', label: 'Vertical Jump', unit: 'cm', direction: 'higher' },
  jump_gather: { key: 'jump_gather', label: 'Jump w. Gather Step', unit: 'cm', direction: 'higher' },
  '30yd_dash': { key: '30yd_dash', label: '30-Yard Dash', unit: 's', direction: 'lower' },
  '3_cone_drill': { key: '3_cone_drill', label: '3-Cone Drill', unit: 's', direction: 'lower' },
  shuttle_5_10_5: { key: 'shuttle_5_10_5', label: '5-10-5 Shuttle', unit: 's', direction: 'lower' },
  pushups_1min: { key: 'pushups_1min', label: 'Push-Ups (1 Min AMRAP)', unit: 'reps', direction: 'higher' },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricType[];

export function isMetricType(value: string): value is MetricType {
  return value in METRICS;
}

export function isLowerBetter(key: string): boolean {
  return isMetricType(key) && METRICS[key].direction === 'lower';
}

export function metricLabel(key: string): string {
  return isMetricType(key) ? METRICS[key].label : key;
}

export function metricUnit(key: string): string {
  return isMetricType(key) ? METRICS[key].unit : '';
}

/** The better of two values for this metric. */
export function betterOf(key: string, a: number, b: number): number {
  return isLowerBetter(key) ? Math.min(a, b) : Math.max(a, b);
}
