/**
 * The standing formulas, for the edge functions.
 *
 * Deno cannot import from src/, so this is a transcription of the relevant part of
 * src/lib/analytics.ts rather than a re-export - the same arrangement, and the same warning,
 * as _shared/metrics.ts beside it. Change one, change the other. What must not drift is the
 * definition of a percentile: the client computes it for a coach and this file computes it for
 * a player, and if the two disagree the same athlete gets two different numbers depending on
 * who is looking at them.
 *
 * Only the group-relative half lives here. Personal bests, deltas and trends are computed from
 * a player's own rows, which row-level security already lets them read, so they stay in the
 * browser and have no second implementation to keep in step.
 */

import { METRIC_KEYS, isLowerBetter, type MetricType, type PerformanceEntryRow } from './metrics.ts';

export const MIN_GROUP_FOR_PERCENTILE = 4;

export function isBetter(metric: string, candidate: number, than: number): boolean {
  return isLowerBetter(metric) ? candidate < than : candidate > than;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Each player's most recent value for one metric.
 *
 * Two rules, both of which the previous functions got subtly differently from each other:
 * the most recent *date* wins, and within a date the *better* attempt wins. get-performance-
 * benchmarks took whichever row the map happened to see first, which for a day with two
 * attempts meant an arbitrary one.
 */
export function latestByPlayer(
  entries: PerformanceEntryRow[],
  metric: MetricType,
): Map<string, { value: number; entry_date: string }> {
  const latest = new Map<string, { value: number; entry_date: string }>();
  for (const entry of entries) {
    if (entry.metric_type !== metric) continue;
    const value = Number(entry.value);
    if (!Number.isFinite(value)) continue;

    const existing = latest.get(entry.player_id);
    if (
      !existing ||
      entry.entry_date > existing.entry_date ||
      (entry.entry_date === existing.entry_date && isBetter(metric, value, existing.value))
    ) {
      latest.set(entry.player_id, { value, entry_date: entry.entry_date });
    }
  }
  return latest;
}

export interface MetricStanding {
  metric_type: MetricType;
  percentile: number | null;
  rank: number | null;
  n: number;
  median: number | null;
  best: number | null;
  reliable: boolean;
  current_value: number | null;
  next_target_value: number | null;
  /** Only ever populated for a coach or admin; null for a player. */
  next_target_name: string | null;
}

/**
 * Where one player stands on one metric inside a group.
 *
 * The percentile is the share of the *others* in the group this player is strictly better
 * than - the definition the app has always shown players in its own explainer - so ties do not
 * inflate one another and the best in a group reads 100.
 */
export function standingFor(
  entries: PerformanceEntryRow[],
  metric: MetricType,
  playerId: string,
  memberIds: string[],
  nameOf: (id: string) => string | null,
): MetricStanding {
  const latest = latestByPlayer(entries, metric);
  const values: Array<{ playerId: string; value: number }> = [];
  for (const id of memberIds) {
    const hit = latest.get(id);
    if (hit) values.push({ playerId: id, value: hit.value });
  }

  values.sort((a, b) => (isLowerBetter(metric) ? a.value - b.value : b.value - a.value));

  const n = values.length;
  const mine = values.find((v) => v.playerId === playerId);
  const base: MetricStanding = {
    metric_type: metric,
    percentile: null,
    rank: null,
    n,
    median: median(values.map((v) => v.value)),
    best: n > 0 ? values[0].value : null,
    reliable: n >= MIN_GROUP_FOR_PERCENTILE,
    current_value: null,
    next_target_value: null,
    next_target_name: null,
  };
  if (!mine) return base;

  const strictlyBetter = values.filter((o) => isBetter(metric, o.value, mine.value)).length;
  const strictlyWorse = values.filter(
    (o) => o.playerId !== playerId && isBetter(metric, mine.value, o.value),
  ).length;

  // Walking back from just ahead finds the closest player who is genuinely ahead rather than
  // one who is merely tied - the target worth chasing, not the group leader.
  let nextValue: number | null = null;
  let nextName: string | null = null;
  const myIndex = values.indexOf(mine);
  for (let i = myIndex - 1; i >= 0; i--) {
    if (isBetter(metric, values[i].value, mine.value)) {
      nextValue = values[i].value;
      nextName = nameOf(values[i].playerId);
      break;
    }
  }

  return {
    ...base,
    percentile: n > 1 ? Math.round((strictlyWorse / (n - 1)) * 100) : 100,
    rank: strictlyBetter + 1,
    current_value: mine.value,
    next_target_value: nextValue,
    next_target_name: nextName,
  };
}

export function standingsForAll(
  entries: PerformanceEntryRow[],
  playerId: string,
  memberIds: string[],
  nameOf: (id: string) => string | null,
): MetricStanding[] {
  return METRIC_KEYS.map((metric) =>
    standingFor(entries, metric, playerId, memberIds, nameOf),
  );
}

const OFFENSE_POSITIONS = ['QB', 'WR', 'C'];
const DEFENSE_POSITIONS = ['DB', 'B'];

export function unitOf(position: string | null | undefined): 'offense' | 'defense' | null {
  if (!position) return null;
  if (OFFENSE_POSITIONS.includes(position)) return 'offense';
  if (DEFENSE_POSITIONS.includes(position)) return 'defense';
  return null;
}
