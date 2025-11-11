import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMetrics, getAllMetricTypes, type MetricData, type NormalizedMetric } from '@/lib/performanceUtils';

export type ComparisonMode = 'best' | 'position' | 'offense' | 'defense';

export interface ComparisonData {
  [key: string]: NormalizedMetric[];
}

interface UsePerformanceComparisonProps {
  mode: ComparisonMode;
  selectedPosition?: string;
  currentUserId: string;
  userRole: string;
}

export function usePerformanceComparison({
  mode,
  selectedPosition,
  currentUserId,
  userRole
}: UsePerformanceComparisonProps) {
  const [data, setData] = useState<ComparisonData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [allMetricsData, setAllMetricsData] = useState<MetricData[]>([]);

  useEffect(() => {
    fetchComparisonData();
  }, [mode, selectedPosition, currentUserId]);

  async function fetchComparisonData() {
    setIsLoading(true);
    try {
      // Guard against empty player IDs
      if (!currentUserId || currentUserId.trim() === '') {
        console.warn('No valid player ID provided');
        setIsLoading(false);
        return;
      }

      // Always try to show current user's data (regardless of role)
      const currentData = await fetchLatestPlayerMetrics(currentUserId);
      
      // Fetch benchmark data from backend endpoint
      const { data: benchmarkResponse, error: benchmarkError } = await supabase.functions.invoke(
        'get-performance-benchmarks',
        {
          body: {
            mode,
            position: selectedPosition
          }
        }
      );

      if (benchmarkError) {
        console.error('Error fetching benchmarks:', benchmarkError);
        setIsLoading(false);
        return;
      }

      const { benchmarks, allData } = benchmarkResponse;
      
      if (!allData) {
        setIsLoading(false);
        return;
      }

      setAllMetricsData(allData as MetricData[]);

      const result: ComparisonData = {};

      // Add current user's data
      if (currentData.length > 0) {
        result['You'] = normalizeMetrics(currentData, allData as MetricData[]);
      }

      // Add comparison benchmark based on mode
      if (benchmarks && benchmarks.length > 0) {
        let benchmarkLabel = '';
        switch (mode) {
          case 'best':
            benchmarkLabel = 'Best Overall';
            break;
          case 'position':
            benchmarkLabel = `Best ${selectedPosition}`;
            break;
          case 'offense':
            benchmarkLabel = 'Best Offense';
            break;
          case 'defense':
            benchmarkLabel = 'Best Defense';
            break;
        }
        result[benchmarkLabel] = normalizeMetrics(benchmarks, allData as MetricData[]);
      }

      setData(result);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error fetching comparison data:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchLatestPlayerMetrics(playerId: string): Promise<MetricData[]> {
    const metrics = getAllMetricTypes();
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const { data } = await supabase
        .from('performance_entries')
        .select('metric_type, value')
        .eq('player_id', playerId)
        .eq('metric_type', metric)
        .order('entry_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        result.push(data as MetricData);
      }
    }

    return result;
  }


  return { data, isLoading, allMetricsData };
}
