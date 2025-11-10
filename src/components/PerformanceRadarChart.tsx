import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { usePerformanceComparison, type ComparisonMode } from "@/hooks/usePerformanceComparison";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface Player {
  id: string;
  first_name: string;
  last_name: string;
}

interface PerformanceRadarChartProps {
  currentUserId: string;
  userRole: string;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const HISTORICAL_OPTIONS = [
  { value: 1, label: '1 month ago' },
  { value: 3, label: '3 months ago' },
  { value: 6, label: '6 months ago' },
  { value: 12, label: '1 year ago' },
  { value: 24, label: '2 years ago' },
  { value: 36, label: '3 years ago' },
];

export function PerformanceRadarChart({ currentUserId, userRole }: PerformanceRadarChartProps) {
  const [mode, setMode] = useState<ComparisonMode>('average');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [historicalPeriods, setHistoricalPeriods] = useState<number[]>([1, 6, 12]);
  const [players, setPlayers] = useState<Player[]>([]);

  const { data: comparisonData, isLoading } = usePerformanceComparison({
    mode,
    selectedPlayerIds,
    historicalPeriods,
    currentUserId,
    userRole
  });

  useEffect(() => {
    fetchPlayers();
  }, []);

  async function fetchPlayers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name');
    
    if (data) {
      setPlayers(data as Player[]);
    }
  }

  // Transform data for recharts
  const chartData = Object.keys(comparisonData).length > 0
    ? comparisonData[Object.keys(comparisonData)[0]].map((metric, index) => {
        const dataPoint: any = { metric: metric.metric };
        Object.entries(comparisonData).forEach(([key, metrics]) => {
          dataPoint[key] = metrics[index]?.value || 0;
        });
        return dataPoint;
      })
    : [];

  const dataKeys = Object.keys(comparisonData);

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  }

  function toggleHistoricalPeriod(months: number) {
    setHistoricalPeriods(prev =>
      prev.includes(months)
        ? prev.filter(m => m !== months)
        : [...prev, months]
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Comparison</CardTitle>
        <CardDescription>
          Compare athletic performance across different metrics and players
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as ComparisonMode)} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="average">Average</TabsTrigger>
            <TabsTrigger value="best">Best</TabsTrigger>
            <TabsTrigger value="players">Players</TabsTrigger>
            {userRole === 'player' && <TabsTrigger value="position">Position</TabsTrigger>}
            {userRole === 'player' && <TabsTrigger value="historical">Historical</TabsTrigger>}
          </TabsList>

          <TabsContent value="players" className="space-y-4">
            <div className="space-y-2">
              <Label>Select Players to Compare</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                {players.map(player => (
                  <div key={player.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={player.id}
                      checked={selectedPlayerIds.includes(player.id)}
                      onCheckedChange={() => togglePlayer(player.id)}
                    />
                    <label
                      htmlFor={player.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {player.first_name} {player.last_name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="historical" className="space-y-4">
            <div className="space-y-2">
              <Label>Select Time Periods</Label>
              <div className="grid grid-cols-2 gap-2 p-2 border rounded-md">
                {HISTORICAL_OPTIONS.map(option => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`period-${option.value}`}
                      checked={historicalPeriods.includes(option.value)}
                      onCheckedChange={() => toggleHistoricalPeriod(option.value)}
                    />
                    <label
                      htmlFor={`period-${option.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="average" />
          <TabsContent value="best" />
          <TabsContent value="position" />
        </Tabs>

        <div className="mt-6">
          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={chartData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis 
                  dataKey="metric" 
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                />
                {dataKeys.map((key, index) => (
                  <Radar
                    key={key}
                    name={key}
                    dataKey={key}
                    stroke={COLORS[index % COLORS.length]}
                    fill={COLORS[index % COLORS.length]}
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                ))}
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--popover-foreground))'
                  }}
                  formatter={(value: any) => `${Math.round(value)}/100`}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              {mode === 'players' && selectedPlayerIds.length === 0 
                ? 'Select players to compare'
                : mode === 'historical' && historicalPeriods.length === 0
                ? 'Select time periods to compare'
                : 'No data available for comparison'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
