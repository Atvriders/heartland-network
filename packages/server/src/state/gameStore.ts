/**
 * In-memory game registry: loads saves from Postgres, ticks the simulation,
 * persists on autosave/manual save, and broadcasts state to WebSocket clients.
 */
import type { GameEvent, GameSave, LiveState } from "@heartland/shared";
import type { Pool } from "../db/pool.js";
import { CURRENT_SAVE_VERSION, migrateSave, cloneSave } from "../save/migrations.js";
import { GameEngine } from "../sim/engine.js";
import { applyCommand, planLink, planSiteProject, planImprovement } from "../sim/commands.js";
import { deriveLiveState } from "../sim/derive.js";
import { createNewGame } from "../sim/newgame.js";
import { initResearch, refreshResearchState } from "../sim/research.js";
import type { Command, CommandResult } from "@heartland/shared";
import type { WebSocket } from "ws";
import { shortId } from "../util/ids.js";
import type { PlanResult } from "../sim/commands.js";

export interface LoadedGame {
  id: string;
  save: GameSave;
  engine: GameEngine;
  clients: Set<WebSocket>;
  dirty: boolean;
  daysSinceSave: number;
  lastSavedDay: number;
  lastBroadcastAt: number;
  lastState: LiveState | null;
}

export class GameStore {
  private games = new Map<string, LoadedGame>();
  private tickMs: number;
  private maxGames: number;
  private timer: NodeJS.Timeout | null = null;
  readonly pool: Pool;

