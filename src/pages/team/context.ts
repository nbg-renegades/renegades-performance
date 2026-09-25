import { useOutletContext } from "react-router";
import type { GroupSpec, GroupStanding } from "@/lib/analytics";
import type { MetricType } from "@/lib/metrics";
import type { SquadAnalytics } from "@/hooks/useSquadAnalytics";

/**
 * Lives apart from TeamLayout so that file exports only its component: a module mixing a
 * component with other exports cannot be hot-replaced on its own, so an edit there would
 * reload more of the app than it needs to.
 */

export interface TeamContext {
  analytics: SquadAnalytics;
  /** The one comparison group every tab under /team is scoped to. */
  group: GroupSpec;
  groupLabel: string;
  /** Members of the active group, which is what each tab lists. */
  memberIds: string[];
  /** Standings relative to the active group. */
  standings: Record<MetricType, GroupStanding>;
}

export function useTeamContext() {
  return useOutletContext<TeamContext>();
}
