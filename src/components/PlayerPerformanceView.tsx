import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PerformanceTimeSelector } from "./PerformanceTimeSelector";
import { PerformanceLineChart } from "./PerformanceLineChart";
import { getAllMetricTypes, METRIC_LABELS, type MetricType } from "@/lib/performanceUtils";
import { TrendingUp } from "lucide-react";

interface PlayerPerformanceViewProps {
  playerId: string;
}

export function PlayerPerformanceView({ playerId }: PlayerPerformanceViewProps) {
  const allMetrics = getAllMetricTypes();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>(allMetrics[0]);
  const [timeRangeMonths, setTimeRangeMonths] = useState(3); // Default to 3 months

  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Your Performance Progress
        </CardTitle>
        <CardDescription>Track your athletic development over time</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1 space-y-2 w-full sm:w-auto">
            <Label htmlFor="metric-selector">Metric</Label>
            <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
              <SelectTrigger id="metric-selector" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {allMetrics.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {METRIC_LABELS[metric]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-full sm:w-auto">
            <Label>Time Range</Label>
            <PerformanceTimeSelector 
              selectedMonths={timeRangeMonths} 
              onSelect={setTimeRangeMonths} 
            />
          </div>
        </div>
        <PerformanceLineChart 
          playerId={playerId} 
          metricType={selectedMetric} 
          timeRangeMonths={timeRangeMonths} 
        />
      </CardContent>
    </Card>
  );
}