  constructor(pool: Pool, opts: { tickMs: number; maxGames: number }) {
    this.pool = pool;
    this.tickMs = opts.tickMs;
    this.maxGames = opts.maxGames;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.loop(), this.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Persist all dirty games (graceful shutdown). */
  async shutdown(): Promise<void> {
    this.stop();
    for (const game of this.games.values()) {
      if (game.dirty) {
        try {
          await this.persist(game);
        } catch (e) {
          console.error("[heartland] shutdown save failed:", e);
        }
      }
    }
  }

  async list(): Promise<
    {
      id: string;
      name: string;
      day: number;
      version: number;
      createdAt: string;
      updatedAt: string;
      cash: number;
      subs: number;
    }[]
  > {
    const res = await this.pool.query<{
      id: string;
      name: string;
      save_version: number;
      created_at: string;
      updated_at: string;
      data: GameSave;
    }>("SELECT id, name, save_version, created_at, updated_at, data FROM games ORDER BY created_at");
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      day: r.data?.meta?.gameDay ?? 0,
      version: r.save_version,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
      cash: Math.round(r.data?.finance?.cash ?? 0),
      subs: countSubs(r.data),
    }));
  }

  async create(opts: {
    name?: string;
    seed?: number;
    difficulty?: "easy" | "normal" | "hard";
  }): Promise<LoadedGame> {
    if (this.games.size >= this.maxGames) throw new Error("Maximum number of games reached.");
    const save = createNewGame(opts, CURRENT_SAVE_VERSION);
    save.research = initResearch();
    const id = shortId("game");
    const loaded = this.register(id, save);
    loaded.dirty = true;
    await this.persist(loaded);
    return loaded;
  }

  register(id: string, save: GameSave): LoadedGame {
    refreshResearchState(save);
    const engine = new GameEngine(save);
    const loaded: LoadedGame = {
      id,
      save,
      engine,
      clients: new Set(),
      dirty: false,
      daysSinceSave: 0,
      lastSavedDay: save.meta.gameDay,
      lastBroadcastAt: 0,
      lastState: null,
    };
    this.games.set(id, loaded);
    return loaded;
  }

  /** Load a game from the database into memory. */
  async load(id: string): Promise<LoadedGame> {
    const existing = this.games.get(id);
    if (existing) return existing;
    const res = await this.pool.query<{ id: string; data: GameSave; save_version: number }>(
      "SELECT id, data, save_version FROM games WHERE id = $1",
      [id],
    );
    const row = res.rows[0];
    if (!row) throw new Error("Game not found.");
    const migrated = migrateSave(row.data);
    const loaded = this.register(id, migrated);
    if (migrated.version !== row.save_version) {
      loaded.dirty = true;
      await this.persist(loaded);
    }
    return loaded;
  }

  get(id: string): LoadedGame | undefined {
    return this.games.get(id);
  }

  /** Import a save (from export JSON). */
  async importSave(data: unknown): Promise<LoadedGame> {
    if (this.games.size >= this.maxGames) throw new Error("Maximum number of games reached.");
    const migrated = migrateSave(data);
    const id = shortId("game");
    const loaded = this.register(id, migrated);
    loaded.dirty = true;
    await this.persist(loaded);
    return loaded;
  }

  async persist(game: LoadedGame): Promise<void> {
    const data = cloneSave(game.save);
    await this.pool.query(
      `INSERT INTO games (id, slot, name, save_version, data, created_at, updated_at, last_saved_day)
       VALUES ($1, NULL, $2, $3, $4::jsonb, now(), now(), $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         save_version = EXCLUDED.save_version,
         data = EXCLUDED.data,
         updated_at = now(),
         last_saved_day = EXCLUDED.last_saved_day`,
      [game.id, data.meta.name, data.version, JSON.stringify(data), data.meta.gameDay],
    );
    game.dirty = false;
    game.lastSavedDay = data.meta.gameDay;
  }

  async deleteGame(id: string): Promise<void> {
    this.games.delete(id);
    await this.pool.query("DELETE FROM games WHERE id = $1", [id]);
  }

  async exportGame(id: string): Promise<GameSave> {
    const game = await this.load(id);
    return cloneSave(game.save);
  }

  /** Apply a player command to a loaded game. */
  async command(id: string, cmd: Command): Promise<CommandResult> {
    const game = await this.load(id);
    const result = applyCommand(game.save, game.engine, cmd);
    if (result.ok) game.dirty = true;
    return result;
  }

  /** Estimate a project without applying it (for client cost previews). */
  async estimate(id: string, args: Extract<Command, { cmd: "startProject" }>): Promise<PlanResult> {
    const game = await this.load(id);
    const save = game.save;
    const type = args.type;
    if (type === "co" || type === "tower" || type === "cabinet") {
      return planSiteProject(save, type, args.tier, {
        x: args.x,
        y: args.y,
        townId: args.townId,
        districtId: args.districtId,
        name: args.name,
      });
    }
    if (type === "fiber" || type === "microwave") {
      if (!args.fromSiteId || !args.toSiteId) return { ok: false, error: "A link needs both endpoints." };
      return planLink(save, type, args.tier, args.fromSiteId, args.toSiteId);
    }
    if (!args.siteId) return { ok: false, error: "Choose a site." };
    return planImprovement(save, type, args.tier, args.siteId);
  }

  attachClient(gameId: string, ws: WebSocket): void {
    const game = this.games.get(gameId);
    if (!game) throw new Error("Game not found.");
    game.clients.add(ws);
  }

  detachClient(gameId: string, ws: WebSocket): void {
    this.games.get(gameId)?.clients.delete(ws);
  }

  private loop(): void {
    for (const game of this.games.values()) {
      try {
        this.tickGame(game);
      } catch (e) {
        // A bug in one game's tick must never take down the whole server.
        console.error("[heartland] tick failed:", e);
      }
    }
  }

  private tickGame(game: LoadedGame): void {
    if (game.save.meta.paused || game.save.meta.gameOver) return;
    // 1x = 1 game-day per interval; faster speeds simulate multiple days.
    const ticks = Math.min(15, Math.max(1, game.save.meta.speed));
    const pendingEvents: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      if (game.save.meta.paused) break;
      const events = game.engine.tick();
      if (pendingEvents.length < 6) pendingEvents.push(...events);
      game.dirty = true;
      game.daysSinceSave++;
      if (game.daysSinceSave >= game.save.settings.autosaveDays) {
        game.daysSinceSave = 0;
        void this.persist(game).catch((e) => console.error("autosave failed", e));
      }
    }
    if (pendingEvents.length > 0) {
      for (const ws of game.clients) {
        if (ws.readyState === ws.OPEN) {
          for (const ev of pendingEvents.slice(0, 6)) {
            this.safeSend(ws, JSON.stringify({ type: "event", event: ev }));
          }
        }
      }
    }
    this.broadcast(game);
  }

  broadcast(game: LoadedGame): void {
    if (game.clients.size === 0) {
      game.lastState = null;
      return;
    }
    const state = deriveLiveState(game.save, game.id);
    game.lastState = state;
    const payload = JSON.stringify({ type: "state", state });
    for (const ws of game.clients) {
      if (ws.readyState === ws.OPEN) this.safeSend(ws, payload);
    }
  }

  pushEvent(gameId: string, event: GameEvent): void {
    const game = this.games.get(gameId);
    if (!game) return;
    const payload = JSON.stringify({ type: "event", event });
    for (const ws of game.clients) {
      if (ws.readyState === ws.OPEN) this.safeSend(ws, payload);
    }
  }

  notifySaved(gameId: string, day: number): void {
    const game = this.games.get(gameId);
    if (!game) return;
    const payload = JSON.stringify({ type: "saved", day });
    for (const ws of game.clients) {
      if (ws.readyState === ws.OPEN) this.safeSend(ws, payload);
    }
  }

  /** Send the current state immediately (used after commands). */
  sendStateNow(game: LoadedGame): void {
    this.broadcast(game);
  }

  private safeSend(ws: WebSocket, payload: string): void {
    try {
      ws.send(payload);
    } catch {
      // client vanished; ignore
    }
  }
}

function countSubs(data: GameSave): number {
  let n = 0;
  for (const dm of Object.values(data?.districtsMarket ?? {})) {
    n += dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
  }
  return n;
}
