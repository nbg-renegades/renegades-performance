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
const SILVER_COLOR = '#C0C0C0'; // Silver for player 2 in compare mode

function getLineColor(key: string, mode: ComparisonMode, playerNames: { player1: string; player2: string }): string {
  // In compare mode, assign specific colors
  if (mode === 'compare') {
    // Baseline is always gray
    if (key.includes('Best')) return COMPARISON_COLOR;
    // Player 1 is Gold
    if (key === playerNames.player1) return PLAYER_COLOR;
    // Player 2 is Silver
    if (key === playerNames.player2) return SILVER_COLOR;
  }
  
  // Current player is always gold in non-compare modes
  if (key === 'You') return PLAYER_COLOR;
  
  // Single comparison modes use gray
  return COMPARISON_COLOR;
}

function getStrokeWidth(key: string): number {
  return key === 'You' ? 3 : 2;
}


export function PerformanceRadarChart({ currentUserId, userRole }: PerformanceRadarChartProps) {
  const [mode, setMode] = useState<ComparisonMode>('best');
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [playerUnit, setPlayerUnit] = useState<'offense' | 'defense' | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [players, setPlayers] = useState<Array<{ id: string; name: string }>>([]);
  const [isCoach, setIsCoach] = useState(false);
  const [isCoachAndPlayer, setIsCoachAndPlayer] = useState(false);
  
  // Compare mode states
  const [compareBaseline, setCompareBaseline] = useState<'best' | 'offense' | 'defense'>('best');
  const [comparePlayer1, setComparePlayer1] = useState<string>('');
  const [comparePlayer2, setComparePlayer2] = useState<string>('');

  const { data: comparisonData, isLoading, error, refetch, positionLabel, comparePlayerNames } = usePerformanceComparison({
    mode,
    selectedPosition,
    currentUserId: selectedPlayerId || currentUserId,
    userRole,
    comparePlayer1Id: comparePlayer1,
    comparePlayer2Id: comparePlayer2,
    compareBaseline
  });

  useEffect(() => {
    // Check if user is a coach
    const checkCoach = userRole === 'coach' || userRole === 'admin';
    setIsCoach(checkCoach);

    // If coach, fetch all players and check if coach is also a player
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
    if (!targetId) return;
    
    const { data } = await supabase
      .from('player_positions')
      .select('position')
      .eq('player_id', targetId)
      .maybeSingle();
    
    if (data) {
      const position = data.position as FootballPosition;
      const unit = getPositionUnit(position);
      setPlayerUnit(unit);
      // Set the selected position to the player's actual position
      setSelectedPosition(position);
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
    setIsCoachAndPlayer(coachIsPlayer);
    
    if (coachIsPlayer) {
      setSelectedPlayerId(currentUserId);
      const position = playerData.find(p => p.player_id === currentUserId)?.position as FootballPosition;
      if (position) {
        const unit = getPositionUnit(position);
        setPlayerUnit(unit);
        setSelectedPosition(position);
      }
    } else {
      // Default to empty for non-player coaches
      setSelectedPlayerId('');
      setPlayerUnit(null);
      setSelectedPosition('');
    }
  }

  // Transform data for recharts - match metrics by name, not by index
  const chartData = Object.keys(comparisonData).length > 0
    ? comparisonData[Object.keys(comparisonData)[0]].map((metric) => {
        const dataPoint: any = { metric: metric.metric };
        Object.entries(comparisonData).forEach(([key, metrics]) => {
          // Find the matching metric by name instead of using index
          const matchingMetric = metrics.find(m => m.metric === metric.metric);
          dataPoint[key] = matchingMetric?.value || 0;
        });
        return dataPoint;
      })
    : [];

  // Separate player data from reference data - draw reference first (outer layer)
  const dataKeys = Object.keys(comparisonData);
  const referenceKeys = dataKeys.filter(key => key !== 'You');
  const playerKeys = dataKeys.filter(key => key === 'You');
  const orderedKeys = [...referenceKeys, ...playerKeys]; // Reference first, player second
  
  // Get player names for compare mode color assignment - use the names from the hook
  const playerNames = comparePlayerNames || { player1: '', player2: '' };
  
  // In compare mode, order should be: baseline, player1, player2
  const compareOrderedKeys = mode === 'compare' 
    ? [
        ...dataKeys.filter(k => k.includes('Best')), // Baseline first
        playerNames.player1,
        playerNames.player2
      ].filter(Boolean)
    : orderedKeys;


  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Comparison</CardTitle>
        <CardDescription>
          Compare your latest performance against reference benchmarks within your comparison group. All metrics are scaled 0-100 where 100 = best performance in the group. For time-based metrics, 0 = 1.4× the group's best time; for distance, 0 = half the group's best; for push-ups, 0 = 1/5 the group's best.
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
          <TabsList className={`grid w-full ${
            isCoach && !isCoachAndPlayer 
              ? 'grid-cols-4' 
              : playerUnit !== null 
                ? 'grid-cols-3' 
                : 'grid-cols-4'
          } h-auto`}>
            <TabsTrigger value="best" className="px-2 py-2 data-[state=active]:bg-background" disabled={isLoading}>
              Best Overall
            </TabsTrigger>
            {/* Show position tab only for players (including coaches who are also players) */}
            {!isCoach || isCoachAndPlayer ? (
              <TabsTrigger value="position" className="px-2 py-2 data-[state=active]:bg-background" disabled={isLoading}>
                {isLoading ? 'Loading...' : (positionLabel || 'My Position')}
              </TabsTrigger>
            ) : null}
            {/* Show compare tab only for coaches who are NOT players */}
            {/* Compare Tab - Available for all coaches and admins */}
            {isCoach && (
              <TabsTrigger value="compare" className="px-2 py-2 data-[state=active]:bg-background" disabled={isLoading}>
                Compare
              </TabsTrigger>
            )}
            {(isCoach || playerUnit === 'offense') && (
              <TabsTrigger value="offense" className="px-2 py-2 data-[state=active]:bg-background" disabled={isLoading}>
                Offense
              </TabsTrigger>
            )}
            {(isCoach || playerUnit === 'defense') && (
              <TabsTrigger value="defense" className="px-2 py-2 data-[state=active]:bg-background" disabled={isLoading}>
                Defense
              </TabsTrigger>
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
          <TabsContent value="compare" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="baseline-select">Baseline</Label>
                <Select value={compareBaseline} onValueChange={(v) => setCompareBaseline(v as 'best' | 'offense' | 'defense')}>
                  <SelectTrigger id="baseline-select" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="best">Best Overall</SelectItem>
                    <SelectItem value="offense">Offense</SelectItem>
                    <SelectItem value="defense">Defense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="player1-select">Player 1 (Gold)</Label>
                <Select value={comparePlayer1} onValueChange={setComparePlayer1}>
                  <SelectTrigger id="player1-select" className="bg-background">
                    <SelectValue placeholder="Select player..." />
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
              <div className="space-y-2">
                <Label htmlFor="player2-select">Player 2 (Silver)</Label>
                <Select value={comparePlayer2} onValueChange={setComparePlayer2}>
                  <SelectTrigger id="player2-select" className="bg-background">
                    <SelectValue placeholder="Select player..." />
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
            </div>
          </TabsContent>
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
                {compareOrderedKeys.map((key) => (
                  <Radar
                    key={key}
                    name={key}
                    dataKey={key}
                    stroke={getLineColor(key, mode, playerNames)}
                    fill={getLineColor(key, mode, playerNames)}
                    fillOpacity={key === 'You' || (mode === 'compare' && !key.includes('Best')) ? 0.4 : 0.15}
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
              <li><strong>100 = Best in comparison group</strong> (fastest time or highest distance/reps within the selected comparison)</li>
              <li><strong>0 = Baseline:</strong> 1.4× the group's best time for speed; 1/2 group's best for jumps; 1/5 group's best for push-ups</li>
              <li><strong>Time metrics:</strong> If group best is 5s, then 5s=100, 7s=0</li>
              <li><strong>Jumps:</strong> If group best is 200cm, then 200cm=100, 100cm=0</li>
              <li><strong>Push-ups:</strong> If group best is 100 reps, then 100=100, 20=0</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
