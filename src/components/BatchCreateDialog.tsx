import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  METRICS,
  METRIC_KEYS,
  metricLabel,
  metricUnit,
  type MetricType,
} from "@/lib/metrics";
import { Search } from "lucide-react";

interface Player {
  id: string;
  first_name: string;
  last_name: string;
}

interface BatchCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: Player[];
  currentUserId: string;
  onSuccess: () => void;
}

const today = () => new Date().toISOString().split("T")[0];

const emptyMetricValues = () =>
  Object.fromEntries(METRIC_KEYS.map((m) => [m, ""])) as Record<MetricType, string>;

const playerLabel = (p: Player) => `${p.first_name} ${p.last_name}`;

/**
 * "By Exercise" is the testing-day flow: one drill, the whole squad, one after another.
 *
 * It used to start with a single empty row holding a player dropdown and a value box, plus
 * an "Add Row" button. Recording a drill for 20 players meant 19 Add Row clicks and 20
 * dropdown selections - about 40 interactions of pure overhead before a single number got
 * typed, on a phone, at the side of a pitch.
 *
 * The roster is already known, so the form is now the roster: one labelled input per
 * player, in squad order, and the coach just tabs down the list typing numbers. Blank rows
 * are skipped, so a player who did not attend needs no action at all. A search box keeps
 * it workable once the roster outgrows a screen.
 */
