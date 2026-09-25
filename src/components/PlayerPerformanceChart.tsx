import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQuery } from "@tanstack/react-query";
import { queryKeys, fetchRoster, fetchMetricHistory } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParamState } from "@/hooks/useSearchParamState";
import {
  METRICS,
  METRIC_OPTIONS,
  isMetricType,
  metricLabel,
  metricLabelWithUnit,
  metricUnit,
  type MetricType,
} from "@/lib/metrics";

interface PlayerPerformanceChartProps {
  currentUserId: string;
  userRole: string;
  selectedPlayerId?: string;
  /**
   * Hides the player dropdown. On a player's own page the subject is the page, so offering to
   * switch to somebody else inside one card is how the old three-tab layout ended up with
   * three independent dropdowns that disagreed with each other.
   */
  lockPlayer?: boolean;
  /** The group median per metric, drawn as a reference line. */
  medianByMetric?: Map<MetricType, number>;
  /** The athlete's best ever value per metric, drawn as a reference line. */
  personalBestByMetric?: Map<MetricType, number>;
}

type ZoomLevel = '1m' | '3m' | '6m' | '12m' | '18m' | '3y';

const ZOOM_LEVELS: Record<ZoomLevel, { label: string; months: number }> = {
  '1m': { label: '1 Month', months: 1 },
  '3m': { label: '3 Months', months: 3 },
  '6m': { label: '6 Months', months: 6 },
  '12m': { label: '12 Months', months: 12 },
  '18m': { label: '18 Months', months: 18 },
  '3y': { label: '3 Years', months: 36 },
};

interface ChartPoint {
  /** Epoch millis; the X axis is a time scale, so the key has to be numeric. */
  ts: number;
  value: number;
  isoDate: string;
  dateLabel: string;
}

