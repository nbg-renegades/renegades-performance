import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { MetricStatus, Trend } from "@/lib/analytics";
import { statusPresentation } from "@/lib/vizScale";
import { cn } from "@/lib/utils";

/**
 * Which way an athlete has been moving over the recent window.
 *
 * This is the question a single latest value cannot answer and the one a coach asks first: a
 * 4.2s dash means one thing on the way down and another on the way up. The direction comes
 * from a fitted slope rather than from first-versus-last, so one bad day at either end of the
 * window does not flip the verdict.
 *
 * "Not enough data" is shown rather than hidden. A blank would read as "flat", and telling a
 * coach that three measurements are needed is itself actionable.
 */
export function TrendIndicator({
  trend,
  className,
  showPercent = true,
}: {
  trend: Trend;
  className?: string;
  showPercent?: boolean;
}) {
  if (trend.direction === "insufficient") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
        title={`Needs at least 3 tests in the window to show a trend (has ${trend.points})`}
      >
        <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Not enough data for a trend</span>
      </span>
    );
  }

  const percent = trend.percentPer30Days ?? 0;
  const Icon =
    trend.direction === "improving"
      ? TrendingUp
      : trend.direction === "declining"
        ? TrendingDown
        : Minus;
  const color =
    trend.direction === "improving"
      ? "var(--viz-good)"
      : trend.direction === "declining"
        ? "var(--viz-serious)"
        : undefined;
  const word =
    trend.direction === "improving"
      ? "improving"
      : trend.direction === "declining"
        ? "declining"
        : "holding steady";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        !color && "text-muted-foreground",
        className,
      )}
      style={color ? { color } : undefined}
      title={`${word} by ${Math.abs(percent).toFixed(1)}% per month, fitted over ${trend.points} tests`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {showPercent && trend.direction !== "flat" ? (
        <span>{Math.abs(percent).toFixed(1)}%</span>
      ) : (
        <span className="sr-only">{word}</span>
      )}
    </span>
  );
}

/**
 * Whether a measurement can still be trusted as current.
 *
 * Icon and word first, colour second: the three states have to be distinguishable without it.
 */
export function StatusChip({
  status,
  daysSinceLast,
  className,
  compact = false,
}: {
  status: MetricStatus;
  daysSinceLast?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const { label, color } = statusPresentation(status);
  const Icon = status === "current" ? CircleCheck : status === "stale" ? Clock : CircleAlert;
  const detail =
    status === "missing"
      ? "Never measured"
      : daysSinceLast === null || daysSinceLast === undefined
        ? label
        : `Last measured ${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago`;

  if (compact) {
    return (
      <span className={cn("inline-flex", className)} title={detail}>
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
        <span className="sr-only">{detail}</span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)} title={detail}>
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
      <span className="text-muted-foreground">{detail}</span>
    </span>
  );
}
