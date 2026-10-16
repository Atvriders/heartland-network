/** Capture README screenshots against a locally running server. */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.env.SHOT_BASE ?? "http://127.0.0.1:8099";
const gameId = process.env.SHOT_GAME;
if (!gameId) {
  console.error("usage: SHOT_GAME=<id> node scripts/screenshot.mjs");
  process.exit(1);
}

fs.mkdirSync("docs/screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${base}/?game=${gameId}`);
await page.waitForSelector('[data-testid="map"]', { timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "docs/screenshots/map.png" });

await page.getByTestId("open-finance").click();
await page.waitForTimeout(800);
await page.screenshot({ path: "docs/screenshots/finance.png" });

await browser.close();
console.log("screenshots written");
