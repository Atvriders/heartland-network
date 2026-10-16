/** Mobile viewport tests: layout, touch interactions, panels. */
import { expect, test } from "@playwright/test";

const BASE = "http://127.0.0.1:8141";

test.describe("mobile viewport", () => {
  let gameId = "";

  test.beforeAll(async ({ request }) => {
    const res = await request.post(`${BASE}/api/games`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "Mobile Network", seed: 900, difficulty: "easy" },
    });
    expect(res.ok()).toBeTruthy();
    gameId = ((await res.json()) as { game: { id: string } }).game.id;
  });

  test("game loads and map is interactive on a phone-size screen", async ({ page }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("hud")).toBeVisible();
    await expect(page.getByTestId("toolbar")).toBeVisible();
    await expect(page.getByTestId("map")).toBeVisible();

    // Interact with a town in the central map area. Click the topmost fill
    // circle with raw mouse coordinates (SVG hit-testing handles the rest).
    const point = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('[data-testid^="town-"]')];
      const vw = window.innerWidth;
      for (const g of groups) {
        const fill = g.querySelectorAll("circle")[1] ?? g.querySelector("circle");
        if (!fill) continue;
        const r = fill.getBoundingClientRect();
        if (r.x > vw * 0.3 && r.x < vw * 0.7 && r.y > 140 && r.y < 680) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: g.getAttribute("data-testid") };
        }
      }
      return null;
    });
    expect(point).not.toBeNull();
    await page.mouse.click(point!.x, point!.y);
    await expect(page.getByTestId("inspector")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("inspector")).toContainText("Population", { timeout: 15_000 });

    // Mobile panel bar opens management screens.
    await page.getByTestId("mobile-panel-finance").click();
    await expect(page.getByTestId("side-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("side-panel")).toContainText("Cash", { timeout: 15_000 });
  });
});
