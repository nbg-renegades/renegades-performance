import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, Users, Target } from "lucide-react";

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    recentEntries: 0,
    userRole: "",
    userName: "",
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

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
    });
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <Card className="border-border/50 shadow-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team Performance</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">Excellent</div>
            <p className="text-xs text-muted-foreground mt-1">Overall rating</p>
          </CardContent>
        </Card>
      </div>

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
