import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

interface PlayerPerformanceChartProps {
  currentUserId: string;
  userRole: string;
  selectedPlayerId?: string;
}

type ZoomLevel = '1m' | '3m' | '6m' | '12m' | '18m' | '3y';
type MetricType = 'vertical_jump' | 'broad_jump' | '40yd_dash' | '3cone_drill' | 'shuffle_run' | 'pushups_1min';

const ZOOM_LEVELS: Record<ZoomLevel, { label: string; months: number }> = {
  '1m': { label: '1 Month', months: 1 },
  '3m': { label: '3 Months', months: 3 },
  '6m': { label: '6 Months', months: 6 },
  '12m': { label: '12 Months', months: 12 },
  '18m': { label: '18 Months', months: 18 },
  '3y': { label: '3 Years', months: 36 },
};

const METRICS: Record<MetricType, { label: string; unit: string }> = {
  vertical_jump: { label: 'Vertical Jump', unit: 'cm' },
  broad_jump: { label: 'Broad Jump', unit: 'cm' },
  '40yd_dash': { label: '40-Yard Dash', unit: 's' },
  '3cone_drill': { label: '3-Cone Drill', unit: 's' },
  shuffle_run: { label: 'Shuffle Run', unit: 's' },
  pushups_1min: { label: '1 Min AMRAP Pushups', unit: 'reps' },
};

interface Player {
  id: string;
  first_name: string;
  last_name: string;
}

export function PlayerPerformanceChart({ currentUserId, userRole, selectedPlayerId }: PlayerPerformanceChartProps) {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('3m');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('vertical_jump');
  const [chartData, setChartData] = useState<any[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string>(currentUserId);
  const [isLoading, setIsLoading] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Set initial player ID
    if (selectedPlayerId) {
      setActivePlayerId(selectedPlayerId);
    } else if (currentUserId) {
      setActivePlayerId(currentUserId);
    }
  }, [selectedPlayerId, currentUserId]);

  useEffect(() => {
    if (userRole === 'coach' || userRole === 'admin') {
      fetchPlayers();
    }
  }, [userRole]);

  useEffect(() => {
    if (activePlayerId) {
      fetchChartData();
    }
  }, [zoomLevel, selectedMetric, activePlayerId]);

  async function fetchPlayers() {
    const { data: playerRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'player');

    if (playerRoles && playerRoles.length > 0) {
      const playerIds = playerRoles.map(r => r.user_id);
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', playerIds)
        .order('first_name');
      
      if (data) {
        setPlayers(data as Player[]);
      }
    }
  }

  async function fetchChartData() {
    setIsLoading(true);
    try {
      const months = ZOOM_LEVELS[zoomLevel].months;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const { data } = await supabase
        .from('performance_entries')
        .select('entry_date, value')
        .eq('player_id', activePlayerId)
        .eq('metric_type', selectedMetric)
        .gte('entry_date', startDate.toISOString().split('T')[0])
        .lte('entry_date', endDate.toISOString().split('T')[0])
        .order('entry_date', { ascending: true });

      const dbData = data || [];
      const valueByDate = new Map(dbData.map((entry: any) => [entry.entry_date, entry.value]));

      const dailyData: any[] = [];
      const cursor = new Date(startDate);
      cursor.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(0, 0, 0, 0);

      while (cursor <= end) {
        const iso = cursor.toISOString().split('T')[0];
        dailyData.push({
          ts: cursor.getTime(),
          value: valueByDate.get(iso) ?? null,
          isoDate: iso,
          dateLabel: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      
      setChartData(dailyData);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const chartHeight = isMobile ? 250 : 400;

  // Compute fixed timeframe boundaries (start and end at midnight) for X-axis domain
  const endDateAxis = new Date();
  endDateAxis.setHours(0, 0, 0, 0);
  const startDateAxis = new Date(endDateAxis);
  startDateAxis.setMonth(startDateAxis.getMonth() - ZOOM_LEVELS[zoomLevel].months);
  const startTs = startDateAxis.getTime();
  const endTs = endDateAxis.getTime();

  const formatXAxisTick = (ts: number) => {
    const months = ZOOM_LEVELS[zoomLevel].months;
    const options: Intl.DateTimeFormatOptions =
      months <= 1
        ? { month: 'short', day: 'numeric' }
        : months <= 6
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', year: '2-digit' };
    return new Date(ts).toLocaleDateString('en-US', options);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance History</CardTitle>
        <CardDescription>
          Track your progress over time across different metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(userRole === 'coach' || userRole === 'admin') && (
            <div className="space-y-2">
              <Label htmlFor="player-select">Select Player</Label>
              <Select value={activePlayerId} onValueChange={setActivePlayerId}>
                <SelectTrigger id="player-select" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {players.map(player => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.first_name} {player.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="metric-select">Select Metric</Label>
            <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
              <SelectTrigger id="metric-select" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {Object.entries(METRICS).map(([key, { label, unit }]) => (
                  <SelectItem key={key} value={key}>
                    {label} [{unit}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={zoomLevel} onValueChange={(v) => setZoomLevel(v as ZoomLevel)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
            {Object.entries(ZOOM_LEVELS).map(([key, { label }]) => (
              <TabsTrigger key={key} value={key} className="text-xs md:text-sm">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4">
          {isLoading ? (
            <Skeleton className={`h-[${chartHeight}px] w-full`} />
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={chartData} margin={{ bottom: isMobile ? 20 : 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={[startTs, endTs]}
                  scale="time"
                  tickFormatter={(value) => formatXAxisTick(value as number)}
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: isMobile ? 10 : 12 }}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 60 : 30}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }}
                  label={{ 
                    value: `${METRICS[selectedMetric].label} [${METRICS[selectedMetric].unit}]`, 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { fill: 'hsl(var(--foreground))', fontSize: isMobile ? 10 : 12 }
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--popover-foreground))'
                  }}
                  formatter={(value: any) => [`${value} ${METRICS[selectedMetric].unit}`, METRICS[selectedMetric].label]}
                  labelFormatter={(label: any) =>
                    new Date(label as number).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                  }
                />
                <Legend 
                  wrapperStyle={{ paddingTop: isMobile ? '10px' : '20px', fontSize: isMobile ? '10px' : '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))', r: isMobile ? 3 : 4 }}
                  activeDot={{ r: isMobile ? 5 : 6 }}
                  name={METRICS[selectedMetric].label}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
