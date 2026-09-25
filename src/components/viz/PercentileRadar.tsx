import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { METRIC_KEYS, formatMetricValue, metricLabel, metricUnit, type MetricType } from "@/lib/metrics";
import type { GroupStanding } from "@/lib/analytics";

/**
 * One or two athletes' standing across all six metrics, on a percentile scale.
 *
 * The old radar scaled each axis by hand: 100 was the group's best and 0 was that best times
 * a per-metric constant - 1.4x for a time, a half for a jump, a fifth for a rep count. Three
 * consequences followed. The axes were not comparable, so 80 on the jump axis and 80 on the
 * sprint axis meant different things and the shape of the polygon was not information. One
 * outlier athlete moved everybody else's score, because the whole scale hung off the group's
 * best value. And the chart needed a five-bullet legend to explain itself, which is the usual
 * sign that a scale is not doing its job.
 *
 * A percentile needs one sentence, means the same thing on every axis, and is the same number
 * the standing panel and the squad matrix show - so the three cannot disagree. The trade is
 * real and worth naming: a percentile says where you rank, not how far ahead you are, so a
 * squad with one outstanding athlete and a tight pack behind them looks evenly spread here.
 * Absolute values are a hover away, and the per-metric cards carry them outright.
 */

export interface RadarSeries {
  key: string;
  label: string;
  /** Percentile per metric. A missing metric leaves that axis at the centre. */
  percentiles: Map<MetricType, number>;
  /** The underlying measurement, for the hover. */
  values?: Map<MetricType, number>;
  color: string;
}

export function PercentileRadar({
  series,
  standings,
  height = 380,
}: {
  series: RadarSeries[];
  /** Used only to spell the median out in the hover; the 50 ring is the median by definition. */
  standings?: Record<MetricType, GroupStanding>;
  height?: number;
}) {
  const data = METRIC_KEYS.map((metric) => {
    const point: Record<string, string | number | null> = {
      metric: metricLabel(metric),
      metricKey: metric,
      // The median is the 50th percentile by construction, so the reference ring is a
      // constant rather than something computed per axis.
      median: 50,
    };
    for (const entry of series) {
      point[entry.key] = entry.percentiles.get(metric) ?? 0;
      point[`${entry.key}__value`] = entry.values?.get(metric) ?? null;
    }
    point.__groupMedian = standings?.[metric]?.median ?? null;
    return point;
  });

  const hasAnything = series.some((s) => s.percentiles.size > 0);

  if (!hasAnything) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No measurements yet, so there is nothing to rank.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="var(--viz-grid)" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tickCount={5}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
        />

        {/* The reference ring, drawn first so the athletes sit on top of it. It is a
            threshold rather than a series: no fill, hairline stroke, named in the legend so
            nobody has to guess what the plain ring is. */}
        <Radar
          name="Squad median"
          dataKey="median"
          stroke="var(--viz-axis)"
          strokeWidth={1}
          fill="none"
          isAnimationActive={false}
        />

        {series.map((entry) => (
          <Radar
            key={entry.key}
            name={entry.label}
            dataKey={entry.key}
            stroke={entry.color}
            fill={entry.color}
            // Thin marks and a light fill: two solid polygons on top of each other hide
            // whichever is drawn second.
            fillOpacity={series.length > 1 ? 0.18 : 0.28}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}

        <Legend wrapperStyle={{ paddingTop: 16, fontSize: 12 }} iconType="line" />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          formatter={(value: number, name: string, item: { payload?: Record<string, unknown> }) => {
            if (name === "Squad median") {
              const metric = item.payload?.metricKey as MetricType | undefined;
              const median = item.payload?.__groupMedian as number | null | undefined;
              return [
                median !== null && median !== undefined && metric
                  ? `${formatMetricValue(metric, median)} ${metricUnit(metric)}`
                  : "—",
                "Squad median",
              ];
            }
            const entry = series.find((s) => s.label === name);
            const metric = item.payload?.metricKey as MetricType | undefined;
            const raw = entry ? (item.payload?.[`${entry.key}__value`] as number | null) : null;
            const rawText =
              raw !== null && raw !== undefined && metric
                ? ` · ${formatMetricValue(metric, raw)} ${metricUnit(metric)}`
                : " · not measured";
            return [`${Math.round(value)}th percentile${rawText}`, name];
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
