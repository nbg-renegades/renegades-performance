import { test, expect } from "./fixtures";

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

test.describe("signed in", () => {
  const routes = [
    { path: "/", landmark: /Welcome back/ },
    { path: "/performance", landmark: /^Performance$/ },
    { path: "/performance/history", landmark: /^Performance$/ },
    { path: "/performance/comparison", landmark: /^Performance$/ },
    { path: "/users", landmark: /User Management/ },
  ];

  for (const { path, landmark } of routes) {
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
    for (const { path } of routes) {
      await signedIn.goto(path);
      await expect(signedIn.locator("main")).toBeVisible();
      const overflow = await signedIn.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
    }
  });

  test("every control has an accessible name", async ({ signedIn }) => {
    await signedIn.goto("/performance");
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

test.describe("entries table", () => {
  test("pages rather than rendering every entry", async ({ signedIn }) => {
    await signedIn.goto("/performance");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    // 252 fixture entries; the page shows 25 and says so.
    expect(await signedIn.locator("table tbody tr").count()).toBe(25);
    await expect(signedIn.getByText(/Showing 1–25 of 252/)).toBeVisible();
  });

  test("sorts by value", async ({ signedIn }) => {
    await signedIn.goto("/performance");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    await signedIn.getByRole("button", { name: /^Value/ }).click();

    const values = await signedIn.evaluate(() =>
      [...document.querySelectorAll("table tbody tr td:nth-last-child(2)")]
        .map((td) => parseFloat((td as HTMLElement).innerText))
        .filter((v) => !Number.isNaN(v)),
    );
    expect(values.length).toBeGreaterThan(1);
    expect([...values]).toEqual([...values].sort((a, b) => a - b));
  });

  test("groups by date", async ({ signedIn }) => {
    await signedIn.goto("/performance");
    await expect(signedIn.locator("table tbody tr").first()).toBeVisible();

    await signedIn.getByLabel("Group by").click();
    await signedIn.getByRole("option", { name: "Date" }).click();

    await expect(signedIn.locator("table tbody td[colspan]").first()).toBeVisible();
  });
});

test.describe("batch entry", () => {
  test("offers the whole squad without a single click", async ({ signedIn }) => {
    await signedIn.goto("/performance");
    await signedIn.getByRole("button", { name: "Batch Create" }).click();
    await signedIn.getByRole("tab", { name: "One drill" }).click();

    // One labelled input per player, and none of the old add-a-row ceremony.
    const inputs = signedIn.locator('input[id^="player-value-"]');
    await expect(inputs).toHaveCount(6);
    await expect(signedIn.getByRole("button", { name: /add row/i })).toHaveCount(0);
  });

  test("saves only the players given a value", async ({ signedIn, captured }) => {
    await signedIn.goto("/performance");
    await signedIn.getByRole("button", { name: "Batch Create" }).click();
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
