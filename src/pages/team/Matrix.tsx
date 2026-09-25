import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SquadMatrix } from "@/components/SquadMatrix";
import { useTeamContext } from "./context";

const TeamMatrix = () => {
  const { analytics, standings, memberIds, groupLabel } = useTeamContext();

  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader>
        <CardTitle>Squad matrix</CardTitle>
        <CardDescription>
          Every player against every metric, ranked within {groupLabel.toLowerCase()}. Sort by a
          metric to see who is strongest and who is struggling on it. Each cell shows the most
          recent value, where it places in the group, which way it has been moving, and whether
          it is recent enough to trust.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SquadMatrix analytics={analytics} standings={standings} playerIds={memberIds} />
      </CardContent>
    </Card>
  );
};

export default TeamMatrix;
