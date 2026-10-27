import { meaningfulChange, type MetricType } from "@/lib/metrics";
import { seasonLabel, type MetricChange } from "@/lib/seasons";
import { DeltaBadge } from "@/components/viz/DeltaBadge";
import { cn } from "@/lib/utils";

/**
 * How one drill moved by the testing calendar: across the player's latest preseason, and
 * against the year before.
 *
 * Both are judged against the drill's noise floor, so a sprint 0.03 s quicker reads "≈ same"
 * rather than as progress - the same rule the coach's "most improved" lists use. Renders
 * nothing when neither comparison exists yet, which for a first test is the honest answer.
 */
export function SeasonDeltas({
  metric,
  season,
  seasonGain,
  yearOverYear,
  className,
}: {
  metric: MetricType;
  season: number;
  seasonGain: MetricChange | null;
  yearOverYear: MetricChange | null;
  className?: string;
}) {
  if (!seasonGain && !yearOverYear) return null;
  const threshold = meaningfulChange(metric);

  return (
    <dl className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs", className)}>
      {seasonGain && (
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">Preseason {seasonLabel(season)}</dt>
          <dd>
            <DeltaBadge
              metric={metric}
              improvement={seasonGain.improvement}
              percent={seasonGain.percent}
              threshold={threshold}
              against={`the first test of ${seasonLabel(season)}`}
            />
          </dd>
        </div>
      )}
      {yearOverYear && (
        <div className="flex items-center gap-1.5">
          <dt className="text-muted-foreground">vs {seasonLabel(season - 1)}</dt>
          <dd>
            <DeltaBadge
              metric={metric}
              improvement={yearOverYear.improvement}
              percent={yearOverYear.percent}
              threshold={threshold}
              against={`the ${seasonLabel(season - 1)} best`}
            />
          </dd>
        </div>
      )}
    </dl>
  );
}
