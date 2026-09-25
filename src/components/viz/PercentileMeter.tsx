import { rankLabel, rankStep } from "@/lib/vizScale";
import { cn } from "@/lib/utils";

/**
 * Where one athlete sits inside a group, as a meter rather than a coloured cell.
 *
 * The length carries the value and the colour only reinforces it. That ordering matters: the
 * bottom step of the ramp is dim against this app's near-black surface by design, and if
 * colour were the primary encoding a weak result would be unreadable rather than merely
 * quiet. It also keeps the number itself in an ordinary text colour, so nothing legible sits
 * on a fill that has to be bright enough to read text against.
 *
 * `title` spells the percentile out in words as well, because a coach reading this on a phone
 * in the sun is not comparing five shades of blue.
 */
export function PercentileMeter({
  percentile,
  /** False when the group is too small for the number to mean much; the meter greys out. */
  reliable = true,
  className,
  showValue = false,
}: {
  percentile: number | null;
  reliable?: boolean;
  className?: string;
  showValue?: boolean;
}) {
  if (percentile === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>&mdash;</span>;
  }

  const clamped = Math.max(0, Math.min(100, percentile));
  const description = reliable
    ? `${clamped}th percentile — ${rankLabel(clamped)}`
    : `${clamped}th percentile, but the group is too small for this to mean much`;

  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={description}>
      <span
        className="relative h-1.5 w-full min-w-10 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--viz-axis) 70%, transparent)" }}
        role="img"
        aria-label={description}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: reliable ? rankStep(clamped) : "var(--viz-neutral)",
            // A zero-percentile athlete still gets a visible sliver, so "measured and last"
            // never looks the same as "not measured".
            minWidth: 3,
          }}
        />
      </span>
      {showValue && (
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {clamped}
        </span>
      )}
    </span>
  );
}

/**
 * The legend for the ramp. Present because a continuous colour scale that is never explained
 * is a colour-only encoding, and because "80" means nothing until someone says what it is a
 * percentage of.
 */
export function PercentileLegend({ className }: { className?: string }) {
  const bands = [
    { label: "Bottom", at: 10 },
    { label: "Lower", at: 30 },
    { label: "Mid", at: 50 },
    { label: "Upper", at: 70 },
    { label: "Top", at: 90 },
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground", className)}>
      <span>Share of the group this player is ahead of:</span>
      <span className="flex items-center gap-3">
        {bands.map((band) => (
          <span key={band.label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-4 rounded-sm"
              style={{ backgroundColor: rankStep(band.at) }}
              aria-hidden="true"
            />
            {band.label}
          </span>
        ))}
      </span>
    </div>
  );
}
