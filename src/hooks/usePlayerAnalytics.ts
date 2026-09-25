import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchPlayerStanding, type MetricStanding } from "@/lib/queries";
import { useViewer } from "@/hooks/useViewer";
import { useSquadAnalytics } from "@/hooks/useSquadAnalytics";
import {
  domainScores,
  nextTargetFor,
  summarise,
  trend,
  type DomainScores,
  type EntryIndex,
  type GroupSpec,
  type PlayerMetricSummary,
  type Trend,
} from "@/lib/analytics";
import { METRIC_KEYS, type MetricType } from "@/lib/metrics";

/**
 * One player's page, for whoever is looking at it.
 *
 * There are genuinely two data paths here and no way around it. A coach may read every row, so
 * their percentiles, medians and next targets are computed in the browser from the one cached
 * entries query - no extra request, and the same numbers the squad matrix shows. A player may
 * read only their own rows, so anything that needs the group has to come from an edge function
 * that can see it.
 *
 * What both paths return is the same shape, so the page itself never branches on who is
 * looking. Only the name of the player one place ahead differs, and it differs because the
 * server withholds it rather than because the page hides it.
 */
export interface PlayerStandingRow {
  metric: MetricType;
  percentile: number | null;
  rank: number | null;
  /** How many players in the group have a value for this metric. */
  n: number;
  median: number | null;
  best: number | null;
  reliable: boolean;
  nextTargetValue: number | null;
  nextTargetName: string | null;
}

export interface PlayerAnalytics {
  index: EntryIndex;
  summaries: Record<MetricType, PlayerMetricSummary>;
  trends: Record<MetricType, Trend>;
  standings: Record<MetricType, PlayerStandingRow>;
  percentiles: Map<MetricType, number>;
  scores: DomainScores;
  /** True when the viewer may see teammates' names. */
  showsNames: boolean;
  isPending: boolean;
  error: Error | null;
  now: Date;
}

const EMPTY_STANDING: Omit<PlayerStandingRow, "metric"> = {
  percentile: null,
  rank: null,
  n: 0,
  median: null,
  best: null,
  reliable: false,
  nextTargetValue: null,
  nextTargetName: null,
};

function fromMetricStandings(rows: MetricStanding[]): Record<MetricType, PlayerStandingRow> {
  const byMetric = new Map(rows.map((r) => [r.metric_type, r]));
  return Object.fromEntries(
    METRIC_KEYS.map((metric) => {
      const row = byMetric.get(metric);
      return [
        metric,
        row
          ? {
              metric,
              percentile: row.percentile,
              rank: row.rank,
              n: row.n,
              median: row.median,
              best: row.best,
              reliable: row.reliable,
              nextTargetValue: row.next_target_value,
              nextTargetName: row.next_target_name,
            }
          : { metric, ...EMPTY_STANDING },
      ];
    }),
  ) as Record<MetricType, PlayerStandingRow>;
}

export function usePlayerAnalytics(
  playerId: string,
  group: GroupSpec = { kind: "team" },
): PlayerAnalytics {
  const viewer = useViewer();
  const isCoach = viewer.isCoach;

  /**
   * The same hook serves both readers, because the entries query is the same query either way -
   * `get_best_daily_entries` applies row-level security itself, so a coach gets the squad and a
   * player gets their own rows from one cached key. The player's own summaries, records and
   * trends therefore work identically on both paths. Only the group-relative figures differ,
   * and that is what the standing function below is for.
   */
  const squad = useSquadAnalytics();
  const { index, now, nameOf, standingsForGroup } = squad;

  const standingQuery = useQuery({
    queryKey: queryKeys.playerStanding(playerId),
    queryFn: () => fetchPlayerStanding(playerId),
    enabled: !isCoach && !!playerId,
  });

  const summaries = useMemo(
    () =>
      Object.fromEntries(
        METRIC_KEYS.map((metric) => [metric, summarise(index, playerId, metric, now)]),
      ) as Record<MetricType, PlayerMetricSummary>,
    [index, playerId, now],
  );

  const trends = useMemo(
    () =>
      Object.fromEntries(
        METRIC_KEYS.map((metric) => [metric, trend(index, playerId, metric, 6, now)]),
      ) as Record<MetricType, Trend>,
    [index, playerId, now],
  );

  const groupStandings = useMemo(
    () => (isCoach ? standingsForGroup(group) : null),
    [isCoach, standingsForGroup, group],
  );

  const standings = useMemo<Record<MetricType, PlayerStandingRow>>(() => {
    if (isCoach && groupStandings) {
      return Object.fromEntries(
        METRIC_KEYS.map((metric) => {
          const standing = groupStandings[metric];
          const row = standing?.rows.find((r) => r.playerId === playerId);
          const target = standing ? nextTargetFor(standing, playerId) : null;
          return [
            metric,
            {
              metric,
              percentile: row?.percentile ?? null,
              rank: row?.rank ?? null,
              n: standing?.n ?? 0,
              median: standing?.median ?? null,
              best: standing?.best ?? null,
              reliable: standing?.reliable ?? false,
              nextTargetValue: target?.value ?? null,
              nextTargetName: target ? nameOf(target.playerId) : null,
            },
          ];
        }),
      ) as Record<MetricType, PlayerStandingRow>;
    }

    const payload = standingQuery.data;
    if (!payload) {
      return Object.fromEntries(
        METRIC_KEYS.map((metric) => [metric, { metric, ...EMPTY_STANDING }]),
      ) as Record<MetricType, PlayerStandingRow>;
    }
    const rows =
      group.kind === "position"
        ? payload.position
        : group.kind === "offense" || group.kind === "defense"
          ? payload.unit
          : payload.team;
    return fromMetricStandings(rows);
  }, [isCoach, groupStandings, playerId, nameOf, standingQuery.data, group.kind]);

  const percentiles = useMemo(() => {
    const map = new Map<MetricType, number>();
    for (const metric of METRIC_KEYS) {
      const value = standings[metric]?.percentile;
      if (value !== null && value !== undefined) map.set(metric, value);
    }
    return map;
  }, [standings]);

  const scores = useMemo(() => domainScores(percentiles), [percentiles]);

  return {
    index,
    summaries,
    trends,
    standings,
    percentiles,
    scores,
    showsNames: isCoach,
    isPending: squad.isPending || viewer.isPending || (!isCoach && standingQuery.isPending),
    error: squad.error ?? (standingQuery.error as Error | null),
    now,
  };
}
