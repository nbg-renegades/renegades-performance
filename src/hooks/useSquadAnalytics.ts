import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  queryKeys,
  fetchEntries,
  fetchSquad,
  type PerformanceEntry,
  type SquadMember,
} from "@/lib/queries";
import {
  buildIndex,
  groupMembers,
  standingsFor,
  type EntryIndex,
  type GroupSpec,
  type GroupStanding,
} from "@/lib/analytics";
import type { FootballPosition } from "@/lib/positionUtils";
import type { MetricType } from "@/lib/metrics";

/**
 * Everything the squad-wide views need, from the two queries they all share.
 *
 * A coach already holds every row they are allowed to see: `fetchEntries` is the best-of-day
 * RPC, cached under one key. So the matrix, the leaderboards, the coverage grid and a player
 * page are all computed from that one cached list rather than asking the server a new
 * question per view - which is what the four aggregation edge functions were doing, each
 * re-reading the whole table to answer a slightly different question about it.
 *
 * `now` is frozen for the lifetime of the hook. Calling `new Date()` inside the memos would
 * hand them a new dependency on every render and recompute the whole squad each time; it
 * would also let a view silently disagree with itself about whether a measurement has just
 * crossed the 90-day staleness line.
 */
export interface SquadAnalytics {
  index: EntryIndex;
  squad: SquadMember[];
  playerIds: string[];
  positions: Map<string, FootballPosition>;
  nameOf: (playerId: string) => string;
  memberOf: (playerId: string) => SquadMember | undefined;
  /** Standings across the whole squad, keyed by metric. */
  teamStandings: Record<MetricType, GroupStanding>;
  /**
   * Standings inside an arbitrary group. Stable between renders, so a caller can memoise on
   * it - computing a group is cheap, but recomputing it every render would throw away the
   * memoisation of everything downstream that takes the result as a dependency.
   */
  standingsForGroup: (group: GroupSpec) => Record<MetricType, GroupStanding>;
  now: Date;
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Frozen module-level fallbacks rather than `?? []` at the call site. A fresh literal is a new
 * array identity on every render, which would invalidate every memo below it and recompute the
 * whole squad each time - the exact cost this hook exists to avoid.
 */
const NO_ENTRIES: PerformanceEntry[] = [];
const NO_SQUAD: SquadMember[] = [];

export function useSquadAnalytics(): SquadAnalytics {
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries,
    queryFn: fetchEntries,
  });

  const squadQuery = useQuery({
    queryKey: queryKeys.squad,
    queryFn: fetchSquad,
  });

  const entries = entriesQuery.data ?? NO_ENTRIES;
  const squad = squadQuery.data ?? NO_SQUAD;

  const now = useMemo(() => new Date(), []);
  const index = useMemo(() => buildIndex(entries), [entries]);

  const squadIds = useMemo(() => squad.map((p) => p.id), [squad]);

  /**
   * The roster is the source of truth for who exists, but a coach may hold entries for
   * someone who has since lost the player role. Appending those keeps their history
   * reachable instead of dropping rows on the floor.
   */
  const playerIds = useMemo(() => {
    const extra = index.playerIds.filter((id) => !squadIds.includes(id));
    return [...squadIds, ...extra];
  }, [squadIds, index.playerIds]);

  const byId = useMemo(() => new Map(squad.map((p) => [p.id, p])), [squad]);

  const positions = useMemo(
    () => new Map(squad.map((p) => [p.id, p.position])),
    [squad],
  );

  const teamStandings = useMemo(
    () => standingsFor(index, playerIds, now),
    [index, playerIds, now],
  );

  const standingsForGroup = useCallback(
    (group: GroupSpec) => standingsFor(index, groupMembers(group, playerIds, positions), now),
    [index, playerIds, positions, now],
  );

  return {
    index,
    squad,
    playerIds,
    positions,
    nameOf: (playerId) => byId.get(playerId)?.name ?? "Unknown player",
    memberOf: (playerId) => byId.get(playerId),
    teamStandings,
    standingsForGroup,
    now,
    isPending: entriesQuery.isPending || squadQuery.isPending,
    isFetching: entriesQuery.isFetching || squadQuery.isFetching,
    error: (entriesQuery.error as Error | null) ?? (squadQuery.error as Error | null),
  };
}
