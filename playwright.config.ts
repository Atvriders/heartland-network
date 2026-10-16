import { defineConfig } from "@playwright/test";

const PG_PORT = process.env.PG_PORT ?? "5433";
const PG_PASS = process.env.PG_PASSWORD ?? "heartland";
const DB_URL = `postgres://heartland:${PG_PASS}@127.0.0.1:${PG_PORT}/heartland_e2e`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8141",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/reset-e2e-db.mjs && node packages/server/dist/index.js",
    url: "http://127.0.0.1:8141/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: "8141",
      HOST: "127.0.0.1",
      DATABASE_URL: DB_URL,
      PG_PORT,
      PG_PASSWORD: PG_PASS,
    },
  },
  projects: [
    {
      name: "desktop",
      testMatch: /game\.spec\.ts/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
