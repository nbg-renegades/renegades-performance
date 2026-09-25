import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, CalendarDays, ClipboardList, TrendingDown, TrendingUp, Users } from "lucide-react";
import { METRIC_KEYS, formatMetricValue, metricLabel, metricUnit } from "@/lib/metrics";
import {
  STALE_AFTER_DAYS,
  coverageByMetric,
  sessionReport,
  trend,
  type Trend,
} from "@/lib/analytics";
import { useSquadAnalytics } from "@/hooks/useSquadAnalytics";
import { TrendIndicator } from "@/components/viz/TrendIndicator";
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
   * The athletes who moved most over the recent window, either way. Ranked by percent so a
   * sprint's tenths and a jump's centimetres can sit in the same list.
   */
  const movers = useMemo(() => {
    const rows = playerIds.flatMap((playerId) =>
      METRIC_KEYS.flatMap((metric) => {
        const result = trend(index, playerId, metric, 6, now);
        if (result.direction === "insufficient" || result.percentPer30Days === null) return [];
        // The whole Trend travels, not a bare number: a percent per month is not a value in the
        // metric's unit, and anything that formats it as one would print a sprint's "0.8" as
        // seconds.
        return [{ playerId, metric, trend: result, percent: result.percentPer30Days }];
      }),
    );
    rows.sort((a, b) => b.percent - a.percent);
    return { improving: rows.slice(0, 5), declining: rows.slice(-5).reverse() };
  }, [playerIds, index, now]);

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
                measured and <strong>{staleTotal}</strong> are older than {STALE_AFTER_DAYS} days.
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

            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <CardTitle>Who is moving</CardTitle>
                <CardDescription>
                  Fitted trend over the last 6 months, as percent per month, so drills in
                  different units can be compared. Needs at least three tests to appear.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <MoverList
                  title="Improving"
                  icon={
                    <TrendingUp
                      className="h-4 w-4"
                      style={{ color: "var(--viz-good)" }}
                      aria-hidden="true"
                    />
                  }
                  rows={movers.improving.filter((m) => m.percent > 0)}
                  nameOf={nameOf}
                  emptyText="Nobody has three tests on the same drill yet."
                />
                <MoverList
                  title="Sliding"
                  icon={
                    <TrendingDown
                      className="h-4 w-4"
                      style={{ color: "var(--viz-serious)" }}
                      aria-hidden="true"
                    />
                  }
                  rows={movers.declining.filter((m) => m.percent < 0)}
                  nameOf={nameOf}
                  emptyText="Nobody is trending down."
                />
              </CardContent>
            </Card>
          </div>
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

function MoverList({
  title,
  icon,
  rows,
  nameOf,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{
    playerId: string;
    metric: (typeof METRIC_KEYS)[number];
    trend: Trend;
    percent: number;
  }>;
  nameOf: (id: string) => string;
  emptyText: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={`${row.playerId}-${row.metric}`} className="flex items-center gap-2">
              <Link
                to={`/players/${row.playerId}`}
                className="min-w-0 flex-1 truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {nameOf(row.playerId)}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {metricLabel(row.metric)}
              </span>
              <TrendIndicator trend={row.trend} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
