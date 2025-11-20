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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [players, setPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [isCoach, setIsCoach] = useState(false);

  const { data: comparisonData, isLoading, error, refetch, positionLabel } = usePerformanceComparison({
    mode,
    selectedPosition,
    currentUserId: selectedPlayerId || currentUserId,
    userRole
  });

  useEffect(() => {
    // Check if user is a coach
    const checkCoach = userRole === 'coach' || userRole === 'admin';
    setIsCoach(checkCoach);

    // If coach, fetch all players and set default
    if (checkCoach) {
      fetchAllPlayers();
    } else {
      // Always check player unit for non-coaches
      fetchPlayerUnit();
    }
  }, [currentUserId, userRole]);

  useEffect(() => {
    // Update player unit when selected player changes
    if (selectedPlayerId) {
      fetchPlayerUnit(selectedPlayerId);
    } else if (!isCoach) {
      fetchPlayerUnit();
    }
  }, [selectedPlayerId, isCoach]);

  async function fetchPlayerUnit(playerId?: string) {
    const targetId = playerId || currentUserId;
    const { data } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', targetId)
      .maybeSingle();
    
    if (data) {
      const position = data.position as FootballPosition;
      const unit = getPositionUnit(position);
      setPlayerUnit(unit);
    } else {
      setPlayerUnit(null);
    }
  }

  async function fetchAllPlayers() {
    // Fetch all players with positions
    const { data: playerData } = await supabase
      .from('player_positions')
      .select('player_id, position');
    
    if (!playerData) return;

    // Fetch profile information for all players
    const playerIds = playerData.map(p => p.player_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', playerIds);

    if (!profiles) return;

    const playerList = profiles.map(profile => ({
      id: profile.id,
      name: `${profile.first_name} ${profile.last_name}`
    }));

    setPlayers(playerList);

    // Check if current coach is also a player
    const coachIsPlayer = playerData.some(p => p.player_id === currentUserId);
    
    if (coachIsPlayer) {
      setSelectedPlayerId(currentUserId);
      const position = playerData.find(p => p.player_id === currentUserId)?.position as FootballPosition;
      if (position) {
        const unit = getPositionUnit(position);
        setPlayerUnit(unit);
      }
    } else {
      // Default to empty for non-player coaches
      setSelectedPlayerId('');
      setPlayerUnit(null);
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
          Compare your latest performance against reference benchmarks. All metrics are scaled 0-100 where 100 = best performance. For time-based metrics, 0 = 1.4× the best time; for distance/reps, 0 = half the best value.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isCoach && (
          <div className="mb-4 space-y-2">
            <Label htmlFor="player-select">Select Player</Label>
            <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
              <SelectTrigger id="player-select" className="bg-background">
                <SelectValue placeholder="Select a player..." />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {players.map(player => (
                  <SelectItem key={player.id} value={player.id}>
                    {player.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as ComparisonMode)} className="w-full">
          <TabsList className={`grid w-full ${playerUnit !== null ? 'grid-cols-3' : 'grid-cols-4'} h-auto`}>
            <TabsTrigger value="best" className="px-2 py-2 data-[state=active]:bg-background">Best Overall</TabsTrigger>
            <TabsTrigger value="position" className="px-2 py-2 data-[state=active]:bg-background">
              {positionLabel || 'My Position'}
            </TabsTrigger>
            {(isCoach || playerUnit === 'offense') && (
              <TabsTrigger value="offense" className="px-2 py-2 data-[state=active]:bg-background">Offense</TabsTrigger>
            )}
            {(isCoach || playerUnit === 'defense') && (
              <TabsTrigger value="defense" className="px-2 py-2 data-[state=active]:bg-background">Defense</TabsTrigger>
            )}
          </TabsList>

          {!isCoach && userRole === 'player' ? null : (
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
          )}

          <TabsContent value="best" />
          <TabsContent value="offense" />
          <TabsContent value="defense" />
        </Tabs>

        <div className="mt-6">
          {isLoading ? (
            <div className="h-[400px] w-full flex flex-col items-center justify-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground">Loading benchmark data...</p>
            </div>
          ) : error ? (
            <div className="h-[400px] w-full flex flex-col items-center justify-center gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
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
              <li><strong>100 = Best performance</strong> (fastest time or highest distance/reps)</li>
              <li><strong>0 = Baseline:</strong> 1.4× the best time for speed; 1/2 best for jumps; 1/5 best for push-ups</li>
              <li><strong>Time metrics:</strong> If best is 5s, then 5s=100, 7s=0</li>
              <li><strong>Jumps:</strong> If best is 200cm, then 200cm=100, 100cm=0</li>
              <li><strong>Push-ups:</strong> If best is 100 reps, then 100=100, 20=0</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
