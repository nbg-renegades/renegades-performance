import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Target, AlertCircle, Clock, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { METRIC_LABELS, METRIC_UNITS, type MetricType, getAllMetricTypes } from "@/lib/performanceUtils";
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

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalPlayers: 0,
    teamRecentEntries: 0,
    userRecentEntries: 0,
    userRoles: [] as string[],
    userName: "",
    userId: "",
  });
  const [metricStatuses, setMetricStatuses] = useState<MetricStatus[]>([]);
  const [teamBestAllTime, setTeamBestAllTime] = useState<TeamBestMetric[]>([]);
  const [teamBestSixMonths, setTeamBestSixMonths] = useState<TeamBestMetric[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (stats.userId) {
      fetchMetricStatuses();
    }
  }, [stats.userId]);

  const fetchDashboardData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user profile and roles in parallel
    const [profileResult, rolesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
    ]);

    const profile = profileResult.data;
    const roles = (rolesResult.data || []).map((r: any) => r.role);

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
        
        // Calculate best value
        const isLowerBetter = ['30yd_dash', '3_cone_drill', 'shuttle_5_10_5'].includes(metric);
        const bestValue = isLowerBetter
          ? Math.min(...metricEntries.map(e => e.value))
          : Math.max(...metricEntries.map(e => e.value));

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
                    <span className="text-sm font-medium">{METRIC_LABELS[m.metric]}</span>
                    <span className="text-lg font-bold text-primary">
                      {m.value.toFixed(2)} <span className="text-sm text-muted-foreground">[{METRIC_UNITS[m.metric]}]</span>
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
                    <span className="text-sm font-medium">{METRIC_LABELS[m.metric]}</span>
                    <span className="text-lg font-bold text-primary">
                      {m.value.toFixed(2)} <span className="text-sm text-muted-foreground">[{METRIC_UNITS[m.metric]}]</span>
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
                  .map(m => METRIC_LABELS[m.metric])
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
                  .map(m => METRIC_LABELS[m.metric])
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
                          {METRIC_LABELS[m.metric]}
                        </div>
                        <div className="text-xl font-bold text-primary">
                          {m.bestValue?.toFixed(2)} <span className="text-sm text-muted-foreground">[{METRIC_UNITS[m.metric]}]</span>
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
            <div 
              onClick={() => navigate("/performance")}
              className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <h3 className="font-semibold mb-1">Add Performance Entry</h3>
              <p className="text-sm text-muted-foreground">Record new metrics for players</p>
            </div>
          )}
          {primaryRole === "player" && (
            <div 
              onClick={() => navigate("/performance")}
              className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <h3 className="font-semibold mb-1">View My Progress</h3>
              <p className="text-sm text-muted-foreground">Check your performance trends</p>
            </div>
          )}
          {primaryRole === "admin" && (
            <div 
              onClick={() => navigate("/users")}
              className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer"
            >
              <h3 className="font-semibold mb-1">Manage Users</h3>
              <p className="text-sm text-muted-foreground">Add or edit team members</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
