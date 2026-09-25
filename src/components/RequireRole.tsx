import { Navigate, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchCurrentUserId, fetchRoles } from "@/lib/queries";

/**
 * A route only some roles may open.
 *
 * The sidebar already hides links a player has no use for, but hiding a link is not a
 * restriction - the URL still worked, and /team would have shown a player the whole squad's
 * numbers. The real protection is the database's row-level security, which never returns
 * another player's rows to them; this guard is so the app does not render an empty,
 * confusing page in the attempt.
 *
 * Both queries are the ones every other screen already uses, so this costs no extra request.
 */
export function RequireRole({
  allow,
  redirectTo = "/",
}: {
  allow: string[];
  redirectTo?: string;
}) {
  const { data: userId = "", isPending: userPending } = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: fetchCurrentUserId,
  });

  const { data: roles = [], isPending: rolesPending } = useQuery({
    queryKey: queryKeys.roles(userId),
    queryFn: () => fetchRoles(userId),
    enabled: !!userId,
  });

  // Deciding before the roles are known would bounce every coach off their own page on a slow
  // connection, so the gate waits rather than guessing.
  if (userPending || (!!userId && rolesPending)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!roles.some((role) => allow.includes(role))) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
