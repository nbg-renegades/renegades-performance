import { useMemo } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, CalendarDays, ChevronRight } from "lucide-react";
import { METRIC_KEYS } from "@/lib/metrics";
import { sessionReport } from "@/lib/analytics";
import { useTeamContext } from "./context";

/**
 * Every day anything was recorded, newest first.
 *
 * A testing day is the unit a coach actually works in - "what did we do on Tuesday" - and the
 * app had no concept of one. The entries list could be grouped by date, but that is a list of
 * rows rather than an account of a session, with no notion of who was missing or what changed.
 */

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const TeamSessions = () => {
  const { analytics, memberIds } = useTeamContext();
  const { index } = analytics;

  const sessions = useMemo(
    () =>
      index.dates.map((date) => ({
        date,
        report: sessionReport(index, date, memberIds),
      })),
    [index, memberIds],
  );

  if (sessions.length === 0) {
    return (
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Nothing has been recorded yet.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Every day with a recorded measurement. Open one for who turned up, what they set, and
          who went backwards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {sessions.map(({ date, report }) => (
            <li key={date}>
              <Link
                to={`/team/sessions/${date}`}
                className="flex items-center gap-3 rounded-sm py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{formatDate(date)}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.playersTested.length}{" "}
                    {report.playersTested.length === 1 ? "player" : "players"} &middot;{" "}
                    {report.entryCount} {report.entryCount === 1 ? "measurement" : "measurements"}{" "}
                    &middot; {report.metricsCovered.length} of {METRIC_KEYS.length} drills
                  </p>
                </div>
                {report.personalBests.length > 0 && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium"
                    style={{ color: "var(--viz-good)" }}
                    title={`${report.personalBests.length} personal best${report.personalBests.length === 1 ? "" : "s"} set this day`}
                  >
                    <Award className="h-3.5 w-3.5" aria-hidden="true" />
                    {report.personalBests.length}
                  </span>
                )}
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default TeamSessions;