export function PlayerPerformanceChart({
  currentUserId,
  userRole,
  selectedPlayerId,
  lockPlayer = false,
  medianByMetric,
  personalBestByMetric,
}: PlayerPerformanceChartProps) {
  // Both selections live in the URL, so a link to this chart carries the drill and the window
  // it was showing. They were useState, which meant a coach could not send anyone what they
  // were looking at.
  const [rawZoom, setZoomLevel] = useSearchParamState('range', '3m');
  const [rawMetric, setSelectedMetric] = useSearchParamState('metric', 'vertical_jump');
  const zoomLevel = (rawZoom in ZOOM_LEVELS ? rawZoom : '3m') as ZoomLevel;
  const selectedMetric = (isMetricType(rawMetric) ? rawMetric : 'vertical_jump') as MetricType;
  // Who the chart is showing is a choice layered over the props, not a copy of them. As
  // state synced by an effect it was always one render stale and re-ran on every prop
  // change; as a derived value there is nothing to keep in sync.
  const [chosenPlayerId, setChosenPlayerId] = useState<string | null>(null);
  const activePlayerId = chosenPlayerId ?? selectedPlayerId ?? currentUserId;
  const isMobile = useIsMobile();

  const isCoach = userRole === 'coach' || userRole === 'admin';

  const { data: players = [] } = useQuery({
    queryKey: queryKeys.roster,
    queryFn: fetchRoster,
    enabled: isCoach,
  });

  const months = ZOOM_LEVELS[zoomLevel].months;
  const { data: historyRows = [], isPending: isLoading } = useQuery({
    queryKey: queryKeys.metricHistory(activePlayerId, selectedMetric, months),
    queryFn: () => fetchMetricHistory(activePlayerId, selectedMetric, months),
    enabled: !!activePlayerId,
  });

  const chartData: ChartPoint[] = historyRows.map((entry) => ({
    ts: new Date(entry.entry_date).getTime(),
    value: entry.value,
    isoDate: entry.entry_date,
    dateLabel: new Date(entry.entry_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    }),
  }));

  const chartHeight = isMobile ? 250 : 400;

  // Compute fixed timeframe boundaries (start and end at midnight) for X-axis domain
  const endDateAxis = new Date();
  endDateAxis.setHours(0, 0, 0, 0);
  const startDateAxis = new Date(endDateAxis);
  startDateAxis.setMonth(startDateAxis.getMonth() - ZOOM_LEVELS[zoomLevel].months);
  const startTs = startDateAxis.getTime();
  const endTs = endDateAxis.getTime();

  // Recharts anchors a numeric axis at 0 unless told otherwise. For these metrics that is
  // never the interesting range: a vertical jump going 54cm -> 60cm is an 11% gain, but
  // against a 0-60 axis it draws as a flat line across the top of a 400px chart. Framing
  // the actual spread - with 10% padding, and a floor of half a unit so a single point or
  // a run of identical values still gets a sane axis - is what makes the trend visible.
  const median = medianByMetric?.get(selectedMetric) ?? null;
  const personalBest = personalBestByMetric?.get(selectedMetric) ?? null;

  const yDomain = (() => {
    if (chartData.length === 0) return [0, 'auto'] as const;
    // The reference lines are part of the picture, so they have to be inside the frame. Left
    // out of this, a median below the plotted range simply would not be drawn and the chart
    // would quietly claim the athlete had no context.
    const values = [
      ...chartData.map((d) => d.value as number),
      ...(median !== null ? [median] : []),
      ...(personalBest !== null ? [personalBest] : []),
    ];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.1, 0.5);
    return [
      // Nothing here can be negative, so never pad below zero.
      Math.max(0, +(lo - pad).toFixed(2)),
      +(hi + pad).toFixed(2),
    ] as const;
  })();

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
          Track your progress over time across different metrics. Select a metric and timeframe to view your performance trend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isCoach && !lockPlayer && (
            <div className="space-y-2">
              <Label htmlFor="player-select">Select Player</Label>
              <Select value={activePlayerId} onValueChange={setChosenPlayerId}>
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
                {METRIC_OPTIONS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {metricLabelWithUnit(m.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={zoomLevel} onValueChange={(v) => setZoomLevel(v as ZoomLevel)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6 h-auto">
            {Object.entries(ZOOM_LEVELS).map(([key, { label }]) => (
              <TabsTrigger key={key} value={key} className="text-xs md:text-sm px-2 py-2">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4">
          {isLoading ? (
            // Tailwind cannot see an interpolated class name, so `h-[${chartHeight}px]`
            // generated no CSS at all and the skeleton collapsed to nothing - the card
            // shrank and snapped back on every metric or timeframe change. An inline
            // height reserves the same space the chart is about to take.
            <Skeleton className="w-full" style={{ height: chartHeight }} />
          ) : (
            <>
              {/* Show date range */}
              <div className="mb-2 text-sm text-muted-foreground text-center">
                Showing: {startDateAxis.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — {endDateAxis.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {chartData.length === 0 && <span className="text-orange-500 ml-2">(No data in this range)</span>}
              </div>
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
                  domain={yDomain}
                  allowDecimals={METRICS[selectedMetric].precision > 0}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }}
                  label={{
                    value: metricLabelWithUnit(selectedMetric), 
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
                  formatter={(value: number) => [`${value} ${metricUnit(selectedMetric)}`, metricLabel(selectedMetric)]}
                  labelFormatter={(label: number) =>
                    new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                  }
                />
                <Legend
                  wrapperStyle={{ paddingTop: isMobile ? '10px' : '20px', fontSize: isMobile ? '10px' : '12px' }}
                />
                {/* Two references that turn a bare line into something readable: the best this
                    athlete has ever managed, and the middle of the group. A rising line means
                    nothing until you know whether it is rising towards the squad or away from
                    it. Solid hairlines, because a dashed rule reads as a projection. */}
                {personalBest !== null && (
                  <ReferenceLine
                    y={personalBest}
                    stroke="var(--viz-good)"
                    strokeWidth={1}
                    label={{
                      value: 'Personal best',
                      position: 'insideTopRight',
                      fill: 'var(--viz-good)',
                      fontSize: isMobile ? 9 : 11,
                    }}
                  />
                )}
                {median !== null && (
                  <ReferenceLine
                    y={median}
                    stroke="var(--viz-axis)"
                    strokeWidth={1}
                    label={{
                      value: 'Group median',
                      position: 'insideBottomRight',
                      fill: 'hsl(var(--muted-foreground))',
                      fontSize: isMobile ? 9 : 11,
                    }}
                  />
                )}
                <Line
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', r: isMobile ? 4 : 5, strokeWidth: 2 }}
                  activeDot={{ r: isMobile ? 6 : 8, strokeWidth: 0 }}
                  name={metricLabel(selectedMetric)}
                  isAnimationActive={false}
                />
              </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
