import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke test against the LOCAL stack (ports 544xx). Needs `npm run supabase:start`,
 * `npm run env:local`, `npm run seed` and a synced catalog. Starts its own dev server on :3100.
 */
const PORT = 3100;
export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"], locale: "he-IL", trace: "retain-on-failure" },
  // Once per theme (LM1): the device setting decides it, since no choice is saved.
  projects: [
    { name: "dark", use: { colorScheme: "dark" } },
    { name: "light", use: { colorScheme: "light" } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, QUOTE_LINK_SECRET: process.env.QUOTE_LINK_SECRET ?? "e2e-only-secret-not-for-production-use" },
  },
});
