/**
 * Regenerates the screenshots in docs/screenshots/ that the README shows.
 *
 *   node scripts/readme-screenshots.ts
 *
 * Everything on screen is invented: a made-up squad with made-up results over three
 * preseasons, served by intercepting every Supabase request, the same way tests/fixtures.ts
 * does. The dev server is started against a Supabase URL that does not exist, so nothing
 * here can reach a real project even if a request slipped past the mock - and the club's own
 * names must never end up in a public README.
 *
 * The browser clock is frozen in the middle of a preseason, because that is when the season
 * views have the most to say. Out of preseason the dashboard shows last year's recap instead.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, devices, type Browser, type Page } from "@playwright/test";
import { standingsForAll, unitOf } from "../supabase/functions/_shared/analytics.ts";

const PORT = 5198;
const BASE_URL = `http://localhost:${PORT}`;
const PROJECT_REF = "readmedemo0000000000";
const SUPABASE_HOST = `${PROJECT_REF}.supabase.co`;
const OUT_DIR = "docs/screenshots";

/** Two tests into the 2026/27 preseason. */
const NOW = new Date("2026-12-08T18:30:00+01:00");

// ── An invented squad ──────────────────────────────────────────────────────────────────────

/** Deterministic, so a re-run produces the same pictures. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = prng(27);
const noise = () => random() * 2 - 1;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Position = "QB" | "WR" | "C" | "DB" | "B" | "unassigned";

interface DemoPlayer {
  id: string;
  first_name: string;
  last_name: string;
  position: Position;
  /** Club years they were tested in. */
  seasons: number[];
  /** -1 (slowest in the squad) .. +1 (fastest). */
  talent: number;
}

const p = (
  n: number,
  first_name: string,
  last_name: string,
  position: Position,
  seasons: number[],
  talent: number,
): DemoPlayer => ({ id: uuid(n), first_name, last_name, position, seasons, talent });

const PLAYERS: DemoPlayer[] = [
  p(1, "Alex", "Example", "QB", [2024, 2025, 2026], 0.35),
  p(2, "Jordan", "Sample", "WR", [2024, 2025, 2026], 0.8),
  p(3, "Casey", "Placeholder", "WR", [2025, 2026], 0.55),
  p(4, "Riley", "Demo", "C", [2024, 2025, 2026], -0.4),
  p(5, "Morgan", "Mock", "DB", [2024, 2025, 2026], 0.6),
  p(6, "Taylor", "Testcase", "DB", [2025, 2026], 0.2),
  p(7, "Quinn", "Fixture", "B", [2024, 2025, 2026], -0.1),
  p(8, "Avery", "Stub", "B", [2025, 2026], -0.55),
  p(9, "Jamie", "Dummy", "WR", [2026], 0.1),
  p(10, "Robin", "Fakename", "DB", [2026], -0.2),
  p(11, "Sky", "Lorem", "QB", [2024, 2025], 0.0),
  p(12, "Drew", "Ipsum", "C", [2025, 2026], -0.75),
  p(13, "Emery", "Specimen", "unassigned", [2026], -0.35),
  p(14, "Parker", "Prototype", "WR", [2024, 2025, 2026], 0.4),
];

/** Someone who left after 2025/26 and was anonymised: results kept, name and account gone. */
const FORMER_ID = "3f2a9c41-7e0b-4d55-9a1e-8b6c2d0f4e17";

/** Signs in as an admin and coach, not a player - the head coach's view. */
const COACH = { id: uuid(100), first_name: "Coach", last_name: "Demo" };
/** The player whose own dashboard the mobile shots show. */
const PLAYER_VIEWER = PLAYERS[1];

const SESSIONS: Record<number, string[]> = {
  2024: ["2024-11-16", "2024-12-07", "2025-01-18"],
  2025: ["2025-11-15", "2025-12-06", "2026-01-17"],
  2026: ["2026-11-14", "2026-12-05"],
};

const METRICS = {
  vertical_jump: { unit: "cm", base: 56, spread: 0.14, lower: false, precision: 0 },
  jump_gather: { unit: "cm", base: 68, spread: 0.14, lower: false, precision: 0 },
  "30yd_dash": { unit: "s", base: 4.3, spread: 0.06, lower: true, precision: 2 },
  "3_cone_drill": { unit: "s", base: 7.75, spread: 0.06, lower: true, precision: 2 },
  shuttle_5_10_5: { unit: "s", base: 4.85, spread: 0.06, lower: true, precision: 2 },
  pushups_1min: { unit: "reps", base: 38, spread: 0.3, lower: false, precision: 0 },
} as const;

type Metric = keyof typeof METRICS;

interface Entry {
  id: string;
  player_id: string;
  metric_type: Metric;
  value: number;
  unit: string;
  entry_date: string;
  created_at: string;
  created_by: string;
}

