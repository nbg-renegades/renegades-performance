/**
 * The one definition of what a performance metric is.
 *
 * This used to be spread across four places in the client - a `metricDisplayNames` map in
 * Performance.tsx, METRIC_LABELS/METRIC_UNITS in a performanceUtils module, a local METRICS
 * in PlayerPerformanceChart, and a `unitMap` inside the add-entry handler - plus a separate
 * copy in each edge function and a third encoding of "lower is better" in SQL. They had
 * already drifted: Performance.tsx baked the unit into the label and the others did not,
 * and get_best_daily_entries() was still ranking a metric name the enum had dropped, which
 * meant the app showed the *slowest* 30-Yard Dash and 3-Cone Drill of each day as the best.
 *
 * Adding a metric should be one entry here. The edge functions keep their own copy in
 * supabase/functions/_shared/metrics.ts because Deno cannot import from src/, but it is a
 * direct transcription of this table and the two carry pointers to each other.
 *
 * `direction` is the part that must never disagree with
 * supabase/migrations/20260924110000_best_daily_entries_time_metrics.sql.
 */

export type MetricType =
  | 'vertical_jump'
  | 'jump_gather'
  | '30yd_dash'
  | '3_cone_drill'
  | 'shuttle_5_10_5'
  | 'pushups_1min';

export type MetricUnit = 'cm' | 's' | 'reps';

export interface MetricDefinition {
  key: MetricType;
  /** What a person calls it. No unit - use `metricLabelWithUnit` when the unit matters. */
  label: string;
  unit: MetricUnit;
  /** Which way is better. Times are `lower`; distances and rep counts are `higher`. */
  direction: 'higher' | 'lower';
  /** Input granularity, and the number of decimals a value is rendered with. */
  step: number;
  precision: number;
}

export const METRICS: Record<MetricType, MetricDefinition> = {
  vertical_jump: {
    key: 'vertical_jump',
    label: 'Vertical Jump',
    unit: 'cm',
    direction: 'higher',
    step: 1,
    precision: 0,
  },
  jump_gather: {
    key: 'jump_gather',
    label: 'Jump w. Gather Step',
    unit: 'cm',
    direction: 'higher',
    step: 1,
    precision: 0,
  },
  '30yd_dash': {
    key: '30yd_dash',
    label: '30-Yard Dash',
    unit: 's',
    direction: 'lower',
    step: 0.01,
    precision: 2,
  },
  '3_cone_drill': {
    key: '3_cone_drill',
    label: '3-Cone Drill',
    unit: 's',
    direction: 'lower',
    step: 0.01,
    precision: 2,
  },
  shuttle_5_10_5: {
    key: 'shuttle_5_10_5',
    label: '5-10-5 Shuttle',
    unit: 's',
    direction: 'lower',
    step: 0.01,
    precision: 2,
  },
  pushups_1min: {
    key: 'pushups_1min',
    label: 'Push-Ups (1 Min AMRAP)',
    unit: 'reps',
    direction: 'higher',
    step: 1,
    precision: 0,
  },
};

/** Every metric, in the order they should be offered and listed. */
export const METRIC_KEYS = Object.keys(METRICS) as MetricType[];

export const METRIC_OPTIONS: MetricDefinition[] = METRIC_KEYS.map((k) => METRICS[k]);

export function isMetricType(value: string): value is MetricType {
  return value in METRICS;
}

export function metricLabel(key: MetricType | string): string {
  return isMetricType(key) ? METRICS[key].label : key;
}

export function metricUnit(key: MetricType | string): string {
  return isMetricType(key) ? METRICS[key].unit : '';
}

/** "30-Yard Dash [s]" - the form used in dropdowns and axis titles. */
export function metricLabelWithUnit(key: MetricType | string): string {
  return isMetricType(key) ? `${METRICS[key].label} [${METRICS[key].unit}]` : String(key);
}

export function isLowerBetter(key: MetricType | string): boolean {
  return isMetricType(key) && METRICS[key].direction === 'lower';
}

/** Renders a value at the metric's own precision: 4.12 for a time, 58 for a jump. */
export function formatMetricValue(key: MetricType | string, value: number): string {
  return isMetricType(key) ? value.toFixed(METRICS[key].precision) : String(value);
}

/** Value plus unit, e.g. "4.12 s". */
export function formatMetricValueWithUnit(key: MetricType | string, value: number): string {
  const unit = metricUnit(key);
  return unit ? `${formatMetricValue(key, value)} ${unit}` : formatMetricValue(key, value);
}

/** The better of two values for this metric. */
export function betterOf(key: MetricType | string, a: number, b: number): number {
  return isLowerBetter(key) ? Math.min(a, b) : Math.max(a, b);
}

/** The best value in a set, or undefined when the set is empty. */
export function bestOf(key: MetricType | string, values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((best, v) => betterOf(key, best, v));
}
