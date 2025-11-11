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
  const [error, setError] = useState<string | null>(null);
  const [allMetricsData, setAllMetricsData] = useState<MetricData[]>([]);

  useEffect(() => {
    fetchComparisonData();
  }, [mode, selectedPosition, currentUserId]);

  // Set up realtime subscription for performance entries
  useEffect(() => {
    const channel = supabase
      .channel('performance-entries-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'performance_entries'
        },
        () => {
          // Refetch data when any performance entry changes
          fetchComparisonData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode, selectedPosition, currentUserId]);

  async function fetchComparisonData() {
    setIsLoading(true);
    setError(null);
    try {
      // Guard against empty player IDs
      if (!currentUserId || currentUserId.trim() === '') {
        console.warn('No valid player ID provided');
        setError('No player ID provided');
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
        setError('Failed to load benchmark data. Please try again.');
        setIsLoading(false);
        return;
      }

      const { benchmarks, allData } = benchmarkResponse;
      
      if (!allData) {
        setError('No performance data available');
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
      setError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error fetching comparison data:', errorMessage);
      setError('Failed to load performance data. Please try again.');
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


  return { data, isLoading, error, allMetricsData, refetch: fetchComparisonData };
}
