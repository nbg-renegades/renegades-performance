import { Navigate, useLocation } from "react-router";
import { useViewer } from "@/hooks/useViewer";

/**
 * /me, which is the player page about whoever is signed in.
 *
 * A stable address matters more than it looks: it is what the sidebar link, the dashboard
 * button and the redirects from the old /performance tabs can all point at without knowing the
 * viewer's user id. The search string is carried across so a link like /me?metric=30yd_dash
 * still lands on the right drill.
 */
export function MyPageRedirect() {
  const viewer = useViewer();
  const { search } = useLocation();

  if (viewer.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  // A coach who is not also a player has no page of their own; the squad is what they came for.
  if (!viewer.userId || (!viewer.isPlayer && viewer.isCoach)) {
    return <Navigate to="/team" replace />;
  }

  return <Navigate to={{ pathname: `/players/${viewer.userId}`, search }} replace />;
}
