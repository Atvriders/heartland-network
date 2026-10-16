/** Heartland Network server bootstrap. */
import express from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { createPool, migrate, ping } from "./db/pool.js";
import { GameStore } from "./state/gameStore.js";
import { buildRoutes } from "./api/routes.js";
import { attachWs } from "./api/ws.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  // Verify DB connectivity with retries (Postgres may start after the app).
  let connected = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    connected = await ping(pool);
    if (connected) break;
    console.log(`[heartland] Waiting for database (attempt ${attempt}/10)...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!connected) {
    console.error("[heartland] FATAL: could not connect to PostgreSQL.");
    process.exit(1);
  }

  const schemaVersion = await migrate(pool);
  console.log(`[heartland] Database ready (schema v${schemaVersion}).`);

  const store = new GameStore(pool, { tickMs: config.tickMs, maxGames: config.maxGames });
  store.start();

  const app = express();
  app.use(express.json({ limit: "16mb" }));
  app.use(buildRoutes(store, { version: config.version, adminToken: config.adminToken }, pool));

  // Serve the built web client (single image deployment).
  const clientDir = config.clientDirCandidates.find((p) => fs.existsSync(path.join(p, "index.html")));
  if (clientDir) {
    console.log(`[heartland] Serving web client from ${clientDir}`);
    app.use(express.static(clientDir, { maxAge: "1h", index: "index.html" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .type("text/plain")
        .send("Heartland Network server running. The web client build was not found — run `npm run build`.");
    });
  }

  const server = http.createServer(app);
  attachWs(server, store);
  server.on("error", (e) => {
    console.error(`[heartland] Server error: ${(e as Error).message}`);
    process.exit(1);
  });

  server.listen(config.port, config.host, () => {
    console.log(
      `[heartland] Heartland Network v${config.version} listening on http://${config.host}:${config.port}`,
    );
  });

  const shutdown = async (signal: string) => {
    console.log(`[heartland] ${signal} received — saving and shutting down.`);
    await store.shutdown();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[heartland] Fatal error:", e);
  process.exit(1);
});
