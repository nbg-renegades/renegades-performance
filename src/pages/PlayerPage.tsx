import { useMemo } from "react";
import { Navigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Target, Trophy } from "lucide-react";
import {
  METRIC_KEYS,
  formatMetricValue,
  metricLabel,
  metricUnit,
  type MetricType,
} from "@/lib/metrics";
import { queryKeys, fetchSquad } from "@/lib/queries";
import { POSITION_LABELS, getPositionUnit } from "@/lib/positionUtils";
import { MIN_GROUP_FOR_PERCENTILE, type GroupSpec } from "@/lib/analytics";
import { useViewer } from "@/hooks/useViewer";
import { usePlayerAnalytics, type PlayerStandingRow } from "@/hooks/usePlayerAnalytics";
import { useSearchParamState } from "@/hooks/useSearchParamState";
import { DeltaBadge, PersonalBestBadge } from "@/components/viz/DeltaBadge";
import { PercentileLegend, PercentileMeter } from "@/components/viz/PercentileMeter";
import { PercentileRadar, type RadarSeries } from "@/components/viz/PercentileRadar";
import { DomainScoresRow } from "@/components/viz/DomainScores";
import { StatusChip, TrendIndicator } from "@/components/viz/TrendIndicator";
import { PlayerPerformanceChart } from "@/components/PlayerPerformanceChart";
import { errorMessage } from "@/lib/errors";

/**
 * Everything about one athlete, in one place.
 *
 * "Show me Max" is the most natural thing a coach says about this data and there was no page
 * for it. The three questions - what are their numbers, how have they moved, where do they
 * stand - were three separate tabs, each with its own player dropdown that forgot the choice
 * when you left it, and none of them addressable by a link.
 *
 * A player opening /me gets exactly the same page about themselves. The only difference is
 * whose name appears as the next target, and that is decided by the server rather than hidden
 * here.
 */

