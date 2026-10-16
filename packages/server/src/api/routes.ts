/** REST API routes. */
import { Router } from "express";
import type { GameSave } from "@heartland/shared";
import { CURRENT_SAVE_VERSION } from "../save/migrations.js";
import { ping, schemaVersion, type Pool } from "../db/pool.js";
import type { GameStore } from "../state/gameStore.js";
import { deriveLiveState } from "../sim/derive.js";
import type { Command } from "@heartland/shared";

export function buildRoutes(
  store: GameStore,
  opts: { version: string; adminToken: string | null },
  pool: Pool,
): Router {
  const router = Router();

  const requireAdmin = (req: { headers: Record<string, string | undefined> }): boolean => {
    if (!opts.adminToken) return true;
    return req.headers["x-admin-token"] === opts.adminToken;
  };

  router.get("/api/health", async (_req, res) => {
    const dbOk = await ping(pool).catch(() => false);
    const sv = await schemaVersion(pool).catch(() => -1);
    res.json({
      ok: dbOk && sv >= 0,
      service: "heartland-network",
      version: opts.version,
      db: dbOk ? "connected" : "error",
      schemaVersion: sv,
      uptimeS: Math.round(process.uptime()),
    });
  });

  router.get("/api/meta", (_req, res) => {
    res.json({
      service: "heartland-network",
      version: opts.version,
      currentSaveVersion: CURRENT_SAVE_VERSION,
      features: [
        "statewide-map",
        "fiber",
        "fixed-wireless",
        "los",
        "power-backup",
        "failures",
        "research",
        "competition",
        "finance",
        "save-migration",
        "admin",
      ],
    });
  });

  router.get("/api/games", async (_req, res) => {
    try {
      const games = await store.list();
      res.json({ games });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  router.post("/api/games", async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        name?: string;
        seed?: number;
        difficulty?: "easy" | "normal" | "hard";
      };
      if (body.difficulty !== undefined && !["easy", "normal", "hard"].includes(body.difficulty)) {
        return res.status(400).json({ error: "Invalid difficulty." });
      }
      const game = await store.create({
        name: body.name,
        seed: body.seed !== undefined ? Math.floor(body.seed) : undefined,
        difficulty: body.difficulty,
      });
      const state = deriveLiveState(game.save, game.id);
      res.status(201).json({
        game: {
          id: game.id,
          name: game.save.meta.name,
          day: game.save.meta.gameDay,
          version: game.save.version,
          createdAt: game.save.meta.createdAt,
          updatedAt: game.save.meta.createdAt,
          cash: Math.round(game.save.finance.cash),
          subs: 0,
        },
        state,
        staticMap: game.save.map,
      });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get("/api/games/:id", async (req, res) => {
    try {
      const game = await store.load(req.params.id as string);
      const state = deriveLiveState(game.save, game.id);
      res.json({ state, staticMap: game.save.map });
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  router.post("/api/games/:id/commands", async (req, res) => {
    try {
      const game = await store.load(req.params.id as string);
      const result = await store.command(game.id, req.body as Command);
      if (!result.ok) return res.status(400).json(result);
      // Persist important state changes immediately.
      if (game.dirty) {
        await store.persist(game).catch(() => undefined);
        game.dirty = false;
      }
      store.sendStateNow(game);
      return res.json(result);
    } catch (e) {
      return res.status(400).json({ ok: false, error: (e as Error).message, events: [] });
    }
  });

  router.post("/api/games/:id/estimate", async (req, res) => {
    try {
      const result = await store.estimate(
        req.params.id as string,
        req.body as Extract<Command, { cmd: "startProject" }>,
      );
      res.json(result);
    } catch (e) {
      res.status(400).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post("/api/games/:id/save", async (req, res) => {
    try {
      const game = await store.load(req.params.id as string);
      await store.persist(game);
      store.notifySaved(game.id, game.save.meta.gameDay);
      res.json({ ok: true, day: game.save.meta.gameDay });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  router.get("/api/games/:id/export", async (req, res) => {
    try {
      const snapshot = await store.exportGame(req.params.id as string);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="heartland-${req.params.id}.json"`);
      res.send(JSON.stringify(snapshot, null, 2));
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  router.post("/api/games/import", async (req, res) => {
    try {
      if (!requireAdmin(req as never)) return res.status(401).json({ error: "Admin token required." });
      const data = (req.body ?? {}) as { name?: string; data?: unknown } | GameSave;
      const payload = (data as { data?: unknown }).data ?? data;
      const game = await store.importSave(payload);
      res.status(201).json({ game: { id: game.id, name: game.save.meta.name, day: game.save.meta.gameDay } });
    } catch (e) {
      res.status(400).json({ error: `Import failed: ${(e as Error).message}` });
    }
  });

  router.delete("/api/games/:id", async (req, res) => {
    try {
      if (!requireAdmin(req as never)) return res.status(401).json({ error: "Admin token required." });
      await store.deleteGame(req.params.id as string);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  return router;
}
