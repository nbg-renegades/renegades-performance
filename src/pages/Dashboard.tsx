import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchOwnProfile } from "@/lib/queries";
import { useViewer } from "@/hooks/useViewer";
import { CoachDashboard } from "./dashboard/CoachDashboard";
import { PlayerDashboard } from "./dashboard/PlayerDashboard";

/**
 * One landing page per role, chosen here.
 *
 * There used to be a single dashboard for everyone, with three cards at the top that told a
 * coach the size of their own squad, told a player how many entries the team had made, and told
 * both of them which role they had just signed in as. Underneath, the only actionable part -
 * missing and stale measurements - was computed from the viewer's own rows, so it was empty for
 * every coach who was not also a player, and every player saw two panels of team-wide bests
 * they could do nothing with.
 *
 * The two audiences want opposite things on opening the app: a coach wants the squad and what to
 * do about it, a player wants themselves. Splitting them is what lets each page be short.
 */
const Dashboard = () => {
  const viewer = useViewer();

  const { data: profile } = useQuery({
    queryKey: queryKeys.ownProfile(viewer.userId),
    queryFn: () => fetchOwnProfile(viewer.userId),
    enabled: !!viewer.userId,
  });

  const name = profile?.name || "";

  if (viewer.isPending) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  // A coach who is also a player gets the coach view; their own page is one click away, and the
  // squad is the thing they opened the app for.
  return viewer.isCoach ? (
    <CoachDashboard name={name} />
  ) : (
    <PlayerDashboard name={name} userId={viewer.userId} />
  );
};

export default Dashboard;
