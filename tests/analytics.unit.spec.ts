import { test, expect } from "@playwright/test";
import {
  MIN_GROUP_FOR_PERCENTILE,
  STALE_AFTER_DAYS,
  agilityToSpeedRatio,
  buildIndex,
  coverageByMetric,
  domainScores,
  gatherGain,
  groupMembers,
  groupStanding,
  improvement,
  median,
  nextTargetFor,
  percentilesFor,
  rankDerived,
  sessionReport,
  standingsFor,
  summarise,
  trend,
  type AnalyticsEntry,
} from "../src/lib/analytics";
import type { FootballPosition } from "../src/lib/positionUtils";

/**
 * These run in the `unit` Playwright project, which opens no browser. Everything under test
 * is pure, so each case is a table of rows in and a number out.
 *
 * `NOW` is fixed and passed explicitly to every call that cares about the date. The
 * functions all take a `now` for exactly this reason: a suite that read the real clock would
 * start failing whenever a fixture crossed the 90-day staleness line.
 */
const NOW = new Date("2026-09-25T12:00:00Z");

const row = (
  player: string,
  metric: string,
  value: number,
  date: string,
): AnalyticsEntry => ({ player_id: player, metric_type: metric, value, entry_date: date });

test.describe("buildIndex", () => {
  test("sorts a series oldest-first regardless of input order", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 60, "2026-06-01"),
      row("a", "vertical_jump", 55, "2026-01-01"),
      row("a", "vertical_jump", 58, "2026-03-01"),
    ]);
    expect(index.byPlayer.get("a")!.get("vertical_jump")!.map((x) => x.date)).toEqual([
      "2026-01-01",
      "2026-03-01",
      "2026-06-01",
    ]);
  });

  test("keeps the better attempt when a day has two, per direction", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 55, "2026-06-01"),
      row("a", "vertical_jump", 61, "2026-06-01"),
      row("a", "30yd_dash", 4.4, "2026-06-01"),
      row("a", "30yd_dash", 4.1, "2026-06-01"),
    ]);
    expect(index.byPlayer.get("a")!.get("vertical_jump")).toEqual([
      { date: "2026-06-01", value: 61 },
    ]);
    expect(index.byPlayer.get("a")!.get("30yd_dash")).toEqual([
      { date: "2026-06-01", value: 4.1 },
    ]);
  });

  test("drops unknown metrics and non-numeric values", () => {
    const index = buildIndex([
      row("a", "bench_press", 100, "2026-06-01"),
      row("a", "vertical_jump", Number.NaN, "2026-06-01"),
      row("a", "vertical_jump", 60, "2026-06-02"),
    ]);
    expect(index.playerIds).toEqual(["a"]);
    expect(index.byPlayer.get("a")!.size).toBe(1);
    expect(index.byPlayer.get("a")!.get("vertical_jump")).toHaveLength(1);
  });
});

test.describe("improvement direction", () => {
  test("a faster time and a higher jump are both positive", () => {
    expect(improvement("30yd_dash", 4.3, 4.1)).toBeCloseTo(0.2);
    expect(improvement("vertical_jump", 55, 60)).toBe(5);
  });

  test("a slower time and a lower jump are both negative", () => {
    expect(improvement("30yd_dash", 4.1, 4.3)).toBeCloseTo(-0.2);
    expect(improvement("vertical_jump", 60, 55)).toBe(-5);
  });
});

