import { Fragment, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { POSITION_LABELS, type FootballPosition } from "@/lib/positionUtils";
import { formatMetricValue, metricLabel, metricUnit } from "@/lib/metrics";
import { buildIndex, improvement, improvementPercent, isBetter } from "@/lib/analytics";
import { DeltaBadge, PersonalBestBadge } from "@/components/viz/DeltaBadge";
import { cn } from "@/lib/utils";

/**
 * The entries list used to be a stack of ~93px cards, one per entry, with the player's
 * name and position repeated verbatim on every row and a wide empty gutter down the
 * middle. It answered "what is the most recent thing" and nothing else: no sorting, no
 * grouping, and at 263 entries roughly 29 desktop screens of scrolling.
 *
 * A table fits the same data in about a fifth of the height and lets a coach ask the
 * questions they actually have - who was fastest, what happened at Tuesday's session, how
 * does one player's column read top to bottom.
 *
 * Sorting, grouping and paging all happen in memory. The RPC hands back the whole set
 * anyway and a club roster is in the hundreds of rows, so pushing this to the server would
 * add round-trips without saving any work.
 */

export interface PerformanceEntryRow {
  id: string;
  entry_date: string;
  metric_type: string;
  value: number;
  unit: string;
  player_id: string;
  player?: {
    first_name: string;
    last_name: string;
    position?: FootballPosition;
  };
}

/**
 * What changed at each row, worked out once for the whole list.
 *
 * A log of values answers "what was recorded" and nothing else. The question a coach has while
 * reading it is "is that better than last time", and until now the only way to find out was to
 * scroll for the same player's previous row and do the subtraction. Both columns are derived,
 * so nothing is stored and no existing row changes.
 *
 * Each row is judged against what that player had done *before that row's own date*, not
 * against the newest value, so an older row still reads the way it read on the day.
 */
function buildRowContext(rows: PerformanceEntryRow[]) {
  const index = buildIndex(rows);
  const context = new Map<
    string,
    { improvement: number | null; percent: number | null; isRecord: boolean }
  >();

  for (const row of rows) {
    const series = index.byPlayer.get(row.player_id)?.get(row.metric_type as never) ?? [];
    const position = series.findIndex((a) => a.date === row.entry_date);
    if (position === -1) continue;

    const before = series.slice(0, position);
    const previous = before.length > 0 ? before[before.length - 1] : null;
    const previousBest = before.reduce<number | null>(
      (best, a) => (best === null || isBetter(row.metric_type, a.value, best) ? a.value : best),
      null,
    );

    context.set(row.id, {
      improvement: previous ? improvement(row.metric_type, previous.value, row.value) : null,
      percent: previous ? improvementPercent(row.metric_type, previous.value, row.value) : null,
      // A first-ever measurement is not celebrated as a record: there was nothing to beat.
      isRecord: previousBest !== null && isBetter(row.metric_type, row.value, previousBest),
    });
  }

  return context;
}

type SortKey = "entry_date" | "player" | "metric_type" | "value";
type SortDirection = "asc" | "desc";
type GroupBy = "none" | "player" | "date";

const PAGE_SIZE = 25;

const playerName = (entry: PerformanceEntryRow) =>
  entry.player ? `${entry.player.first_name} ${entry.player.last_name}` : "Unknown player";

const positionLabel = (entry: PerformanceEntryRow) =>
  entry.player?.position && entry.player.position !== "unassigned"
    ? POSITION_LABELS[entry.player.position]
    : null;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

/**
 * Declared at module scope: a component created inside the render body is a new type on
 * every render, so React would unmount and remount each header cell rather than update it.
 */
function SortableHead({
  label,
  sortByKey,
  sortKey,
  sortDirection,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortByKey: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
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
          "inline-flex items-center gap-1 rounded-sm font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-foreground" : "text-muted-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

interface Props {
  entries: PerformanceEntryRow[];
  /** Total before filtering, so the empty state can tell "no data" from "no matches". */
  totalCount: number;
  showPlayerColumn: boolean;
  canEdit: (entry: PerformanceEntryRow) => boolean;
  describeEntry: (entry: PerformanceEntryRow) => string;
  onEdit: (entry: PerformanceEntryRow) => void;
  onDelete: (entryId: string) => void;
  /**
   * The rows the change column is measured against, when the visible rows have been filtered.
   * Filtering by metric or by player leaves each player's per-metric series intact, so the
   * default is fine; a future filter that cuts a series short would need this.
   */
  deltaBasis?: PerformanceEntryRow[];
}

export function PerformanceEntriesTable({
  entries,
  totalCount,
  showPlayerColumn,
  canEdit,
  describeEntry,
  onEdit,
  onDelete,
  deltaBasis,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("entry_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [page, setPage] = useState(0);

  const rowContext = useMemo(
    () => buildRowContext(deltaBasis ?? entries),
    [deltaBasis, entries],
  );

  const sorted = useMemo(() => {
    const factor = sortDirection === "asc" ? 1 : -1;

    const compareBy = (key: SortKey, a: PerformanceEntryRow, b: PerformanceEntryRow) => {
      switch (key) {
        case "entry_date":
          return a.entry_date.localeCompare(b.entry_date);
        case "player":
          return playerName(a).localeCompare(playerName(b));
        case "metric_type":
          return metricLabel(a.metric_type).localeCompare(metricLabel(b.metric_type));
        case "value":
          return a.value - b.value;
      }
    };

    return [...entries].sort((a, b) => {
      // Grouping wins over the column sort, otherwise a group's rows would be scattered
      // across the page. Within a group the chosen column still decides the order.
      if (groupBy === "player") {
        const byPlayer = playerName(a).localeCompare(playerName(b));
        if (byPlayer !== 0) return byPlayer;
      } else if (groupBy === "date") {
        const byDate = b.entry_date.localeCompare(a.entry_date);
        if (byDate !== 0) return byDate;
      }

      const primary = compareBy(sortKey, a, b) * factor;
      if (primary !== 0) return primary;

      // A stable tiebreak keeps rows from shuffling between renders when a column ties.
      return a.id.localeCompare(b.id);
    });
  }, [entries, sortKey, sortDirection, groupBy]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  // Filtering or re-sorting makes the current page number meaningless. Resetting during
  // render rather than from an effect avoids painting the stale page first; `entries` is
  // memoised upstream, so its identity only changes when the filters actually do.
  const listSignature = `${sortKey}|${sortDirection}|${groupBy}`;
  const [seenSignature, setSeenSignature] = useState(listSignature);
  const [seenEntries, setSeenEntries] = useState(entries);
  if (listSignature !== seenSignature || entries !== seenEntries) {
    setSeenSignature(listSignature);
    setSeenEntries(entries);
    setPage(0);
  }

  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const groupKey = (entry: PerformanceEntryRow) =>
    groupBy === "player" ? playerName(entry) : groupBy === "date" ? formatDate(entry.entry_date) : null;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Dates read newest-first and everything else reads A-Z / smallest-first.
      setSortDirection(key === "entry_date" ? "desc" : "asc");
    }
  };

  if (sorted.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-8">
        {totalCount === 0
          ? "No performance entries yet. Add your first entry to get started!"
          : "No entries match your filters. Try adjusting your selection."}
      </p>
    );
  }

  // Which rows open a new group, worked out up front: deciding this by mutating a
  // variable inside the map would carry state across renders.
  const rowsWithGroupBreaks = pageRows.map((entry, i) => {
    const key = groupKey(entry);
    const previousKey = i === 0 ? null : groupKey(pageRows[i - 1]);
    // The first row of a page always restates its group, since the header that introduced
    // it may be on the page before.
    return { entry, groupHeading: key !== null && (i === 0 || key !== previousKey) ? key : null };
  });

  // Date, Metric, Value, Change, and the actions column when the viewer can edit anything.
  const showActions = entries.some(canEdit);
  const columnCount = 4 + (showPlayerColumn ? 2 : 0) + (showActions ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-48">
          <Label htmlFor="group-by" className="text-sm mb-2 block">
            Group by
          </Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger id="group-by" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="none">Nothing</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              {showPlayerColumn && <SelectItem value="player">Player</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground pb-2">
          {sorted.length} {sorted.length === 1 ? "entry" : "entries"}
          {pageCount > 1 && ` · page ${safePage + 1} of ${pageCount}`}
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHead
                label="Date"
                sortByKey="entry_date"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort} className="w-[7.5rem]" />
              {showPlayerColumn && (
                <>
                  <SortableHead
                label="Player"
                sortByKey="player"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort} className="hidden md:table-cell" />
                  <TableHead className="hidden lg:table-cell text-muted-foreground">
                    Position
                  </TableHead>
                </>
              )}
              <SortableHead
                label="Metric"
                sortByKey="metric_type"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort} />
              <SortableHead
                label="Value"
                sortByKey="value"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={toggleSort} className="text-right" align="right" />
              {/* Not sortable: the change is relative to each row's own history, so ordering
                  the whole list by it would compare a sprint's tenths against a jump's
                  centimetres. Sorting by value still works, and the squad matrix is where
                  "who improved most" is a first-class question. */}
              <TableHead className="text-right text-muted-foreground">Change</TableHead>
              {showActions && <TableHead className="w-[5.5rem]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsWithGroupBreaks.map(({ entry, groupHeading }) => {
              const position = positionLabel(entry);

              return (
                <Fragment key={entry.id}>
                  {groupHeading && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="bg-muted/40 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {groupHeading}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(entry.entry_date)}
                    </TableCell>
                    {showPlayerColumn && (
                      <>
                        <TableCell className="hidden md:table-cell font-medium">
                          {playerName(entry)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground">
                          {position ?? "—"}
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      {metricLabel(entry.metric_type)}
                      {/* The player column is hidden on narrow screens, so the name rides
                          along here instead of disappearing. */}
                      {showPlayerColumn && (
                        <span className="block md:hidden text-xs text-muted-foreground">
                          {playerName(entry)}
                          {position ? ` · ${position}` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-semibold text-primary tabular-nums">
                      {formatMetricValue(entry.metric_type, entry.value)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {metricUnit(entry.metric_type) || entry.unit}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {rowContext.get(entry.id)?.isRecord && <PersonalBestBadge />}
                        <DeltaBadge
                          metric={entry.metric_type}
                          improvement={rowContext.get(entry.id)?.improvement ?? null}
                          percent={rowContext.get(entry.id)?.percent ?? null}
                          showUnit={false}
                        />
                      </span>
                    </TableCell>
                    {showActions && (
                      <TableCell className="text-right">
                        {canEdit(entry) && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${describeEntry(entry)}`}
                              title="Edit entry"
                              onClick={() => onEdit(entry)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              aria-label={`Delete ${describeEntry(entry)}`}
                              title="Delete entry"
                              onClick={() => onDelete(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(safePage - 1)}
            disabled={safePage === 0}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing {safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + pageRows.length} of{" "}
            {sorted.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(safePage + 1)}
            disabled={safePage >= pageCount - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
