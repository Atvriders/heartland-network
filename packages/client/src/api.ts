/** Client API: game loading, commands, WebSocket. */
import { API, apiFetch, sendCommand } from "@heartland/shared";
import type {
  Command,
  CreateGameResponse,
  GameSummary,
  HealthResponse,
  ListGamesResponse,
  LiveState,
  LoadGameResponse,
  MapData,
  ServerMessage,
} from "@heartland/shared";

export async function health(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>(API.health);
}

export async function listGames(): Promise<GameSummary[]> {
  const res = await apiFetch<ListGamesResponse>(API.games);
  return res.games;
}

export async function createGame(opts: {
  name?: string;
  seed?: number;
  difficulty?: "easy" | "normal" | "hard";
}): Promise<CreateGameResponse> {
  return apiFetch<CreateGameResponse>(API.games, { method: "POST", body: JSON.stringify(opts) });
}

export async function loadGame(id: string): Promise<LoadGameResponse> {
  return apiFetch<LoadGameResponse>(API.game(id));
}

export async function saveGame(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(API.save(id), { method: "POST" });
}

export async function exportGame(id: string): Promise<string> {
  const res = await fetch(API.export(id));
  if (!res.ok) throw new Error("Export failed.");
  return res.text();
}

export async function importGame(
  data: unknown,
): Promise<{ game: { id: string; name: string; day: number } }> {
  return apiFetch<{ game: { id: string; name: string; day: number } }>(API.import, {
    method: "POST",
    body: JSON.stringify({ data }),
  });
}

export async function deleteGame(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(API.game(id), { method: "DELETE" });
}

export async function command(id: string, cmd: Command) {
  return sendCommand(id, cmd);
}

export function openSocket(
  gameId: string,
  handlers: {
    onState: (s: LiveState) => void;
    onEvent: (m: Extract<ServerMessage, { type: "event" }>) => void;
    onSaved: (day: number) => void;
    onClose: () => void;
  },
): { close: () => void } {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let closed = false;
  let ws: WebSocket | null = null;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${proto}://${location.host}${API.ws(gameId)}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.type === "state") handlers.onState(msg.state);
      else if (msg.type === "event") handlers.onEvent(msg);
      else if (msg.type === "saved") handlers.onSaved(msg.day);
    };
    ws.onclose = () => {
      handlers.onClose();
      if (!closed) {
        retry = Math.min(8, retry + 1);
        setTimeout(connect, 800 * retry);
      }
    };
    ws.onerror = () => ws?.close();
  };
  connect();

  return {
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}

export type { MapData, LiveState };
