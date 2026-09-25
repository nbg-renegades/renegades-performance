import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Target, User } from "lucide-react";
import { METRIC_KEYS, formatMetricValue, metricLabel, metricUnit } from "@/lib/metrics";
import { STALE_AFTER_DAYS } from "@/lib/analytics";
import { usePlayerAnalytics } from "@/hooks/usePlayerAnalytics";
import { DeltaBadge, PersonalBestBadge } from "@/components/viz/DeltaBadge";
import { DomainScoresRow } from "@/components/viz/DomainScores";
import { PercentileMeter } from "@/components/viz/PercentileMeter";
import { errorMessage } from "@/lib/errors";

/**
 * What a player needs on opening the app.
 *
 * They used to get the same page as a coach: a headcount of the team, a count of everyone's
 * entries, and a card naming the role they had just signed in as. The one genuinely useful part
 * - which of their own metrics were missing or stale - sat at the bottom under two panels of
 * team-wide numbers they could do nothing about.
 *
 * Their own standing, their own records, and what to aim at next. Teammates' names never appear
 * here, and not because this page omits them: the standing function withholds them from anyone
 * without a coach role.
 */
export function PlayerDashboard({ name, userId }: { name: string; userId: string }) {
  const navigate = useNavigate();
  const analytics = usePlayerAnalytics(userId);

  const needsAttention = METRIC_KEYS.filter(
    (metric) => analytics.summaries[metric]?.status !== "current",
  );

  const measured = METRIC_KEYS.filter(
    (metric) => analytics.summaries[metric]?.latest !== null,
  );

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
          Your standing across the squad, and what to aim at next
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate("/log")}>
          <Plus className="mr-2 h-4 w-4" />
          Log a result
        </Button>
        <Button variant="outline" onClick={() => navigate("/me")}>
          <User className="mr-2 h-4 w-4" />
          My full page
        </Button>
      </div>

      {analytics.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : measured.length === 0 ? (
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <CardTitle>Nothing measured yet</CardTitle>
            <CardDescription>
              Once your first results are recorded, this page shows where you stand against the
              squad and what to aim at next.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {needsAttention.length > 0 && (
            <Alert>
              <AlertDescription>
                <strong>Worth re-testing:</strong>{" "}
                {needsAttention
                  .map((metric) => {
                    const summary = analytics.summaries[metric];
                    return summary.status === "missing"
                      ? `${metricLabel(metric)} (never measured)`
                      : `${metricLabel(metric)} (${summary.daysSinceLast} days old)`;
                  })
                  .join(", ")}
                . Anything older than {STALE_AFTER_DAYS} days counts as stale.
              </AlertDescription>
            </Alert>
          )}

          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <CardTitle>Where you stand</CardTitle>
              <CardDescription>
                Percentile against the whole squad, where 50 is the middle. The quality scores
                and the overall are worked out from your six measurements, not stored.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DomainScoresRow scores={analytics.scores} />
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <CardTitle>Your metrics</CardTitle>
              <CardDescription>
                Latest value, how it changed since your previous test, where it ranks, and the
                next value to beat.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 md:grid-cols-2">
                {METRIC_KEYS.map((metric) => {
                  const summary = analytics.summaries[metric];
                  const standing = analytics.standings[metric];
                  if (summary.latest === null) return null;
                  return (
                    <li key={metric} className="space-y-2 rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{metricLabel(metric)}</p>
                          <p className="mt-0.5 text-xl font-bold">
                            {formatMetricValue(metric, summary.latest)}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                              {metricUnit(metric)}
                            </span>
                          </p>
                        </div>
                        <span className="flex flex-col items-end gap-1">
                          <DeltaBadge
                            metric={metric}
                            improvement={summary.improvementVsPrevious}
                            percent={summary.improvementVsPreviousPercent}
                          />
                          {summary.isPersonalBest && summary.attempts > 1 && <PersonalBestBadge />}
                        </span>
                      </div>
                      <PercentileMeter
                        percentile={standing.percentile}
                        reliable={standing.reliable}
                        showValue
                      />
                      {standing.nextTargetValue !== null && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Target className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                          Next target{" "}
                          <span className="font-medium tabular-nums text-foreground">
                            {formatMetricValue(metric, standing.nextTargetValue)}{" "}
                            {metricUnit(metric)}
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            <Link
              to="/me"
              className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Your full page
            </Link>{" "}
            has your history over time, your profile shape and every personal best.
          </p>
        </>
      )}
    </div>
  );
}
