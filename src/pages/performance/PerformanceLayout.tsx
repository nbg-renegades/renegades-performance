import { Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  queryKeys,
  fetchCurrentUserId,
  fetchRoles,
  fetchRoster,
  primaryRole,
} from "@/lib/queries";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import type { PerformanceContext } from "./context";

/**
 * /performance used to be one route that owned everything: the history chart, the radar
 * comparison, the neighbourhood panel, the filters and the full entries list. Every visit
 * paid for all of it - six sequential round-trips before the page settled, and a realtime
 * subscription on the whole performance_entries table that refetched the comparison
 * whenever anyone anywhere saved a row.
 *
 * Three routes now, lazily loaded, so a coach opening the entries list does not download
 * or run the charts, and the comparison's subscription only exists while someone is
 * looking at it.
 *
 * The layout resolves who the viewer is once and hands it down through the outlet context.
 * The old page did its own auth.getUser() plus a user_roles query, and so did every page
 * beside it.
 */

const TABS = [
  { to: "/performance", label: "Entries", end: true },
  { to: "/performance/history", label: "History", end: false },
  { to: "/performance/comparison", label: "Comparison", end: false },
];

const PerformanceLayout = () => {
  const { data: currentUserId = "", isPending: userPending } = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: fetchCurrentUserId,
  });

  const { data: roles = [], isPending: rolesPending } = useQuery({
    queryKey: queryKeys.roles(currentUserId),
    queryFn: () => fetchRoles(currentUserId),
    enabled: !!currentUserId,
  });

  const userRole = primaryRole(roles);
  const needsRoster = userRole === "coach" || userRole === "admin";

  // Only coaches and admins ever pick another player, so only they fetch the roster.
  const { data: players = [] } = useQuery({
    queryKey: queryKeys.roster,
    queryFn: fetchRoster,
    enabled: needsRoster,
  });

  const context: PerformanceContext = {
    currentUserId: currentUserId ?? "",
    userRole,
    players,
    isLoading: userPending || rolesPending,
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Performance</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Monitor and record athletic performance metrics
        </p>
      </div>

      <nav
        aria-label="Performance sections"
        className="inline-flex w-full items-center gap-1 rounded-md bg-muted p-1 sm:w-auto"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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

      <Outlet context={context} />
    </div>
  );
};

export default PerformanceLayout;
