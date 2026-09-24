import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, TrendingUp, Pencil, Trash2, Download, Users } from "lucide-react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { BatchCreateDialog } from "@/components/BatchCreateDialog";
import { PerformanceEntriesTable } from "@/components/PerformanceEntriesTable";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { POSITION_OPTIONS, POSITION_LABELS, getPositionUnit, type FootballPosition } from "@/lib/positionUtils";
import { errorMessage } from "@/lib/errors";
import { performanceEntrySchema } from "@/lib/validation";
import {
  METRICS,
  METRIC_OPTIONS,
  isMetricType,
  metricLabel,
  metricLabelWithUnit,
  metricUnit,
} from "@/lib/metrics";
import { z } from "zod";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePerformanceContext } from "./context";

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

const PerformanceEntries = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  // Identity and roster are resolved once by PerformanceLayout and shared by all three
  // tabs, rather than each route repeating auth.getUser() plus a user_roles lookup.
  const { currentUserId, userRole, players, isLoading: isContextLoading } =
    usePerformanceContext();
  const [entries, setEntries] = useState<PerformanceEntry[]>([]);
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
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);

  // Debounced refresh to prevent rapid successive calls
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const FETCH_COOLDOWN = 1000; // 1 second cooldown

  const fetchData = async () => {
    if (!currentUserId) return;

    // Rate limiting: Check cooldown
    const now = Date.now();
    if (now - lastFetchTime < FETCH_COOLDOWN) {
      return; // Skip if called too soon
    }
    setLastFetchTime(now);

    // Fetch performance entries using best daily entries RPC
    // This ensures only the best entry per metric per day per player is shown
    const { data: bestDailyData, error: bestDailyError } = await supabase
      .rpc('get_best_daily_entries');

    if (bestDailyError) {
      console.error("Error fetching entries:", bestDailyError);
      toast({
        title: "Error",
        description: "Failed to load performance entries",
        variant: "destructive",
      });
      return;
    }

    // The RPC already restricts players to their own rows, so no client-side filter.
    const entriesData = bestDailyData || [];

    // Fetch player names and positions for all entries
    const playerIdsToFetch = [...new Set(entriesData.map((e) => e.player_id))];
    const [playerProfilesResult, playerPositionsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', playerIdsToFetch),
      supabase
        .from('player_positions')
        .select('player_id, position')
        .in('player_id', playerIdsToFetch)
    ]);

    const playerMap = new Map(
      (playerProfilesResult.data || []).map(p => [p.id, p])
    );

    const positionMap = new Map(
      (playerPositionsResult.data || []).map(p => [p.player_id, p.position])
    );

    // Transform entries to match our interface
    const transformedEntries: PerformanceEntry[] = entriesData.map((entry) => {
      const profile = playerMap.get(entry.player_id);
      const position = positionMap.get(entry.player_id);
      return {
        id: entry.id,
        entry_date: entry.entry_date,
        metric_type: entry.metric_type,
        value: entry.value,
        unit: entry.unit,
        player_id: entry.player_id,
        player: profile ? {
          first_name: profile.first_name,
          last_name: profile.last_name,
          position: position as FootballPosition,
        } : undefined,
      };
    });

    setEntries(transformedEntries);
  };

  useEffect(() => {
    fetchData();
  }, [currentUserId]);

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
      const errors = validation.error.issues.map(e => e.message).join(", ");
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
        .insert([{
          player_id: playerId,
          metric_type: validation.data.metric_type,
          value: value,
          unit: metricUnit(metricType),
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
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
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
      const errors = editValidation.error.issues.map(e => e.message).join(", ");
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
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
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
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Used for the row buttons' accessible names and for the delete confirmation, so both
  // say which entry they mean rather than "this entry".
  const describeEntry = (entry: PerformanceEntry) => {
    const who = entry.player
      ? `${entry.player.first_name} ${entry.player.last_name}`
      : "this player";
    const what = metricLabel(entry.metric_type);
    return `${what} for ${who}, ${entry.value} ${entry.unit} on ${new Date(entry.entry_date).toLocaleDateString()}`;
  };

  const canEditEntry = (entry: PerformanceEntry) => {
    if (userRole === "admin" || userRole === "coach") return true;
    if (userRole === "player" && entry.player_id === currentUserId) return true;
    return false;
  };

  const canAddEntry = userRole === "coach" || userRole === "admin" || userRole === "player";

  // Memoised so its identity is stable between renders: the table resets its page
  // whenever this list changes, and a fresh array every render would reset it always.
  const filteredEntries = useMemo(() => entries.filter(entry => {
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
  }), [entries, filterMetric, filterPlayer, filterPosition, filterUnit]);

  const deletingEntry = entries.find((e) => e.id === deletingEntryId) ?? null;

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
          metricLabelWithUnit(entry.metric_type),
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
    } catch (error) {
      toast({
        title: "Error",
        description: errorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap gap-2">
          {(userRole === "coach" || userRole === "admin") && (
            <>
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => setIsBatchDialogOpen(true)}>
                <Users className="h-4 w-4 mr-2" />
                Batch Create
              </Button>
            </>
          )}
          {canAddEntry && (
            <ResponsiveDialog
              open={isDialogOpen}
              onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setSelectedPlayerId(""); setSelectedMetric(""); } }}
              title="Add Performance Entry"
              description="Record a new performance metric"
              trigger={
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entry
                </Button>
              }
            >
              <form onSubmit={handleAddEntry} className="space-y-4">
                {/* Player selector for coaches/admins */}
                {(userRole === "coach" || userRole === "admin") ? (
                  <div className="space-y-2">
                    <Label htmlFor="player_id">Player</Label>
                    <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                      <SelectTrigger id="player_id" className="bg-background">
                        <SelectValue placeholder="Select player" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {players.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Hidden input so value is submitted with the form */}
                    <input type="hidden" name="player_id" value={selectedPlayerId || ""} />
                  </div>
                ) : (
                  // Players submit their own ID
                  <input type="hidden" name="player_id" value={currentUserId} />
                )}

                {/* Metric selector */}
                <div className="space-y-2">
                  <Label htmlFor="metric_type">Metric</Label>
                  <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                    <SelectTrigger id="metric_type" className="bg-background">
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {METRIC_OPTIONS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {metricLabelWithUnit(m.key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Hidden input so value is submitted with the form */}
                  <input type="hidden" name="metric_type" value={selectedMetric || ""} />
                </div>

                {/* Value */}
                <div className="space-y-2">
                  <Label htmlFor="value">Value</Label>
                  <div className="relative">
                    <Input
                      id="value"
                      name="value"
                      type="number"
                      inputMode="decimal"
                      step={isMetricType(selectedMetric) ? METRICS[selectedMetric].step : 0.01}
                      min={0}
                      className="pr-12"
                      required
                    />
                    {/* The unit only appeared in the metric dropdown, so the coach had to
                        remember whether this box wanted cm, seconds or reps. */}
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      {metricUnit(selectedMetric)}
                    </span>
                  </div>
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="entry_date">Date</Label>
                  <Input
                    id="entry_date"
                    name="entry_date"
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    // A measurement cannot have happened tomorrow.
                    max={new Date().toISOString().split("T")[0]}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isLoading || ((userRole === "coach" || userRole === "admin") && !selectedPlayerId) || !selectedMetric
                  }
                >
                  {isLoading ? "Adding..." : "Add Entry"}
                </Button>
              </form>
            </ResponsiveDialog>
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
          <div className={`grid gap-3 mb-4 ${userRole === "player" ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
            <div className="flex-1">
              <Label htmlFor="filter-metric" className="text-sm mb-2 block">Filter by Metric</Label>
              <Select value={filterMetric} onValueChange={setFilterMetric}>
                <SelectTrigger id="filter-metric" className="bg-background">
                  <SelectValue placeholder="All Metrics" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Metrics</SelectItem>
                  {METRIC_OPTIONS.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {metricLabelWithUnit(m.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(userRole === "coach" || userRole === "admin") && (
              <>
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
                  {/* filterUnit had state and a live predicate but no control at all, so
                      the offense/defense split was unreachable. */}
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
              </>
            )}
          </div>
          <PerformanceEntriesTable
            entries={filteredEntries}
            totalCount={entries.length}
            showPlayerColumn={userRole === "coach" || userRole === "admin"}
            canEdit={canEditEntry}
            describeEntry={describeEntry}
            onEdit={setEditingEntry}
            onDelete={setDeletingEntryId}
          />
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <ResponsiveDialog
        open={!!editingEntry}
        onOpenChange={(open) => !open && setEditingEntry(null)}
        title="Edit Performance Entry"
        description="Update the performance metric value"
      >
        <form onSubmit={handleEditEntry} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-value">Value</Label>
            <Input
              id="edit-value"
              name="value"
              type="number"
              step="0.01"
              defaultValue={editingEntry?.value}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-entry-date">Date</Label>
            <Input
              id="edit-entry-date"
              name="entry_date"
              type="date"
              defaultValue={editingEntry?.entry_date}
              max={new Date().toISOString().split("T")[0]}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Updating..." : "Update Entry"}
          </Button>
        </form>
      </ResponsiveDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingEntryId} onOpenChange={(open) => !open && setDeletingEntryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Performance Entry</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingEntry
                ? `Delete ${describeEntry(deletingEntry)}? This action cannot be undone.`
                : "This action cannot be undone."}
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

      {/* Batch Create Dialog */}
      {(userRole === "coach" || userRole === "admin") && (
        <BatchCreateDialog
          open={isBatchDialogOpen}
          onOpenChange={setIsBatchDialogOpen}
          players={players}
          currentUserId={currentUserId}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};

export default PerformanceEntries;
