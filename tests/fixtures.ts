import { readFileSync } from "node:fs";
import { test as base, type Page } from "@playwright/test";

/**
 * A signed-in app with a predictable backend.
 *
 * Every request to Supabase is answered from the fixture below, so the suite needs no
 * project, no credentials and no network. The session is seeded straight into
 * localStorage, because signing in for real would need a password we should not have.
 *
 * The project ref is read from the same env var the app reads. Hard-coding it once cost an
 * afternoon: the ref changed, the storage key changed with it, every page silently
 * redirected to the login screen and the failure looked like a bug in the app.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? readEnvFile("VITE_SUPABASE_URL");
export const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

function readEnvFile(key: string): string {
  // Vite loads .env for the dev server; this process has to read it itself.
  for (const file of [".env.local", ".env"]) {
    try {
      const match = readFileSync(file, "utf8").match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
      if (match) return match[1];
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`${key} is not set and was not found in .env - copy .env.example to .env`);
}

export const ADMIN_ID = "11111111-1111-1111-1111-111111111111";

export const PLAYERS = [
  { id: ADMIN_ID, first_name: "Philipp", last_name: "Bruchner", position: "QB" },
  { id: "22221222-2222-2222-2222-222222222222", first_name: "Jonas", last_name: "Keller", position: "WR" },
  { id: "22222222-2222-2222-2222-222222222222", first_name: "Marco", last_name: "Schulz", position: "DB" },
  { id: "22223222-2222-2222-2222-222222222222", first_name: "Tim", last_name: "Hoffmann", position: "C" },
  { id: "22224222-2222-2222-2222-222222222222", first_name: "Lars", last_name: "Wagner", position: "B" },
  { id: "22225222-2222-2222-2222-222222222222", first_name: "Nico", last_name: "Braun", position: "WR" },
];

const METRICS = [
  "vertical_jump",
  "jump_gather",
  "30yd_dash",
  "3_cone_drill",
  "shuttle_5_10_5",
  "pushups_1min",
] as const;

const UNITS: Record<string, string> = {
  vertical_jump: "cm",
  jump_gather: "cm",
  "30yd_dash": "s",
  "3_cone_drill": "s",
  shuttle_5_10_5: "s",
  pushups_1min: "reps",
};

const LABELS: Record<string, string> = {
  vertical_jump: "Vertical Jump",
  jump_gather: "Jump w. Gather Step",
  "30yd_dash": "30-Yard Dash",
  "3_cone_drill": "3-Cone Drill",
  shuttle_5_10_5: "5-10-5 Shuttle",
  pushups_1min: "Push-Ups (1 Min AMRAP)",
};

const BASE: Record<string, number> = {
  vertical_jump: 58,
  jump_gather: 71,
  "30yd_dash": 4.12,
  "3_cone_drill": 7.45,
  shuttle_5_10_5: 4.63,
  pushups_1min: 44,
};

/** 6 players x 7 dates x 6 metrics = 252 rows, close to what production holds. */
function buildEntries() {
  const rows: Array<Record<string, unknown>> = [];
  let n = 0;
  for (const player of PLAYERS) {
    for (let week = 0; week < 7; week++) {
      const date = new Date(Date.now() - week * 21 * 864e5).toISOString().slice(0, 10);
      for (const metric of METRICS) {
        const seconds = UNITS[metric] === "s";
        const drift = week * 0.004 * (seconds ? 1 : -1);
        const value = +(BASE[metric] * (1 + drift + Math.sin(n * 1.7) * 0.05)).toFixed(seconds ? 2 : 0);
        rows.push({
          id: `e${n}`,
          player_id: player.id,
          metric_type: metric,
          value,
          unit: UNITS[metric],
          entry_date: date,
          created_at: `${date}T10:00:00Z`,
          created_by: ADMIN_ID,
        });
        n++;
      }
    }
  }
  return rows;
}

const ENTRIES = buildEntries();

const bestOf = (metric: string) =>
  UNITS[metric] === "s"
    ? Math.min(...ENTRIES.filter((e) => e.metric_type === metric).map((e) => e.value as number))
    : Math.max(...ENTRIES.filter((e) => e.metric_type === metric).map((e) => e.value as number));

/** Rows POSTed during a test, so a spec can assert on what the app tried to save. */
export type Captured = Array<Record<string, unknown>>;

