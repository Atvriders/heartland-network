/** Integration tests: real server process + PostgreSQL. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import pg from "pg";
import type { CreateGameResponse, GameSave, LoadGameResponse } from "@heartland/shared";

const PG_PORT = process.env.PG_PORT ?? "5433";
const PORT = 8131;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_DB = `postgres://heartland@127.0.0.1:${PG_PORT}/postgres`;
const TEST_DB = `postgres://heartland@127.0.0.1:${PG_PORT}/heartland_test`;

let server: ChildProcess | null = null;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const text = await res.text();
  const body: T = text ? (JSON.parse(text) as T) : (undefined as T);
  return { status: res.status, body };
}

async function waitHealthy(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("server did not become healthy");
}

async function cmd(gameId: string, command: unknown): Promise<{ ok: boolean; error?: string }> {
  const { status, body } = await fetchJson<{ ok: boolean; error?: string }>(`/api/games/${gameId}/commands`, {
    method: "POST",
    body: JSON.stringify(command),
  });
  expect(status).toBe(200);
  return body;
}

beforeAll(async () => {
  // Reset the test database.
  const admin = new pg.Client({ connectionString: ADMIN_DB });
  await admin.connect();
  await admin.query("DROP SCHEMA public CASCADE");
  await admin.query("CREATE SCHEMA public");
  await admin.end();

  server = spawn(process.execPath, ["dist/index.js"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_URL: TEST_DB,
      HOST: "127.0.0.1",
      CLIENT_DIR: "/nonexistent",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr?.on("data", (d) => process.stderr.write(`[server] ${String(d)}`));
  await waitHealthy();
});

afterAll(async () => {
  server?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 600));
});

describe("API integration", () => {
  it("health reports db connected and schema version", async () => {
    const { body } = await fetchJson<{ ok: boolean; db: string; schemaVersion: number; service: string }>(
      "/api/health",
    );
    expect(body.ok).toBe(true);
    expect(body.db).toBe("connected");
    expect(body.schemaVersion).toBe(2);
    expect(body.service).toBe("heartland-network");
  });

  it("migrations are idempotent (schema version stable)", async () => {
    const pool = new pg.Pool({ connectionString: TEST_DB });
    const { migrate, schemaVersion } = await import("../../src/db/pool.js");
    const v1 = await schemaVersion(pool);
    const v2 = await migrate(pool);
    expect(v1).toBe(2);
    expect(v2).toBe(2);
    await pool.end();
  });

  let gameId = "";

  it("creates a game with a map", async () => {
    const { status, body } = await fetchJson<CreateGameResponse>("/api/games", {
      method: "POST",
      body: JSON.stringify({ name: "Integration Test", seed: 2026, difficulty: "normal" }),
    });
    expect(status).toBe(201);
    expect(body.game.name).toBe("Integration Test");
    expect(body.staticMap.towns.length).toBeGreaterThan(25);
    expect(body.state.meta.paused).toBe(true);
    gameId = body.game.id;
  });

  it("runs the build-and-serve workflow over the live API", async () => {
    const { body: loaded } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    const capital = [...loaded.staticMap.towns].sort((a, b) => b.pop - a.pop)[0]!;

    const co = await cmd(gameId, { cmd: "startProject", type: "co", tier: 1, townId: capital.id });
    expect(co.ok).toBe(true);
    const cab = await cmd(gameId, {
      cmd: "startProject",
      type: "cabinet",
      tier: 1,
      districtId: capital.districtIds[0],
    });
    expect(cab.ok).toBe(true);
    // Keep the scenario deterministic: only deliberate drills will cause failures.
    await cmd(gameId, { cmd: "setSetting", key: "ambientStorms", value: false });
    await cmd(gameId, { cmd: "setSetting", key: "equipmentFailures", value: false });
    await cmd(gameId, { cmd: "setPaused", paused: false });
    await cmd(gameId, { cmd: "setSpeed", speed: 15 });

    // Wait for construction + adoption (30+ days at 15 days/sec ≈ 3 s).
    let subs = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { body } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
      subs = body.state.kpis.subs;
      if (subs > 0) break;
    }
    expect(subs).toBeGreaterThan(0);
    // Give the simulation another moment to advance past the month boundary.
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const { body } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
      if (body.state.meta.gameDay > 30) break;
    }
    const { body } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    expect(body.state.meta.gameDay).toBeGreaterThan(30);
    expect(body.state.kpis.monthlyRevenue).toBeGreaterThan(0);
  });

  it("storms damage the network; crews restore service", async () => {
    const { body } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    const co = body.state.sites.find((s) => s.kind === "co")!;
    expect(co.status).toBe("online");

    // Storm hit rolls are random; run drills until the office is damaged.
    let active: { id: string; status: string; crewAssigned: boolean } | undefined;
    for (let attempt = 0; attempt < 8; attempt++) {
      const storm = await cmd(gameId, { cmd: "stormExercise", severity: 3, x: co.x, y: co.y, radiusKm: 40 });
      expect(storm.ok).toBe(true);
      const afterStorm = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
      const coAfter = afterStorm.body.state.sites.find((s) => s.id === co.id)!;
      if (coAfter.status === "failed") {
        active = afterStorm.body.state.incidents.find(
          (i) => i.status === "active" && i.affectedSites.includes(co.id),
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 400)); // let the day advance so the RNG stream differs
    }
    expect(active).toBeDefined();
    const after = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    expect(after.body.state.sites.find((s) => s.id === co.id)!.status).toBe("failed");

    // Dispatch crews to every active incident (each drill/storm needs one).
    const activeList = after.body.state.incidents.filter((i) => i.status === "active");
    expect(activeList.length).toBeGreaterThan(0);
    for (const inc of activeList) {
      const dispatch = await cmd(gameId, { cmd: "dispatchCrew", incidentId: inc.id });
      expect(dispatch.ok).toBe(true);
    }

    // Wait for resolution.
    let resolved = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const { body } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
      if (body.state.incidents.every((x) => x.status === "resolved")) {
        resolved = true;
        break;
      }
    }
    expect(resolved).toBe(true);
    const { body: final } = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    expect(final.state.sites.find((s) => s.id === co.id)!.status).toBe("online");
  });

  it("save persists across a server restart", async () => {
    await cmd(gameId, { cmd: "setPaused", paused: true });
    const saveRes = await fetch(`${BASE}/api/games/${gameId}/save`, { method: "POST" });
    expect(saveRes.ok).toBe(true);

    const before = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    const dayBefore = before.body.state.meta.gameDay;
    const sitesBefore = before.body.state.sites.length;

    // Restart the server.
    server?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 800));
    server = spawn(process.execPath, ["dist/index.js"], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATABASE_URL: TEST_DB,
        HOST: "127.0.0.1",
        CLIENT_DIR: "/nonexistent",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitHealthy();

    const after = await fetchJson<LoadGameResponse>(`/api/games/${gameId}`);
    expect(after.body.state.meta.gameDay).toBe(dayBefore);
    expect(after.body.state.sites.length).toBe(sitesBefore);
    expect(after.body.state.finance.cash).toBe(before.body.state.finance.cash);
  });

  it("export / import round-trips a save", async () => {
    const exp = await fetch(`${BASE}/api/games/${gameId}/export`);
    expect(exp.ok).toBe(true);
    const snapshot = (await exp.json()) as GameSave;
    expect(snapshot.meta.name).toBe("Integration Test");
    expect(snapshot.version).toBeGreaterThanOrEqual(2);

    const imp = await fetchJson<{ game: { id: string; name: string; day: number } }>("/api/games/import", {
      method: "POST",
      body: JSON.stringify({ data: snapshot }),
    });
    expect(imp.status).toBe(201);
    expect(imp.body.game.day).toBe(snapshot.meta.gameDay);

    const list = await fetchJson<{ games: { id: string }[] }>("/api/games");
    expect(list.body.games.some((g) => g.id === imp.body.game.id)).toBe(true);

    // Clean up the imported copy.
    const del = await fetch(`${BASE}/api/games/${imp.body.game.id}`, { method: "DELETE" });
    expect(del.ok).toBe(true);
  });

  it("rejects invalid commands with a helpful error", async () => {
    const bad = await fetchJson<{ ok: boolean; error?: string }>(`/api/games/${gameId}/commands`, {
      method: "POST",
      body: JSON.stringify({ cmd: "startProject", type: "co", tier: 1 }),
    });
    expect(bad.status).toBe(400);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.error).toContain("town");
  });
});
