/** Admin panel: save management, settings, import/export, health. */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSnapshot, useStore } from "../../game/store.js";
import { Toggle } from "../components.js";
import { deleteGame, exportGame, health, importGame, listGames } from "../../api.js";
import { fmtInt } from "../../game/format.js";
import { IconDownload, IconSave, IconSettings, IconStorm, IconTrash, IconUpload } from "../icons.js";

export function AdminPanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const state = snap.state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [healthInfo, setHealthInfo] = useState<{ db?: string; schemaVersion?: number; version?: string }>({});
  const [games, setGames] = useState<{ id: string; name: string; day: number; subs: number }[]>([]);

  const refreshGames = () => {
    void listGames()
      .then(setGames)
      .catch(() => undefined);
  };

  useEffect(() => {
    void health()
      .then((h) => setHealthInfo({ db: h.db, schemaVersion: h.schemaVersion, version: h.version }))
      .catch(() => undefined);
    refreshGames();
  }, []);

  if (!state) return null;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={() => void store.saveNow()} data-testid="save-button">
          <IconSave /> Save now
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              const text = await exportGame(store.gameId);
              const blob = new Blob([text], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `heartland-save-${store.gameId}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (e) {
              store.toast("critical", `Export failed: ${(e as Error).message}`, 0);
            }
          }}
          data-testid="export-button"
        >
          <IconDownload /> Export save
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <IconUpload /> Import save
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const data = JSON.parse(await f.text());
              const res = await importGame(data);
              store.toast("info", `Imported as "${res.game.name}" — reload to play it.`, 0);
              refreshGames();
            } catch (err) {
              store.toast("critical", `Import failed: ${(err as Error).message}`, 0);
            }
          }}
        />
        <button
          className="btn danger"
          onClick={() =>
            store.confirm(
              "Delete this game?",
              "The save is permanently removed from the database.",
              async () => {
                await deleteGame(store.gameId);
                location.href = "/";
              },
              { danger: true, confirmLabel: "Delete game" },
            )
          }
        >
          <IconTrash /> Delete game
        </button>
      </div>

      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          margin: "10px 0 8px",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <IconSettings size={15} /> Simulation settings
      </div>
      <div className="field">
        <label>Autosave interval (days)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={state.settings.autosaveDays}
          onChange={(e) =>
            void store.send(
              { cmd: "setSetting", key: "autosaveDays", value: Number(e.target.value) },
              { silent: true },
            )
          }
        />
      </div>
      <Toggle
        checked={state.settings.ambientStorms}
        onChange={(v) => void store.send({ cmd: "setSetting", key: "ambientStorms", value: v })}
        label="Ambient storms"
      />
      <Toggle
        checked={state.settings.equipmentFailures}
        onChange={(v) => void store.send({ cmd: "setSetting", key: "equipmentFailures", value: v })}
        label="Equipment failures"
      />
      <Toggle
        checked={state.settings.alertsEnabled}
        onChange={(v) => void store.send({ cmd: "setSetting", key: "alertsEnabled", value: v })}
        label="Alert toasts"
      />

      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          margin: "12px 0 8px",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <IconStorm size={15} /> Training
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-1)", marginBottom: 6 }}>
        Run a storm drill from the map context menu (right-click empty ground) to test resilience, or start
        one at a random location:
      </div>
      <button
        className="btn small warn"
        onClick={() => {
          const m = snap.staticMap;
          const x = Math.round(80 + Math.random() * (m ? m.widthKm - 160 : 600));
          const y = Math.round(80 + Math.random() * (m ? m.heightKm - 160 : 400));
          void store.send({ cmd: "stormExercise", severity: 2, x, y, radiusKm: 55 });
        }}
      >
        <IconStorm /> Random storm drill
      </button>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "12px 0 8px" }}>Server</div>
      <div className="ins-row">
        <span className="k">Version</span>
        <span className="v">{healthInfo.version ?? "—"}</span>
      </div>
      <div className="ins-row">
        <span className="k">Database</span>
        <span className="v">{healthInfo.db ?? "…"}</span>
      </div>
      <div className="ins-row">
        <span className="k">Schema version</span>
        <span className="v">{healthInfo.schemaVersion ?? "—"}</span>
      </div>
      <div className="ins-row">
        <span className="k">Game id</span>
        <span className="v" style={{ fontSize: 11 }}>
          {store.gameId}
        </span>
      </div>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "12px 0 8px" }}>All games</div>
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="right">Day</th>
            <th className="right">Subs</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.id}>
              <td>{g.id === store.gameId ? <b>{g.name}</b> : g.name}</td>
              <td className="right num">{g.day}</td>
              <td className="right num">{fmtInt(g.subs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
