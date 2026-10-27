/**
 * Comparisons that follow the club's testing calendar instead of the clock.
 *
 * The squad is tested in bursts: two or three sessions in preseason (November to January),
 * then nothing until the next November. A trend fitted over "the last six months" is empty
 * for most of the year, and in January it is a slope through three points four weeks apart,
 * which mostly measures the timing error. The questions a coach actually asks line up with
 * the calendar instead:
 *
 * - **Season gain** - what did this preseason do for them? First test of the year against the
 *   best one after it.
 * - **Year over year** - did they come back better than last year? This year's best against
 *   last year's best. Bests rather than single days, because the best of three attempts is
 *   far steadier than any one of them.
 *
 * Both are judged against the metric's `meaningfulChange`, so a change inside the noise reads
 * as "same" and never ranks. Direction is still handled only by ./analytics: every number
 * here comes out of `improvement`, already sign-normalised.
 */

import { METRIC_KEYS, meaningfulChange, type MetricType } from './metrics';
import {
  DOMAINS,
  DOMAIN_KEYS,
  improvement,
  improvementPercent,
  isBetter,
  median,
  seriesFor,
  todayIso,
  type Attempt,
  type DomainKey,
  type EntryIndex,
} from './analytics';
import { seasonLabel, seasonOf } from './clubYear';

export { SEASON_START_MONTH, seasonLabel, seasonOf } from './clubYear';

/** Every club year with at least one test, newest first. */
export function seasonsWithTests(index: EntryIndex): number[] {
  return [...new Set(index.dates.map(seasonOf))].sort((a, b) => b - a);
}

export interface FocusSeason {
  season: number;
  /** False when the current year has no tests yet and this is last year's recap. */
  isCurrent: boolean;
}

/**
 * The year the season views should describe: the current one once it has a test, otherwise
 * the most recent one that does. Between February and the first November session that turns
 * the dashboard into a recap of last preseason instead of an empty card.
 */
export function focusSeason(index: EntryIndex, now: Date = new Date()): FocusSeason | null {
  const current = seasonOf(todayIso(now));
  const latest = seasonsWithTests(index).find((season) => season <= current);
  if (latest === undefined) return null;
  return { season: latest, isCurrent: latest === current };
}

/**
 * The latest club year, up to the current one, in which this player was tested on anything.
 * A player's own page describes their own year: in October that is last preseason, not an
 * empty one, and for a player who skipped last year it is the year they last turned up.
 */
export function latestSeasonFor(
  index: EntryIndex,
  playerId: string,
  now: Date = new Date(),
): number | null {
  const current = seasonOf(todayIso(now));
  let latest: number | null = null;
  for (const series of index.byPlayer.get(playerId)?.values() ?? []) {
    for (const attempt of series) {
      const season = seasonOf(attempt.date);
      if (season <= current && (latest === null || season > latest)) latest = season;
    }
  }
  return latest;
}

export type Verdict = 'better' | 'same' | 'worse';

/**
 * Whether a sign-normalised change clears the metric's noise floor. The epsilon keeps
 * 4.55 - 4.50, which floating point makes 0.04999..., from falling just short of 0.05.
 */
export function verdict(metric: MetricType, change: number): Verdict {
  if (Math.abs(change) < meaningfulChange(metric) - 1e-9) return 'same';
  return change > 0 ? 'better' : 'worse';
}

export interface MetricChange {
  playerId: string;
  metric: MetricType;
  from: Attempt;
  to: Attempt;
  /** Positive = improved, in the metric's unit. */
  improvement: number;
  percent: number;
  verdict: Verdict;
}

function changeBetween(
  playerId: string,
  metric: MetricType,
  from: Attempt,
  to: Attempt,
): MetricChange {
  const delta = improvement(metric, from.value, to.value);
  return {
    playerId,
    metric,
    from,
    to,
    improvement: delta,
    percent: improvementPercent(metric, from.value, to.value) ?? 0,
    verdict: verdict(metric, delta),
  };
}

function attemptsIn(
  index: EntryIndex,
  playerId: string,
  metric: MetricType,
  season: number,
): Attempt[] {
  return seriesFor(index, playerId, metric).filter((a) => seasonOf(a.date) === season);
}

/** The earliest attempt holding the best value - the one that set it. */
function bestAttempt(metric: MetricType, attempts: Attempt[]): Attempt | null {
  return attempts.reduce<Attempt | null>(
    (best, a) => (!best || isBetter(metric, a.value, best.value) ? a : best),
    null,
  );
}

/**
 * This year's best against last year's best. Only for players tested in both years - the
 * returning players - so a rookie never appears and someone back after a gap year is not
 * credited with two years of training as one.
 */
export function yearOverYear(
  index: EntryIndex,
  playerId: string,
  metric: MetricType,
  season: number,
): MetricChange | null {
  const thisYear = bestAttempt(metric, attemptsIn(index, playerId, metric, season));
  const lastYear = bestAttempt(metric, attemptsIn(index, playerId, metric, season - 1));
  if (!thisYear || !lastYear) return null;
  return changeBetween(playerId, metric, lastYear, thisYear);
}

/**
 * The season's first test against the best one after it: what the preseason block added.
 * Can be negative - if every later test was worse than the baseline, that is the answer.
 */
export function seasonGain(
  index: EntryIndex,
  playerId: string,
  metric: MetricType,
  season: number,
): MetricChange | null {
  const [baseline, ...later] = attemptsIn(index, playerId, metric, season);
  const best = bestAttempt(metric, later);
  if (!baseline || !best) return null;
  return changeBetween(playerId, metric, baseline, best);
}

