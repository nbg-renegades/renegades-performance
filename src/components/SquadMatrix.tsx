import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  METRIC_KEYS,
  formatMetricValue,
  metricLabel,
  metricUnit,
  type MetricType,
} from "@/lib/metrics";
import { summarise, trend, type GroupStanding } from "@/lib/analytics";
import { POSITION_LABELS } from "@/lib/positionUtils";
import { PercentileLegend, PercentileMeter } from "@/components/viz/PercentileMeter";
import { StatusChip, TrendIndicator } from "@/components/viz/TrendIndicator";
import { PersonalBestBadge } from "@/components/viz/DeltaBadge";
import type { SquadAnalytics } from "@/hooks/useSquadAnalytics";
import { cn } from "@/lib/utils";

/**
 * The whole squad against all six metrics, on one screen.
 *
 * Every analytical view in this app used to take a single player: pick a name, read a chart,
 * pick the next name. For a coach deciding what tomorrow's session should work on, that is
 * the wrong shape entirely - the question is "where is this team weak", and answering it
 * meant twenty-five round trips through a dropdown.
 *
 * Each cell carries four readings, which is as many as a cell can hold before it stops being
 * scannable: the current value, where it places in the squad, which way it has been moving,
 * and whether it is recent enough to believe. The value is the primary reading and stays in an
 * ordinary text colour; the placement is a meter whose length says the same thing its colour
 * does.
 *
 * Sorting by a metric column is the point of the thing - it turns the matrix into "who is
 * slowest", which is a question no screen could answer before.
 */

type SortKey = "player" | "position" | MetricType;
type SortDirection = "asc" | "desc";

interface Props {
  analytics: SquadAnalytics;
  /** Which group the percentiles are relative to. Defaults to the whole squad. */
  standings?: Record<MetricType, GroupStanding>;
  /** Restricts the rows without changing what the percentiles are measured against. */
  playerIds?: string[];
}

export function SquadMatrix({ analytics, standings, playerIds }: Props) {
  const { index, now, nameOf, memberOf, teamStandings } = analytics;
  const activeStandings = standings ?? teamStandings;
  const rowIds = playerIds ?? analytics.playerIds;

  const [sortKey, setSortKey] = useState<SortKey>("player");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const rows = useMemo(() => {
    return rowIds.map((playerId) => {
      const cells = METRIC_KEYS.map((metric) => {
        const summary = summarise(index, playerId, metric, now);
        const standingRow = activeStandings[metric]?.rows.find((r) => r.playerId === playerId);
        return {
          metric,
          summary,
          percentile: standingRow?.percentile ?? null,
          reliable: activeStandings[metric]?.reliable ?? false,
          trend: trend(index, playerId, metric, 6, now),
        };
      });
      return {
        playerId,
        name: nameOf(playerId),
        position: memberOf(playerId)?.position ?? "unassigned",
        cells,
        byMetric: new Map(cells.map((c) => [c.metric, c])),
      };
    });
  }, [rowIds, index, now, activeStandings, nameOf, memberOf]);

  const sorted = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "player") return a.name.localeCompare(b.name) * factor;
      if (sortKey === "position") {
        const byPosition = a.position.localeCompare(b.position) * factor;
        return byPosition !== 0 ? byPosition : a.name.localeCompare(b.name);
      }
      // Ranking by the standing rather than the raw value keeps "best first" meaning the
      // same thing in a column of times and a column of centimetres.
      const aRank = a.byMetric.get(sortKey)?.percentile;
      const bRank = b.byMetric.get(sortKey)?.percentile;
      // An untested player has no place in the order and always sits at the bottom, whichever
      // way the column is pointing - they are not "worst", they are unknown.
      if (aRank === null || aRank === undefined) return bRank === null || bRank === undefined ? a.name.localeCompare(b.name) : 1;
      if (bRank === null || bRank === undefined) return -1;
      const byRank = (bRank - aRank) * factor;
      return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
    });
  }, [rows, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // A name reads A-Z; a metric column reads best-first, which is what someone clicking
      // "30-Yard Dash" is asking for.
      setSortDirection(key === "player" || key === "position" ? "asc" : "asc");
    }
  };

  if (rowIds.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No players on the roster yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead
                label="Player"
                sortByKey="player"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort}
                className="sticky left-0 z-20 bg-card"
              />
              <SortableHead
                label="Pos"
                sortByKey="position"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort}
                className="hidden lg:table-cell"
              />
              {METRIC_KEYS.map((metric) => (
                <SortableHead
                  key={metric}
                  label={metricLabel(metric)}
                  hint={metricUnit(metric)}
                  sortByKey={metric}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="min-w-[8.5rem]"
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.playerId}>
                {/* Sticky so the name stays put while the six metric columns scroll on a
                    phone - a grid of numbers with the row label scrolled off is unreadable. */}
                <TableCell className="sticky left-0 z-10 bg-card font-medium">
                  <Link
                    to={`/players/${row.playerId}`}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground lg:hidden">
                    {row.position === "unassigned" ? "No position" : POSITION_LABELS[row.position]}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {row.position === "unassigned" ? "—" : row.position}
                </TableCell>
                {row.cells.map((cell) => (
                  <TableCell key={cell.metric} className="align-top">
                    {cell.summary.latest === null ? (
                      <StatusChip status="missing" compact />
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold tabular-nums">
                            {formatMetricValue(cell.metric, cell.summary.latest)}
                          </span>
                          {cell.summary.isPersonalBest && cell.summary.attempts > 1 && (
                            <PersonalBestBadge />
                          )}
                        </div>
                        <PercentileMeter
                          percentile={cell.percentile}
                          reliable={cell.reliable}
                        />
                        <div className="flex items-center gap-2">
                          <TrendIndicator trend={cell.trend} showPercent={false} />
                          {cell.summary.status === "stale" && (
                            <StatusChip
                              status="stale"
                              daysSinceLast={cell.summary.daysSinceLast}
                              compact
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PercentileLegend />
    </div>
  );
}

/**
 * Declared at module scope rather than inside the render body: a component created during
 * render is a new type every time, so React would remount each header cell instead of
 * updating it. The entries table learned this the same way.
 */
function SortableHead({
  label,
  hint,
  sortByKey,
  sortKey,
  sortDirection,
  onSort,
  className,
}: {
  label: string;
  hint?: string;
  sortByKey: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === sortByKey;
  const Icon = !active ? ChevronsUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={!active ? "none" : sortDirection === "asc" ? "ascending" : "descending"}
    >
      <button
        type="button"
        onClick={() => onSort(sortByKey)}
        className={cn(
          "inline-flex items-start gap-1 rounded-sm text-left font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>
          {label}
          {hint ? <span className="ml-1 font-normal text-muted-foreground">[{hint}]</span> : null}
        </span>
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </TableHead>
  );
}
