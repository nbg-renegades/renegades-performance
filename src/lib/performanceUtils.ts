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
 * For time metrics: 0 = 2x best time, 100 = best time
 * For distance/reps: 0 = actual 0, 100 = best value
 */
export function normalizeMetrics(
  data: MetricData[],
  allData: MetricData[]
): NormalizedMetric[] {
  // Find best performance for each metric
  const bestValues = new Map<MetricType, number>();
  
  allData.forEach(item => {
    const current = bestValues.get(item.metric_type);
    const isLowerBetter = LOWER_IS_BETTER.includes(item.metric_type);
    
    if (current === undefined) {
      bestValues.set(item.metric_type, item.value);
    } else {
      if (isLowerBetter) {
        bestValues.set(item.metric_type, Math.min(current, item.value));
      } else {
        bestValues.set(item.metric_type, Math.max(current, item.value));
      }
    }
  });

  return data.map(item => {
    const bestValue = bestValues.get(item.metric_type);
    if (bestValue === undefined) {
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
      // For time metrics: baseline (0) = best * 2, best performance (100) = best
      const baseline = bestValue * 2;
      const range = baseline - bestValue;
      
      if (range === 0) {
        normalized = 100;
      } else {
        normalized = Math.max(0, Math.min(100, ((baseline - item.value) / range) * 100));
      }
    } else {
      // For distance/reps: baseline (0) = 0, best performance (100) = best value
      if (bestValue === 0) {
        normalized = 0;
      } else {
        normalized = Math.max(0, Math.min(100, (item.value / bestValue) * 100));
      }
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
