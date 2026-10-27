import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import type { MetricStatus } from "@/lib/analytics";
import { statusPresentation } from "@/lib/vizScale";
import { cn } from "@/lib/utils";

/**
 * Whether a measurement is from this club year, an earlier one, or was never taken.
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
