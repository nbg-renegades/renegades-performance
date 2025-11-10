export type MetricType = 'vertical_jump' | 'broad_jump' | '40yd_dash' | '3cone_drill' | 'shuffle_run' | 'pushups_1min';

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

// Metrics where lower is better (time-based)
const LOWER_IS_BETTER: MetricType[] = ['40yd_dash', '3cone_drill', 'shuffle_run'];

// User-friendly metric labels
export const METRIC_LABELS: Record<MetricType, string> = {
  'vertical_jump': 'Vertical Jump',
  'broad_jump': 'Broad Jump',
  '40yd_dash': '40yd Dash',
  '3cone_drill': '3-Cone Drill',
  'shuffle_run': 'Shuffle Run',
  'pushups_1min': 'Pushups (1min)'
};

export const METRIC_UNITS: Record<MetricType, string> = {
  'vertical_jump': 'cm',
  'broad_jump': 'cm',
  '40yd_dash': 's',
  '3cone_drill': 's',
  'shuffle_run': 's',
  'pushups_1min': 'reps'
};

/**
 * Normalize metrics to 0-100 scale where 100 is always best
 */
export function normalizeMetrics(
  data: MetricData[],
  allData: MetricData[]
): NormalizedMetric[] {
  // Calculate min/max for each metric across all data
  const ranges = new Map<MetricType, { min: number; max: number }>();
  
  allData.forEach(item => {
    const current = ranges.get(item.metric_type);
    if (!current) {
      ranges.set(item.metric_type, { min: item.value, max: item.value });
    } else {
      ranges.set(item.metric_type, {
        min: Math.min(current.min, item.value),
        max: Math.max(current.max, item.value)
      });
    }
  });

  return data.map(item => {
    const range = ranges.get(item.metric_type);
    if (!range || range.max === range.min) {
      return {
        metric: METRIC_LABELS[item.metric_type],
        value: 50,
        rawValue: item.value,
        unit: METRIC_UNITS[item.metric_type]
      };
    }

    let normalized: number;
    const isLowerBetter = LOWER_IS_BETTER.includes(item.metric_type);

    if (isLowerBetter) {
      // For time-based metrics, lower is better
      normalized = ((range.max - item.value) / (range.max - range.min)) * 100;
    } else {
      // For distance/reps metrics, higher is better
      normalized = ((item.value - range.min) / (range.max - range.min)) * 100;
    }

    return {
      metric: METRIC_LABELS[item.metric_type],
      value: Math.round(normalized),
      rawValue: item.value,
      unit: METRIC_UNITS[item.metric_type]
    };
  });
}

/**
 * Get all metric types as array
 */
export function getAllMetricTypes(): MetricType[] {
  return Object.keys(METRIC_LABELS) as MetricType[];
}

/**
 * Create empty metric set with all metrics at 0
 */
export function createEmptyMetricSet(): NormalizedMetric[] {
  return getAllMetricTypes().map(type => ({
    metric: METRIC_LABELS[type],
    value: 0,
    rawValue: 0,
    unit: METRIC_UNITS[type]
  }));
}
