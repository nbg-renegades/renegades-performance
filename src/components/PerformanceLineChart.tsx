import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { METRIC_LABELS, METRIC_UNITS, type MetricType } from "@/lib/performanceUtils";

interface PerformanceLineChartProps {
  playerId: string;
  metricType: MetricType;
  timeRangeMonths: number;
}

interface ChartDataPoint {
  date: string;
  value: number;
  formattedDate: string;
}

export function PerformanceLineChart({ playerId, metricType, timeRangeMonths }: PerformanceLineChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [playerId, metricType, timeRangeMonths]);

  async function fetchChartData() {
    setIsLoading(true);
    try {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - timeRangeMonths);

      const { data: entries } = await supabase
        .from('performance_entries')
        .select('entry_date, value')
        .eq('player_id', playerId)
        .eq('metric_type', metricType)
        .gte('entry_date', startDate.toISOString().split('T')[0])
        .order('entry_date', { ascending: true });

      if (entries) {
        const chartData: ChartDataPoint[] = entries.map(entry => ({
          date: entry.entry_date,
          value: entry.value,
          formattedDate: new Date(entry.entry_date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: timeRangeMonths > 12 ? 'numeric' : undefined
          }),
        }));
        setData(chartData);
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{METRIC_LABELS[metricType]}</CardTitle>
          <CardDescription>Performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            No data available for this time period
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{METRIC_LABELS[metricType]}</CardTitle>
        <CardDescription>Performance trend over the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="formattedDate" 
              className="text-xs"
              angle={data.length > 10 ? -45 : 0}
              textAnchor={data.length > 10 ? "end" : "middle"}
              height={data.length > 10 ? 80 : 30}
            />
            <YAxis 
              label={{ value: METRIC_UNITS[metricType], angle: -90, position: 'insideLeft' }}
              className="text-xs"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
              labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 6 }}
              name={`Value (${METRIC_UNITS[metricType]})`}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
