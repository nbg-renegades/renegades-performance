import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchCurrentUserId, fetchRoles, primaryRole } from "@/lib/queries";

/**
 * Who is looking, and what they are allowed to do.
 *
 * This used to be resolved by PerformanceLayout and handed down through an outlet context,
 * which worked only for the three routes underneath it - every other page ran its own
 * `auth.getUser()` plus a `user_roles` lookup. Both queries are keyed and cached, so asking
 * here is free wherever it is asked, and a page no longer has to sit inside a particular
 * layout to know who the viewer is.
 */
export interface Viewer {
  userId: string;
  roles: string[];
  role: string;
  isCoach: boolean;
  isAdmin: boolean;
  isPlayer: boolean;
  isPending: boolean;
}

export function useViewer(): Viewer {
  const { data: userId = "", isPending: userPending } = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: fetchCurrentUserId,
  });

  const { data: roles = [], isPending: rolesPending } = useQuery({
    queryKey: queryKeys.roles(userId),
    queryFn: () => fetchRoles(userId),
    enabled: !!userId,
  });

  return {
    userId,
    roles,
    role: primaryRole(roles),
    // A coach is anyone who may see the whole squad, which an admin also may. Kept as one
    // question because every caller asking "isCoach" means exactly that.
    isCoach: roles.includes("coach") || roles.includes("admin"),
    isAdmin: roles.includes("admin"),
    isPlayer: roles.includes("player"),
    isPending: userPending || (!!userId && rolesPending),
  };
}
