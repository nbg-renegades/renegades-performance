import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Target, AlertCircle, Clock, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type MetricType, getAllMetricTypes } from "@/lib/performanceUtils";
import { bestOf, formatMetricValue, metricLabel, metricUnit } from "@/lib/metrics";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MetricStatus {
  metric: MetricType;
  status: 'missing' | 'outdated' | 'current';
  lastEntry?: Date;
  bestValue?: number;
}

interface TeamBestMetric {
  metric: MetricType;
  value: number;
}

/**
 * These were `<div onClick>`, which meant the dashboard's only two actions were not in the
 * tab order at all - the whole page had exactly one focusable element, the sidebar toggle.
 * A button gets keyboard activation, focus styling and the right role for free.
 */
const QuickAction = ({
  onClick,
  title,
  description,
}: {
  onClick: () => void;
  title: string;
  description: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <h3 className="font-semibold mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground">{description}</p>
  </button>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalPlayers: 0,
    teamRecentEntries: 0,
    userRecentEntries: 0,
    userRoles: [] as string[],
    userName: "",
    userId: "",
    userPosition: "",
  });
  const [metricStatuses, setMetricStatuses] = useState<MetricStatus[]>([]);
  const [teamBestAllTime, setTeamBestAllTime] = useState<TeamBestMetric[]>([]);
  const [teamBestSixMonths, setTeamBestSixMonths] = useState<TeamBestMetric[]>([]);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user profile, roles, and position in parallel
    const [profileResult, rolesResult, positionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id),
      supabase
        .from("player_positions")
        .select("position")
        .eq("player_id", user.id)
        .maybeSingle()
    ]);

    const profile = profileResult.data;
    const roles = (rolesResult.data || []).map((r) => r.role);
    const position = positionResult.data?.position || "unassigned";

    // Fetch aggregated stats and team bests from backend
    const { data: aggregatedStats, error: statsError } = await supabase.functions.invoke(
      'get-dashboard-stats',
      {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      }
    );

    if (statsError) {
      console.error('Error fetching dashboard stats:', statsError);
    }

    setStats({
      totalPlayers: aggregatedStats?.totalPlayers || 0,
      teamRecentEntries: aggregatedStats?.teamRecentEntries || 0,
      userRecentEntries: aggregatedStats?.userRecentEntries || 0,
      userRoles: roles,
      userName: profile ? `${profile.first_name} ${profile.last_name}` : "",
      userId: user.id,
      userPosition: position,
    });

    // Set team best performances from backend response
    if (aggregatedStats?.teamBestAllTime) {
      setTeamBestAllTime(aggregatedStats.teamBestAllTime);
    }
    if (aggregatedStats?.teamBestSixMonths) {
      setTeamBestSixMonths(aggregatedStats.teamBestSixMonths);
    }
  };


  const fetchMetricStatuses = async () => {
    const allMetrics = getAllMetricTypes();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Batch query: Fetch all player entries at once
    const { data: allPlayerEntries } = await supabase
      .from('performance_entries')
      .select('entry_date, value, metric_type')
      .eq('player_id', stats.userId)
      .in('metric_type', allMetrics)
      .order('entry_date', { ascending: false });

    const statuses: MetricStatus[] = [];

    allMetrics.forEach(metric => {
      const metricEntries = allPlayerEntries?.filter(e => e.metric_type === metric) || [];
      
      if (metricEntries.length === 0) {
        statuses.push({ metric, status: 'missing' });
      } else {
        // Latest entry is first due to order by
        const latestEntry = metricEntries[0];
        const lastEntryDate = new Date(latestEntry.entry_date);
        const isOutdated = lastEntryDate < threeMonthsAgo;
        
        const bestValue = bestOf(metric, metricEntries.map(e => e.value));

        statuses.push({
          metric,
          status: isOutdated ? 'outdated' : 'current',
          lastEntry: lastEntryDate,
          bestValue,
        });
      }
    });

    setMetricStatuses(statuses);
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (stats.userId) {
      fetchMetricStatuses();
    }
  }, [stats.userId]);

  const roleDisplayNames = {
    admin: "Administrator",
    coach: "Coach",
    player: "Player",
  };

  const displayRoles = stats.userRoles.map(role => roleDisplayNames[role as keyof typeof roleDisplayNames]).filter(Boolean).join(", ") || "User";
  const primaryRole = stats.userRoles.includes("admin") ? "admin" :
                     stats.userRoles.includes("coach") ? "coach" :
                     stats.userRoles.includes("player") ? "player" : "";

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Welcome back, {stats.userName || "User"}!</h1>
        <p className="text-sm md:text-base text-muted-foreground">Role: {displayRoles}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.totalPlayers}</div>
            <p className="text-xs text-muted-foreground mt-1">Active team members</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Entries</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <div className="text-2xl font-bold text-primary">{stats.teamRecentEntries}</div>
                <p className="text-xs text-muted-foreground">Team entries (last 30 days)</p>
              </div>
              {primaryRole === "player" && (
                <div className="pt-2 border-t border-border/50">
                  <div className="text-xl font-bold text-primary">{stats.userRecentEntries}</div>
                  <p className="text-xs text-muted-foreground">Your entries (last 30 days)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Your Role{stats.userRoles.length > 1 ? 's' : ''}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{displayRoles}</div>
            <p className="text-xs text-muted-foreground mt-1">Access level{stats.userRoles.length > 1 ? 's' : ''}</p>
            {stats.userPosition && stats.userPosition !== "unassigned" && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-sm font-medium text-muted-foreground">Position</div>
                <div className="text-lg font-bold text-primary mt-1">{stats.userPosition}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Best Performances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {teamBestAllTime.length > 0 && (
          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <CardTitle>Team Best Performances (All-Time)</CardTitle>
              </div>
              <CardDescription>Best recorded values across all team members</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {teamBestAllTime.map(m => (
                  <div key={m.metric} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{metricLabel(m.metric)}</span>
                    <span className="text-lg font-bold text-primary">
                      {formatMetricValue(m.metric, m.value)} <span className="text-sm text-muted-foreground">[{metricUnit(m.metric)}]</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {teamBestSixMonths.length > 0 && (
          <Card className="border-border/50 shadow-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <CardTitle>Team Best Performances (Last 6 Months)</CardTitle>
              </div>
              <CardDescription>Best recorded values in the last 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3">
                {teamBestSixMonths.map(m => (
                  <div key={m.metric} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{metricLabel(m.metric)}</span>
                    <span className="text-lg font-bold text-primary">
                      {formatMetricValue(m.metric, m.value)} <span className="text-sm text-muted-foreground">[{metricUnit(m.metric)}]</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Metric Status Alerts */}
      {metricStatuses.length > 0 && (
        <div className="space-y-4">
          {/* Missing Entries */}
          {metricStatuses.filter(m => m.status === 'missing').length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Missing entries:</strong>{' '}
                {metricStatuses
                  .filter(m => m.status === 'missing')
                  .map(m => metricLabel(m.metric))
                  .join(', ')}
              </AlertDescription>
            </Alert>
          )}

          {/* Outdated Entries */}
          {metricStatuses.filter(m => m.status === 'outdated').length > 0 && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <strong>Outdated entries ({">"} 3 months):</strong>{' '}
                {metricStatuses
                  .filter(m => m.status === 'outdated')
                  .map(m => metricLabel(m.metric))
                  .join(', ')}
              </AlertDescription>
            </Alert>
          )}

          {/* Best Values */}
          {metricStatuses.filter(m => m.bestValue !== undefined).length > 0 && (
            <Card className="border-border/50 shadow-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  <CardTitle>Your Best Performances</CardTitle>
                </div>
                <CardDescription>Personal records across all metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {metricStatuses
                    .filter(m => m.bestValue !== undefined)
                    .map(m => (
                      <div key={m.metric} className="p-3 rounded-lg bg-muted/50 space-y-1">
                        <div className="text-sm font-medium text-muted-foreground">
                          {metricLabel(m.metric)}
                        </div>
                        <div className="text-xl font-bold text-primary">
                          {m.bestValue === undefined ? "-" : formatMetricValue(m.metric, m.bestValue)} <span className="text-sm text-muted-foreground">[{metricUnit(m.metric)}]</span>
                        </div>
                        {m.status === 'outdated' && (
                          <Badge variant="outline" className="text-xs">
                            Outdated
                          </Badge>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>What would you like to do today?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(primaryRole === "coach" || primaryRole === "admin") && (
            <QuickAction
              onClick={() => navigate("/performance")}
              title="Add Performance Entry"
              description="Record new metrics for players"
            />
          )}
          {primaryRole === "player" && (
            <QuickAction
              onClick={() => navigate("/performance")}
              title="View My Progress"
              description="Check your performance trends"
            />
          )}
          {primaryRole === "admin" && (
            <QuickAction
              onClick={() => navigate("/users")}
              title="Manage Users"
              description="Add or edit team members"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
