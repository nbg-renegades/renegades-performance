import { useEffect, useState } from "react";
import { Outlet, useOutletContext } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

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

export interface PerformanceContext {
  currentUserId: string;
  userRole: string;
  players: PerformancePlayer[];
  /** True until the viewer's identity and role are known. */
  isLoading: boolean;
}

export interface PerformancePlayer {
  id: string;
  first_name: string;
  last_name: string;
}

export function usePerformanceContext() {
  return useOutletContext<PerformanceContext>();
}

const TABS = [
  { to: "/performance", label: "Entries", end: true },
  { to: "/performance/history", label: "History", end: false },
  { to: "/performance/comparison", label: "Comparison", end: false },
];

const PerformanceLayout = () => {
  const [currentUserId, setCurrentUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [players, setPlayers] = useState<PerformancePlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (rolesData || []).map((r) => r.role as string);
      const role = roles.includes("admin")
        ? "admin"
        : roles.includes("coach")
          ? "coach"
          : roles.includes("player")
            ? "player"
            : "";

      // Only coaches and admins ever pick another player, so only they need the roster.
      let roster: PerformancePlayer[] = [];
      if (role === "coach" || role === "admin") {
        const { data: playerRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "player");

        const playerIds = (playerRoles || []).map((r) => r.user_id);
        if (playerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", playerIds)
            .order("last_name", { ascending: true })
            .order("first_name", { ascending: true });
          roster = profiles || [];
        }
      }

      if (cancelled) return;
      setCurrentUserId(user.id);
      setUserRole(role);
      setPlayers(roster);
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const context: PerformanceContext = { currentUserId, userRole, players, isLoading };

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