/**
 * The latest test of the season against the one before it, when it went backwards past the
 * noise floor. Mid-preseason that is more often a knock or fatigue than effort, so the
 * dashboard frames it as "check in with", not as a ranking.
 */
export function seasonDrop(
  index: EntryIndex,
  playerId: string,
  metric: MetricType,
  season: number,
): MetricChange | null {
  const attempts = attemptsIn(index, playerId, metric, season);
  if (attempts.length < 2) return null;
  const result = changeBetween(
    playerId,
    metric,
    attempts[attempts.length - 2],
    attempts[attempts.length - 1],
  );
  return result.verdict === 'worse' ? result : null;
}

/**
 * A rookie is anyone tested this year who was never tested before. Derived from the data
 * rather than a profile field, so a veteran who joined before the app existed counts as a
 * rookie in their first recorded year - the learning effect that makes rookies a separate
 * list is about the drills, and that is when they first met them here.
 */
export function isRookie(index: EntryIndex, playerId: string, season: number): boolean {
  let first: string | null = null;
  for (const series of index.byPlayer.get(playerId)?.values() ?? []) {
    if (series.length > 0 && (first === null || series[0].date < first)) first = series[0].date;
  }
  return first !== null && seasonOf(first) === season;
}

/** At least this many of the four qualities must have been compared for an overall score. */
export const MIN_DOMAINS_FOR_SCORE = 2;

export interface AthleteScore {
  playerId: string;
  /** Mean percent improvement across the compared domains. */
  overall: number;
  byDomain: Partial<Record<DomainKey, number>>;
  changes: MetricChange[];
}

/**
 * One figure per player from many per-metric changes, best first.
 *
 * Percent, so a sprint and a jump can be averaged at all; averaged inside each domain first,
 * so the two agility drills do not outvote the one sprint (the same reason `domainScores`
 * does it). A change inside the noise floor counts as zero: otherwise the athlete whose
 * timing errors all happened to fall the right way would top the list.
 */
export function rankAthletes(changes: MetricChange[]): AthleteScore[] {
  const byPlayer = new Map<string, MetricChange[]>();
  for (const change of changes) {
    const list = byPlayer.get(change.playerId);
    if (list) list.push(change);
    else byPlayer.set(change.playerId, [change]);
  }

  const scores: AthleteScore[] = [];
  for (const [playerId, list] of byPlayer) {
    const byDomain: Partial<Record<DomainKey, number>> = {};
    for (const key of DOMAIN_KEYS) {
      const percents = list
        .filter((c) => DOMAINS[key].metrics.includes(c.metric))
        .map((c) => (c.verdict === 'same' ? 0 : c.percent));
      if (percents.length > 0) {
        byDomain[key] = percents.reduce((a, b) => a + b, 0) / percents.length;
      }
    }
    const domainValues = Object.values(byDomain);
    if (domainValues.length < MIN_DOMAINS_FOR_SCORE) continue;
    scores.push({
      playerId,
      overall: domainValues.reduce((a, b) => a + b, 0) / domainValues.length,
      byDomain,
      changes: list,
    });
  }
  return scores.sort((a, b) => b.overall - a.overall);
}

/** Every per-metric change of one kind, for a set of players and one season. */
export function changesFor(
  compare: typeof yearOverYear,
  index: EntryIndex,
  playerIds: string[],
  season: number,
): MetricChange[] {
  return playerIds.flatMap((playerId) =>
    METRIC_KEYS.flatMap((metric) => {
      const result = compare(index, playerId, metric, season);
      return result ? [result] : [];
    }),
  );
}

export interface SeasonRecord {
  metric: MetricType;
  value: number;
  date: string;
  /** The best they had managed before the record. */
  previousBest: number;
}

export interface PlayerRecords {
  playerId: string;
  records: SeasonRecord[];
}

/**
 * Personal bests set during the season, at most one per metric, players with the most
 * first. A first-ever attempt is not a record here - the session report counts it, but in a
 * "most PBs" list it would hand the award to whoever turned up for the most drills.
 */
export function seasonRecords(
  index: EntryIndex,
  playerIds: string[],
  season: number,
): PlayerRecords[] {
  const result: PlayerRecords[] = [];
  for (const playerId of playerIds) {
    const records: SeasonRecord[] = [];
    for (const metric of METRIC_KEYS) {
      const best = bestAttempt(metric, attemptsIn(index, playerId, metric, season));
      if (!best) continue;
      const before = bestAttempt(
        metric,
        seriesFor(index, playerId, metric).filter((a) => a.date < best.date),
      );
      if (before && isBetter(metric, best.value, before.value)) {
        records.push({ metric, value: best.value, date: best.date, previousBest: before.value });
      }
    }
    if (records.length > 0) result.push({ playerId, records });
  }
  return result.sort((a, b) => b.records.length - a.records.length);
}

export interface MetricProgress {
  metric: MetricType;
  /** Returning players with a best in both years. */
  n: number;
  /** Median year-over-year improvement, in the metric's unit. */
  medianImprovement: number | null;
  verdict: Verdict | null;
}

/**
 * Whether the squad got better, per metric, counting only players tested in both years.
 * Comparing this year's whole squad with last year's would mostly measure who joined and
 * who left; the returning players are the only like-for-like comparison there is.
 */
export function squadProgress(
  index: EntryIndex,
  playerIds: string[],
  season: number,
): MetricProgress[] {
  return METRIC_KEYS.map((metric) => {
    const deltas = playerIds.flatMap((playerId) => {
      const result = yearOverYear(index, playerId, metric, season);
      return result ? [result.improvement] : [];
    });
    const mid = median(deltas);
    return {
      metric,
      n: deltas.length,
      medianImprovement: mid,
      verdict: mid === null ? null : verdict(metric, mid),
    };
  });
}
