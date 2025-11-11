import { useEffect, useState } from "react";
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

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    recentEntries: 0,
    userRole: "",
    userName: "",
    userId: "",
  });
  const [metricStatuses, setMetricStatuses] = useState<MetricStatus[]>([]);

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

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    // Get all user roles (users can have multiple roles)
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    // Prioritize roles: admin > coach > player
    const roles = (rolesData || []).map((r: any) => r.role);
    const primaryRole = roles.includes("admin") ? "admin" :
                       roles.includes("coach") ? "coach" :
                       roles.includes("player") ? "player" : "";

    // Get total players
    const { count: playerCount } = await supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "player");

    // Get recent entries count (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { count: entriesCount } = await supabase
      .from("performance_entries")
      .select("*", { count: "exact", head: true })
      .gte("entry_date", thirtyDaysAgo.toISOString().split("T")[0]);

    setStats({
      totalPlayers: playerCount || 0,
      recentEntries: entriesCount || 0,
      userRole: primaryRole,
      userName: profile ? `${profile.first_name} ${profile.last_name}` : "",
      userId: user.id,
    });
  };

  const fetchMetricStatuses = async () => {
    const allMetrics = getAllMetricTypes();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const statuses: MetricStatus[] = [];

    for (const metric of allMetrics) {
      // Get latest entry for this metric
      const { data: latestEntry } = await supabase
        .from('performance_entries')
        .select('entry_date, value')
        .eq('player_id', stats.userId)
        .eq('metric_type', metric)
        .order('entry_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get best value for this metric
      const { data: allEntries } = await supabase
        .from('performance_entries')
        .select('value, metric_type')
        .eq('player_id', stats.userId)
        .eq('metric_type', metric);

      let bestValue: number | undefined;
      if (allEntries && allEntries.length > 0) {
        const isLowerBetter = ['40yd_dash', '3cone_drill', 'shuffle_run'].includes(metric);
        bestValue = isLowerBetter
          ? Math.min(...allEntries.map(e => e.value))
          : Math.max(...allEntries.map(e => e.value));
      }

      if (!latestEntry) {
        statuses.push({ metric, status: 'missing' });
      } else {
        const lastEntryDate = new Date(latestEntry.entry_date);
        const isOutdated = lastEntryDate < threeMonthsAgo;
        statuses.push({
          metric,
          status: isOutdated ? 'outdated' : 'current',
          lastEntry: lastEntryDate,
          bestValue,
        });
      }
    }

    setMetricStatuses(statuses);
  };

  const roleDisplayName = {
    admin: "Administrator",
    coach: "Coach",
    player: "Player",
  }[stats.userRole] || "User";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Welcome back, {stats.userName || "User"}!</h1>
        <p className="text-muted-foreground">Role: {roleDisplayName}</p>
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
            <div className="text-2xl font-bold text-primary">{stats.recentEntries}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Your Role</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{roleDisplayName}</div>
            <p className="text-xs text-muted-foreground mt-1">Current access level</p>
          </CardContent>
        </Card>
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
          {(stats.userRole === "coach" || stats.userRole === "admin") && (
            <div className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer">
              <h3 className="font-semibold mb-1">Add Performance Entry</h3>
              <p className="text-sm text-muted-foreground">Record new metrics for players</p>
            </div>
          )}
          {stats.userRole === "player" && (
            <div className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer">
              <h3 className="font-semibold mb-1">View My Progress</h3>
              <p className="text-sm text-muted-foreground">Check your performance trends</p>
            </div>
          )}
          {stats.userRole === "admin" && (
            <div className="p-4 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer">
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
