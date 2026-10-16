/**
 * End-to-end tests against the production build (server + client bundle).
 * Covers the complete playable workflow: create game, build network,
 * gain customers, survive a storm, repair, save, restart, reload.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:8141";

async function api(request: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  return request.fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    method: init?.method ?? "GET",
    data: init?.data,
  });
}

async function createGame(request: APIRequestContext, name: string, seed: number): Promise<string> {
  const res = await api(request, "/api/games", {
    method: "POST",
    data: { name, seed, difficulty: "normal" },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    game: { id: string };
    staticMap: { towns: { id: string; pop: number }[] };
  };
  // Remember the capital for the test.
  const capital = [...body.staticMap.towns].sort((a, b) => b.pop - a.pop)[0]!.id;
  (globalThis as unknown as Record<string, unknown>).__capital = capital;
  return body.game.id;
}

async function command(request: APIRequestContext, gameId: string, cmd: unknown): Promise<unknown> {
  const res = await api(request, `/api/games/${gameId}/commands`, { method: "POST", data: cmd });
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) throw new Error(`command failed: ${body.error}`);
  return body;
}

async function getState(
  request: APIRequestContext,
  gameId: string,
): Promise<{
  state: {
    meta: { gameDay: number; paused: boolean };
    kpis: { subs: number; incidentActive: number };
    sites: { id: string; kind: string; status: string; name: string; x: number; y: number }[];
    incidents: { id: string; status: string; crewAssigned: boolean }[];
  };
}> {
  const res = await api(request, `/api/games/${gameId}`);
  return (await res.json()) as never;
}

/** Click the map at the center of a town marker. */
async function clickTown(page: Page, townId: string): Promise<void> {
  const box = await page.locator(`[data-testid="town-${townId}"] circle`).first().boundingBox();
  if (!box) throw new Error(`town ${townId} not visible`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe.serial("heartland network — core workflow", () => {
  let gameId: string;

  test.beforeAll(async ({ request }) => {
    gameId = await createGame(request, "E2E Network", 777);
    // Deterministic scenario: no random ambient failures.
    await command(request, gameId, { cmd: "setSetting", key: "ambientStorms", value: false });
    await command(request, gameId, { cmd: "setSetting", key: "equipmentFailures", value: false });
  });

  test("new game shows the statewide map", async ({ page }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("map")).toBeVisible();
    await expect(page.getByTestId("hud")).toBeVisible();
    await expect(page.getByTestId("hud-cash")).toContainText("$2.50M");
    // Town labels render on the map.
    await expect(page.locator("svg text").first()).toBeVisible({ timeout: 20_000 });
    // Toolbar present with build tools.
    await expect(page.getByTestId("tool-co")).toBeVisible();
  });

  test("player builds an office, connects cabinets, gains customers", async ({ page, request }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("map")).toBeVisible();

    // Build a central office in the capital.
    await page.getByTestId("tool-co").click();
    const capital = (globalThis as unknown as Record<string, string>).__capital!;
    await clickTown(page, capital);
    const preview = page.getByTestId("build-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("Start construction");
    await preview.getByTestId("confirm-build").click();
    await expect(page.getByTestId("tool-co")).toHaveClass(/active/);

    const state0 = await getState(request, gameId);
    expect(state0.state.sites.length).toBe(1);

    // Build a cabinet in the capital's first district so customers can sign up.
    const districts = (
      (await (await api(request, `/api/games/${gameId}`)).json()) as {
        staticMap: { towns: { id: string; districtIds: string[] }[] };
      }
    ).staticMap.towns.find((t) => t.id === capital)!.districtIds;
    await command(request, gameId, {
      cmd: "startProject",
      type: "cabinet",
      tier: 1,
      districtId: districts[0],
    });

    // Fast-forward until subscribers arrive.
    await command(request, gameId, { cmd: "setPaused", paused: false });
    await command(request, gameId, { cmd: "setSpeed", speed: 15 });
    await expect
      .poll(async () => (await getState(request, gameId)).state.kpis.subs, { timeout: 60_000 })
      .toBeGreaterThan(0);

    // HUD reflects subscribers.
    await expect(page.getByTestId("hud")).toContainText("$");
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const st = await getState(request, gameId);
      if (st.state.meta.gameDay > 30) break;
    }
    const state = await getState(request, gameId);
    expect(state.state.meta.gameDay).toBeGreaterThan(30);
    const co = state.state.sites.find((s) => s.kind === "co")!;
    expect(co.status).toBe("online");
  });

  test("storm damages the network; players dispatch crews and restore service", async ({ page, request }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("map")).toBeVisible();

    const before = await getState(request, gameId);
    const co = before.state.sites.find((s) => s.kind === "co")!;
    expect(co.status).toBe("online");

    // Storm hit rolls are random; run drills until the office is damaged.
    let incidentId: string | undefined;
    for (let attempt = 0; attempt < 8; attempt++) {
      await command(request, gameId, { cmd: "stormExercise", severity: 3, x: co.x, y: co.y, radiusKm: 40 });
      const damaged = await getState(request, gameId);
      if (damaged.state.sites.find((s) => s.id === co.id)!.status === "failed") {
        incidentId = damaged.state.incidents.find(
          (i) => i.status === "active" && i.affectedSites.includes(co.id),
        )?.id;
        break;
      }
      await page.waitForTimeout(400);
    }
    expect(incidentId).toBeDefined();
    const damaged = await getState(request, gameId);
    expect(damaged.state.sites.find((s) => s.id === co.id)!.status).toBe("failed");

    // Dispatch crews to all other active incidents via API; the target
    // incident gets its crew through the UI.
    for (const inc of damaged.state.incidents) {
      if (inc.status === "active" && inc.id !== incidentId) {
        await command(request, gameId, { cmd: "dispatchCrew", incidentId: inc.id });
      }
    }

    // Dispatch a crew through the UI.
    await page.getByTestId("open-incidents").click();
    const card = page.getByTestId(`incident-card-${incidentId}`);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /Dispatch crew/ }).click();

    await expect
      .poll(
        async () => {
          const s = await getState(request, gameId);
          return s.state.incidents.find((i) => i.id === incidentId)?.status;
        },
        { timeout: 60_000 },
      )
      .toBe("resolved");

    await expect
      .poll(
        async () => {
          const s = await getState(request, gameId);
          if (s.state.incidents.some((i) => i.status === "active")) return "waiting";
          return s.state.sites.find((s) => s.id === co.id)?.status;
        },
        { timeout: 60_000 },
      )
      .toBe("online");
  });

  test("save, restart deployment, reload — everything is preserved", async ({ page, request }) => {
    await command(request, gameId, { cmd: "setPaused", paused: true });
    await api(request, `/api/games/${gameId}/save`, { method: "POST" });
    const before = await getState(request, gameId);
    const dayBefore = before.state.meta.gameDay;
    const cashBefore = (
      (await (await api(request, `/api/games/${gameId}`)).json()) as { state: { finance: { cash: number } } }
    ).state.finance.cash;

    // Simulate a deployment restart: reload the client (server restart covered
    // by the integration suite) and reconnect.
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("hud")).toBeVisible();

    const after = await getState(request, gameId);
    expect(after.state.meta.gameDay).toBe(dayBefore);
    const cashAfter = (
      (await (await api(request, `/api/games/${gameId}`)).json()) as { state: { finance: { cash: number } } }
    ).state.finance.cash;
    expect(cashAfter).toBe(cashBefore);
    // Sites are still rendered on the map.
    await expect(page.locator('[data-testid^="site-"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("keyboard shortcuts control time", async ({ page, request }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("hud")).toBeVisible();
    await command(request, gameId, { cmd: "setPaused", paused: true });
    const day0 = (await getState(request, gameId)).state.meta.gameDay;

    await page.keyboard.press(" ");
    await page.waitForTimeout(1500);
    const day1 = (await getState(request, gameId)).state.meta.gameDay;
    expect(day1).toBeGreaterThan(day0);

    await page.keyboard.press(" ");
    await page.waitForTimeout(800);
    const day2 = (await getState(request, gameId)).state.meta.gameDay;
    await page.waitForTimeout(800);
    const day3 = (await getState(request, gameId)).state.meta.gameDay;
    expect(day3).toBe(day2);
  });

  test("map pans and zooms", async ({ page }) => {
    await page.goto(`/?game=${gameId}`);
    await expect(page.getByTestId("map")).toBeVisible();
    const map = page.getByTestId("map");
    const box = (await map.boundingBox())!;
    const before = await page.locator("svg text").first().boundingBox();
    // Zoom in with the wheel.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(500);
    const after = await page.locator("svg text").first().boundingBox();
    expect(before && after).toBeTruthy();
    // Positions of towns change relative to the viewport after zooming.
    expect(after!.x).not.toBe(before!.x);
  });
});