function buildEntries(): Entry[] {
  const rows: Entry[] = [];
  const athletes = [
    ...PLAYERS,
    { id: FORMER_ID, position: "WR" as Position, seasons: [2024, 2025], talent: 0.3 },
  ];
  for (const athlete of athletes) {
    // Each athlete is a little better or worse at each drill than their overall talent says.
    const bias = Object.fromEntries(Object.keys(METRICS).map((m) => [m, noise() * 0.35]));
    athlete.seasons.forEach((season, year) => {
      SESSIONS[season].forEach((date, session) => {
        // Not everyone makes every session, but everyone makes the first one.
        if (session > 0 && random() < 0.15) return;
        for (const [metric, def] of Object.entries(METRICS) as [Metric, (typeof METRICS)[Metric]][]) {
          // Push-ups are only tested at the first session of each preseason.
          if (metric === "pushups_1min" && session > 0) continue;
          if (random() < 0.05) continue;
          const skill = athlete.talent + bias[metric];
          // Returning players come back a bit better; within a preseason they improve again.
          const gain = year * 0.04 + session * 0.012 + noise() * 0.012;
          const factor = 1 + skill * def.spread + gain * (def.spread / 0.06);
          const value = def.lower ? def.base / factor : def.base * factor;
          rows.push({
            id: `e${rows.length}`,
            player_id: athlete.id,
            metric_type: metric,
            value: +value.toFixed(def.precision),
            unit: def.unit,
            entry_date: date,
            created_at: `${date}T17:00:00Z`,
            created_by: COACH.id,
          });
        }
      });
    });
  }
  return rows;
}

const ENTRIES = buildEntries();

const PROFILES = [...PLAYERS, COACH].map((m) => ({
  id: m.id,
  username: `${m.first_name}.${m.last_name}`.toLowerCase(),
  first_name: m.first_name,
  last_name: m.last_name,
  terms_accepted_at: "2026-11-01T12:00:00Z",
  created_at: "2024-10-01T12:00:00Z",
}));

const ROLES = [
  ...PLAYERS.map((m) => ({ user_id: m.id, role: "player" })),
  { user_id: COACH.id, role: "admin" },
  { user_id: COACH.id, role: "coach" },
];

const POSITIONS = PLAYERS.filter((m) => m.position !== "unassigned").map((m) => ({
  player_id: m.id,
  position: m.position,
}));

// ── A PostgREST stand-in ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** Applies the eq/in/gte/lte filters and the order the app's queries use. */
function query(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const operand = rest.join(".");
    if (op === "eq") out = out.filter((r) => String(r[key]) === operand);
    if (op === "in") {
      const set = new Set(operand.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")));
      out = out.filter((r) => set.has(String(r[key])));
    }
    if (op === "gte") out = out.filter((r) => String(r[key]) >= operand);
    if (op === "lte") out = out.filter((r) => String(r[key]) <= operand);
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((o) => o.split("."));
    out = [...out].sort((a, b) => {
      for (const [col, dir] of keys) {
        const cmp = String(a[col]).localeCompare(String(b[col]));
        if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }
  return out;
}

async function mockSupabase(page: Page, viewer: { id: string; isCoach: boolean }) {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  const json = (body: unknown) => ({ status: 200, headers, body: JSON.stringify(body) });

  // Row-level security, roughly: a player sees their own rows and nobody else's.
  const own = <T extends Row>(rows: T[], col: string) =>
    viewer.isCoach ? rows : rows.filter((r) => r[col] === viewer.id);
  const tables: Record<string, Row[]> = {
    profiles: own(PROFILES, "id"),
    user_roles: own(ROLES, "user_id"),
    player_positions: own(POSITIONS, "player_id"),
    performance_entries: own(ENTRIES as unknown as Row[], "player_id"),
    former_players: viewer.isCoach ? [{ id: FORMER_ID }] : [],
  };

  // Anything that is not the dev server or the fake project is refused, not fetched.
  await page.route(
    (url) => url.hostname !== "localhost" && url.hostname !== SUPABASE_HOST,
    (route) => route.abort(),
  );

  await page.route(`**/${SUPABASE_HOST}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const wantsOne = (request.headers()["accept"] ?? "").includes("pgrst.object");

    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers, body: "" });

    if (path.startsWith("/auth/v1/user")) {
      return route.fulfill(json({ id: viewer.id, aud: "authenticated", role: "authenticated" }));
    }

    if (path === "/rest/v1/rpc/get_best_daily_entries") {
      return route.fulfill(json(tables.performance_entries));
    }

    if (path.startsWith("/rest/v1/")) {
      const rows = query(tables[path.slice("/rest/v1/".length)] ?? [], url.searchParams);
      return route.fulfill(json(wantsOne ? (rows[0] ?? null) : rows));
    }

    // The real aggregation, run over the invented rows.
    if (path.endsWith("/functions/v1/get-player-standing")) {
      const { player_id } = JSON.parse(request.postData() || "{}");
      const squad = PLAYERS.map((m) => m.id);
      const positionOf = (id: string) => PLAYERS.find((m) => m.id === id)?.position ?? null;
      const position = positionOf(player_id);
      const unit = unitOf(position);
      const nameOf = () => null;
      return route.fulfill(
        json({
          team: standingsForAll(ENTRIES, player_id, squad, nameOf),
          unit: standingsForAll(ENTRIES, player_id, squad.filter((id) => unit && unitOf(positionOf(id)) === unit), nameOf),
          position: standingsForAll(ENTRIES, player_id, squad.filter((id) => positionOf(id) === position), nameOf),
          position_label: position === "unassigned" ? null : position,
          unit_label: unit,
          includes_names: false,
        }),
      );
    }

    return route.fulfill(json([]));
  });
}

/** A session the client accepts; only `exp` and `sub` are ever read locally. */
async function seedSession(page: Page, userId: string) {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const exp = Math.floor(NOW.getTime() / 1000) + 7200;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: userId, exp, aud: "authenticated", role: "authenticated" })}.sig`;
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: 7200,
    expires_at: exp,
    refresh_token: "demo",
    user: { id: userId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} },
  };
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`sb-${PROJECT_REF}-auth-token`, JSON.stringify(session)] as const,
  );
}

