import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMetrics, getAllMetricTypes, type MetricData, type NormalizedMetric } from '@/lib/performanceUtils';

export type ComparisonMode = 'best' | 'position' | 'offense' | 'defense' | 'compare' | 'average';

export interface ComparisonData {
  [key: string]: NormalizedMetric[];
}

export interface UsePerformanceComparisonResult {
  data: ComparisonData;
  isLoading: boolean;
  error: string | null;
  allMetricsData: MetricData[];
  refetch: () => void;
  positionLabel?: string;
  comparePlayerNames?: {
    player1: string;
    player2: string;
  };
}

interface UsePerformanceComparisonProps {
  mode: ComparisonMode;
  selectedPosition?: string;
  currentUserId: string;
  userRole: string;
  comparePlayer1Id?: string;
  comparePlayer2Id?: string;
  compareBaseline?: 'best' | 'offense' | 'defense';
}

export function usePerformanceComparison({
  mode,
  selectedPosition,
  currentUserId,
  userRole,
  comparePlayer1Id,
  comparePlayer2Id,
  compareBaseline
}: UsePerformanceComparisonProps) {
  const [data, setData] = useState<ComparisonData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allMetricsData, setAllMetricsData] = useState<MetricData[]>([]);
  const [positionLabel, setPositionLabel] = useState<string | undefined>();
  const [comparePlayerNames, setComparePlayerNames] = useState<{ player1: string; player2: string } | undefined>();

  useEffect(() => {
    fetchComparisonData();
  }, [mode, selectedPosition, currentUserId, comparePlayer1Id, comparePlayer2Id, compareBaseline]);

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
  }, [mode, selectedPosition, currentUserId, comparePlayer1Id, comparePlayer2Id, compareBaseline]);

  async function fetchComparisonData() {
    setIsLoading(true);
    setError(null);
    try {
      // For compare mode, handle differently
      if (mode === 'compare') {
        if (!comparePlayer1Id || !comparePlayer2Id) {
          setError('Please select two players to compare');
          setIsLoading(false);
          return;
        }

        // Fetch data for both players
        const player1Data = await fetchLatestPlayerMetrics(comparePlayer1Id);
        const player2Data = await fetchLatestPlayerMetrics(comparePlayer2Id);

        // Fetch benchmark based on compareBaseline
        const baselineMode = compareBaseline || 'best';
        const { data: benchmarkResponse, error: benchmarkError } = await supabase.functions.invoke(
          'get-performance-benchmarks',
          {
            body: {
              mode: baselineMode,
              ...(selectedPosition && { position: selectedPosition }),
              currentPlayerId: comparePlayer1Id
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

        // Add benchmark
        if (benchmarks && benchmarks.length > 0) {
          let benchmarkLabel = '';
          switch (baselineMode) {
            case 'best':
              benchmarkLabel = 'Best Overall';
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

        // Fetch player names
        const { data: profile1 } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', comparePlayer1Id)
          .single();
        const player1Name = profile1 ? `${profile1.first_name} ${profile1.last_name}` : 'Player 1';

        const { data: profile2 } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', comparePlayer2Id)
          .single();
        const player2Name = profile2 ? `${profile2.first_name} ${profile2.last_name}` : 'Player 2';

        // Store the player names in order
        setComparePlayerNames({
          player1: player1Name,
          player2: player2Name
        });

        // Add player 1 (Gold)
        if (player1Data.length > 0) {
          result[player1Name] = normalizeMetrics(player1Data, allData as MetricData[]);
        }

        // Add player 2 (Silver)
        if (player2Data.length > 0) {
          result[player2Name] = normalizeMetrics(player2Data, allData as MetricData[]);
        }

        setData(result);
        setError(null);
        setIsLoading(false);
        return;
      }

      // Guard against empty player IDs for non-compare and non-average modes
      if (mode !== 'average' && (!currentUserId || currentUserId.trim() === '')) {
        console.warn('No valid player ID provided');
        setError('No player ID provided');
        setIsLoading(false);
        return;
      }

      // For average mode, fetch averages instead of benchmarks
      if (mode === 'average') {
        // Determine unit based on position if we're in position mode
        let unitParam: 'offense' | 'defense' | undefined = undefined;
        let positionParam: string | undefined = undefined;

        if (selectedPosition) {
          positionParam = selectedPosition;
          const offensePositions = ['QB', 'WR', 'C'];
          const defensePositions = ['DB', 'B'];
          if (offensePositions.includes(selectedPosition)) {
            unitParam = 'offense';
          } else if (defensePositions.includes(selectedPosition)) {
            unitParam = 'defense';
          }
        }

        const { data: averagesResponse, error: averagesError } = await supabase.functions.invoke(
          'get-performance-averages',
          {
            body: {
              player_id: currentUserId || '',
              position: positionParam,
              unit: unitParam
            }
          }
        );

        if (averagesError) {
          console.error('Error fetching averages:', averagesError);
          setError('Failed to load average data. Please try again.');
          setIsLoading(false);
          return;
        }

        const { all, position, unit } = averagesResponse;

        // Fetch benchmark data to get allData
        const { data: benchmarkResponse, error: benchmarkError } = await supabase.functions.invoke(
          'get-performance-benchmarks',
          {
            body: {
              mode: 'best',
              currentPlayerId: currentUserId || ''
            }
          }
        );

        if (benchmarkError) {
          console.error('Error fetching benchmark data:', benchmarkError);
          setError('Failed to load data. Please try again.');
          setIsLoading(false);
          return;
        }

        const { allData } = benchmarkResponse;
        
        if (!allData) {
          setError('No performance data available');
          setIsLoading(false);
          return;
        }

        setAllMetricsData(allData as MetricData[]);

        const result: ComparisonData = {};

        // Add current user's data if available
        if (currentUserId) {
          const currentData = await fetchLatestPlayerMetrics(currentUserId);
          if (currentData.length > 0) {
            result['You'] = normalizeMetrics(currentData, allData as MetricData[]);
          }
        }

        // Add average comparison based on context
        if (all && all.length > 0) {
          const avgMetrics: MetricData[] = all.map((avg: any) => ({
            metric_type: avg.metric_type,
            value: avg.average_value
          }));
          result['Average All'] = normalizeMetrics(avgMetrics, allData as MetricData[]);
        }

        setData(result);
        setError(null);
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
            ...(selectedPosition && { position: selectedPosition }),
            currentPlayerId: currentUserId
          }
        }
      );

      if (benchmarkError) {
        console.error('Error fetching benchmarks:', benchmarkError);
        setError('Failed to load benchmark data. Please try again.');
        setIsLoading(false);
        return;
      }

      const { benchmarks, allData, playerPosition } = benchmarkResponse;
      
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
            // Use the position from backend response
            const posLabel = playerPosition || selectedPosition;
            benchmarkLabel = `Best ${posLabel}`;
            setPositionLabel(posLabel);
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

  return {
    data,
    isLoading,
    error,
    allMetricsData,
    refetch: fetchComparisonData,
    positionLabel,
    comparePlayerNames
  };

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
