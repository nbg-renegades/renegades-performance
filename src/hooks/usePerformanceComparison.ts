import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMetrics, createEmptyMetricSet, getAllMetricTypes, type MetricData, type NormalizedMetric } from '@/lib/performanceUtils';

export type ComparisonMode = 'players' | 'average' | 'best' | 'my_position' | 'position' | 'offense' | 'defense' | 'historical';

export interface ComparisonData {
  [key: string]: NormalizedMetric[];
}

interface UsePerformanceComparisonProps {
  mode: ComparisonMode;
  selectedPlayerIds: string[];
  selectedPosition?: string;
  historicalPeriods: number[]; // in months
  currentUserId: string;
  userRole: string;
}

export function usePerformanceComparison({
  mode,
  selectedPlayerIds,
  selectedPosition,
  historicalPeriods,
  currentUserId,
  userRole
}: UsePerformanceComparisonProps) {
  const [data, setData] = useState<ComparisonData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [allMetricsData, setAllMetricsData] = useState<MetricData[]>([]);

  useEffect(() => {
    fetchComparisonData();
  }, [mode, selectedPlayerIds, selectedPosition, historicalPeriods, currentUserId]);

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
        case 'players':
          if (selectedPlayerIds.length > 0) {
            for (const playerId of selectedPlayerIds) {
              const playerData = await fetchLatestPlayerMetrics(playerId);
              const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', playerId)
                .single();
              
              const playerName = profile 
                ? `${profile.first_name} ${profile.last_name}`
                : 'Unknown';
              
              result[playerName] = normalizeMetrics(playerData, allData as MetricData[]);
            }
          }
          break;

        case 'average':
          const avgData = await fetchAverageMetrics();
          result['Average'] = normalizeMetrics(avgData, allData as MetricData[]);
          break;

        case 'best':
          const bestData = await fetchBestMetrics();
          result['Best Overall'] = normalizeMetrics(bestData, allData as MetricData[]);
          break;

        case 'my_position':
          if (userRole === 'player') {
            const myPositionData = await fetchMyPositionBestMetrics(currentUserId);
            result['My Position Best'] = normalizeMetrics(myPositionData, allData as MetricData[]);
          }
          break;

        case 'position':
          if (selectedPosition) {
            const positionData = await fetchPositionAverageMetrics(selectedPosition);
            result[`${selectedPosition} Average`] = normalizeMetrics(positionData, allData as MetricData[]);
          }
          break;

        case 'offense':
          const offenseData = await fetchUnitAverageMetrics('offense');
          result['Offense Average'] = normalizeMetrics(offenseData, allData as MetricData[]);
          break;

        case 'defense':
          const defenseData = await fetchUnitAverageMetrics('defense');
          result['Defense Average'] = normalizeMetrics(defenseData, allData as MetricData[]);
          break;

        case 'historical':
          if (userRole === 'player' && historicalPeriods.length > 0) {
            for (const months of historicalPeriods) {
              const historicalData = await fetchHistoricalMetrics(currentUserId, months);
              const label = months === 1 ? '1 month ago' : 
                           months === 3 ? '3 months ago' :
                           months === 6 ? '6 months ago' :
                           months === 12 ? '1 year ago' :
                           months === 24 ? '2 years ago' :
                           '3 years ago';
              result[label] = normalizeMetrics(historicalData, allData as MetricData[]);
            }
          }
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

  async function fetchMyPositionBestMetrics(playerId: string): Promise<MetricData[]> {
    // Get player's position
    const { data: positionData } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', playerId)
      .single();

    if (!positionData) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    const position = positionData.position;

    // Get all players with the same position
    const { data: samePositionPlayers } = await supabase
      .from('player_positions')
      .select('player_id')
      .eq('position', position);

    if (!samePositionPlayers || samePositionPlayers.length === 0) {
      return createEmptyMetricSet().map(m => ({ 
        metric_type: Object.keys(m)[0] as any, 
        value: 0 
      }));
    }

    const playerIds = samePositionPlayers.map(p => p.player_id);

    // Get the best performance for each metric among players with this position
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

  async function fetchPositionAverageMetrics(position: string): Promise<MetricData[]> {
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

  async function fetchUnitAverageMetrics(unit: 'offense' | 'defense'): Promise<MetricData[]> {
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

  async function fetchHistoricalMetrics(playerId: string, monthsAgo: number): Promise<MetricData[]> {
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() - monthsAgo);
    
    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 7);

    const metrics = getAllMetricTypes();
    const result: MetricData[] = [];

    for (const metric of metrics) {
      const { data } = await supabase
        .from('performance_entries')
        .select('metric_type, value')
        .eq('player_id', playerId)
        .eq('metric_type', metric)
        .gte('entry_date', startDate.toISOString().split('T')[0])
        .lte('entry_date', endDate.toISOString().split('T')[0])
        .order('entry_date', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        result.push(data as MetricData);
      }
    }

    return result;
  }

  return { data, isLoading, allMetricsData };
}