// ── Shots ──────────────────────────────────────────────────────────────────────────────────

interface Shot {
  file: string;
  device: "desktop" | "mobile";
  viewer: "coach" | "player";
  path: string;
  /** Waits for, and optionally does, whatever the shot needs before it is taken. */
  prepare?: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
  { file: "desktop-coach-dashboard.png", device: "desktop", viewer: "coach", path: "/" },
  { file: "desktop-team-matrix.png", device: "desktop", viewer: "coach", path: "/team" },
  { file: "desktop-player-page.png", device: "desktop", viewer: "coach", path: `/players/${PLAYERS[4].id}` },
  { file: "desktop-coverage.png", device: "desktop", viewer: "coach", path: "/team/coverage" },
  { file: "mobile-player-dashboard.png", device: "mobile", viewer: "player", path: "/" },
  {
    file: "mobile-my-page.png",
    device: "mobile",
    viewer: "player",
    path: "/me",
    prepare: async (page) => {
      await page
        .getByText("Metric by metric")
        .evaluate((el) => el.closest(".rounded-lg, [class*=card]")?.scrollIntoView({ block: "start" }));
    },
  },
  {
    file: "mobile-record-session.png",
    device: "mobile",
    viewer: "coach",
    path: "/log",
    prepare: async (page) => {
      await page.getByRole("button", { name: /Record session/ }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "One drill" }).click();
      await dialog.locator("#batch-exercise-metric").click();
      await page.getByRole("option", { name: /30-Yard Dash/ }).click();
      // A testing day half done: the first few players have their sprint in.
      const times = ["4.21", "4.08", "4.17"];
      for (const [i, value] of times.entries()) {
        await dialog.locator('input[id^="player-value-"]').nth(i).fill(value);
      }
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        document.querySelectorAll('[role="dialog"] *').forEach((el) => (el.scrollTop = 0));
      });
    },
  },
  { file: "mobile-leaderboards.png", device: "mobile", viewer: "coach", path: "/team/leaderboards" },
];

async function take(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    ...(shot.device === "mobile"
      ? { ...devices["iPhone 13"], deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 }),
    baseURL: BASE_URL,
    locale: "en-GB",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const viewer =
    shot.viewer === "coach" ? { id: COACH.id, isCoach: true } : { id: PLAYER_VIEWER.id, isCoach: false };
  await mockSupabase(page, viewer);
  await seedSession(page, viewer.id);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(shot.path);
  await page.locator("main h1, h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  await shot.prepare?.(page);
  // Let the charts finish their entry animation.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT_DIR}/${shot.file}` });
  await context.close();

  if (errors.length) throw new Error(`${shot.file}: ${errors.join("; ")}`);
  console.log(`  ${shot.file}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Environment variables beat .env in Vite, so this server never sees the real project.
  const server = spawn("pnpm", ["vite", "--port", String(PORT), "--strictPort"], {
    env: {
      ...process.env,
      VITE_SUPABASE_PROJECT_ID: PROJECT_REF,
      VITE_SUPABASE_URL: `https://${SUPABASE_HOST}`,
      VITE_SUPABASE_PUBLISHABLE_KEY: "demo-key",
    },
    stdio: "ignore",
    detached: true,
  });
  const stop = () => {
    try {
      process.kill(-server.pid!);
    } catch {
      // already gone
    }
  };

  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(BASE_URL)).ok) break;
      } catch {
        // not up yet
      }
      if (i > 60) throw new Error("dev server did not start");
      await new Promise((r) => setTimeout(r, 500));
    }

    const browser = await chromium.launch();
    try {
      for (const shot of process.argv[2] ? SHOTS.filter((s) => s.file.includes(process.argv[2])) : SHOTS) {
        await take(browser, shot);
      }
    } finally {
      await browser.close();
    }
  } finally {
    stop();
  }
}

await main();
