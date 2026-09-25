import { useMemo } from "react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, Medal } from "lucide-react";
import {
  METRIC_KEYS,
  formatMetricValue,
  metricLabel,
  metricUnit,
  type MetricType,
} from "@/lib/metrics";
import {
  agilityToSpeedRatio,
  gatherGain,
  rankDerived,
  summarise,
  type DerivedRanking,
} from "@/lib/analytics";
import { DeltaBadge } from "@/components/viz/DeltaBadge";
import { useTeamContext } from "./context";

/**
 * Who is best at what, per metric, plus the two derived readings that need a squad to mean
 * anything.
 *
 * The dashboard has always shown the team's best *value* per metric, with no name attached -
 * a number with nobody behind it. A coach wants the name, the order, and how far apart the
 * top of the list is, which is the same data arranged so it answers something.
 */

const PODIUM_COLORS = ["var(--viz-rank-5)", "var(--viz-rank-4)", "var(--viz-rank-3)"];

const TeamLeaderboards = () => {
  const { analytics, standings, memberIds, groupLabel } = useTeamContext();
  const { index, now, nameOf } = analytics;

  /**
   * Gather gain and the agility-to-speed ratio are not metrics - nothing stores them and they
   * have no entry in the metric table - so their direction is stated at the call site rather
   * than looked up. More gain from a run-up is better; less time lost to a change of
   * direction is better.
   */
  const derived = useMemo(() => {
    const gain = rankDerived(
      memberIds.map((playerId) => ({ playerId, value: gatherGain(index, playerId, now) })),
      true,
    );
    const ratio = rankDerived(
      memberIds.map((playerId) => ({
        playerId,
        value: agilityToSpeedRatio(index, playerId, now),
      })),
      false,
    );
    return { gain, ratio };
  }, [memberIds, index, now]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {METRIC_KEYS.map((metric) => (
          <MetricBoard
            key={metric}
            metric={metric}
            rows={standings[metric]?.rows ?? []}
            nameOf={nameOf}
            summaryFor={(playerId) => summarise(index, playerId, metric, now)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DerivedBoard
          title="Gather gain"
          description="How many centimetres the approach step adds to a standing jump. A technique reading: a big standing jump with little gain means the run-up is not being converted."
          formula="Jump w. Gather Step − Vertical Jump"
          rankings={derived.gain}
          nameOf={nameOf}
          format={(value) => `${value > 0 ? "+" : ""}${value.toFixed(0)} cm`}
        />
        <DerivedBoard
          title="Agility-to-speed ratio"
          description="How much of an athlete's straight-line speed survives a change of direction. Lower is better. This is a proxy, not the published change-of-direction deficit, which needs a 10-yard split this app does not measure - so it is only meaningful ranked against the rest of the squad."
          formula="5-10-5 Shuttle ÷ 30-Yard Dash"
          rankings={derived.ratio}
          nameOf={nameOf}
          format={(value) => value.toFixed(3)}
        />
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="how" className="border-border">
          <AccordionTrigger className="text-sm hover:no-underline">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
              <span>How these lists are built</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pt-2 text-sm text-muted-foreground">
            <p>
              Each list uses every player's <strong>most recent</strong> value, not their best
              ever. Current form is what a coach plans the next block around; a personal best
              from eighteen months ago is on the player's own page.
            </p>
            <p>
              Only one value per player per day counts - the best of that day - so a set of
              warm-up attempts cannot crowd out the rest of the squad.
            </p>
            <p>
              Players with no measurement for a metric are left off its list rather than placed
              last. Who is missing is the Coverage tab's job.
            </p>
            <p>
              Lists are scoped to <strong>{groupLabel.toLowerCase()}</strong>, set by the
              control above.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

function MetricBoard({
  metric,
  rows,
  nameOf,
  summaryFor,
}: {
  metric: MetricType;
  rows: Array<{ playerId: string; value: number; percentile: number; rank: number }>;
  nameOf: (id: string) => string;
  summaryFor: (playerId: string) => ReturnType<typeof summarise>;
}) {
  const top = rows.slice(0, 5);

  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {metricLabel(metric)}{" "}
          <span className="text-sm font-normal text-muted-foreground">[{metricUnit(metric)}]</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nobody in this group has been measured yet.</p>
        ) : (
          <ol className="space-y-2">
            {top.map((row, position) => {
              const summary = summaryFor(row.playerId);
              const leader = rows[0].value;
              return (
                <li key={row.playerId} className="flex items-center gap-3">
                  <span
                    className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums"
                    style={{ color: PODIUM_COLORS[position] ?? "hsl(var(--muted-foreground))" }}
                  >
                    {row.rank}
                  </span>
                  <Link
                    to={`/players/${row.playerId}`}
                    className="flex-1 truncate rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {nameOf(row.playerId)}
                  </Link>
                  <DeltaBadge
                    metric={metric}
                    improvement={summary.improvementVsPrevious}
                    percent={summary.improvementVsPreviousPercent}
                    showUnit={false}
                    className="shrink-0"
                  />
                  <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-primary">
                    {formatMetricValue(metric, row.value)}
                  </span>
                  {/* How far off the leader, which is what says whether the top of this list is
                      a close race or one athlete on their own. */}
                  <span className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    {position === 0
                      ? "leader"
                      : `+${formatMetricValue(metric, Math.abs(row.value - leader))}`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function DerivedBoard({
  title,
  description,
  formula,
  rankings,
  nameOf,
  format,
}: {
  title: string;
  description: string;
  formula: string;
  rankings: DerivedRanking[];
  nameOf: (id: string) => string;
  format: (value: number) => string;
}) {
  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Medal className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
          {/* Labelled as derived, with the arithmetic in plain sight: these are not stored
              measurements and nobody should mistake them for one. */}
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            Derived
          </span>
        </div>
        <CardDescription>
          <span className="block font-mono text-xs text-foreground/80">{formula}</span>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rankings.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Needs both underlying metrics measured for at least one player in this group.
          </p>
        ) : (
          <ol className="space-y-2">
            {rankings.slice(0, 5).map((row, position) => (
              <li key={row.playerId} className="flex items-center gap-3">
                <span
                  className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums"
                  style={{ color: PODIUM_COLORS[position] ?? "hsl(var(--muted-foreground))" }}
                >
                  {row.rank}
                </span>
                <Link
                  to={`/players/${row.playerId}`}
                  className="flex-1 truncate rounded-sm text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {nameOf(row.playerId)}
                </Link>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                  {format(row.value)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default TeamLeaderboards;
