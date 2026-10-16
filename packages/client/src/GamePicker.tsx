/** Game picker / new-game screen. */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createGame, deleteGame, health, listGames } from "./api.js";
import type { GameSummary } from "@heartland/shared";
import { fmtInt } from "./game/format.js";
import { IconTrash } from "./ui/icons.js";

export function GamePicker({ onPlay }: { onPlay: (id: string) => void }): ReactNode {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [name, setName] = useState("Meridian County Network");
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthInfo, setHealthInfo] = useState<{ db?: string } | null>(null);

  const refresh = () =>
    void listGames()
      .then(setGames)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
    void health()
      .then(setHealthInfo)
      .catch(() => undefined);
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createGame({
        name,
        difficulty,
        seed: seed.trim() === "" ? undefined : Number(seed),
      });
      onPlay(res.game.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(1200px 700px at 50% 20%, #0d1a2e 0%, #060a13 70%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
      }}
    >
      <div style={{ width: "min(560px, calc(100vw - 32px))", padding: "24px 0" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "0.08em" }}>
            HEARTLAND<span style={{ color: "var(--accent)" }}>NET</span>
          </div>
          <div style={{ color: "var(--text-1)", fontSize: 14, marginTop: 4 }}>
            Build a statewide broadband network. Survive the storms.
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 12, marginTop: 8 }}>
            Self-hosted · single player · no account required
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">New network</span>
            {healthInfo && (
              <span className="badge" style={{ marginLeft: "auto" }}>
                <span
                  className={healthInfo.db === "connected" ? "badge ok" : "badge crit"}
                  style={{ padding: 0 }}
                >
                  {healthInfo.db === "connected" ? "● DB connected" : "● DB offline"}
                </span>
              </span>
            )}
          </div>
          <div className="panel-body">
            <div className="field">
              <label>Company name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                data-testid="new-game-name"
              />
            </div>
            <div className="field">
              <label>Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                data-testid="new-game-difficulty"
              >
                <option value="easy">Easy — more cash, fewer storms</option>
                <option value="normal">Normal — the intended experience</option>
                <option value="hard">Hard — tight cash, harsh weather</option>
              </select>
            </div>
            <div className="field">
              <label>Map seed (optional — same seed, same state)</label>
              <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 42" />
            </div>
            {error && <div style={{ color: "#ff9aa0", fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <button
              className="btn primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={busy}
              onClick={() => void create()}
              data-testid="create-game"
            >
              {busy ? "Creating…" : "Found the network"}
            </button>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="panel-head">
            <span className="panel-title">Saved games</span>
          </div>
          <div className="panel-body" style={{ padding: 6 }}>
            {games.length === 0 ? (
              <div style={{ padding: 12, color: "var(--text-2)", fontSize: 13 }}>No saved games yet.</div>
            ) : (
              <table className="table" data-testid="game-list">
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => onPlay(g.id)}>
                      <td>
                        <b>{g.name}</b>
                        <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                          Day {g.day} · {fmtInt(g.subs)} subs · v{g.version}
                        </div>
                      </td>
                      <td className="right">
                        <button
                          className="btn ghost icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${g.name}"? This cannot be undone.`)) {
                              void deleteGame(g.id).then(refresh);
                            }
                          }}
                          aria-label="Delete game"
                        >
                          <IconTrash size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
