import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/**
 * The suite talks to a dev server on a port of its own, so running it never collides with
 * a dev server you already have open. Every Supabase call is intercepted (see
 * tests/fixtures.ts), so the tests need no backend, no credentials and no network.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    /**
     * `*.unit.spec.ts` files test the pure modules in src/lib and never open a page, so they
     * run once rather than once per device. Keeping them in this runner means the repo has
     * one test command and one set of TypeScript settings instead of a second framework -
     * `minimumReleaseAge` makes adding a dependency a five-day wait, and these tests need
     * nothing Playwright does not already do.
     */
    { name: "unit", testMatch: /.*\.unit\.spec\.ts/ },
    {
      name: "desktop",
      testIgnore: /.*\.unit\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", testIgnore: /.*\.unit\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
