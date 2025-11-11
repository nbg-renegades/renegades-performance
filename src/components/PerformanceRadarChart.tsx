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
import { POSITION_OPTIONS, POSITION_LABELS } from "@/lib/positionUtils";

interface PerformanceRadarChartProps {
  currentUserId: string;
  userRole: string;
}

const PLAYER_COLOR = 'hsl(var(--primary))'; // Gold color for current player
const COMPARISON_COLOR = 'hsl(var(--muted-foreground))'; // Gray for single comparisons

const MULTI_COLORS = [
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-1))',
];

function getLineColor(key: string, mode: ComparisonMode, index: number): string {
  // Current player is always gold
  if (key === 'You') return PLAYER_COLOR;
  
  // Multi-player modes use different colors
  if (mode === 'players' || mode === 'historical') {
    return MULTI_COLORS[(index - 1) % MULTI_COLORS.length];
  }
  
  // Single comparison modes use gray
  return COMPARISON_COLOR;
}

function getStrokeWidth(key: string): number {
  return key === 'You' ? 3 : 2;
}

const HISTORICAL_OPTIONS = [
  { value: 1, label: '1 month ago' },
  { value: 3, label: '3 months ago' },
  { value: 6, label: '6 months ago' },
  { value: 12, label: '1 year ago' },
  { value: 24, label: '2 years ago' },
  { value: 36, label: '3 years ago' },
];

export function PerformanceRadarChart({ currentUserId, userRole }: PerformanceRadarChartProps) {
  const [mode, setMode] = useState<ComparisonMode>('best');
  const [selectedPosition, setSelectedPosition] = useState<string>('QB');
  const [historicalPeriods, setHistoricalPeriods] = useState<number[]>([1, 6, 12]);
  const [playerUnit, setPlayerUnit] = useState<'offense' | 'defense' | null>(null);

  const { data: comparisonData, isLoading } = usePerformanceComparison({
    mode,
    selectedPlayerIds: [],
    selectedPosition,
    historicalPeriods,
    currentUserId,
    userRole
  });

  useEffect(() => {
    if (userRole === 'player') {
      fetchPlayerUnit();
    }
  }, [userRole, currentUserId]);

  async function fetchPlayerUnit() {
    const { data: positionData } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', currentUserId)
      .single();
    
    if (positionData) {
      const offensePositions = ['QB', 'WR', 'C'];
      const defensePositions = ['DB', 'B'];
      
      if (offensePositions.includes(positionData.position)) {
        setPlayerUnit('offense');
      } else if (defensePositions.includes(positionData.position)) {
        setPlayerUnit('defense');
      }
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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 h-auto">
            <TabsTrigger value="best" className="text-xs sm:text-sm">Best</TabsTrigger>
            {userRole === 'player' && <TabsTrigger value="my_position" className="text-xs sm:text-sm">My Position</TabsTrigger>}
            <TabsTrigger value="position" className="text-xs sm:text-sm">Position</TabsTrigger>
            {(userRole !== 'player' || playerUnit === 'offense') && (
              <TabsTrigger value="offense" className="text-xs sm:text-sm">Offense</TabsTrigger>
            )}
            {(userRole !== 'player' || playerUnit === 'defense') && (
              <TabsTrigger value="defense" className="text-xs sm:text-sm">Defense</TabsTrigger>
            )}
            {userRole === 'player' && <TabsTrigger value="historical" className="text-xs sm:text-sm">Historical</TabsTrigger>}
          </TabsList>

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

          <TabsContent value="position" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="position-select">Select Position</Label>
              <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                <SelectTrigger id="position-select" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {POSITION_OPTIONS.filter(pos => pos !== 'unassigned').map(pos => (
                    <SelectItem key={pos} value={pos}>
                      {POSITION_LABELS[pos]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="position" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="position-select">Select Position</Label>
              <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                <SelectTrigger id="position-select" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {POSITION_OPTIONS.filter(pos => pos !== 'unassigned').map(pos => (
                    <SelectItem key={pos} value={pos}>
                      {POSITION_LABELS[pos]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="best" />
          <TabsContent value="my_position" />
          <TabsContent value="offense" />
          <TabsContent value="defense" />
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
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
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
                    stroke={getLineColor(key, mode, index)}
                    fill={getLineColor(key, mode, index)}
                    fillOpacity={key === 'You' ? 0.3 : 0.1}
                    strokeWidth={getStrokeWidth(key)}
                  />
                ))}
                <Legend 
                  wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }}
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
            <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
              {mode === 'historical' && historicalPeriods.length === 0
                ? 'Select time periods to compare'
                : 'No data available for comparison'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
