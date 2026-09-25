import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMetrics, type MetricData, type NormalizedMetric } from '@/lib/performanceUtils';
import { getPositionUnit, type FootballPosition } from '@/lib/positionUtils';
import { errorMessage } from '@/lib/errors';

export type ComparisonMode = 'best' | 'position' | 'offense' | 'defense' | 'compare';

export interface ComparisonData {
  [key: string]: NormalizedMetric[];
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

/** Everything one comparison needs, built in a single pass so it can be one query. */
interface ComparisonResult {
  data: ComparisonData;
  allMetricsData: MetricData[];
  positionLabel?: string;
  comparePlayerNames?: { player1: string; player2: string };
}

interface BenchmarkResponse {
  benchmarks?: MetricData[];
  allData?: MetricData[];
  playerPosition?: string;
}

type AverageRow = { metric_type: MetricData['metric_type']; average_value: number };

interface AveragesResponse {
  all?: AverageRow[];
  position?: AverageRow[];
  unit?: AverageRow[];
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}

/** A player's most recent value for each metric, taken from the best-of-day rows. */
async function fetchLatestPlayerMetrics(playerId: string): Promise<MetricData[]> {
  const { data: bestEntries, error } = await supabase.rpc('get_best_daily_entries');
  if (error) throw new Error(error.message);
  if (!bestEntries) return [];

  const latestByMetric = new Map<string, { value: number; entry_date: string }>();
  for (const entry of bestEntries.filter((e) => e.player_id === playerId)) {
    const existing = latestByMetric.get(entry.metric_type);
    if (!existing || entry.entry_date > existing.entry_date) {
      latestByMetric.set(entry.metric_type, { value: entry.value, entry_date: entry.entry_date });
    }
  }

  return [...latestByMetric].map(([metric_type, { value }]) => ({
    metric_type: metric_type as MetricData['metric_type'],
    value,
  }));
}

async function fetchPlayerName(playerId: string, fallback: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', playerId)
    .single();
  return data ? `${data.first_name} ${data.last_name}` : fallback;
}

const BEST_LABELS: Record<'best' | 'offense' | 'defense', string> = {
  best: 'Best Overall',
  offense: 'Best Offense',
  defense: 'Best Defense',
};

/**
 * Pure: it fetches and returns, and touches no state. That is what lets the whole thing be
 * a query rather than an effect writing into six useStates.
 */
async function buildComparison(props: UsePerformanceComparisonProps): Promise<ComparisonResult> {
  const {
    mode,
    selectedPosition,
    currentUserId,
    comparePlayer1Id,
    comparePlayer2Id,
    compareBaseline,
  } = props;

  // Compare mode: two players the coach picked, against a shared baseline.
  if (mode === 'compare') {
    if (!comparePlayer1Id || !comparePlayer2Id) {
      throw new Error('Please select two players to compare');
    }
    const baselineMode = compareBaseline || 'best';

    // These were five sequential awaits; none of them depends on another.
    const [player1Data, player2Data, benchmarkResponse, player1Name, player2Name] =
      await Promise.all([
        fetchLatestPlayerMetrics(comparePlayer1Id),
        fetchLatestPlayerMetrics(comparePlayer2Id),
        invoke<BenchmarkResponse>('get-performance-benchmarks', {
          mode: baselineMode,
          ...(selectedPosition && { position: selectedPosition }),
          currentPlayerId: comparePlayer1Id,
        }),
        fetchPlayerName(comparePlayer1Id, 'Player 1'),
        fetchPlayerName(comparePlayer2Id, 'Player 2'),
      ]);

    const { benchmarks, allData } = benchmarkResponse;
    if (!allData) throw new Error('No performance data available');

    const data: ComparisonData = {};
    if (benchmarks && benchmarks.length > 0) {
      data[BEST_LABELS[baselineMode]] = normalizeMetrics(benchmarks, allData);
    }
    if (player1Data.length > 0) data[player1Name] = normalizeMetrics(player1Data, allData);
    if (player2Data.length > 0) data[player2Name] = normalizeMetrics(player2Data, allData);

    return {
      data,
      allMetricsData: allData,
      comparePlayerNames: { player1: player1Name, player2: player2Name },
    };
  }

  if (!currentUserId || currentUserId.trim() === '') {
    throw new Error('No player ID provided');
  }

  const [currentData, benchmarkResponse] = await Promise.all([
    fetchLatestPlayerMetrics(currentUserId),
    invoke<BenchmarkResponse>('get-performance-benchmarks', {
      mode,
      ...(selectedPosition && { position: selectedPosition }),
      currentPlayerId: currentUserId,
    }),
  ]);

  const { benchmarks, allData, playerPosition } = benchmarkResponse;
  if (!allData) throw new Error('No performance data available');

  const data: ComparisonData = {};
  if (currentData.length > 0) data['You'] = normalizeMetrics(currentData, allData);

  const posLabel = playerPosition || selectedPosition;
  if (benchmarks && benchmarks.length > 0) {
    const label = mode === 'position' ? `Best ${posLabel}` : BEST_LABELS[mode];
    data[label] = normalizeMetrics(benchmarks, allData);
  }

  // Which group's average to ask for follows from the mode, and for a position from which
  // side of the ball that position plays on.
  const positionParam = mode === 'position' ? selectedPosition : undefined;
  const unitParam =
    mode === 'offense' || mode === 'defense'
      ? mode
      : mode === 'position' && selectedPosition
        ? (getPositionUnit(selectedPosition as FootballPosition) ?? undefined)
        : undefined;

  // The average is a nice-to-have; losing it should not lose the benchmark above it.
  try {
    const averages = await invoke<AveragesResponse>('get-performance-averages', {
      player_id: currentUserId,
      position: positionParam,
      unit: unitParam,
    });

    const averageData =
      mode === 'best' ? averages.all : mode === 'position' ? averages.position : averages.unit;

    const averageLabel =
      mode === 'best'
        ? 'Average All'
        : mode === 'position'
          ? `Average ${posLabel}`
          : mode === 'offense'
            ? 'Average Offense'
            : 'Average Defense';

    if (averageData && averageData.length > 0) {
      data[averageLabel] = normalizeMetrics(
        averageData.map((avg) => ({ metric_type: avg.metric_type, value: avg.average_value })),
        allData,
      );
    }
  } catch (error) {
    console.error('Error fetching averages:', errorMessage(error));
  }

  return { data, allMetricsData: allData, positionLabel: posLabel };
}

export function usePerformanceComparison(props: UsePerformanceComparisonProps) {
  const {
    mode,
    selectedPosition,
    currentUserId,
    comparePlayer1Id,
    comparePlayer2Id,
    compareBaseline,
  } = props;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [
      'comparison',
      mode,
      selectedPosition,
      currentUserId,
      comparePlayer1Id,
      comparePlayer2Id,
      compareBaseline,
    ],
    queryFn: () => buildComparison(props),
    enabled: mode === 'compare' ? !!comparePlayer1Id && !!comparePlayer2Id : !!currentUserId,
  });

  // Someone else saving a measurement moves everyone's benchmarks. Invalidating is the
  // whole job: this effect owns no state, so there is nothing to keep in sync and nothing
  // to tear down but the channel.
  useEffect(() => {
    const channel = supabase
      .channel('performance-entries-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'performance_entries' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['comparison'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return {
    data: query.data?.data ?? {},
    isLoading: query.isPending,
    error: query.error ? errorMessage(query.error, 'Failed to load performance data.') : null,
    allMetricsData: query.data?.allMetricsData ?? [],
    refetch: query.refetch,
    positionLabel: query.data?.positionLabel,
    comparePlayerNames: query.data?.comparePlayerNames,
  };
}
