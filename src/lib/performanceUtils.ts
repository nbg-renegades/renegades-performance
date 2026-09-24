/**
 * Normalisation for the radar comparison. The metric table itself lives in ./metrics -
 * this module only holds the 0-100 scaling built on top of it.
 */
import {
  METRICS,
  METRIC_KEYS,
  bestOf,
  isLowerBetter,
  metricLabel,
  metricUnit,
  type MetricType,
} from './metrics';

export type { MetricType } from './metrics';

export interface MetricData {
  metric_type: MetricType;
  value: number;
}

export interface NormalizedMetric {
  metric: string;
  value: number;
  rawValue: number;
  unit: string;
}

/**
 * Kept so existing call sites keep working; both are projections of METRICS, so there is
 * nothing here that can drift from it.
 */
export const METRIC_LABELS: Record<MetricType, string> = Object.fromEntries(
  METRIC_KEYS.map((k) => [k, METRICS[k].label]),
) as Record<MetricType, string>;

export const METRIC_UNITS: Record<MetricType, string> = Object.fromEntries(
  METRIC_KEYS.map((k) => [k, METRICS[k].unit]),
) as Record<MetricType, string>;

/**
 * Normalize metrics to a 0-100 scale where 100 is always best.
 *
 * 100 is the best value in `allData`. 0 is that best scaled by the metric's
 * baselineFactor: 1.4x the best time, half the best jump, a fifth of the best rep count.
 */
export function normalizeMetrics(
  data: MetricData[],
  allData: MetricData[],
): NormalizedMetric[] {
  const bestValues = new Map<MetricType, number>();
  for (const key of METRIC_KEYS) {
    const values = allData.filter((d) => d.metric_type === key).map((d) => d.value);
    const best = bestOf(key, values);
    if (best !== undefined) bestValues.set(key, best);
  }

  return data.map((item) => {
    const shared = {
      metric: metricLabel(item.metric_type),
      rawValue: item.value,
      unit: metricUnit(item.metric_type),
    };

    const bestValue = bestValues.get(item.metric_type);
    if (bestValue === undefined) return { ...shared, value: 50 };

    const baseline = bestValue * METRICS[item.metric_type].baselineFactor;
    const range = isLowerBetter(item.metric_type)
      ? baseline - bestValue
      : bestValue - baseline;

    if (range === 0) return { ...shared, value: 100 };

    const distanceFromBaseline = isLowerBetter(item.metric_type)
      ? baseline - item.value
      : item.value - baseline;

    return {
      ...shared,
      value: Math.round(Math.max(0, Math.min(100, (distanceFromBaseline / range) * 100))),
    };
  });
}

/** Get all metric types as array */
export function getAllMetricTypes(): MetricType[] {
  return METRIC_KEYS;
}

/** Create empty metric set with all metrics at 0 */
export function createEmptyMetricSet(): NormalizedMetric[] {
  return METRIC_KEYS.map((type) => ({
    metric: metricLabel(type),
    value: 0,
    rawValue: 0,
    unit: metricUnit(type),
  }));
}
