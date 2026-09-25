import { supabase } from "@/integrations/supabase/client";
import type { FootballPosition } from "@/lib/positionUtils";
import type { MetricType } from "@/lib/metrics";

/**
 * Query keys and the functions behind them, in one place.
 *
 * Every screen used to fetch inside a useEffect and mirror the result into useState, which
 * meant each mount refetched, two components asking the same question asked it twice, and
 * anything that wrote had to remember to call the right refetch by hand. Keys here give
 * writes one vocabulary to invalidate against, and react-query dedupes the reads.
 */

export const queryKeys = {
  currentUser: ["current-user"] as const,
  roles: (userId: string) => ["roles", userId] as const,
  roster: ["roster"] as const,
  squad: ["squad"] as const,
  profiles: ["profiles"] as const,
  bestDailyEntries: ["best-daily-entries"] as const,
  entryDetails: (playerIds: string[]) => ["entry-details", [...playerIds].sort()] as const,
  playerPosition: (playerId: string) => ["player-position", playerId] as const,
  metricHistory: (playerId: string, metric: string, months: number) =>
    ["metric-history", playerId, metric, months] as const,
  playerMetrics: (playerId: string) => ["player-metrics", playerId] as const,
  dashboardStats: ["dashboard-stats"] as const,
  playerStanding: (playerId: string) => ["player-standing", playerId] as const,
  termsAccepted: (userId: string) => ["terms-accepted", userId] as const,
  users: ["users"] as const,
  ownProfile: (userId: string) => ["own-profile", userId] as const,
  entries: ["entries"] as const,
  session: ["session"] as const,
};

export interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
}

/** Throws on error so react-query can put the query into its error state. */
function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Every role the user holds, highest-privilege first is decided by the caller. */
export async function fetchRoles(userId: string): Promise<string[]> {
  const rows = unwrap(await supabase.from("user_roles").select("role").eq("user_id", userId));
  return (rows || []).map((r) => r.role as string);
}

export function primaryRole(roles: string[]): string {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("coach")) return "coach";
  if (roles.includes("player")) return "player";
  return "";
}

/** Everyone with the player role, in squad order. */
export async function fetchRoster(): Promise<RosterPlayer[]> {
  const playerRoles = unwrap(
    await supabase.from("user_roles").select("user_id").eq("role", "player"),
  );
  const playerIds = (playerRoles || []).map((r) => r.user_id);
  if (playerIds.length === 0) return [];

  const profiles = unwrap(
    await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", playerIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
  );
  return profiles || [];
}

export async function fetchBestDailyEntries() {
  const rows = unwrap(await supabase.rpc("get_best_daily_entries"));
  return rows || [];
}

/** Names and positions for the players appearing in a set of entries. */
export async function fetchEntryDetails(playerIds: string[]) {
  if (playerIds.length === 0) {
    return { profiles: new Map<string, RosterPlayer>(), positions: new Map<string, FootballPosition>() };
  }
  const [profileRows, positionRows] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name").in("id", playerIds),
    supabase.from("player_positions").select("player_id, position").in("player_id", playerIds),
  ]);
  return {
    profiles: new Map((unwrap(profileRows) || []).map((p) => [p.id, p])),
    positions: new Map(
      (unwrap(positionRows) || []).map((p) => [p.player_id, p.position as FootballPosition]),
    ),
  };
}

export interface SquadMember extends RosterPlayer {
  position: FootballPosition;
  name: string;
}

/**
 * The squad: everyone with the player role, in squad order, each with a position.
 *
 * This is the one roster every screen shares. It replaced a second one that started from
 * `player_positions` instead, so a player nobody had assigned a position to simply did not
 * exist in the comparison chart while appearing everywhere else - and an unassigned player is
 * exactly the one a coach needs reminding about. Here a missing row means `'unassigned'`,
 * which the group helpers already understand as "in no unit".
 */
export async function fetchSquad(): Promise<SquadMember[]> {
  const players = await fetchRoster();
  if (players.length === 0) return [];

  const positionRows = unwrap(
    await supabase
      .from("player_positions")
      .select("player_id, position")
      .in("player_id", players.map((p) => p.id)),
  );
  const positionById = new Map(
    (positionRows || []).map((p) => [p.player_id, p.position as FootballPosition]),
  );

  return players.map((player) => ({
    ...player,
    name: `${player.first_name} ${player.last_name}`,
    position: positionById.get(player.id) ?? "unassigned",
  }));
}

export async function fetchPlayerPosition(playerId: string): Promise<FootballPosition | null> {
  const row = unwrap(
    await supabase.from("player_positions").select("position").eq("player_id", playerId).maybeSingle(),
  );
  return (row?.position as FootballPosition) ?? null;
}

export async function fetchMetricHistory(playerId: string, metric: string, months: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const rows = unwrap(
    await supabase
      .from("performance_entries")
      .select("entry_date, value")
      .eq("player_id", playerId)
      .eq("metric_type", metric as never)
      .gte("entry_date", startDate.toISOString().split("T")[0])
      .lte("entry_date", endDate.toISOString().split("T")[0])
      .order("entry_date", { ascending: true }),
  );
  return rows || [];
}

