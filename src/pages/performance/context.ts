import { useOutletContext } from "react-router";

/**
 * Lives apart from PerformanceLayout so that file exports only its component. A module
 * that mixes a component with other exports cannot be hot-replaced on its own, so an edit
 * there reloads more of the app than it needs to.
 */

export interface PerformancePlayer {
  id: string;
  first_name: string;
  last_name: string;
}

export interface PerformanceContext {
  currentUserId: string;
  userRole: string;
  players: PerformancePlayer[];
  /** True until the viewer's identity and role are known. */
  isLoading: boolean;
}

export function usePerformanceContext() {
  return useOutletContext<PerformanceContext>();
}