const PlayerPage = () => {
  const { id = "" } = useParams();
  const viewer = useViewer();

  const [rawGroup, setRawGroup] = useSearchParamState("group", "team");

  const { data: squad = [] } = useQuery({
    queryKey: queryKeys.squad,
    queryFn: fetchSquad,
  });

  const member = squad.find((p) => p.id === id);
  const position = member?.position ?? "unassigned";

  const group = useMemo<GroupSpec>(() => {
    if (rawGroup === "offense" || rawGroup === "defense") return { kind: rawGroup };
    if (rawGroup === "position") {
      return position === "unassigned" ? { kind: "team" } : { kind: "position", position };
    }
    return { kind: "team" };
  }, [rawGroup, position]);

  const analytics = usePlayerAnalytics(id, group);

  // A player may only look at themselves. The edge function refuses the request anyway, so
  // this is about not rendering a page of blanks rather than about access control.
  if (!viewer.isPending && !viewer.isCoach && id && id !== viewer.userId) {
    return <Navigate to="/me" replace />;
  }

  const unit = position === "unassigned" ? null : getPositionUnit(position);

  const groupLabel =
    group.kind === "team"
      ? "the whole squad"
      : group.kind === "position" && group.position
        ? POSITION_LABELS[group.position].toLowerCase() + "s"
        : group.kind;

  const radarSeries: RadarSeries[] = [
    {
      key: "player",
      label: member?.name ?? "This player",
      percentiles: analytics.percentiles,
      values: new Map(
        METRIC_KEYS.flatMap((metric) => {
          const latest = analytics.summaries[metric]?.latest;
          return latest === null || latest === undefined ? [] : [[metric, latest] as const];
        }),
      ),
      color: "var(--viz-series-1)",
    },
  ];

  if (analytics.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(analytics.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold md:text-3xl">
            {member?.name ?? (analytics.isPending ? "…" : "Player")}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            {position === "unassigned"
              ? "No position on file"
              : `${POSITION_LABELS[position]}${unit ? ` · ${unit}` : ""}`}
          </p>
        </div>

        <div className="w-full sm:w-56">
          <Label htmlFor="player-group" className="mb-2 block text-sm">
            Rank against
          </Label>
          <Select value={rawGroup} onValueChange={setRawGroup}>
            <SelectTrigger id="player-group" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="team">Whole squad</SelectItem>
              {position !== "unassigned" && (
                <SelectItem value="position">{POSITION_LABELS[position]}s</SelectItem>
              )}
              {unit && <SelectItem value={unit}>{unit === "offense" ? "Offense" : "Defense"}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {analytics.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <CardTitle>Where they stand</CardTitle>
              <CardDescription>
                Percentile scores against {groupLabel}, where 50 is the middle of the group. The
                four quality scores and the overall are derived from the six measurements, never
                stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DomainScoresRow scores={analytics.scores} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <CardTitle>Profile shape</CardTitle>
                <CardDescription>
                  All six metrics on one scale. The plain ring is the group median, so anything
                  inside it is below the middle of {groupLabel}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PercentileRadar series={radarSeries} />
              </CardContent>
            </Card>

            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <CardTitle>Personal bests</CardTitle>
                </div>
                <CardDescription>
                  Their best ever value for each metric, and when it was set. The current value
                  sits beside it, so a best that is no longer being matched is visible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {METRIC_KEYS.map((metric) => {
                    const summary = analytics.summaries[metric];
                    if (summary.personalBest === null) return null;
                    return (
                      <li
                        key={metric}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-sm">{metricLabel(metric)}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-semibold tabular-nums text-primary">
                            {formatMetricValue(metric, summary.personalBest)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              {metricUnit(metric)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {summary.personalBestDate
                              ? new Date(summary.personalBestDate).toLocaleDateString()
                              : ""}
                          </span>
                          {summary.isPersonalBest && summary.attempts > 1 && <PersonalBestBadge />}
                        </span>
                      </li>
                    );
                  })}
                  {METRIC_KEYS.every((m) => analytics.summaries[m].personalBest === null) && (
                    <li className="text-sm text-muted-foreground">Nothing measured yet.</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <CardTitle>Metric by metric</CardTitle>
              <CardDescription>
                Current value, how it changed since the previous test, where it ranks in{" "}
                {groupLabel}, and what the next target is.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {METRIC_KEYS.map((metric) => (
                  <MetricCard
                    key={metric}
                    metric={metric}
                    summary={analytics.summaries[metric]}
                    standing={analytics.standings[metric]}
                    trend={analytics.trends[metric]}
                    showsNames={analytics.showsNames}
                  />
                ))}
              </div>
              <PercentileLegend />
            </CardContent>
          </Card>

          {/* The history chart keeps its own metric and timeframe controls; both now live in the
              URL, so a link to this page carries the drill and the window someone was looking
              at. */}
          <PlayerPerformanceChart
            currentUserId={id}
            userRole={viewer.role}
            selectedPlayerId={id}
            lockPlayer
            medianByMetric={
              new Map(
                METRIC_KEYS.flatMap((metric) => {
                  const median = analytics.standings[metric]?.median;
                  return median === null || median === undefined
                    ? []
                    : [[metric, median] as const];
                }),
              )
            }
            personalBestByMetric={
              new Map(
                METRIC_KEYS.flatMap((metric) => {
                  const best = analytics.summaries[metric]?.personalBest;
                  return best === null || best === undefined ? [] : [[metric, best] as const];
                }),
              )
            }
          />
        </>
      )}
    </div>
  );
};

function MetricCard({
  metric,
  summary,
  standing,
  trend,
  showsNames,
}: {
  metric: MetricType;
  summary: ReturnType<typeof usePlayerAnalytics>["summaries"][MetricType];
  standing: PlayerStandingRow;
  trend: ReturnType<typeof usePlayerAnalytics>["trends"][MetricType];
  showsNames: boolean;
}) {
  if (summary.latest === null) {
    return (
      <div className="rounded-lg border border-border p-4">
        <h4 className="text-sm font-semibold">{metricLabel(metric)}</h4>
        <p className="mt-2">
          <StatusChip status="missing" />
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{metricLabel(metric)}</h4>
          <p className="mt-1 text-2xl font-bold">
            {formatMetricValue(metric, summary.latest)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {metricUnit(metric)}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <DeltaBadge
            metric={metric}
            improvement={summary.improvementVsPrevious}
            percent={summary.improvementVsPreviousPercent}
          />
          <TrendIndicator trend={trend} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {standing.rank !== null && standing.n > 0
              ? `Rank ${standing.rank} of ${standing.n}`
              : "Not ranked"}
          </span>
          {standing.median !== null && (
            <span>group median {formatMetricValue(metric, standing.median)}</span>
          )}
        </div>
        <PercentileMeter
          percentile={standing.percentile}
          reliable={standing.reliable}
          showValue
        />
        {!standing.reliable && standing.n > 0 && (
          <p className="text-xs text-muted-foreground">
            Only {standing.n} measured in this group, fewer than the{" "}
            {MIN_GROUP_FOR_PERCENTILE} a ranking needs to mean much.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 border-t border-border pt-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="text-xs">
          {standing.nextTargetValue === null ? (
            <span className="text-muted-foreground">
              {standing.rank === 1 ? "Best in this group" : "No one ahead to chase"}
            </span>
          ) : (
            <>
              <span className="text-muted-foreground">Next target: </span>
              <span className="font-medium tabular-nums">
                {formatMetricValue(metric, standing.nextTargetValue)} {metricUnit(metric)}
              </span>
              {showsNames && standing.nextTargetName && (
                <span className="text-muted-foreground"> ({standing.nextTargetName})</span>
              )}
            </>
          )}
        </div>
      </div>

      <StatusChip status={summary.status} daysSinceLast={summary.daysSinceLast} />
    </div>
  );
}

export default PlayerPage;