export async function mockSupabase(page: Page, captured: Captured, role: "admin" | "player" = "admin") {
  const headers = { "content-type": "application/json", "access-control-allow-origin": "*" };
  const json = (body: unknown) => ({ status: 200, headers, body: JSON.stringify(body) });

  await page.route(`**/${PROJECT_REF}.supabase.co/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const params = url.searchParams;
    const wantsOne = (request.headers()["accept"] ?? "").includes("pgrst.object");
    const select = params.get("select") ?? "";

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers, body: "" });
    }

    if (request.method() === "POST" && path.startsWith("/rest/v1/performance_entries")) {
      captured.push(...JSON.parse(request.postData() || "[]"));
      return route.fulfill({ status: 201, headers, body: "[]" });
    }

    if (path.startsWith("/auth/v1/user")) {
      return route.fulfill(json({ id: ADMIN_ID, aud: "authenticated", role: "authenticated" }));
    }

    if (path.startsWith("/rest/v1/user_roles")) {
      if (select.includes("user_id")) {
        return route.fulfill(json(PLAYERS.map((p) => ({ user_id: p.id, role: "player" }))));
      }
      if (params.get("role")) {
        return route.fulfill(json(PLAYERS.map((p) => ({ user_id: p.id }))));
      }
      const roles = role === "admin" ? ["admin", "player"] : ["player"];
      return route.fulfill(json(roles.map((r) => ({ role: r }))));
    }

    if (path.startsWith("/rest/v1/player_positions")) {
      if (select.includes("player_id")) {
        return route.fulfill(json(PLAYERS.map((p) => ({ player_id: p.id, position: p.position }))));
      }
      return route.fulfill(json(wantsOne ? { position: "QB" } : [{ position: "QB" }]));
    }

    if (path.startsWith("/rest/v1/profiles")) {
      const rows = PLAYERS.map((p) => ({
        id: p.id,
        username: `${p.first_name.toLowerCase()}.${p.last_name.toLowerCase()}`,
        first_name: p.first_name,
        last_name: p.last_name,
        terms_accepted_at: "2026-01-04T09:00:00Z",
      }));
      return route.fulfill(json(wantsOne ? rows[0] : rows));
    }

    if (path.startsWith("/rest/v1/rpc/get_best_daily_entries")) {
      const seen = new Set<string>();
      const best = ENTRIES.filter((e) => {
        const key = `${e.player_id}${e.metric_type}${e.entry_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return route.fulfill(json(best));
    }

    if (path.startsWith("/rest/v1/performance_entries")) {
      const playerId = (params.get("player_id") ?? "").replace("eq.", "");
      const metric = (params.get("metric_type") ?? "").replace("eq.", "");
      let rows = ENTRIES;
      if (playerId) rows = rows.filter((e) => e.player_id === playerId);
      if (metric && !metric.startsWith("in.")) rows = rows.filter((e) => e.metric_type === metric);
      return route.fulfill(json(rows.slice(0, 400)));
    }

    if (path.includes("/functions/v1/get-dashboard-stats")) {
      return route.fulfill(
        json({
          totalPlayers: PLAYERS.length,
          teamRecentEntries: 37,
          userRecentEntries: 6,
          teamBestAllTime: METRICS.map((m) => ({ metric: m, value: bestOf(m) })),
          teamBestSixMonths: METRICS.map((m) => ({ metric: m, value: bestOf(m) })),
        }),
      );
    }

    /**
     * One standing function now answers what get-performance-benchmarks,
     * get-performance-averages and get-player-neighborhood used to answer between them. It
     * only exists for players - a coach computes the same figures in the browser from the
     * entries - so the shape here is what a player receives, names withheld.
     */
    if (path.includes("/functions/v1/get-player-standing")) {
      const standing = (n: number) =>
        METRICS.map((m, i) => ({
          metric_type: m,
          percentile: [92, 74, 55, 100, 31, 12][i],
          rank: [1, 2, 3, 1, 4, 5][i],
          n,
          median: BASE[m],
          best: bestOf(m),
          reliable: n >= 4,
          current_value: BASE[m],
          next_target_value: i === 3 ? null : BASE[m] * (UNITS[m] === "s" ? 0.97 : 1.03),
          next_target_name: null,
        }));
      return route.fulfill(
        json({
          team: standing(PLAYERS.length),
          unit: standing(3),
          position: standing(2),
          position_label: "QB",
          unit_label: "offense",
          includes_names: false,
        }),
      );
    }

    return route.fulfill({ status: 200, headers, body: "[]" });
  });
}

/** A JWT the client will accept; only `exp` and `sub` are ever read locally. */
function fakeJwt() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const encode = (value: unknown) => {
    const bytes = [...JSON.stringify(value)].map((c) => c.charCodeAt(0));
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
      const triple = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += alphabet[(triple >> 18) & 63] + alphabet[(triple >> 12) & 63];
      if (b !== undefined) out += alphabet[(triple >> 6) & 63];
      if (c !== undefined) out += alphabet[triple & 63];
    }
    return out;
  };
  const exp = Math.floor(Date.now() / 1000) + 7200;
  return {
    token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: ADMIN_ID, exp, aud: "authenticated", role: "authenticated" })}.sig`,
    exp,
  };
}

export async function seedSession(page: Page) {
  const { token, exp } = fakeJwt();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [
      `sb-${PROJECT_REF}-auth-token`,
      JSON.stringify({
        access_token: token,
        token_type: "bearer",
        expires_in: 7200,
        expires_at: exp,
        refresh_token: "fake-refresh",
        user: {
          id: ADMIN_ID,
          aud: "authenticated",
          role: "authenticated",
          email: "philipp.bruchner@team.local",
          app_metadata: {},
          user_metadata: {},
          created_at: "2025-11-08T00:00:00Z",
        },
      }),
    ] as const,
  );
}

/**
 * `signedIn` gives a page that is already authenticated against the mock backend, as an admin.
 *
 * `signedInAsPlayer` is the same page with only the player role, which is a different app: no
 * Team section, no Record session button, and a dashboard about themselves rather than the
 * squad. Both fixtures are needed because most of what the role controls is the absence of
 * something, and an admin-only suite cannot see an absence.
 */
export const test = base.extend<{ signedIn: Page; signedInAsPlayer: Page; captured: Captured }>({
  captured: async ({}, use) => {
    await use([]);
  },
  signedIn: async ({ page, captured }, use) => {
    await mockSupabase(page, captured);
    await seedSession(page);
    await use(page);
  },
  signedInAsPlayer: async ({ page, captured }, use) => {
    await mockSupabase(page, captured, "player");
    await seedSession(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
