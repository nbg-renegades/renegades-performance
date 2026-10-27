import { test, expect } from "@playwright/test";
import { buildIndex, type AnalyticsEntry } from "../src/lib/analytics";
import {
  changesFor,
  focusSeason,
  isRookie,
  latestSeasonFor,
  rankAthletes,
  seasonDrop,
  seasonGain,
  seasonLabel,
  seasonOf,
  seasonRecords,
  squadProgress,
  verdict,
  yearOverYear,
} from "../src/lib/seasons";

/** Same conventions as analytics.unit.spec.ts: pure functions, fixed clock, rows in. */
const row = (
  player: string,
  metric: string,
  value: number,
  date: string,
): AnalyticsEntry => ({ player_id: player, metric_type: metric, value, entry_date: date });

test.describe("seasonOf / seasonLabel", () => {
  test("the club year turns over on 1 October", () => {
    expect(seasonOf("2026-09-30")).toBe(2025);
    expect(seasonOf("2026-10-01")).toBe(2026);
    expect(seasonOf("2026-11-15")).toBe(2026);
    expect(seasonOf("2027-01-20")).toBe(2026);
    expect(seasonOf("2027-06-01")).toBe(2026);
  });

  test("labels a year by both calendar years it spans", () => {
    expect(seasonLabel(2026)).toBe("2026/27");
    expect(seasonLabel(2099)).toBe("2099/00");
    expect(seasonLabel(2008)).toBe("2008/09");
  });
});

test.describe("focusSeason", () => {
  const index = buildIndex([
    row("a", "vertical_jump", 60, "2025-11-10"),
    row("a", "vertical_jump", 62, "2026-01-12"),
  ]);

  test("recaps last year until the current one has a test", () => {
    expect(focusSeason(index, new Date("2026-10-27T12:00:00Z"))).toEqual({
      season: 2025,
      isCurrent: false,
    });
  });

  test("switches to the current year with its first session", () => {
    const withNovember = buildIndex([
      row("a", "vertical_jump", 60, "2025-11-10"),
      row("a", "vertical_jump", 63, "2026-11-09"),
    ]);
    expect(focusSeason(withNovember, new Date("2026-11-10T12:00:00Z"))).toEqual({
      season: 2026,
      isCurrent: true,
    });
  });

  test("is null with no tests at all", () => {
    expect(focusSeason(buildIndex([]), new Date("2026-10-27T12:00:00Z"))).toBeNull();
  });
});

test.describe("latestSeasonFor", () => {
  const index = buildIndex([
    row("a", "vertical_jump", 60, "2024-11-10"),
    row("a", "30yd_dash", 4.5, "2026-01-12"),
    row("b", "vertical_jump", 60, "2026-11-09"),
  ]);
  const october = new Date("2026-10-27T12:00:00Z");

  test("is the player's own last tested year, even when the squad has moved on", () => {
    expect(latestSeasonFor(index, "a", october)).toBe(2025);
  });

  test("ignores years after the current one", () => {
    expect(latestSeasonFor(index, "b", new Date("2026-09-30T12:00:00Z"))).toBeNull();
    expect(latestSeasonFor(index, "b", october)).toBe(2026);
  });
});

test.describe("verdict", () => {
  test("a change inside the noise floor is the same", () => {
    expect(verdict("30yd_dash", 0.04)).toBe("same");
    expect(verdict("30yd_dash", -0.04)).toBe("same");
    expect(verdict("vertical_jump", 1)).toBe("same");
  });

  test("a change on the floor counts, despite floating point", () => {
    expect(verdict("30yd_dash", 4.55 - 4.5)).toBe("better");
    expect(verdict("30yd_dash", 4.5 - 4.55)).toBe("worse");
    expect(verdict("pushups_1min", 2)).toBe("better");
  });
});

