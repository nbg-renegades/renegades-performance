import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Award, HelpCircle } from "lucide-react";

interface MetricNeighborhood {
  metric_type: string;
  metric_name: string;
  unit: string;
  current_value: number | null;
  next_best_player: string | null;
  next_best_value: number | null;
  percentile: number | null;
}

interface PerformanceNeighborhoodProps {
  playerId: string;
}

export function PerformanceNeighborhood({ playerId }: PerformanceNeighborhoodProps) {
  const [data, setData] = useState<MetricNeighborhood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNeighborhoodData();
  }, [playerId]);

  async function fetchNeighborhoodData() {
    if (!playerId) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data: result, error: fetchError } = await supabase.functions.invoke(
        'get-player-neighborhood',
        {
          body: { player_id: playerId }
        }
      );

      if (fetchError) {
        throw fetchError;
      }

      setData(result || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function getPercentileColor(percentile: number): string {
    if (percentile >= 80) return 'text-green-600 dark:text-green-400';
    if (percentile >= 60) return 'text-blue-600 dark:text-blue-400';
    if (percentile >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  }

  function getPercentileBadge(percentile: number): string {
    if (percentile >= 80) return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100';
    if (percentile >= 60) return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100';
    if (percentile >= 40) return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100';
    return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-100';
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Neighborhood</CardTitle>
          <CardDescription>Loading performance comparison...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Neighborhood</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const metricsWithData = data.filter(m => m.current_value !== null);

  if (metricsWithData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Neighborhood</CardTitle>
          <CardDescription>No performance data available yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Neighborhood</CardTitle>
        <CardDescription>Your ranking and next target per metric</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {metricsWithData.map((metric) => (
            <div
              key={metric.metric_type}
              className="border border-border rounded-lg p-4 space-y-3 bg-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-sm">{metric.metric_name}</h4>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {metric.current_value?.toFixed(2)} <span className="text-sm text-muted-foreground">[{metric.unit}]</span>
                  </p>
                </div>
                {metric.percentile !== null && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className={getPercentileBadge(metric.percentile)}>
                          <Award className="h-3 w-3 mr-1" />
                          {metric.percentile}%
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your ranking: better than {metric.percentile}% of the team for this metric</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {metric.next_best_value !== null && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">Next Best</p>
                    <p className="text-sm font-medium">
                      <span className="text-primary">{metric.next_best_value.toFixed(2)}</span> <span className="text-xs text-muted-foreground">[{metric.unit}]</span>
                    </p>
                  </div>
                </div>
              )}

              {!metric.next_best_player && metric.percentile === 100 && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Award className="h-4 w-4 text-yellow-500" />
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Team Leader!
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <Accordion type="single" collapsible className="mt-6">
          <AccordionItem value="percentile-explanation" className="border-border">
            <AccordionTrigger className="text-sm hover:no-underline">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span>How do percentiles work?</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-3 pt-2">
              <p>
                The percentile shows what percentage of the team you performed <strong>better than</strong> for each metric.
              </p>
              
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="font-medium text-foreground">Example: 30-Yard Dash</p>
                <p>If your team has 10 players and your time is 4.2s (5th fastest):</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>You ran faster than 5 other players</li>
                  <li>Your percentile: <strong>50%</strong></li>
                  <li>You're exactly in the middle of the pack</li>
                </ul>
              </div>

              <div className="space-y-1">
                <p className="font-medium text-foreground">What percentiles mean:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>85%</strong> = Top 15% (elite performance)</li>
                  <li><strong>50%</strong> = Average, better than half the team</li>
                  <li><strong>20%</strong> = Bottom 20% (room for improvement)</li>
                </ul>
              </div>

              <p className="text-xs italic">
                Higher percentile always means better performance, regardless of whether the metric measures time or distance.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}