test.describe("summarise", () => {
  test("reports a missing metric without inventing numbers", () => {
    const summary = summarise(buildIndex([]), "a", "vertical_jump", NOW);
    expect(summary.status).toBe("missing");
    expect(summary.latest).toBeNull();
    expect(summary.improvementVsPrevious).toBeNull();
    expect(summary.isPersonalBest).toBe(false);
    expect(summary.isNewPersonalBest).toBe(false);
  });

  test("a first attempt is a personal best but not a new one", () => {
    const index = buildIndex([row("a", "vertical_jump", 58, "2026-09-20")]);
    const summary = summarise(index, "a", "vertical_jump", NOW);
    expect(summary.attempts).toBe(1);
    expect(summary.isPersonalBest).toBe(true);
    expect(summary.isNewPersonalBest).toBe(false);
    expect(summary.improvementVsPrevious).toBeNull();
    expect(summary.gapToPersonalBest).toBe(0);
  });

  test("tracks previous, best and the gap when the latest is not the best", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 55, "2026-01-10"),
      row("a", "vertical_jump", 64, "2026-05-10"),
      row("a", "vertical_jump", 60, "2026-09-10"),
    ]);
    const summary = summarise(index, "a", "vertical_jump", NOW);
    expect(summary.latest).toBe(60);
    expect(summary.previous).toBe(64);
    expect(summary.personalBest).toBe(64);
    expect(summary.personalBestDate).toBe("2026-05-10");
    expect(summary.improvementVsPrevious).toBe(-4);
    expect(summary.gapToPersonalBest).toBe(-4);
    expect(summary.isPersonalBest).toBe(false);
    expect(summary.isNewPersonalBest).toBe(false);
  });

  test("a record on a time metric is the lowest value", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 4.3, "2026-01-10"),
      row("a", "30yd_dash", 4.15, "2026-09-10"),
    ]);
    const summary = summarise(index, "a", "30yd_dash", NOW);
    expect(summary.personalBest).toBe(4.15);
    expect(summary.isNewPersonalBest).toBe(true);
    expect(summary.improvementVsPrevious).toBeCloseTo(0.15);
    expect(summary.improvementVsPreviousPercent).toBeCloseTo((0.15 / 4.3) * 100);
  });

  test("goes stale strictly after the threshold", () => {
    const justInside = new Date(NOW.getTime() - STALE_AFTER_DAYS * 86_400_000);
    const justOutside = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 1) * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    expect(
      summarise(buildIndex([row("a", "pushups_1min", 40, iso(justInside))]), "a", "pushups_1min", NOW)
        .status,
    ).toBe("current");
    expect(
      summarise(buildIndex([row("a", "pushups_1min", 40, iso(justOutside))]), "a", "pushups_1min", NOW)
        .status,
    ).toBe("stale");
  });
});