test.describe("yearOverYear", () => {
  test("compares this year's best with last year's best, not single days", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 4.6, "2025-11-10"),
      row("a", "30yd_dash", 4.5, "2025-12-08"),
      row("a", "30yd_dash", 4.7, "2026-01-12"),
      row("a", "30yd_dash", 4.45, "2026-11-09"),
      row("a", "30yd_dash", 4.55, "2026-12-07"),
    ]);
    const result = yearOverYear(index, "a", "30yd_dash", 2026)!;
    expect(result.from.value).toBe(4.5);
    expect(result.to.value).toBe(4.45);
    expect(result.improvement).toBeCloseTo(0.05);
    expect(result.verdict).toBe("better");
  });

  test("needs a test in both years", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 60, "2024-11-10"),
      row("a", "vertical_jump", 66, "2026-11-09"),
    ]);
    // A gap year is not "last year".
    expect(yearOverYear(index, "a", "vertical_jump", 2026)).toBeNull();
  });
});

test.describe("seasonGain", () => {
  test("measures the best later test against the season's first", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 70, "2025-12-01"),
      row("a", "vertical_jump", 58, "2026-11-09"),
      row("a", "vertical_jump", 63, "2026-12-07"),
      row("a", "vertical_jump", 61, "2027-01-11"),
    ]);
    const result = seasonGain(index, "a", "vertical_jump", 2026)!;
    expect(result.from).toEqual({ date: "2026-11-09", value: 58 });
    expect(result.to).toEqual({ date: "2026-12-07", value: 63 });
    expect(result.improvement).toBe(5);
  });

  test("goes negative when every later test was worse than the baseline", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 4.4, "2026-11-09"),
      row("a", "30yd_dash", 4.6, "2026-12-07"),
    ]);
    expect(seasonGain(index, "a", "30yd_dash", 2026)!.verdict).toBe("worse");
  });

  test("needs two tests in the season", () => {
    const index = buildIndex([row("a", "30yd_dash", 4.4, "2026-11-09")]);
    expect(seasonGain(index, "a", "30yd_dash", 2026)).toBeNull();
  });
});

test.describe("seasonDrop", () => {
  test("reports the latest test going backwards past the floor", () => {
    const index = buildIndex([
      row("a", "pushups_1min", 40, "2026-11-09"),
      row("a", "pushups_1min", 35, "2026-12-07"),
    ]);
    expect(seasonDrop(index, "a", "pushups_1min", 2026)!.improvement).toBe(-5);
  });

  test("ignores a dip inside the noise and a drop across the off-season", () => {
    const index = buildIndex([
      row("a", "pushups_1min", 40, "2026-01-12"),
      row("a", "pushups_1min", 30, "2026-11-09"),
      row("a", "pushups_1min", 29, "2026-12-07"),
    ]);
    expect(seasonDrop(index, "a", "pushups_1min", 2026)).toBeNull();
  });
});

test.describe("isRookie", () => {
  const index = buildIndex([
    row("vet", "vertical_jump", 60, "2025-11-10"),
    row("vet", "30yd_dash", 4.5, "2026-11-09"),
    row("new", "30yd_dash", 4.8, "2026-11-09"),
    row("gone", "vertical_jump", 60, "2025-11-10"),
  ]);

  test("a player's first tested year is their rookie year", () => {
    expect(isRookie(index, "new", 2026)).toBe(true);
    expect(isRookie(index, "vet", 2025)).toBe(true);
  });

  test("any earlier test on any drill makes a returning player", () => {
    expect(isRookie(index, "vet", 2026)).toBe(false);
  });

  test("only players tested this year are rookies of it", () => {
    expect(isRookie(index, "gone", 2026)).toBe(false);
    expect(isRookie(index, "nobody", 2026)).toBe(false);
  });
});

