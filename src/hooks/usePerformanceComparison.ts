import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMetrics, createEmptyMetricSet, getAllMetricTypes, type MetricData, type NormalizedMetric } from '@/lib/performanceUtils';

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
      // Fetch all performance data for normalization context
      const { data: allData } = await supabase
        .from('performance_entries')
        .select('metric_type, value')
        .order('entry_date', { ascending: false });

      if (!allData) {
        setIsLoading(false);
        return;
      }

      setAllMetricsData(allData as MetricData[]);

      const result: ComparisonData = {};

      // Always show current player first if they are a player
      if (userRole === 'player') {
        const currentData = await fetchLatestPlayerMetrics(currentUserId);
        result['You'] = normalizeMetrics(currentData, allData as MetricData[]);
      }

      // Add comparison data based on mode
      switch (mode) {
        case 'best':
          const bestData = await fetchBestMetrics();
          result['Best Overall'] = normalizeMetrics(bestData, allData as MetricData[]);
          break;

        case 'position':
          if (selectedPosition) {
            const positionBestData = await fetchBestPositionMetrics(selectedPosition);
            result[`Best ${selectedPosition}`] = normalizeMetrics(positionBestData, allData as MetricData[]);
          }
          break;

        case 'offense':
          const offenseBestData = await fetchBestUnitMetrics('offense');
          result['Best Offense'] = normalizeMetrics(offenseBestData, allData as MetricData[]);
          break;

        case 'defense':
          const defenseBestData = await fetchBestUnitMetrics('defense');
          result['Best Defense'] = normalizeMetrics(defenseBestData, allData as MetricData[]);
          break;
      }

      setData(result);
    } catch (error) {
      console.error('Error fetching comparison data:', error);
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
        .single();

      if (data) {
        result.push(data as MetricData);
      }
    }

    return result;
  }

  async function fetchAverageMetrics(): Promise<MetricData[]> {
    const metrics = getAllMetricTypes();
    const result: MetricData[] = [];

    for (const metric of metrics) {
      // Get latest entry per player for this metric
      const { data: latestEntries } = await supabase
        .from('performance_entries')
        .select('player_id, value')
        .eq('metric_type', metric)
        .order('entry_date', { ascending: false });

      if (latestEntries && latestEntries.length > 0) {
        // Get unique players with their latest value
        const playerLatest = new Map<string, number>();
        latestEntries.forEach(entry => {
          if (!playerLatest.has(entry.player_id)) {
            playerLatest.set(entry.player_id, entry.value);
          }
        });

        const values = Array.from(playerLatest.values());
        const average = values.reduce((sum, val) => sum + val, 0) / values.length;
        
        result.push({ metric_type: metric, value: average });
      }
    }

    return result;
  }

  async function fetchBestMetrics(): Promise<MetricData[]> {
    const metrics = getAllMetricTypes();
    const lowerIsBetter = ['40yd_dash', '3cone_drill', 'shuffle_run'];
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const isLowerBetter = lowerIsBetter.includes(metric);
      
      const { data } = await supabase
        .from('performance_entries')
        .select('value')
        .eq('metric_type', metric)
        .order('value', { ascending: isLowerBetter })
        .limit(1)
        .single();

      if (data) {
        result.push({ metric_type: metric, value: data.value });
      }
    }

    return result;
  }

  async function fetchSamePositionMetrics(playerId: string): Promise<MetricData[]> {
    // Get player's positions
    const { data: positions } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', playerId);

    if (!positions || positions.length === 0) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    // Get all players with same position
    const positionTypes = positions.map(p => p.position);
    const { data: samePositionPlayers } = await supabase
      .from('player_positions')
      .select('player_id')
      .in('position', positionTypes)
      .neq('player_id', playerId);

    if (!samePositionPlayers || samePositionPlayers.length === 0) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    const playerIds = [...new Set(samePositionPlayers.map(p => p.player_id))];
    
    // Calculate average for each metric
    const metrics = getAllMetricTypes();
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const { data: entries } = await supabase
        .from('performance_entries')
        .select('player_id, value')
        .in('player_id', playerIds)
        .eq('metric_type', metric)
        .order('entry_date', { ascending: false });

      if (entries && entries.length > 0) {
        const playerLatest = new Map<string, number>();
        entries.forEach(entry => {
          if (!playerLatest.has(entry.player_id)) {
            playerLatest.set(entry.player_id, entry.value);
          }
        });

        const values = Array.from(playerLatest.values());
        const average = values.reduce((sum, val) => sum + val, 0) / values.length;
        result.push({ metric_type: metric, value: average });
      }
    }

    return result;
  }

  async function fetchBestPositionMetrics(position: string): Promise<MetricData[]> {
    // Get all players with this position
    const { data: positionPlayers } = await supabase
      .from('player_positions')
      .select('player_id')
      .eq('position', position as any);

    if (!positionPlayers || positionPlayers.length === 0) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    const playerIds = [...new Set(positionPlayers.map(p => p.player_id))];
    
    // Get best for each metric from this position
    const metrics = getAllMetricTypes();
    const lowerIsBetter = ['40yd_dash', '3cone_drill', 'shuffle_run'];
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const isLowerBetter = lowerIsBetter.includes(metric);
      
      const { data } = await supabase
        .from('performance_entries')
        .select('value')
        .in('player_id', playerIds)
        .eq('metric_type', metric)
        .order('value', { ascending: isLowerBetter })
        .limit(1)
        .maybeSingle();

      if (data) {
        result.push({ metric_type: metric, value: data.value });
      }
    }

    return result;
  }

  async function fetchBestUnitMetrics(unit: 'offense' | 'defense'): Promise<MetricData[]> {
    // Define which positions belong to each unit
    const offensePositions = ['QB', 'WR', 'C'];
    const defensePositions = ['DB', 'B'];
    const positions = unit === 'offense' ? offensePositions : defensePositions;

    // Get all players in this unit
    const { data: unitPlayers } = await supabase
      .from('player_positions')
      .select('player_id')
      .in('position', positions as any);

    if (!unitPlayers || unitPlayers.length === 0) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    const playerIds = [...new Set(unitPlayers.map(p => p.player_id))];
    
    // Get best for each metric from this unit
    const metrics = getAllMetricTypes();
    const lowerIsBetter = ['40yd_dash', '3cone_drill', 'shuffle_run'];
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const isLowerBetter = lowerIsBetter.includes(metric);
      
      const { data } = await supabase
        .from('performance_entries')
        .select('value')
        .in('player_id', playerIds)
        .eq('metric_type', metric)
        .order('value', { ascending: isLowerBetter })
        .limit(1)
        .maybeSingle();

      if (data) {
        result.push({ metric_type: metric, value: data.value });
      }
    }

    return result;
  }

  return { data, isLoading, allMetricsData };
}
