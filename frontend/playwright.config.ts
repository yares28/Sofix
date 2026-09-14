import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT, E2E_REFRESH_TOKEN, MOCK_PORT } from "./e2e/constants";

// End-to-end tests run the real Next.js app against e2e/mock-api.mjs (recorded grid, scripted refresh):
// no Neon, no football-data.org, deterministic data.

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts", // not *.test.ts, so vitest never picks these up
  fullyParallel: false,
  workers: 1, // the mock API holds one refresh state
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${E2E_PORT}`,
    trace: "retain-on-failure",
    // Locally, drive the installed Chrome instead of downloading a browser; CI installs Chromium.
    channel: process.env.CI ? undefined : "chrome",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /mobile\.e2e\.ts/ },
  ],
  webServer: [
    {
      command: "node e2e/mock-api.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/api/health`,
      env: { E2E_MOCK_PORT: String(MOCK_PORT), E2E_REFRESH_TOKEN },
      reuseExistingServer: false,
    },
    {
      command: `node e2e/prepare.mjs && npx next dev -H 127.0.0.1 -p ${E2E_PORT}`,
      url: `http://127.0.0.1:${E2E_PORT}/api/refresh`, // answers 403 quickly once the server is up
      env: {
        API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        REFRESH_TOKEN: E2E_REFRESH_TOKEN,
        NEXT_DIST_DIR: ".next-e2e", // separate from the dev server's .next
        NEXT_TELEMETRY_DISABLED: "1",
      },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
