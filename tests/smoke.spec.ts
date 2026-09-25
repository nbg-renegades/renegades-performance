import { test, expect, ADMIN_ID } from "./fixtures";

/**
 * A thin net under the things that broke, or nearly broke, while this app was being
 * reworked: routes that stopped rendering, a list that grew to 29 screens, icon buttons
 * with no name, a page that scrolled sideways on a phone, and a batch form that made a
 * coach click forty times before typing a number.
 *
 * Deliberately shallow. These assert that each screen loads and behaves, not how it looks.
 */

test.describe("signed out", () => {
  test("sends you to the login form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Flag Football Center" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
  });
});

/**
 * Every address the sidebar can reach as a coach. The player page is listed by id rather
 * than as /me so the loop can assert on a name it knows.
 */
const ROUTES = [
  { path: "/", landmark: /Welcome back/ },
  { path: "/team", landmark: /^Team$/ },
  { path: "/team/leaderboards", landmark: /^Team$/ },
  { path: "/team/coverage", landmark: /^Team$/ },
  { path: "/team/sessions", landmark: /^Team$/ },
  { path: `/players/${ADMIN_ID}`, landmark: /Philipp Bruchner/ },
  { path: "/log", landmark: /^Log$/ },
  { path: "/users", landmark: /User Management/ },
];

