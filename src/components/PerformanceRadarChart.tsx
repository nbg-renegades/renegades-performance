import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { usePerformanceComparison, type ComparisonMode } from "@/hooks/usePerformanceComparison";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { POSITION_OPTIONS, POSITION_LABELS, type FootballPosition, getPositionUnit } from "@/lib/positionUtils";

interface PerformanceRadarChartProps {
  currentUserId: string;
  userRole: string;
}

const PLAYER_COLOR = 'hsl(var(--primary))'; // Gold color for current player
const COMPARISON_COLOR = 'hsl(var(--muted-foreground))'; // Gray for comparisons

function getLineColor(key: string, mode: ComparisonMode, index: number): string {
  // Current player is always gold
  if (key === 'You') return PLAYER_COLOR;
  
  // Single comparison modes use gray
  return COMPARISON_COLOR;
}

function getStrokeWidth(key: string): number {
  return key === 'You' ? 3 : 2;
}


export function PerformanceRadarChart({ currentUserId, userRole }: PerformanceRadarChartProps) {
  const [mode, setMode] = useState<ComparisonMode>('best');
  const [selectedPosition, setSelectedPosition] = useState<string>('QB');
  const [playerUnit, setPlayerUnit] = useState<'offense' | 'defense' | null>(null);

  const { data: comparisonData, isLoading } = usePerformanceComparison({
    mode,
    selectedPosition,
    currentUserId,
    userRole
  });

  useEffect(() => {
    // Always check player unit, regardless of role
    fetchPlayerUnit();
  }, [currentUserId]);

  async function fetchPlayerUnit() {
    const { data } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', currentUserId)
      .maybeSingle();
    
    if (data) {
      const position = data.position as FootballPosition;
      const unit = getPositionUnit(position);
      setPlayerUnit(unit);
    }
  }

  // Transform data for recharts - ensure Reference is drawn first (outer), then Player (inner)
  const chartData = Object.keys(comparisonData).length > 0
    ? comparisonData[Object.keys(comparisonData)[0]].map((metric, index) => {
        const dataPoint: any = { metric: metric.metric };
        Object.entries(comparisonData).forEach(([key, metrics]) => {
          dataPoint[key] = metrics[index]?.value || 0;
        });
        return dataPoint;
      })
    : [];

  // Separate player data from reference data - draw reference first (outer layer)
  const dataKeys = Object.keys(comparisonData);
  const referenceKeys = dataKeys.filter(key => key !== 'You');
  const playerKeys = dataKeys.filter(key => key === 'You');
  const orderedKeys = [...referenceKeys, ...playerKeys]; // Reference first, player second


  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Comparison</CardTitle>
        <CardDescription>
          Compare your latest performance against reference benchmarks. The outer ring shows the best recorded value for each metric, while your performance is shown in the inner area. All metrics are scaled 0-100 where 100 = best performance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as ComparisonMode)} className="w-full">
          <TabsList className={`grid w-full ${playerUnit !== null ? 'grid-cols-3' : 'grid-cols-4'}`}>
            <TabsTrigger value="best">Best Overall</TabsTrigger>
            <TabsTrigger value="position">My Position</TabsTrigger>
            {(playerUnit === null || playerUnit === 'offense') && (
              <TabsTrigger value="offense">Offense</TabsTrigger>
            )}
            {(playerUnit === null || playerUnit === 'defense') && (
              <TabsTrigger value="defense">Defense</TabsTrigger>
            )}
          </TabsList>

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
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                />
                <PolarRadiusAxis 
                  angle={90} 
                  domain={[0, 100]}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                />
                {orderedKeys.map((key, index) => (
                  <Radar
                    key={key}
                    name={key}
                    dataKey={key}
                    stroke={getLineColor(key, mode, index)}
                    fill={getLineColor(key, mode, index)}
                    fillOpacity={key === 'You' ? 0.4 : 0.15}
                    strokeWidth={getStrokeWidth(key)}
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
                  formatter={(value: any, name: any, props: any) => {
                    const rawValue = props.payload[name];
                    return [`Score: ${Math.round(value)}/100`, name];
                  }}
                  labelFormatter={(label: any) => label}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
              No data available for comparison
            </div>
          )}
          
          {/* Explanation of scaling */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2 text-sm">
            <h4 className="font-semibold text-foreground">How the 0-100 Scale Works</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><strong>100 = Best performance</strong> recorded across all players</li>
              <li><strong>0 = Baseline</strong> (lowest recorded performance)</li>
              <li><strong>Time metrics</strong> (40yd dash, 3-cone, shuffle run): Faster time = Higher score</li>
              <li><strong>Distance/Reps</strong> (jumps, pushups): Higher value = Higher score</li>
              <li><strong>Your score</strong> shows where you stand relative to the best performance</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
