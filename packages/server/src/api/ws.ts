/** WebSocket endpoint: live state push for a game. */
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { GameStore } from "../state/gameStore.js";
import { deriveLiveState } from "../sim/derive.js";

export function attachWs(http: HttpServer, store: GameStore): void {
  const wss = new WebSocketServer({ noServer: true, path: "/api/ws" });

  http.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }
    const gameId = url.searchParams.get("game") ?? "";
    wss.handleUpgrade(req, socket, head, (ws) => {
      void onConnection(ws, gameId, store);
    });
  });
}

async function onConnection(ws: WebSocket, gameId: string, store: GameStore): Promise<void> {
  try {
    const game = await store.load(gameId);
    store.attachClient(gameId, ws);
    ws.send(JSON.stringify({ type: "welcome", gameId, day: game.save.meta.gameDay }));
    // Send an immediate state snapshot.
    const state = deriveLiveState(game.save, game.id);
    ws.send(JSON.stringify({ type: "state", state }));
    ws.on("close", () => store.detachClient(gameId, ws));
    ws.on("error", () => store.detachClient(gameId, ws));
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Game not found." }));
    ws.close();
  }
}
