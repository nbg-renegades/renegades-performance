import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { METRIC_LABELS, METRIC_UNITS, getAllMetricTypes, type MetricType } from "@/lib/performanceUtils";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";

interface BatchCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  players: any[];
  currentUserId: string;
  onSuccess: () => void;
}

interface ExerciseRow {
  id: string;
  playerId: string;
  value: string;
}

export function BatchCreateDialog({ open, onOpenChange, players, currentUserId, onSuccess }: BatchCreateDialogProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"user" | "exercise">("user");
  const [isLoading, setIsLoading] = useState(false);
  
  // Batch by user mode states
  const [selectedUser, setSelectedUser] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [metrics, setMetrics] = useState<Record<MetricType, string>>({
    'vertical_jump': '',
    'jump_gather': '',
    '30yd_dash': '',
    '3_cone_drill': '',
    'shuttle_5_10_5': '',
    'pushups_1min': ''
  });

  // Batch by exercise mode states
  const [selectedExercise, setSelectedExercise] = useState<MetricType>('vertical_jump');
  const [exerciseDate, setExerciseDate] = useState(new Date().toISOString().split('T')[0]);
  const [exerciseRows, setExerciseRows] = useState<ExerciseRow[]>([
    { id: '1', playerId: '', value: '' }
  ]);

  const resetForm = () => {
    setSelectedUser("");
    setEntryDate(new Date().toISOString().split('T')[0]);
    setMetrics({
      'vertical_jump': '',
      'jump_gather': '',
      '30yd_dash': '',
      '3_cone_drill': '',
      'shuttle_5_10_5': '',
      'pushups_1min': ''
    });
    setSelectedExercise('vertical_jump');
    setExerciseDate(new Date().toISOString().split('T')[0]);
    setExerciseRows([{ id: '1', playerId: '', value: '' }]);
  };

  const handleBatchUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate and prepare entries
      const entries = [];
      for (const [metric, value] of Object.entries(metrics)) {
        if (value && parseFloat(value) > 0) {
          entries.push({
            player_id: selectedUser,
            metric_type: metric,
            value: parseFloat(value),
            unit: METRIC_UNITS[metric as MetricType],
            entry_date: entryDate,
            created_by: currentUserId
          });
        }
      }

      if (entries.length === 0) {
        toast({
          title: "No entries",
          description: "Please enter at least one metric value",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Insert all entries
      const { error } = await supabase
        .from("performance_entries")
        .insert(entries);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Added ${entries.length} performance entries`,
      });

      resetForm();
      onSuccess();
      onOpenChange(false);
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

  const handleBatchExerciseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate and prepare entries
      const entries = exerciseRows
        .filter(row => row.playerId && row.value && parseFloat(row.value) > 0)
        .map(row => ({
          player_id: row.playerId,
          metric_type: selectedExercise,
          value: parseFloat(row.value),
          unit: METRIC_UNITS[selectedExercise],
          entry_date: exerciseDate,
          created_by: currentUserId
        }));

      if (entries.length === 0) {
        toast({
          title: "No entries",
          description: "Please add at least one player with a value",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Insert all entries
      const { error } = await supabase
        .from("performance_entries")
        .insert(entries);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Added ${entries.length} ${METRIC_LABELS[selectedExercise]} entries`,
      });

      resetForm();
      onSuccess();
      onOpenChange(false);
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

  const addExerciseRow = () => {
    setExerciseRows([...exerciseRows, { id: Date.now().toString(), playerId: '', value: '' }]);
  };

  const removeExerciseRow = (id: string) => {
    if (exerciseRows.length > 1) {
      setExerciseRows(exerciseRows.filter(row => row.id !== id));
    }
  };

  const updateExerciseRow = (id: string, field: 'playerId' | 'value', value: string) => {
    setExerciseRows(exerciseRows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Batch Create Entries"
      description="Create multiple performance entries at once"
    >
      <Tabs value={mode} onValueChange={(v) => setMode(v as "user" | "exercise")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="user">By User</TabsTrigger>
          <TabsTrigger value="exercise">By Exercise</TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="space-y-4">
          <form onSubmit={handleBatchUserSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-user-player">Player</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser} required>
                <SelectTrigger id="batch-user-player">
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

            <div className="space-y-2">
              <Label htmlFor="batch-user-date">Date</Label>
              <Input
                id="batch-user-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <Label>Metrics (enter values for any or all)</Label>
              {getAllMetricTypes().map((metric) => (
                <div key={metric} className="space-y-2">
                  <Label htmlFor={`metric-${metric}`} className="text-sm">
                    {METRIC_LABELS[metric]} ({METRIC_UNITS[metric]})
                  </Label>
                  <Input
                    id={`metric-${metric}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={`Enter ${METRIC_LABELS[metric]}`}
                    value={metrics[metric]}
                    onChange={(e) => setMetrics({ ...metrics, [metric]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
                className="flex-1"
              >
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
            <div className="space-y-2">
              <Label htmlFor="batch-exercise-metric">Exercise</Label>
              <Select value={selectedExercise} onValueChange={(v) => setSelectedExercise(v as MetricType)} required>
                <SelectTrigger id="batch-exercise-metric">
                  <SelectValue placeholder="Select exercise" />
                </SelectTrigger>
                <SelectContent>
                  {getAllMetricTypes().map((metric) => (
                    <SelectItem key={metric} value={metric}>
                      {METRIC_LABELS[metric]} ({METRIC_UNITS[metric]})
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
                onChange={(e) => setExerciseDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Players & Values</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addExerciseRow}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {exerciseRows.map((row) => (
                  <div key={row.id} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Select
                        value={row.playerId}
                        onValueChange={(v) => updateExerciseRow(row.id, 'playerId', v)}
                      >
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
                    <div className="flex-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Value"
                        value={row.value}
                        onChange={(e) => updateExerciseRow(row.id, 'value', e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExerciseRow(row.id)}
                      disabled={exerciseRows.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  onOpenChange(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Creating..." : "Create Entries"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </ResponsiveDialog>
  );
}