test.describe("median", () => {
  test("averages the middle pair for an even count", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

test.describe("groupStanding", () => {
  const entries = [
    row("a", "vertical_jump", 70, "2026-09-01"),
    row("b", "vertical_jump", 60, "2026-09-01"),
    row("c", "vertical_jump", 60, "2026-09-01"),
    row("d", "vertical_jump", 50, "2026-09-01"),
  ];

  test("ranks better-first and shares a rank on a tie", () => {
    const standing = groupStanding(buildIndex(entries), "vertical_jump", ["a", "b", "c", "d"], NOW);
    expect(standing.rows.map((r) => r.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(standing.rows.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(standing.best).toBe(70);
    expect(standing.median).toBe(60);
    expect(standing.n).toBe(4);
    expect(standing.reliable).toBe(true);
  });

  test("a tie does not inflate either player's percentile", () => {
    const standing = groupStanding(buildIndex(entries), "vertical_jump", ["a", "b", "c", "d"], NOW);
    const byId = new Map(standing.rows.map((r) => [r.playerId, r.percentile]));
    // Three others; the leader beats all three, the tied pair beat only d.
    expect(byId.get("a")).toBe(100);
    expect(byId.get("b")).toBe(33);
    expect(byId.get("c")).toBe(33);
    expect(byId.get("d")).toBe(0);
  });

  test("uses the most recent value, not the best one", () => {
    const standing = groupStanding(
      buildIndex([
        row("a", "vertical_jump", 80, "2026-01-01"),
        row("a", "vertical_jump", 55, "2026-09-01"),
        row("b", "vertical_jump", 60, "2026-09-01"),
      ]),
      "vertical_jump",
      ["a", "b"],
      NOW,
    );
    expect(standing.rows[0]).toMatchObject({ playerId: "b", value: 60 });
    expect(standing.best).toBe(60);
  });

  test("a lone player is 100 and the group is flagged unreliable", () => {
    const standing = groupStanding(
      buildIndex([row("a", "vertical_jump", 55, "2026-09-01")]),
      "vertical_jump",
      ["a"],
      NOW,
    );
    expect(standing.rows[0].percentile).toBe(100);
    expect(standing.reliable).toBe(false);
    expect(MIN_GROUP_FOR_PERCENTILE).toBeGreaterThan(1);
  });

  test("ranks a time metric fastest-first", () => {
    const standing = groupStanding(
      buildIndex([
        row("a", "30yd_dash", 4.5, "2026-09-01"),
        row("b", "30yd_dash", 4.1, "2026-09-01"),
      ]),
      "30yd_dash",
      ["a", "b"],
      NOW,
    );
    expect(standing.rows[0].playerId).toBe("b");
    expect(standing.best).toBe(4.1);
  });

  test("skips members with no value for the metric", () => {
    const standing = groupStanding(
      buildIndex([row("a", "vertical_jump", 55, "2026-09-01")]),
      "vertical_jump",
      ["a", "ghost"],
      NOW,
    );
    expect(standing.n).toBe(1);
  });
});

test.describe("nextTargetFor", () => {
  test("names the nearest player who is genuinely ahead, skipping ties", () => {
    const standing = groupStanding(
      buildIndex([
        row("a", "vertical_jump", 70, "2026-09-01"),
        row("b", "vertical_jump", 60, "2026-09-01"),
        row("c", "vertical_jump", 60, "2026-09-01"),
      ]),
      "vertical_jump",
      ["a", "b", "c"],
      NOW,
    );
    const target = nextTargetFor(standing, "c");
    expect(target).toMatchObject({ playerId: "a", value: 70, gap: 10 });
  });

  test("the leader has nobody to chase", () => {
    const standing = groupStanding(
      buildIndex([
        row("a", "vertical_jump", 70, "2026-09-01"),
        row("b", "vertical_jump", 60, "2026-09-01"),
      ]),
      "vertical_jump",
      ["a", "b"],
      NOW,
    );
    expect(nextTargetFor(standing, "a")).toBeNull();
    expect(nextTargetFor(standing, "absent")).toBeNull();
  });

  test("the gap on a time metric is positive seconds to find", () => {
    const standing = groupStanding(
      buildIndex([
        row("a", "30yd_dash", 4.1, "2026-09-01"),
        row("b", "30yd_dash", 4.35, "2026-09-01"),
      ]),
      "30yd_dash",
      ["a", "b"],
      NOW,
    );
    expect(nextTargetFor(standing, "b")!.gap).toBeCloseTo(0.25);
  });
});

test.describe("groupMembers", () => {
  const positions = new Map<string, FootballPosition>([
    ["qb", "QB"],
    ["wr", "WR"],
    ["db", "DB"],
    ["lb", "B"],
    ["none", "unassigned"],
  ]);
  const all = ["qb", "wr", "db", "lb", "none"];

  test("splits by unit and by position", () => {
    expect(groupMembers({ kind: "team" }, all, positions)).toEqual(all);
    expect(groupMembers({ kind: "offense" }, all, positions)).toEqual(["qb", "wr"]);
    expect(groupMembers({ kind: "defense" }, all, positions)).toEqual(["db", "lb"]);
    expect(groupMembers({ kind: "position", position: "WR" }, all, positions)).toEqual(["wr"]);
  });

  test("an unassigned player belongs to no unit, and a position group needs a position", () => {
    expect(groupMembers({ kind: "offense" }, ["none"], positions)).toEqual([]);
    expect(groupMembers({ kind: "position" }, all, positions)).toEqual([]);
  });
});

test.describe("trend", () => {
  const monthsAgo = (n: number) => {
    const d = new Date(NOW);
    d.setMonth(d.getMonth() - n);
    return d.toISOString().slice(0, 10);
  };

  test("fewer than three points in the window is not a trend", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 55, monthsAgo(4)),
      row("a", "vertical_jump", 60, monthsAgo(1)),
      row("a", "vertical_jump", 50, monthsAgo(20)),
    ]);
    const result = trend(index, "a", "vertical_jump", 6, NOW);
    expect(result.direction).toBe("insufficient");
    expect(result.points).toBe(2);
    expect(result.percentPer30Days).toBeNull();
  });

  test("a rising jump improves and a rising time declines", () => {
    const rising = (metric: string, values: number[]) =>
      buildIndex(values.map((v, i) => row("a", metric, v, monthsAgo(5 - i))));

    const jump = trend(rising("vertical_jump", [55, 58, 61, 64]), "a", "vertical_jump", 6, NOW);
    expect(jump.direction).toBe("improving");
    expect(jump.percentPer30Days).toBeGreaterThan(0);

    const dash = trend(rising("30yd_dash", [4.1, 4.2, 4.3, 4.4]), "a", "30yd_dash", 6, NOW);
    expect(dash.direction).toBe("declining");
    expect(dash.percentPer30Days).toBeLessThan(0);
  });

  test("a falling time improves", () => {
    const index = buildIndex(
      [4.4, 4.3, 4.2, 4.1].map((v, i) => row("a", "30yd_dash", v, monthsAgo(5 - i))),
    );
    expect(trend(index, "a", "30yd_dash", 6, NOW).direction).toBe("improving");
  });

  test("an unchanged series is flat, not improving", () => {
    const index = buildIndex(
      [60, 60, 60, 60].map((v, i) => row("a", "vertical_jump", v, monthsAgo(5 - i))),
    );
    const result = trend(index, "a", "vertical_jump", 6, NOW);
    expect(result.direction).toBe("flat");
    expect(result.percentPer30Days).toBeCloseTo(0);
  });
});

test.describe("coverageByMetric", () => {
  test("finds players with no rows at all, which the entries alone cannot show", () => {
    const index = buildIndex([row("tested", "vertical_jump", 60, "2026-09-01")]);
    const coverage = coverageByMetric(index, ["tested", "never-tested"], NOW);
    const jump = coverage.find((c) => c.metric === "vertical_jump")!;
    expect(jump.tested).toBe(1);
    expect(jump.missing).toEqual(["never-tested"]);
    expect(jump.stale).toEqual([]);

    // A metric nobody was measured on is missing for everyone.
    const dash = coverage.find((c) => c.metric === "30yd_dash")!;
    expect(dash.tested).toBe(0);
    expect(dash.missing).toEqual(["tested", "never-tested"]);
  });

  test("separates stale from missing", () => {
    const old = new Date(NOW.getTime() - 200 * 86_400_000).toISOString().slice(0, 10);
    const coverage = coverageByMetric(
      buildIndex([row("a", "vertical_jump", 60, old)]),
      ["a"],
      NOW,
    );
    const jump = coverage.find((c) => c.metric === "vertical_jump")!;
    expect(jump.tested).toBe(1);
    expect(jump.stale).toEqual(["a"]);
    expect(jump.missing).toEqual([]);
  });
});

test.describe("sessionReport", () => {
  const entries = [
    // Player a: tested before, improves and sets a record on the session day.
    row("a", "vertical_jump", 55, "2026-06-01"),
    row("a", "vertical_jump", 62, "2026-09-20"),
    // Player b: tested before, goes backwards on the day.
    row("b", "30yd_dash", 4.1, "2026-06-01"),
    row("b", "30yd_dash", 4.4, "2026-09-20"),
    // Player c: first ever measurement on the day.
    row("c", "pushups_1min", 40, "2026-09-20"),
    // Player d has rows, but not on the session day.
    row("d", "vertical_jump", 50, "2026-06-01"),
  ];
  const report = sessionReport(buildIndex(entries), "2026-09-20", ["a", "b", "c", "d", "e"]);

  test("counts what was measured and who turned up", () => {
    expect(report.entryCount).toBe(3);
    expect(report.playersTested.sort()).toEqual(["a", "b", "c"]);
    expect(report.metricsCovered).toEqual(["vertical_jump", "30yd_dash", "pushups_1min"]);
  });

  test("lists roster members with nothing recorded that day, including the never-tested", () => {
    expect(report.absentees).toEqual(["d", "e"]);
  });

  test("a first-ever measurement counts as a record with no previous best", () => {
    const first = report.personalBests.find((r) => r.playerId === "c")!;
    expect(first).toMatchObject({ metric: "pushups_1min", value: 40, previousBest: null });
  });

  test("records only count when they beat what came before", () => {
    expect(report.personalBests.map((r) => r.playerId).sort()).toEqual(["a", "c"]);
  });

  test("movers run best improvement first, worst regression last", () => {
    expect(report.movers[0].playerId).toBe("a");
    expect(report.movers[0].improvement).toBe(7);
    expect(report.movers[report.movers.length - 1].playerId).toBe("b");
    expect(report.movers[report.movers.length - 1].improvement).toBeCloseTo(-0.3);
    // A first-ever attempt has nothing to move against.
    expect(report.movers.some((m) => m.playerId === "c")).toBe(false);
  });

  test("reads an old session as it stood on the day", () => {
    const june = sessionReport(buildIndex(entries), "2026-06-01", ["a", "b", "c", "d"]);
    expect(june.playersTested.sort()).toEqual(["a", "b", "d"]);
    expect(june.absentees).toEqual(["c"]);
    // On that day every one of them was setting a first record.
    expect(june.personalBests).toHaveLength(3);
    expect(june.movers).toHaveLength(0);
  });
});

test.describe("composites", () => {
  test("a domain averages its metrics so agility does not count double", () => {
    const scores = domainScores(
      new Map([
        ["30yd_dash", 90],
        ["3_cone_drill", 50],
        ["shuttle_5_10_5", 70],
        ["vertical_jump", 40],
        ["jump_gather", 60],
        ["pushups_1min", 20],
      ] as Array<[import("../src/lib/metrics").MetricType, number]>),
    );
    expect(scores.byDomain.speed).toBe(90);
    expect(scores.byDomain.agility).toBe(60);
    expect(scores.byDomain.power).toBe(50);
    expect(scores.byDomain.endurance).toBe(20);
    // Mean of the four domains, not of the six metrics.
    expect(scores.overall).toBe(55);
    expect(scores.metricsUsed).toBe(6);
  });

  test("an unmeasured domain scores null and is left out of the overall", () => {
    const scores = domainScores(
      new Map([["30yd_dash", 80]] as Array<[import("../src/lib/metrics").MetricType, number]>),
    );
    expect(scores.byDomain.speed).toBe(80);
    expect(scores.byDomain.power).toBeNull();
    expect(scores.overall).toBe(80);
    expect(scores.metricsUsed).toBe(1);
  });

  test("percentilesFor pulls one player out of the standings", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 70, "2026-09-01"),
      row("b", "vertical_jump", 50, "2026-09-01"),
    ]);
    const percentiles = percentilesFor(standingsFor(index, ["a", "b"], NOW), "a");
    expect(percentiles.get("vertical_jump")).toBe(100);
    expect(percentiles.has("30yd_dash")).toBe(false);
  });

  test("gather gain is what the run-up adds", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 58, "2026-09-01"),
      row("a", "jump_gather", 71, "2026-09-01"),
      row("b", "vertical_jump", 58, "2026-09-01"),
    ]);
    expect(gatherGain(index, "a", NOW)).toBe(13);
    expect(gatherGain(index, "b", NOW)).toBeNull();
  });

  test("the agility-to-speed ratio needs both measurements", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 4.0, "2026-09-01"),
      row("a", "shuttle_5_10_5", 4.6, "2026-09-01"),
      row("b", "30yd_dash", 4.0, "2026-09-01"),
    ]);
    expect(agilityToSpeedRatio(index, "a", NOW)).toBeCloseTo(1.15);
    expect(agilityToSpeedRatio(index, "b", NOW)).toBeNull();
  });

  test("rankDerived honours the stated direction and drops missing values", () => {
    const values = [
      { playerId: "a", value: 1.1 },
      { playerId: "b", value: 1.3 },
      { playerId: "c", value: null },
    ];
    const lower = rankDerived(values, false);
    expect(lower.map((r) => r.playerId)).toEqual(["a", "b"]);
    expect(lower[0]).toMatchObject({ rank: 1, percentile: 100 });

    const higher = rankDerived(values, true);
    expect(higher.map((r) => r.playerId)).toEqual(["b", "a"]);
  });
});