test.describe("signed in", () => {
  for (const { path, landmark } of ROUTES) {
    test(`${path} renders`, async ({ signedIn }) => {
      const errors: string[] = [];
      signedIn.on("pageerror", (e) => errors.push(String(e)));

      await signedIn.goto(path);
      await expect(signedIn.getByRole("heading", { name: landmark }).first()).toBeVisible();

      // A page that renders "undefined" is loading something it does not have.
      await expect(signedIn.locator("main")).not.toContainText("undefined");
      await expect(signedIn.locator("main")).not.toContainText("NaN");
      expect(errors).toEqual([]);
    });
  }

  test("no page scrolls sideways", async ({ signedIn }) => {
    for (const { path } of ROUTES) {
      await signedIn.goto(path);
      await expect(signedIn.locator("main")).toBeVisible();
      const overflow = await signedIn.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
    }
  });

  test("every control has an accessible name", async ({ signedIn }) => {
    await signedIn.goto("/log");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    const unnamed = await signedIn.evaluate(() =>
      [...document.querySelectorAll("button, a[href]")]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter(
          (el) =>
            !(el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim(),
        ).length,
    );
    expect(unnamed).toBe(0);
  });
});

/**
 * The /performance section was split into /log, /team and a page per player. The old
 * addresses were the sidebar link for the app's whole life, so people have them bookmarked
 * and they have to keep working.
 */
test.describe("old addresses", () => {
  const redirects = [
    { from: "/performance", to: "/log" },
    // Both single-player tabs became the player's own page, which /me resolves to.
    { from: "/performance/history", to: `/players/${ADMIN_ID}` },
    { from: "/performance/comparison", to: `/players/${ADMIN_ID}` },
  ];

  for (const { from, to } of redirects) {
    test(`${from} still lands somewhere`, async ({ signedIn }) => {
      await signedIn.goto(from);
      await expect(signedIn).toHaveURL(new RegExp(`${to}$`));
    });
  }
});

/**
 * What the squad section is scoped to lives in the URL, so a coach can send "look at the
 * defensive backs" as a link and it survives a tab switch.
 */
test.describe("team section", () => {
  test("keeps the chosen group across tabs", async ({ signedIn }) => {
    await signedIn.goto("/team");
    await signedIn.getByLabel("Compare within").click();
    await signedIn.getByRole("option", { name: "Offense" }).click();

    await expect(signedIn).toHaveURL(/group=offense/);
    await signedIn.getByRole("link", { name: "Coverage" }).click();
    await expect(signedIn).toHaveURL(/\/team\/coverage\?group=offense/);
    await expect(signedIn.getByLabel("Compare within")).toContainText("Offense");
  });

  test("opens a session report from the list", async ({ signedIn }) => {
    await signedIn.goto("/team/sessions");
    await signedIn.getByRole("link", { name: /player/ }).first().click();

    await expect(signedIn).toHaveURL(/\/team\/sessions\/\d{4}-\d{2}-\d{2}/);
    await expect(signedIn.locator("main")).not.toContainText("NaN");
  });
});

/**
 * Most of what a role controls is the absence of something, which an admin-only suite
 * cannot see. The sidebar hiding a link is cosmetic; RequireRole is the actual gate.
 */
test.describe("as a player", () => {
  test("is not offered the squad", async ({ signedInAsPlayer }) => {
    await signedInAsPlayer.goto("/");
    await expect(signedInAsPlayer.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
    await expect(signedInAsPlayer.getByRole("link", { name: "Team" })).toHaveCount(0);
  });

  test("is bounced off /team rather than shown an empty page", async ({ signedInAsPlayer }) => {
    await signedInAsPlayer.goto("/team");
    await expect(signedInAsPlayer).toHaveURL(/\/$/);
    await expect(signedInAsPlayer.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  });

  test("cannot record a session for the squad", async ({ signedInAsPlayer }) => {
    await signedInAsPlayer.goto("/log");
    await expect(signedInAsPlayer.getByRole("heading", { name: /^Log$/ })).toBeVisible();
    await expect(signedInAsPlayer.getByRole("button", { name: "Record session" })).toHaveCount(0);
  });
});

test.describe("entries table", () => {
  test("pages rather than rendering every entry", async ({ signedIn }) => {
    await signedIn.goto("/log");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    // 252 fixture entries; the page shows 25 and says so.
    expect(await signedIn.locator("table tbody tr").count()).toBe(25);
    await expect(signedIn.getByText(/Showing 1–25 of 252/)).toBeVisible();
  });

  test("sorts by value", async ({ signedIn }) => {
    await signedIn.goto("/log");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    await signedIn.getByRole("button", { name: /^Value/ }).click();
    await expect(signedIn.getByRole("columnheader", { name: /^Value/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    /**
     * Found by header text rather than by column index. Counting from the end of the row
     * broke silently the moment the table grew a Change column: the test went on passing
     * against a column of deltas that happened to be sorted too.
     */
    const values = await signedIn.evaluate(() => {
      const heads = [...document.querySelectorAll("table thead th")];
      const column = heads.findIndex((th) => (th.textContent ?? "").trim().startsWith("Value"));
      if (column < 0) throw new Error("no Value column");
      return [...document.querySelectorAll("table tbody tr")]
        .map((tr) => tr.children[column] as HTMLElement | undefined)
        .filter((td): td is HTMLElement => !!td)
        .map((td) => parseFloat(td.innerText))
        .filter((v) => !Number.isNaN(v));
    });
    expect(values.length).toBeGreaterThan(1);
    expect([...values]).toEqual([...values].sort((a, b) => a - b));
  });

  test("groups by date", async ({ signedIn }) => {
    await signedIn.goto("/log");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    await signedIn.getByLabel("Group by").click();
    await signedIn.getByRole("option", { name: "Date" }).click();

    await expect(signedIn.locator("table tbody td[colspan]").first()).toBeVisible();
  });
});

test.describe("batch entry", () => {
  test("offers the whole squad without a single click", async ({ signedIn }) => {
    await signedIn.goto("/log");
    await signedIn.getByRole("button", { name: "Record session" }).click();
    await signedIn.getByRole("tab", { name: "One drill" }).click();

    // One labelled input per player, and none of the old add-a-row ceremony.
    const inputs = signedIn.locator('input[id^="player-value-"]');
    await expect(inputs).toHaveCount(6);
    await expect(signedIn.getByRole("button", { name: /add row/i })).toHaveCount(0);
  });

  test("saves only the players given a value", async ({ signedIn, captured }) => {
    await signedIn.goto("/log");
    await signedIn.getByRole("button", { name: "Record session" }).click();
    await signedIn.getByRole("tab", { name: "One drill" }).click();

    const inputs = signedIn.locator('input[id^="player-value-"]');
    await inputs.nth(0).fill("58");
    await inputs.nth(1).fill("61");

    await expect(signedIn.getByText("2 of 6 filled")).toBeVisible();
    await signedIn.getByRole("button", { name: "Create 2 entries" }).click();

    await expect.poll(() => captured.length).toBe(2);
    expect(captured.map((row) => row.value)).toEqual([58, 61]);
    expect(captured.every((row) => row.metric_type === "vertical_jump")).toBe(true);
    expect(captured.every((row) => row.unit === "cm")).toBe(true);
  });
});
