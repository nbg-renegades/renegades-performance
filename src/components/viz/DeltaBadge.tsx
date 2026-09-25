import { ArrowDownRight, ArrowUpRight, Award, Minus } from "lucide-react";
import { formatMetricValue, metricUnit, type MetricType } from "@/lib/metrics";
import { deltaColor } from "@/lib/vizScale";
import { cn } from "@/lib/utils";

/**
 * How much better or worse than last time, in the metric's own unit.
 *
 * The number arrives already sign-normalised by src/lib/analytics, so a positive value is an
 * improvement whether the metric is a stopwatch or a rep count, and this component never
 * consults the metric's direction. That is the whole reason the analytics layer normalises:
 * otherwise every place that renders a change has to remember that 0.2 seconds *less* is
 * better and 2 centimetres *less* is worse.
 *
 * The arrow points the way the athlete moved, not the way the number moved: a 30-yard dash
 * that drops by 0.2s gets an up arrow, because the athlete got faster. A bare "-0.20" with a
 * down arrow would read as a loss, which is exactly backwards.
 *
 * Colour never carries this alone - the arrow and the sign both say it too, which is what
 * keeps it readable for someone who cannot separate the green from the orange.
 */
export function DeltaBadge({
  metric,
  improvement,
  percent,
  showUnit = true,
  className,
}: {
  metric: MetricType | string;
  /** Positive = the athlete improved. `null` when there is nothing to compare against. */
  improvement: number | null;
  percent?: number | null;
  showUnit?: boolean;
  className?: string;
}) {
  if (improvement === null || !Number.isFinite(improvement)) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)} title="No earlier test to compare against">
        &mdash;
      </span>
    );
  }

  const rounded = Math.abs(improvement) < 0.005 ? 0 : improvement;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  const magnitude = formatMetricValue(metric, Math.abs(rounded));
  const unit = showUnit ? metricUnit(metric) : "";
  const word = rounded > 0 ? "better" : rounded < 0 ? "worse" : "unchanged";

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", className)}
      style={{ color: deltaColor(rounded) }}
      title={
        rounded === 0
          ? "Unchanged since the previous test"
          : `${magnitude}${unit ? ` ${unit}` : ""} ${word} than the previous test${
              percent !== null && percent !== undefined && Number.isFinite(percent)
                ? ` (${Math.abs(percent).toFixed(1)}%)`
                : ""
            }`
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {rounded === 0 ? (
        <span>no change</span>
      ) : (
        <span>
          {rounded > 0 ? "+" : "−"}
          {magnitude}
          {unit ? <span className="ml-0.5 font-normal">{unit}</span> : null}
        </span>
      )}
    </span>
  );
}

/**
 * A record set at the latest attempt. Separate from the delta because the two answer
 * different questions - "better than last time" and "better than ever" - and an athlete can
 * improve without setting a record, or set one on their first ever attempt.
 */
export function PersonalBestBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide",
        className,
      )}
      style={{ color: "var(--viz-good)", backgroundColor: "color-mix(in srgb, var(--viz-good) 15%, transparent)" }}
      title="Personal best: the athlete's best recorded value for this metric"
    >
      <Award className="h-3 w-3 shrink-0" aria-hidden="true" />
      PB
    </span>
  );
}