export function BatchCreateDialog({
  open,
  onOpenChange,
  players,
  currentUserId,
  onSuccess,
}: BatchCreateDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"user" | "exercise">("user");
  const [isLoading, setIsLoading] = useState(false);

  // Batch by user
  const [selectedUser, setSelectedUser] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [metrics, setMetrics] = useState<Record<MetricType, string>>(emptyMetricValues);

  // Batch by exercise
  const [selectedExercise, setSelectedExercise] = useState<MetricType>("vertical_jump");
  const [exerciseDate, setExerciseDate] = useState(today);
  const [playerValues, setPlayerValues] = useState<Record<string, string>>({});
  const [playerSearch, setPlayerSearch] = useState("");

  const resetForm = () => {
    setSelectedUser("");
    setEntryDate(today());
    setMetrics(emptyMetricValues());
    setSelectedExercise("vertical_jump");
    setExerciseDate(today());
    setPlayerValues({});
    setPlayerSearch("");
  };

  const close = () => {
    resetForm();
    onOpenChange(false);
  };

  const visiblePlayers = useMemo(() => {
    const needle = playerSearch.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((p) => playerLabel(p).toLowerCase().includes(needle));
  }, [players, playerSearch]);

  /** Only rows the coach actually typed a usable number into become entries. */
  const filledPlayerIds = Object.keys(playerValues).filter((id) => {
    const parsed = parseFloat(playerValues[id]);
    return Number.isFinite(parsed) && parsed > 0;
  });

  const insertEntries = async (
    entries: Array<{ player_id: string; metric_type: string; value: number }>,
    date: string,
    successMessage: string,
  ) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from("performance_entries").insert(
        entries.map((e) => ({
          player_id: e.player_id,
          metric_type: e.metric_type as never,
          value: e.value,
          unit: metricUnit(e.metric_type),
          entry_date: date,
          created_by: currentUserId,
        })),
      );
      if (error) throw error;

      toast({ title: "Success", description: successMessage });
      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save entries",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = METRIC_KEYS.flatMap((metric) => {
      const parsed = parseFloat(metrics[metric]);
      return Number.isFinite(parsed) && parsed > 0
        ? [{ player_id: selectedUser, metric_type: metric, value: parsed }]
        : [];
    });

    if (entries.length === 0) {
      toast({
        title: "No entries",
        description: "Please enter at least one metric value",
        variant: "destructive",
      });
      return;
    }

    await insertEntries(
      entries,
      entryDate,
      `Added ${entries.length} performance ${entries.length === 1 ? "entry" : "entries"}`,
    );
  };

  const handleBatchExerciseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = filledPlayerIds.map((id) => ({
      player_id: id,
      metric_type: selectedExercise,
      value: parseFloat(playerValues[id]),
    }));

    if (entries.length === 0) {
      toast({
        title: "No entries",
        description: "Enter a value for at least one player",
        variant: "destructive",
      });
      return;
    }

    await insertEntries(
      entries,
      exerciseDate,
      `Added ${entries.length} ${metricLabel(selectedExercise)} ${entries.length === 1 ? "entry" : "entries"}`,
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Batch Create Entries"
      description="Create multiple performance entries at once"
      className="sm:max-w-xl"
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as "user" | "exercise")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="user">One player</TabsTrigger>
          <TabsTrigger value="exercise">One drill</TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="space-y-4">
          <form onSubmit={handleBatchUserSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batch-user-player">Player</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger id="batch-user-player" className="bg-background">
                    <SelectValue placeholder="Select player" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {players.map((player) => (
                      <SelectItem key={player.id} value={player.id}>
                        {playerLabel(player)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-user-date">Date</Label>
                <Input
                  id="batch-user-date"
                  type="date"
                  value={entryDate}
                  // A measurement cannot have happened tomorrow.
                  max={today()}
                  onChange={(e) => setEntryDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Metrics — fill in whichever were measured</Label>
              {METRIC_KEYS.map((metric) => (
                <div key={metric} className="grid grid-cols-[1fr_7rem] items-center gap-3">
                  <Label htmlFor={`metric-${metric}`} className="text-sm font-normal">
                    {metricLabel(metric)}
                  </Label>
                  <div className="relative">
                    <Input
                      id={`metric-${metric}`}
                      type="number"
                      inputMode="decimal"
                      step={METRICS[metric].step}
                      min="0"
                      className="pr-12 text-right tabular-nums"
                      value={metrics[metric]}
                      onChange={(e) => setMetrics({ ...metrics, [metric]: e.target.value })}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                      {metricUnit(metric)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !selectedUser} className="flex-1">
                {isLoading ? "Creating..." : "Create Entries"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="exercise" className="space-y-4">
          <form onSubmit={handleBatchExerciseSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batch-exercise-metric">Drill</Label>
                <Select
                  value={selectedExercise}
                  onValueChange={(v) => setSelectedExercise(v as MetricType)}
                >
                  <SelectTrigger id="batch-exercise-metric" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {METRIC_KEYS.map((metric) => (
                      <SelectItem key={metric} value={metric}>
                        {metricLabel(metric)} ({metricUnit(metric)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-exercise-date">Date</Label>
                <Input
                  id="batch-exercise-date"
                  type="date"
                  value={exerciseDate}
                  max={today()}
                  onChange={(e) => setExerciseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No players on the roster yet.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor="batch-player-search">Squad</Label>
                  <span className="text-xs text-muted-foreground">
                    {filledPlayerIds.length} of {players.length} filled
                  </span>
                </div>

                {players.length > 8 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="batch-player-search"
                      type="search"
                      placeholder="Find a player"
                      className="pl-9"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                    />
                  </div>
                )}

                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {visiblePlayers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No player matches “{playerSearch}”.
                    </p>
                  ) : (
                    visiblePlayers.map((player) => (
                      <div
                        key={player.id}
                        className="grid grid-cols-[1fr_7rem] items-center gap-3"
                      >
                        <Label
                          htmlFor={`player-value-${player.id}`}
                          className="text-sm font-normal truncate"
                        >
                          {playerLabel(player)}
                        </Label>
                        <div className="relative">
                          <Input
                            id={`player-value-${player.id}`}
                            type="number"
                            inputMode="decimal"
                            step={METRICS[selectedExercise].step}
                            min="0"
                            className="pr-12 text-right tabular-nums"
                            value={playerValues[player.id] ?? ""}
                            onChange={(e) =>
                              setPlayerValues((prev) => ({
                                ...prev,
                                [player.id]: e.target.value,
                              }))
                            }
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                            {metricUnit(selectedExercise)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={close} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || filledPlayerIds.length === 0}
                className="flex-1"
              >
                {isLoading
                  ? "Creating..."
                  : filledPlayerIds.length === 0
                    ? "Create Entries"
                    : `Create ${filledPlayerIds.length} ${filledPlayerIds.length === 1 ? "entry" : "entries"}`}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </ResponsiveDialog>
  );
}
