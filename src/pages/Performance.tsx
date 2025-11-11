import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp, Pencil, Trash2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PerformanceRadarChart } from "@/components/PerformanceRadarChart";
import { PlayerPerformanceChart } from "@/components/PlayerPerformanceChart";
import { POSITION_OPTIONS, POSITION_LABELS, getPositionUnit, type FootballPosition } from "@/lib/positionUtils";
import { performanceEntrySchema } from "@/lib/validation";
import { z } from "zod";

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
    position?: FootballPosition;
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [selectedMetric, setSelectedMetric] = useState<string>("");
  const [editingEntry, setEditingEntry] = useState<PerformanceEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [filterMetric, setFilterMetric] = useState<string>("all");
  const [filterPlayer, setFilterPlayer] = useState<string>("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterUnit, setFilterUnit] = useState<string>("all");

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
      const { data: playerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "player");

      console.log("Player roles:", playerRoles, "Error:", rolesError);

      if (playerRoles && playerRoles.length > 0) {
        const playerIds = playerRoles.map(r => r.user_id);
        console.log("Player IDs:", playerIds);
        
        // Then get profiles for those users
        const { data: playersData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", playerIds);

        console.log("Players data:", playersData, "Error:", profilesError);
        setPlayers(playersData || []);
      } else {
        setPlayers([]);
      }
    }

    // Fetch performance entries
    const { data: entriesData } = await supabase
      .from("performance_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(20);

    // Fetch player names and positions separately
    if (entriesData) {
      const playerIds = [...new Set(entriesData.map(e => e.player_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      // Fetch positions for each player
      const { data: positionsData } = await supabase
        .from("player_positions")
        .select("player_id, position")
        .in("player_id", playerIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]));
      const positionsMap = new Map<string, FootballPosition>();
      
      positionsData?.forEach(pos => {
        positionsMap.set(pos.player_id, pos.position as FootballPosition);
      });
      
      const entriesWithProfiles = entriesData.map(entry => ({
        ...entry,
        player: {
          ...profilesMap.get(entry.player_id),
          position: positionsMap.get(entry.player_id),
        },
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

    // Validate input
    const validation = performanceEntrySchema.safeParse({
      player_id: playerId,
      metric_type: metricType,
      value: value,
      entry_date: entryDate,
    });

    if (!validation.success) {
      const errors = validation.error.errors.map(e => e.message).join(", ");
      toast({
        title: "Validation Error",
        description: errors,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const unitMap: Record<string, string> = {
      "vertical_jump": "cm",
      "broad_jump": "cm",
      "40yd_dash": "s",
      "3cone_drill": "s",
      "shuffle_run": "s",
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

  const handleEditEntry = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingEntry) return;
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const value = parseFloat(formData.get("value") as string);
    const entryDate = formData.get("entry_date") as string;

    // Validate input (partial schema for editing)
    const editValidation = z.object({
      value: z.number()
        .positive({ message: "Value must be positive" })
        .max(1000, { message: "Value must be less than 1000" })
        .finite({ message: "Value must be a valid number" }),
      entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format" }),
    }).safeParse({ value, entry_date: entryDate });

    if (!editValidation.success) {
      const errors = editValidation.error.errors.map(e => e.message).join(", ");
      toast({
        title: "Validation Error",
        description: errors,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("performance_entries")
        .update({
          value: value,
          entry_date: entryDate,
        })
        .eq("id", editingEntry.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Performance entry updated successfully",
      });

      setEditingEntry(null);
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

  const handleDeleteEntry = async () => {
    if (!deletingEntryId) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from("performance_entries")
        .delete()
        .eq("id", deletingEntryId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Performance entry deleted successfully",
      });

      setDeletingEntryId(null);
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

  const canEditEntry = (entry: PerformanceEntry) => {
    if (userRole === "admin" || userRole === "coach") return true;
    if (userRole === "player" && entry.player_id === currentUserId) return true;
    return false;
  };

  const metricDisplayNames: Record<string, string> = {
    "vertical_jump": "Vertical Jump [cm]",
    "broad_jump": "Broad Jump [cm]",
    "40yd_dash": "40-Yard Dash [s]",
    "3cone_drill": "3-Cone Drill [s]",
    "shuffle_run": "Shuffle Run [s]",
    "pushups_1min": "1 Min AMRAP Pushups [reps]",
  };

  const canAddEntry = userRole === "coach" || userRole === "admin" || userRole === "player";

  // Filter entries based on selected filters
  const filteredEntries = entries.filter(entry => {
    const matchesMetric = filterMetric === "all" || entry.metric_type === filterMetric;
    const matchesPlayer = filterPlayer === "all" || entry.player_id === filterPlayer;
    
    // Position filter
    let matchesPosition = true;
    if (filterPosition !== "all") {
      matchesPosition = entry.player?.position === filterPosition;
    }
    
    // Unit filter (offense/defense)
    let matchesUnit = true;
    if (filterUnit !== "all") {
      if (entry.player?.position) {
        const unit = getPositionUnit(entry.player.position);
        matchesUnit = unit === filterUnit;
      } else {
        matchesUnit = false;
      }
    }
    
    return matchesMetric && matchesPlayer && matchesPosition && matchesUnit;
  });

  const handleExportCSV = async () => {
    try {
      // Fetch all performance entries with player details
      const { data: allEntries, error } = await supabase
        .from("performance_entries")
        .select("*")
        .order("entry_date", { ascending: false });

      if (error) throw error;

      // Fetch all player profiles
      const playerIds = [...new Set(allEntries?.map(e => e.player_id) || [])];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]));

      // Convert to CSV format
      const csvRows = [];
      
      // Header row
      csvRows.push([
        "Date",
        "Player First Name",
        "Player Last Name",
        "Metric Type",
        "Value",
        "Unit"
      ].join(","));

      // Data rows
      allEntries?.forEach(entry => {
        const player = profilesMap.get(entry.player_id);
        csvRows.push([
          entry.entry_date,
          player?.first_name || "",
          player?.last_name || "",
          metricDisplayNames[entry.metric_type],
          entry.value,
          entry.unit
        ].join(","));
      });

      // Create CSV content
      const csvContent = csvRows.join("\n");
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      link.setAttribute("href", url);
      link.setAttribute("download", `performance_data_${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Success",
        description: "Performance data exported successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Performance Tracking</h1>
          <p className="text-muted-foreground">Monitor and record athletic performance metrics</p>
        </div>
        <div className="flex gap-2">
          {(userRole === "coach" || userRole === "admin") && (
            <Button variant="outline" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
          {canAddEntry && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setSelectedPlayerId(""); setSelectedMetric(""); } }}>
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
                    <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
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
                    <input type="hidden" name="player_id" value={selectedPlayerId} />
                  </div>
                )}
                {userRole === "player" && (
                  <input type="hidden" name="player_id" value={currentUserId} />
                )}
                <div className="space-y-2">
                  <Label htmlFor="metric_type">Metric</Label>
                  <Select value={selectedMetric} onValueChange={setSelectedMetric}>
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
                  <input type="hidden" name="metric_type" value={selectedMetric} />
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
                <Button type="submit" className="w-full" disabled={
                  isLoading || ((userRole === "coach" || userRole === "admin") && !selectedPlayerId) || !selectedMetric
                }>
                  {isLoading ? "Adding..." : "Add Entry"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <PlayerPerformanceChart currentUserId={currentUserId} userRole={userRole} />

      <PerformanceRadarChart currentUserId={currentUserId} userRole={userRole} />

      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recent Entries
          </CardTitle>
          <CardDescription>Latest performance measurements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="flex-1">
              <Label htmlFor="filter-metric" className="text-sm mb-2 block">Filter by Metric</Label>
              <Select value={filterMetric} onValueChange={setFilterMetric}>
                <SelectTrigger id="filter-metric" className="bg-background">
                  <SelectValue placeholder="All Metrics" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Metrics</SelectItem>
                  {Object.entries(metricDisplayNames).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(userRole === "coach" || userRole === "admin") && (
              <div className="flex-1">
                <Label htmlFor="filter-player" className="text-sm mb-2 block">Filter by Player</Label>
                <Select value={filterPlayer} onValueChange={setFilterPlayer}>
                  <SelectTrigger id="filter-player" className="bg-background">
                    <SelectValue placeholder="All Players" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">All Players</SelectItem>
                    {players.map((player) => (
                      <SelectItem key={player.id} value={player.id}>
                        {player.first_name} {player.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex-1">
              <Label htmlFor="filter-position" className="text-sm mb-2 block">Filter by Position</Label>
              <Select value={filterPosition} onValueChange={setFilterPosition}>
                <SelectTrigger id="filter-position" className="bg-background">
                  <SelectValue placeholder="All Positions" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Positions</SelectItem>
                  {POSITION_OPTIONS.filter(pos => pos !== 'unassigned').map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {POSITION_LABELS[pos]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="filter-unit" className="text-sm mb-2 block">Filter by Unit</Label>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger id="filter-unit" className="bg-background">
                  <SelectValue placeholder="All Units" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Units</SelectItem>
                  <SelectItem value="offense">Offense</SelectItem>
                  <SelectItem value="defense">Defense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3">
            {filteredEntries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {entries.length === 0 
                  ? "No performance entries yet. Add your first entry to get started!"
                  : "No entries match your filters. Try adjusting your selection."}
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors gap-4"
                >
                  <div className="flex-1">
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
                  {canEditEntry(entry) && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingEntry(entry)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingEntryId(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Performance Entry</DialogTitle>
            <DialogDescription>Update the performance metric value</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditEntry} className="space-y-4">
            <div className="space-y-2">
              <Label>Player</Label>
              <Input
                value={editingEntry?.player ? `${editingEntry.player.first_name} ${editingEntry.player.last_name}` : ''}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Metric</Label>
              <Input
                value={editingEntry ? metricDisplayNames[editingEntry.metric_type] : ''}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_value">Value</Label>
              <Input
                id="edit_value"
                name="value"
                type="number"
                step="0.01"
                required
                defaultValue={editingEntry?.value}
                placeholder="Enter value"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_entry_date">Date</Label>
              <Input
                id="edit_entry_date"
                name="entry_date"
                type="date"
                required
                defaultValue={editingEntry?.entry_date}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Entry"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingEntryId} onOpenChange={(open) => !open && setDeletingEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Performance Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEntry}
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Performance;
