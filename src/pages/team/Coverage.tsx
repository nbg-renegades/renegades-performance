import { useMemo } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { METRIC_KEYS, metricLabel } from "@/lib/metrics";
import { STALE_AFTER_DAYS, coverageByMetric, summarise } from "@/lib/analytics";
import { StatusChip } from "@/components/viz/TrendIndicator";
import { useTeamContext } from "./context";

/**
 * Who has not been measured, and on what.
 *
 * The dashboard has always shown missing and outdated metrics - for the signed-in player
 * only, which is the one person who cannot schedule a testing session about it. Worse, it was
 * derived from that player's own entries, so it could only ever find gaps in a history that
 * already existed: an athlete with no rows at all was invisible. This starts from the roster
 * instead, which is why a player who has never been tested shows up here as the top priority.
 */

const TeamCoverage = () => {
  const { analytics, memberIds, groupLabel } = useTeamContext();
  const { index, now, nameOf, memberOf } = analytics;

  const byMetric = useMemo(
    () => coverageByMetric(index, memberIds, now),
    [index, memberIds, now],
  );

  const byPlayer = useMemo(
    () =>
      memberIds
        .map((playerId) => {
          const cells = METRIC_KEYS.map((metric) => summarise(index, playerId, metric, now));
          return {
            playerId,
            name: nameOf(playerId),
            position: memberOf(playerId)?.position ?? "unassigned",
            cells,
            missing: cells.filter((c) => c.status === "missing").length,
            stale: cells.filter((c) => c.status === "stale").length,
            current: cells.filter((c) => c.status === "current").length,
          };
        })
        // Worst first: the point of this page is a to-do list, so the player needing the most
        // attention is at the top rather than wherever the alphabet puts them.
        .sort(
          (a, b) =>
            b.missing - a.missing || b.stale - a.stale || a.name.localeCompare(b.name),
        ),
    [memberIds, index, now, nameOf, memberOf],
  );

  const totalCells = memberIds.length * METRIC_KEYS.length;
  const currentCells = byPlayer.reduce((sum, row) => sum + row.current, 0);
  const completeness = totalCells > 0 ? Math.round((currentCells / totalCells) * 100) : 0;

  if (memberIds.length === 0) {
    return (
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
          <CardDescription>No players in {groupLabel.toLowerCase()}.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>How complete the picture is</CardTitle>
          <CardDescription>
            The share of {memberIds.length * METRIC_KEYS.length} player-and-metric combinations
            in {groupLabel.toLowerCase()} with a measurement from the last {STALE_AFTER_DAYS}{" "}
            days. Everything else on this page is either missing or older than that.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* A single ratio against a limit: a meter, not a chart. */}
          <div className="flex items-center gap-4">
            <span className="text-4xl font-bold text-primary">{completeness}%</span>
            <Progress value={completeness} className="h-2 flex-1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tally
              label="Up to date"
              count={currentCells}
              total={totalCells}
              status="current"
            />
            <Tally
              label={`Older than ${STALE_AFTER_DAYS} days`}
              count={byPlayer.reduce((s, r) => s + r.stale, 0)}
              total={totalCells}
              status="stale"
            />
            <Tally
              label="Never measured"
              count={byPlayer.reduce((s, r) => s + r.missing, 0)}
              total={totalCells}
              status="missing"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>What to test next</CardTitle>
          <CardDescription>
            Per metric, who is missing it entirely and whose number has gone stale. This is the
            list a testing session should be built from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {byMetric.map((metric) => (
              <div key={metric.metric} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold">{metricLabel(metric.metric)}</h4>
                  <span className="text-xs text-muted-foreground">
                    {metric.tested} of {memberIds.length} measured
                  </span>
                </div>
                {metric.missing.length === 0 && metric.stale.length === 0 ? (
                  <StatusChip status="current" daysSinceLast={null} />
                ) : (
                  <div className="space-y-2 text-sm">
                    {metric.missing.length > 0 && (
                      <PlayerList
                        status="missing"
                        label="Never measured"
                        ids={metric.missing}
                        nameOf={nameOf}
                      />
                    )}
                    {metric.stale.length > 0 && (
                      <PlayerList
                        status="stale"
                        label="Stale"
                        ids={metric.stale}
                        nameOf={nameOf}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>By player</CardTitle>
          <CardDescription>
            Players needing the most attention first. Every cell is a status, not a value.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 bg-card">Player</TableHead>
                  {METRIC_KEYS.map((metric) => (
                    <TableHead key={metric} className="text-center text-xs">
                      {metricLabel(metric)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPlayer.map((row) => (
                  <TableRow key={row.playerId}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">
                      <Link
                        to={`/players/${row.playerId}`}
                        className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.metric} className="text-center">
                        <StatusChip
                          status={cell.status}
                          daysSinceLast={cell.daysSinceLast}
                          compact
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

function Tally({
  label,
  count,
  total,
  status,
}: {
  label: string;
  count: number;
  total: number;
  status: "current" | "stale" | "missing";
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <StatusChip status={status} daysSinceLast={null} compact />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">
        {count}
        <span className="ml-1 text-sm font-normal text-muted-foreground">of {total}</span>
      </p>
    </div>
  );
}

function PlayerList({
  status,
  label,
  ids,
  nameOf,
}: {
  status: "stale" | "missing";
  label: string;
  ids: string[];
  nameOf: (id: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <StatusChip status={status} daysSinceLast={null} compact />
        <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      </span>
      {ids.map((id, i) => (
        <Link
          key={id}
          to={`/players/${id}`}
          className="rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {nameOf(id)}
          {i < ids.length - 1 ? "," : ""}
        </Link>
      ))}
    </div>
  );
}

export default TeamCoverage;
