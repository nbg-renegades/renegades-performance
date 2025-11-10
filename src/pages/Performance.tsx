import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface PerformanceEntry {
  id: string;
  entry_date: string;
  metric_type: string;
  value: number;
  unit: string;
  player_id: string;
  player?: {
    first_name: string;
    last_name: string;
  };
}

const Performance = () => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<PerformanceEntry[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUserId(user.id);

    // Get all user roles (avoid maybeSingle because users can have multiple roles)
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = (rolesData || []).map((r: any) => r.role);
    setUserRole(
      roles.includes("admin") ? "admin" :
      roles.includes("coach") ? "coach" :
      roles.includes("player") ? "player" :
      ""
    );

    // Get all players for coaches/admins
    if (roles.includes("coach") || roles.includes("admin")) {
      // First get all user_ids with player role
      const { data: playerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "player");

      if (playerRoles && playerRoles.length > 0) {
        const playerIds = playerRoles.map(r => r.user_id);
        
        // Then get profiles for those users
        const { data: playersData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", playerIds);

        setPlayers(playersData || []);
      }
    }

    // Fetch performance entries
    const { data: entriesData } = await supabase
      .from("performance_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(20);

    // Fetch player names separately
    if (entriesData) {
      const playerIds = [...new Set(entriesData.map(e => e.player_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]));
      
      const entriesWithProfiles = entriesData.map(entry => ({
        ...entry,
        player: profilesMap.get(entry.player_id),
      }));

      setEntries(entriesWithProfiles as any);
    }
  };

  const handleAddEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const playerId = formData.get("player_id") as string;
    const metricType = formData.get("metric_type") as string;
    const value = parseFloat(formData.get("value") as string);
    const entryDate = formData.get("entry_date") as string;

    const unitMap: Record<string, string> = {
      "vertical_jump": "cm",
      "broad_jump": "cm",
      "40yd_dash": "seconds",
      "3cone_drill": "seconds",
      "shuffle_run": "seconds",
      "pushups_1min": "reps",
    };

    try {
      const { error } = await supabase
        .from("performance_entries")
        .insert([{
          player_id: playerId,
          metric_type: metricType as any,
          value: value,
          unit: unitMap[metricType],
          entry_date: entryDate,
          created_by: currentUserId,
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Performance entry added successfully",
      });

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const metricDisplayNames: Record<string, string> = {
    "vertical_jump": "Vertical Jump",
    "broad_jump": "Broad Jump",
    "40yd_dash": "40-Yard Dash",
    "3cone_drill": "3-Cone Drill",
    "shuffle_run": "Shuffle Run",
    "pushups_1min": "1 Min AMRAP Pushups",
  };

  const canAddEntry = userRole === "coach" || userRole === "admin" || userRole === "player";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Performance Tracking</h1>
          <p className="text-muted-foreground">Monitor and record athletic performance metrics</p>
        </div>
        {canAddEntry && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Performance Entry</DialogTitle>
                <DialogDescription>Record a new performance metric</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddEntry} className="space-y-4">
                {(userRole === "coach" || userRole === "admin") && (
                  <div className="space-y-2">
                    <Label htmlFor="player_id">Player</Label>
                    <Select name="player_id" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map((player) => (
                          <SelectItem key={player.id} value={player.id}>
                            {player.first_name} {player.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {userRole === "player" && (
                  <input type="hidden" name="player_id" value={currentUserId} />
                )}
                <div className="space-y-2">
                  <Label htmlFor="metric_type">Metric</Label>
                  <Select name="metric_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(metricDisplayNames).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  <Input
                    id="value"
                    name="value"
                    type="number"
                    step="0.01"
                    required
                    placeholder="Enter value"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entry_date">Date</Label>
                  <Input
                    id="entry_date"
                    name="entry_date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Adding..." : "Add Entry"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recent Entries
          </CardTitle>
          <CardDescription>Latest performance measurements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {entries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No performance entries yet. Add your first entry to get started!
              </p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="font-semibold">
                      {entry.player?.first_name} {entry.player?.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {metricDisplayNames[entry.metric_type]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      {entry.value} <span className="text-sm text-muted-foreground">{entry.unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.entry_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Performance;