test.describe("rankAthletes", () => {
  test("averages within a domain first, so agility does not count double", () => {
    const index = buildIndex([
      // Sprinter: 30yd improves 5%.
      row("s", "30yd_dash", 5.0, "2025-11-10"),
      row("s", "30yd_dash", 4.75, "2026-11-09"),
      row("s", "vertical_jump", 50, "2025-11-10"),
      row("s", "vertical_jump", 50, "2026-11-09"),
      // Agile: both agility drills improve 3%.
      row("g", "3_cone_drill", 8.0, "2025-11-10"),
      row("g", "3_cone_drill", 7.76, "2026-11-09"),
      row("g", "shuttle_5_10_5", 5.0, "2025-11-10"),
      row("g", "shuttle_5_10_5", 4.85, "2026-11-09"),
      row("g", "vertical_jump", 50, "2025-11-10"),
      row("g", "vertical_jump", 50, "2026-11-09"),
    ]);
    const ranked = rankAthletes(changesFor(yearOverYear, index, ["s", "g"], 2026));
    expect(ranked.map((r) => r.playerId)).toEqual(["s", "g"]);
    expect(ranked[0].overall).toBeCloseTo(2.5);
    expect(ranked[1].overall).toBeCloseTo(1.5);
  });

  test("counts a change inside the noise floor as zero", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 4.54, "2025-11-10"),
      row("a", "30yd_dash", 4.5, "2026-11-09"),
      row("a", "pushups_1min", 30, "2025-11-10"),
      row("a", "pushups_1min", 31, "2026-11-09"),
    ]);
    expect(rankAthletes(changesFor(yearOverYear, index, ["a"], 2026))[0].overall).toBe(0);
  });

  test("leaves out anyone compared on fewer than two domains", () => {
    const index = buildIndex([
      row("a", "30yd_dash", 5.0, "2025-11-10"),
      row("a", "30yd_dash", 4.5, "2026-11-09"),
    ]);
    expect(rankAthletes(changesFor(yearOverYear, index, ["a"], 2026))).toEqual([]);
  });
});

test.describe("seasonRecords", () => {
  test("counts each beaten best once per metric, most first", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 60, "2025-11-10"),
      row("a", "vertical_jump", 62, "2026-11-09"),
      row("a", "vertical_jump", 64, "2026-12-07"),
      row("a", "30yd_dash", 4.6, "2025-11-10"),
      row("a", "30yd_dash", 4.5, "2026-11-09"),
      row("b", "vertical_jump", 55, "2025-11-10"),
      row("b", "vertical_jump", 57, "2026-11-09"),
    ]);
    const result = seasonRecords(index, ["b", "a"], 2026);
    expect(result.map((r) => r.playerId)).toEqual(["a", "b"]);
    expect(result[0].records).toHaveLength(2);
    expect(result[0].records.find((r) => r.metric === "vertical_jump")).toEqual({
      metric: "vertical_jump",
      value: 64,
      date: "2026-12-07",
      // November's 62 was itself a record, and it is what December's 64 had to beat.
      previousBest: 62,
    });
  });

  test("a first-ever attempt is not a record", () => {
    const index = buildIndex([row("a", "vertical_jump", 60, "2026-11-09")]);
    expect(seasonRecords(index, ["a"], 2026)).toEqual([]);
  });
});

test.describe("squadProgress", () => {
  test("takes the median over returning players only", () => {
    const index = buildIndex([
      row("a", "vertical_jump", 50, "2025-11-10"),
      row("a", "vertical_jump", 54, "2026-11-09"),
      row("b", "vertical_jump", 60, "2025-11-10"),
      row("b", "vertical_jump", 61, "2026-11-09"),
      row("c", "vertical_jump", 40, "2025-11-10"),
      row("c", "vertical_jump", 46, "2026-11-09"),
      // A rookie with a huge number must not move the median.
      row("r", "vertical_jump", 90, "2026-11-09"),
    ]);
    const jump = squadProgress(index, ["a", "b", "c", "r"], 2026).find(
      (p) => p.metric === "vertical_jump",
    )!;
    expect(jump).toEqual({ metric: "vertical_jump", n: 3, medianImprovement: 4, verdict: "better" });
  });
});
