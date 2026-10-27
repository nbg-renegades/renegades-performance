import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Award,
  CalendarDays,
  ClipboardList,
  HeartPulse,
  Medal,
  Sprout,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatMetricValue, meaningfulChange, metricLabel, metricUnit } from "@/lib/metrics";
import { coverageByMetric, sessionReport, todayIso } from "@/lib/analytics";
import {
  changesFor,
  focusSeason,
  isRookie,
  rankAthletes,
  seasonDrop,
  seasonGain,
  seasonLabel,
  seasonOf,
  seasonRecords,
  squadProgress,
  yearOverYear,
  type AthleteScore,
  type MetricChange,
} from "@/lib/seasons";
import { useSquadAnalytics } from "@/hooks/useSquadAnalytics";
import { DeltaBadge } from "@/components/viz/DeltaBadge";
import { errorMessage } from "@/lib/errors";

/**
 * What a coach needs on opening the app.
 *
 * The old dashboard gave every role the same three cards - a headcount, an entry count, and a
 * card telling you your own role, which you already knew - then the team's best values with
 * nobody's name attached, then alerts about the *viewer's own* missing metrics, which for a
 * coach who is not a player were always empty.
 *
 * Nothing here is a number for its own sake. Each card is a thing to do: run the session that
 * is overdue, look at the athlete who moved, chase the measurements that are missing.
 */

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export function CoachDashboard({ name }: { name: string }) {
  const navigate = useNavigate();
  const analytics = useSquadAnalytics();
  const { index, playerIds, now, nameOf } = analytics;

  const lastSessionDate = index.dates[0] ?? null;

  const lastSession = useMemo(
    () => (lastSessionDate ? sessionReport(index, lastSessionDate, playerIds) : null),
    [index, lastSessionDate, playerIds],
  );

  const coverage = useMemo(
    () => coverageByMetric(index, playerIds, now),
    [index, playerIds, now],
  );

  /**
   * Who is moving, by the testing calendar rather than a sliding window: the squad is tested
   * two or three times each preseason and not at all in between, so "the last six months" was
   * empty most of the year. Out of preseason this is last year's recap. See src/lib/seasons.
   */
  const season = useMemo(() => {
    const focus = focusSeason(index, now);
    if (!focus) return null;
    const year = focus.season;
    const rookies = playerIds.filter((id) => isRookie(index, id, year));
    const returning = playerIds.filter((id) => !rookies.includes(id));
    return {
      ...focus,
      // Every player is in exactly one "most improved" family: returning players are judged
      // year over year, rookies on what this preseason did for them.
      sinceLastYear: rankAthletes(changesFor(yearOverYear, index, returning, year)),
      thisPreseason: rankAthletes(changesFor(seasonGain, index, returning, year)),
      rookies: rankAthletes(changesFor(seasonGain, index, rookies, year)),
      records: seasonRecords(index, playerIds, year).slice(0, 5),
      // One row per player, worst first: the point is who to talk to, not which drill.
      drops: rankAthletesByDrop(changesFor(seasonDrop, index, playerIds, year)).slice(0, 5),
      progress: squadProgress(index, returning, year),
    };
  }, [index, playerIds, now]);

  const untestedTotal = coverage.reduce((sum, c) => sum + c.missing.length, 0);
  const staleTotal = coverage.reduce((sum, c) => sum + c.stale.length, 0);
  const daysSinceSession = lastSessionDate
    ? Math.floor((now.getTime() - new Date(lastSessionDate).getTime()) / 86_400_000)
    : null;

  if (analytics.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(analytics.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">Welcome back, {name}</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          {analytics.isPending
            ? "Loading the squad…"
            : `${playerIds.length} players on the roster`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate("/log")}>
          <ClipboardList className="mr-2 h-4 w-4" />
          Record session
        </Button>
        <Button variant="outline" onClick={() => navigate("/team")}>
          <Users className="mr-2 h-4 w-4" />
          Squad matrix
        </Button>
      </div>

      {analytics.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          {(untestedTotal > 0 || staleTotal > 0) && (
            <Alert>
              <AlertDescription className="flex flex-wrap items-baseline gap-x-2">
                <strong>{untestedTotal}</strong> player-and-metric combinations have never been
                measured and <strong>{staleTotal}</strong> have not been tested yet in{" "}
                {seasonLabel(seasonOf(todayIso(now)))}.
                <Link
                  to="/team/coverage"
                  className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  See what to test next
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <CardTitle>Last session</CardTitle>
                </div>
                <CardDescription>
                  {lastSessionDate
                    ? `${formatDate(lastSessionDate)}${
                        daysSinceSession !== null
                          ? ` · ${daysSinceSession === 0 ? "today" : `${daysSinceSession} days ago`}`
                          : ""
                      }`
                    : "Nothing has been recorded yet."}
                </CardDescription>
              </CardHeader>
              {lastSession && (
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Players" value={lastSession.playersTested.length} />
                    <Stat label="Measurements" value={lastSession.entryCount} />
                    <Stat label="Records" value={lastSession.personalBests.length} />
                  </div>
                  {lastSession.personalBests.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Personal bests set
                      </p>
                      <ul className="space-y-1 text-sm">
                        {lastSession.personalBests.slice(0, 4).map((record) => (
                          <li
                            key={`${record.playerId}-${record.metric}`}
                            className="flex items-baseline gap-2"
                          >
                            <Award
                              className="h-3.5 w-3.5 shrink-0"
                              style={{ color: "var(--viz-good)" }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{nameOf(record.playerId)}</span>
                            <span className="text-xs text-muted-foreground">
                              {metricLabel(record.metric)}
                            </span>
                            <span className="ml-auto font-semibold tabular-nums text-primary">
                              {formatMetricValue(record.metric, record.value)}{" "}
                              <span className="text-xs font-normal text-muted-foreground">
                                {metricUnit(record.metric)}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Link
                    to={`/team/sessions/${lastSessionDate}`}
                    className="inline-block rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Full session report
                  </Link>
                </CardContent>
              )}
            </Card>

            {season && (
              <Card className="border-border/50 shadow-card">
                <CardHeader>
                  <CardTitle>Returning players vs {seasonLabel(season.season - 1)}</CardTitle>
                  <CardDescription>
                    Median change in season bests, counting only players tested in both
                    years, so new arrivals and departures do not decide it.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border/50 text-sm">
                    {season.progress.map((p) => (
                      <li key={p.metric} className="flex items-center gap-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{metricLabel(p.metric)}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          n={p.n}
                        </span>
                        <DeltaBadge
                          metric={p.metric}
                          improvement={p.medianImprovement}
                          threshold={meaningfulChange(p.metric)}
                          against={seasonLabel(season.season - 1)}
                          className="w-20 shrink-0 justify-end"
                        />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {season && (
            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <CardTitle>
                  {season.isCurrent ? "Who is moving" : "Recap"} · Preseason{" "}
                  {seasonLabel(season.season)}
                </CardTitle>
                <CardDescription>
                  {season.isCurrent
                    ? "So far this preseason."
                    : `Nothing tested in ${seasonLabel(seasonOf(todayIso(now)))} yet, so this is ` +
                      "last year until the first session."}{" "}
                  Overall figures average the percent change per quality (speed, agility,
                  power, endurance); changes inside a drill&apos;s measurement noise count as
                  zero.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                <ScoreList
                  title={`Most improved since ${seasonLabel(season.season - 1)}`}
                  icon={
                    <TrendingUp
                      className="h-4 w-4"
                      style={{ color: "var(--viz-good)" }}
                      aria-hidden="true"
                    />
                  }
                  scores={season.sinceLastYear}
                  nameOf={nameOf}
                  emptyText="Needs returning players tested in both years on at least two qualities."
                />
                <ScoreList
                  title="Most improved this preseason"
                  icon={
                    <TrendingUp
                      className="h-4 w-4"
                      style={{ color: "var(--viz-good)" }}
                      aria-hidden="true"
                    />
                  }
                  scores={season.thisPreseason}
                  nameOf={nameOf}
                  emptyText="Needs a second test this preseason."
                />
                <ScoreList
                  title="Most improved rookie"
                  icon={
                    <Sprout
                      className="h-4 w-4"
                      style={{ color: "var(--viz-good)" }}
                      aria-hidden="true"
                    />
                  }
                  scores={season.rookies}
                  nameOf={nameOf}
                  emptyText="No rookie has a second test this preseason yet."
                />
                <AwardList
                  title="Most personal bests"
                  icon={
                    <Medal
                      className="h-4 w-4"
                      style={{ color: "var(--viz-good)" }}
                      aria-hidden="true"
                    />
                  }
                  emptyText="No records beaten yet. A first-ever attempt does not count."
                  rows={season.records.map((r) => ({
                    playerId: r.playerId,
                    detail: r.records.map((x) => metricLabel(x.metric)).join(", "),
                    value: (
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: "var(--viz-good)" }}
                      >
                        {r.records.length} PB{r.records.length === 1 ? "" : "s"}
                      </span>
                    ),
                  }))}
                  nameOf={nameOf}
                />
                {season.isCurrent && (
                  <AwardList
                    title="Check in with"
                    icon={
                      <HeartPulse
                        className="h-4 w-4"
                        style={{ color: "var(--viz-serious)" }}
                        aria-hidden="true"
                      />
                    }
                    emptyText="Nobody went backwards past the noise at their latest test."
                    rows={season.drops.map(({ playerId, changes }) => ({
                      playerId,
                      detail: changes.map((c) => metricLabel(c.metric)).join(", "),
                      title: changes.map(describeChange).join("\n"),
                      value:
                        changes.length === 1 ? (
                          <DeltaBadge
                            metric={changes[0].metric}
                            improvement={changes[0].improvement}
                            percent={changes[0].percent}
                            against="the previous test"
                          />
                        ) : (
                          <span
                            className="text-xs font-medium"
                            style={{ color: "var(--viz-serious)" }}
                          >
                            {changes.length} drills
                          </span>
                        ),
                    }))}
                    nameOf={nameOf}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function describeChange(c: MetricChange): string {
  return (
    `${metricLabel(c.metric)}: ${formatMetricValue(c.metric, c.from.value)} → ` +
    `${formatMetricValue(c.metric, c.to.value)} ${metricUnit(c.metric)}`
  );
}

function rankAthletesByDrop(drops: MetricChange[]) {
  const byPlayer = new Map<string, MetricChange[]>();
  for (const drop of drops) {
    byPlayer.set(drop.playerId, [...(byPlayer.get(drop.playerId) ?? []), drop]);
  }
  return [...byPlayer]
    .map(([playerId, changes]) => ({
      playerId,
      changes: changes.sort((a, b) => a.percent - b.percent),
    }))
    .sort((a, b) => a.changes[0].percent - b.changes[0].percent);
}

/**
 * A ranked list of athletes who improved. Takes the whole ranking, not just the improvers,
 * so that "nobody compared yet" and "nobody beat the noise" can say different things.
 */
function ScoreList({
  scores,
  emptyText,
  ...rest
}: {
  title: string;
  icon: React.ReactNode;
  scores: AthleteScore[];
  nameOf: (id: string) => string;
  emptyText: string;
}) {
  const improved = scores.filter((score) => score.overall > 0).slice(0, 5);
  return (
    <AwardList
      {...rest}
      emptyText={
        scores.length === 0
          ? emptyText
          : `${scores.length} compared; nobody has improved past the measurement noise yet.`
      }
      rows={improved.map((score) => {
        const improved = score.changes.filter((c) => c.verdict === "better");
        return {
          playerId: score.playerId,
          detail: improved.map((c) => metricLabel(c.metric)).join(", "),
          title: score.changes.map(describeChange).join("\n"),
          value: (
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: "var(--viz-good)" }}
            >
              +{score.overall.toFixed(1)}%
            </span>
          ),
        };
      })}
    />
  );
}

function AwardList({
  title,
  icon,
  rows,
  nameOf,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ playerId: string; detail: string; title?: string; value: React.ReactNode }>;
  nameOf: (id: string) => string;
  emptyText: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.playerId} title={row.title}>
              {/* The whole row is the link: on a phone every link is a 44px tap target, and a
                  name-only link would push its detail line down against the next row. */}
              <Link
                to={`/players/${row.playerId}`}
                className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate underline-offset-4 group-hover:underline">
                    {nameOf(row.playerId)}
                  </span>
                  <span className="shrink-0">{row.value}</span>
                </span>
                {row.detail && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.detail}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