/** Every entry for one player, used for the "missing / outdated" status on the dashboard. */
export async function fetchPlayerMetrics(playerId: string) {
  const rows = unwrap(
    await supabase
      .from("performance_entries")
      .select("entry_date, value, metric_type")
      .eq("player_id", playerId)
      .order("entry_date", { ascending: false }),
  );
  return rows || [];
}

async function invokeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (error) throw error;
  return data as T;
}

export interface TeamBest {
  metric: MetricType;
  value: number;
}

export interface DashboardStats {
  totalPlayers: number;
  teamRecentEntries: number;
  userRecentEntries: number;
  teamBestAllTime: TeamBest[];
  teamBestSixMonths: TeamBest[];
}

export function fetchDashboardStats() {
  return invokeFunction<DashboardStats>("get-dashboard-stats");
}

export interface MetricStanding {
  metric_type: MetricType;
  percentile: number | null;
  rank: number | null;
  n: number;
  median: number | null;
  best: number | null;
  reliable: boolean;
  current_value: number | null;
  next_target_value: number | null;
  /** Only ever set for a coach or admin; the function withholds it from players. */
  next_target_name: string | null;
}

export interface PlayerStanding {
  team: MetricStanding[];
  unit: MetricStanding[];
  position: MetricStanding[];
  position_label: string | null;
  unit_label: "offense" | "defense" | null;
  includes_names: boolean;
}

/**
 * Group-relative numbers for one player, computed server-side.
 *
 * Only a player needs this. Row-level security means their browser holds their own rows and
 * nobody else's, so a percentile cannot be worked out there. A coach already has the whole set
 * and computes the same figures locally through `useSquadAnalytics`, which is why this is not
 * on the path of any squad-wide screen.
 */
export function fetchPlayerStanding(playerId: string) {
  return invokeFunction<PlayerStanding>("get-player-standing", { player_id: playerId });
}

export async function fetchTermsAccepted(userId: string): Promise<boolean> {
  const row = unwrap(
    await supabase.from("profiles").select("terms_accepted_at").eq("id", userId).single(),
  );
  return !!row?.terms_accepted_at;
}

export interface UserProfile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  roles?: Array<{ role: string }>;
  position?: string;
}

/** Every member with their roles and position, for the admin list. */
export async function fetchUsers(): Promise<UserProfile[]> {
  const profiles = unwrap(
    await supabase
      .from("profiles")
      .select("*")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
  );
  if (!profiles || profiles.length === 0) return [];

  const userIds = profiles.map((u) => u.id);
  const [rolesResult, positionsResult] = await Promise.all([
    supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
    supabase.from("player_positions").select("player_id, position").in("player_id", userIds),
  ]);

  const rolesMap = new Map<string, Array<{ role: string }>>();
  for (const r of unwrap(rolesResult) || []) {
    if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
    rolesMap.get(r.user_id)?.push({ role: r.role });
  }
  const positionsMap = new Map<string, string>(
    (unwrap(positionsResult) || []).map((p) => [p.player_id, p.position]),
  );

  return profiles.map((user) => ({
    ...user,
    roles: rolesMap.get(user.id) || [],
    position: positionsMap.get(user.id),
  }));
}

/** Name and position for the signed-in user's own dashboard header. */
export async function fetchOwnProfile(userId: string) {
  const [profileResult, positionResult] = await Promise.all([
    supabase.from("profiles").select("first_name, last_name").eq("id", userId).single(),
    supabase.from("player_positions").select("position").eq("player_id", userId).maybeSingle(),
  ]);
  const profile = unwrap(profileResult);
  return {
    name: profile ? `${profile.first_name} ${profile.last_name}` : "",
    position: (unwrap(positionResult)?.position as FootballPosition) ?? "unassigned",
  };
}

export interface PerformanceEntry {
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
 * The entries list: best-of-day from the RPC, with each player's name and position joined
 * on. The RPC already restricts a player to their own rows, so there is no filtering to
 * do here.
 */
export async function fetchEntries(): Promise<PerformanceEntry[]> {
  const rows = await fetchBestDailyEntries();
  const { profiles, positions } = await fetchEntryDetails([
    ...new Set(rows.map((e) => e.player_id)),
  ]);

  return rows.map((entry) => {
    const profile = profiles.get(entry.player_id);
    return {
      id: entry.id,
      entry_date: entry.entry_date,
      metric_type: entry.metric_type,
      value: entry.value,
      unit: entry.unit,
      player_id: entry.player_id,
      player: profile
        ? {
            first_name: profile.first_name,
            last_name: profile.last_name,
            position: positions.get(entry.player_id),
          }
        : undefined,
    };
  });
}

/** The current session, refreshed by MainLayout's auth-state subscription. */
export async function fetchSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
