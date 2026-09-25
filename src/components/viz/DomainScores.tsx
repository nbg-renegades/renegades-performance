import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOMAINS, DOMAIN_KEYS, type DomainScores as Scores } from "@/lib/analytics";
import { metricLabel } from "@/lib/metrics";
import { rankLabel, rankStep } from "@/lib/vizScale";
import { cn } from "@/lib/utils";

/**
 * Four qualities and one headline, from the six measurements.
 *
 * Six numbers is more than anyone holds in their head, and two of them measure the same
 * quality - the 3-cone drill and the 5-10-5 shuttle are both agility. Averaging inside a
 * quality first stops the agility pair from counting double against the single sprint, which a
 * plain mean over all six would do silently.
 *
 * Every tile says what it is made of, because a composite that does not show its arithmetic is
 * a number nobody can argue with, and a coach should be able to argue with it.
 */
export function DomainScoresRow({
  scores,
  className,
}: {
  scores: Scores;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      <ScoreTile
        label="Overall"
        score={scores.overall}
        explanation={`The mean of the four quality scores below, not of the six metrics. Built from ${scores.metricsUsed} of 6 measurements.`}
        emphasis
      />
      {DOMAIN_KEYS.map((key) => (
        <ScoreTile
          key={key}
          label={DOMAINS[key].label}
          score={scores.byDomain[key]}
          explanation={`Mean percentile across ${DOMAINS[key].metrics
            .map((m) => metricLabel(m))
            .join(" and ")}.`}
        />
      ))}
    </div>
  );
}

function ScoreTile({
  label,
  score,
  explanation,
  emphasis = false,
}: {
  label: string;
  score: number | null;
  explanation: string;
  emphasis?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "rounded-lg border border-border/50 p-3 text-left",
            emphasis ? "bg-secondary" : "bg-muted/50",
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {/* Labelled derived wherever it appears: nothing stores these. */}
            <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground/70">
              derived
            </span>
          </div>
          {score === null ? (
            <p className="mt-1 text-sm text-muted-foreground">Not measured</p>
          ) : (
            <>
              {/* Proportional figures on a standalone number; tabular-nums is for columns. */}
              <p
                className={cn("mt-1 font-bold", emphasis ? "text-3xl" : "text-2xl")}
                style={{ color: emphasis ? "hsl(var(--primary))" : undefined }}
              >
                {score}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: "color-mix(in srgb, var(--viz-axis) 70%, transparent)" }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${score}%`, backgroundColor: rankStep(score), minWidth: 3 }}
                  />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{rankLabel(score)}</p>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{explanation}</p>
        <p className="mt-1 text-muted-foreground">
          0 to 100, where 50 is the middle of the comparison group.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
