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
    try {
      // Get best daily entries for this player
      const { data: bestEntries, error } = await supabase
        .rpc('get_best_daily_entries');

      if (error) {
        console.error('Error fetching player metrics:', error);
        return [];
      }

      if (!bestEntries || bestEntries.length === 0) {
        return [];
      }

      // Filter for this player and get the most recent entry for each metric
      const playerEntries = bestEntries.filter((e: any) => e.player_id === playerId);
      const latestByMetric = new Map<string, MetricData>();
      
      playerEntries.forEach((entry: any) => {
        const existing = latestByMetric.get(entry.metric_type);
        const currentDate = entry.entry_date;
        const existingDate = existing ? (existing as any).entry_date : null;
        
        if (!existing || currentDate > existingDate) {
          latestByMetric.set(entry.metric_type, {
            metric_type: entry.metric_type,
            value: entry.value,
          } as MetricData);
        }
      });

      return Array.from(latestByMetric.values());
    } catch (error) {
      console.error('Error fetching player metrics:', error);
      return [];
    }
  }


  return { data, isLoading, error, allMetricsData, refetch: fetchComparisonData };
}
