import { useMemo } from "react";
import { Outlet, useLocation } from "react-router";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { NavLink } from "@/components/NavLink";
import { useSquadAnalytics } from "@/hooks/useSquadAnalytics";
import { useSearchParamState } from "@/hooks/useSearchParamState";
import { groupMembers, MIN_GROUP_FOR_PERCENTILE, type GroupSpec } from "@/lib/analytics";
import {
  POSITION_LABELS,
  POSITION_OPTIONS,
  type FootballPosition,
} from "@/lib/positionUtils";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { TeamContext } from "./context";

/**
 * The squad-wide section: one comparison group, four ways of looking at it.
 *
 * The group selector sits here rather than inside each tab on purpose. Per-card filters are
 * how a dashboard ends up showing two panels scoped to different slices of the same data,
 * with nothing on screen saying so - the radar chart and the entries list already disagreed
 * about which roster they were drawing from. One control above everything it scopes means the
 * matrix, the leaderboards and the coverage grid are always talking about the same players.
 *
 * All four tabs are computed from the two cached queries `useSquadAnalytics` reads, so
 * switching tabs or groups costs no round trip.
 */

const TABS = [
  { to: "/team", label: "Matrix", end: true },
  { to: "/team/leaderboards", label: "Leaderboards", end: false },
  { to: "/team/coverage", label: "Coverage", end: false },
  { to: "/team/sessions", label: "Sessions", end: false },
];

/** `kind` and an optional position, flattened into one value a Select can hold. */
function parseGroup(raw: string): GroupSpec {
  if (raw === "offense" || raw === "defense") return { kind: raw };
  if (raw.startsWith("position:")) {
    const position = raw.slice("position:".length) as FootballPosition;
    return { kind: "position", position };
  }
  return { kind: "team" };
}

function describeGroup(group: GroupSpec): string {
  if (group.kind === "offense") return "Offense";
  if (group.kind === "defense") return "Defense";
  if (group.kind === "position" && group.position) return POSITION_LABELS[group.position];
  return "Whole squad";
}

const TeamLayout = () => {
  const analytics = useSquadAnalytics();
  const [rawGroup, setRawGroup] = useSearchParamState("group", "team");
  // Carried onto the tab links so switching tab keeps the chosen group, which is the whole
  // point of the group living in the URL.
  const { search } = useLocation();

  const group = useMemo(() => parseGroup(rawGroup), [rawGroup]);
  const groupLabel = describeGroup(group);

  const memberIds = useMemo(
    () => groupMembers(group, analytics.playerIds, analytics.positions),
    [group, analytics.playerIds, analytics.positions],
  );

  const { standingsForGroup } = analytics;
  const standings = useMemo(() => standingsForGroup(group), [standingsForGroup, group]);

  const context: TeamContext = {
    analytics,
    group,
    groupLabel,
    memberIds,
    standings,
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">Team</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          How the squad is performing, where it is thin, and what changed at the last session
        </p>
      </div>

      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-64">
          <Label htmlFor="group-select" className="mb-2 block text-sm">
            Compare within
          </Label>
          <Select value={rawGroup} onValueChange={setRawGroup}>
            <SelectTrigger id="group-select" className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="team">Whole squad</SelectItem>
              <SelectItem value="offense">Offense</SelectItem>
              <SelectItem value="defense">Defense</SelectItem>
              {POSITION_OPTIONS.filter((p) => p !== "unassigned").map((position) => (
                <SelectItem key={position} value={`position:${position}`}>
                  {POSITION_LABELS[position]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {memberIds.length} {memberIds.length === 1 ? "player" : "players"} in {groupLabel.toLowerCase()}
        </p>
      </div>

      <nav
        aria-label="Team sections"
        className="inline-flex w-full items-center gap-1 rounded-md bg-muted p-1 sm:w-auto"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={{ pathname: tab.to, search }}
            end={tab.end}
            className={cn(
              "flex-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
            )}
            activeClassName="bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground"
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {analytics.error ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(analytics.error)}</AlertDescription>
        </Alert>
      ) : analytics.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {memberIds.length > 0 && memberIds.length < MIN_GROUP_FOR_PERCENTILE && (
            <Alert>
              <AlertDescription>
                Only {memberIds.length}{" "}
                {memberIds.length === 1 ? "player is" : "players are"} in {groupLabel.toLowerCase()}.
                Rankings within a group this small say more about its size than about the
                athletes, so they are shown greyed out.
              </AlertDescription>
            </Alert>
          )}
          {/* Refetching holds the previous render at reduced opacity rather than flashing a
              skeleton, so the page never jumps under someone reading it. */}
          <div
            className={cn(
              "transition-opacity",
              analytics.isFetching && !analytics.isPending && "opacity-60",
            )}
          >
            <Outlet context={context} />
          </div>
        </>
      )}
    </div>
  );
};

export default TeamLayout;
