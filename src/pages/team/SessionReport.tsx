import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Award, UserX } from "lucide-react";
import { formatMetricValue, metricLabel, metricUnit } from "@/lib/metrics";
import { sessionReport } from "@/lib/analytics";
import { DeltaBadge } from "@/components/viz/DeltaBadge";
import { useTeamContext } from "./context";

/**
 * One testing day, as it stood on the day.
 *
 * Every comparison here is against what each athlete had done *before* this date, so opening
 * an old session reports what it reported at the time rather than re-judging it against
 * everything that happened since.
 */

const TeamSessionReport = () => {
  const { date = "" } = useParams();
  const { analytics, memberIds, groupLabel } = useTeamContext();
  const { index, nameOf } = analytics;

  const report = useMemo(
    () => sessionReport(index, date, memberIds),
    [index, date, memberIds],
  );

  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : date;

  const improvements = report.movers.filter((m) => m.improvement > 0);
  const regressions = report.movers.filter((m) => m.improvement < 0).reverse();

  return (
    <div className="space-y-4 md:space-y-6">
      <Link
        to="/team/sessions"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All sessions
      </Link>

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>{formatted}</CardTitle>
          <CardDescription>
            {report.entryCount} {report.entryCount === 1 ? "measurement" : "measurements"} from{" "}
            {report.playersTested.length}{" "}
            {report.playersTested.length === 1 ? "player" : "players"} in{" "}
            {groupLabel.toLowerCase()}, across {report.metricsCovered.length}{" "}
            {report.metricsCovered.length === 1 ? "drill" : "drills"}.
          </CardDescription>
        </CardHeader>
        {report.entryCount === 0 && (
          <CardContent>
            <Alert>
              <AlertDescription>
                Nothing was recorded on this date for {groupLabel.toLowerCase()}. It may belong
                to a different group, or the date may not be a session at all.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      {report.personalBests.length > 0 && (
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5" style={{ color: "var(--viz-good)" }} />
              <CardTitle>Personal bests set</CardTitle>
            </div>
            <CardDescription>
              Values that beat everything the athlete had recorded before this day. A
              first-ever measurement counts, and says so.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {report.personalBests.map((record) => (
                <li
                  key={`${record.playerId}-${record.metric}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <Link
                    to={`/players/${record.playerId}`}
                    className="rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {nameOf(record.playerId)}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {metricLabel(record.metric)}
                  </span>
                  <span className="font-semibold tabular-nums text-primary">
                    {formatMetricValue(record.metric, record.value)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {metricUnit(record.metric)}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {record.previousBest === null
                      ? "first measurement"
                      : `previous best ${formatMetricValue(record.metric, record.previousBest)}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <MoveList
          title="Biggest improvements"
          description="Measured against each athlete's previous test of the same drill."
          moves={improvements}
          nameOf={nameOf}
          emptyText="Nobody improved on their previous test this day."
        />
        <MoveList
          title="Went backwards"
          description="Not necessarily a problem - fatigue, a heavy training block or a bad surface all show up here - but worth a look."
          moves={regressions}
          nameOf={nameOf}
          emptyText="Nobody went backwards this day."
        />
      </div>

      {report.absentees.length > 0 && (
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-muted-foreground" />
              <CardTitle>No measurement this day</CardTitle>
            </div>
            <CardDescription>
              {report.absentees.length} of {memberIds.length} in {groupLabel.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {report.absentees.map((id) => (
                <Link
                  key={id}
                  to={`/players/${id}`}
                  className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {nameOf(id)}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function MoveList({
  title,
  description,
  moves,
  nameOf,
  emptyText,
}: {
  title: string;
  description: string;
  moves: ReturnType<typeof sessionReport>["movers"];
  nameOf: (id: string) => string;
  emptyText: string;
}) {
  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {moves.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {moves.slice(0, 8).map((move) => (
              <li
                key={`${move.playerId}-${move.metric}`}
                className="flex items-center gap-3 text-sm"
              >
                <Link
                  to={`/players/${move.playerId}`}
                  className="min-w-0 flex-1 truncate rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {nameOf(move.playerId)}
                </Link>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {metricLabel(move.metric)}
                </span>
                <DeltaBadge
                  metric={move.metric}
                  improvement={move.improvement}
                  percent={move.percent}
                  className="shrink-0"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default TeamSessionReport;
