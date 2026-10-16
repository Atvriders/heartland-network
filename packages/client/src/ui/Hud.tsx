/** Top HUD: company, KPIs, time controls, panel buttons. */
import type { ReactNode } from "react";
import { useSnapshot, useStore, type PanelId } from "../game/store.js";
import { fmtDate, fmtInt, fmtMoney } from "../game/format.js";
import {
  IconAlert,
  IconChart,
  IconClock,
  IconHelp,
  IconLayers,
  IconMenu,
  IconPause,
  IconPlay,
  IconSave,
  IconSettings,
  IconUsers,
} from "./icons.js";
import { useState } from "react";

const SPEEDS = [1, 2, 5, 15] as const;

export function Hud(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const state = snap.state;
  const [layersOpen, setLayersOpen] = useState(false);
  if (!state) return null;
  const k = state.kpis;
  const paused = state.meta.paused;
  const activeIncidents = k.incidentActive;

  const openPanel = (p: PanelId) => store.setPanel(snap.panel === p ? null : p);

  return (
    <div className="hud" data-testid="hud">
      <div className="brand">
        HEARTLAND<span className="accent">NET</span>
      </div>
      <div className="hud-group hide-sm">
        <div className="stat">
          <span className="label">Company</span>
          <span className="value" style={{ fontSize: 13 }}>
            {state.meta.name}
          </span>
        </div>
      </div>
      <div className="hud-group hide-sm">
        <div className="stat">
          <span className="label">Date</span>
          <span className="value num" data-testid="hud-day">
            {fmtDate(state.meta.gameDay)} · D{state.meta.gameDay}
          </span>
        </div>
      </div>
      <div className="hud-group hide-sm">
        <div className="stat">
          <span className="label">Cash</span>
          <span
            className="value num"
            style={{ color: k.cash < 0 ? "#ff9aa0" : "#6eeaa0" }}
            data-testid="hud-cash"
          >
            {fmtMoney(k.cash)}
          </span>
        </div>
        <div className="stat">
          <span className="label">Net / mo</span>
          <span className="value num" style={{ color: k.monthlyNet < 0 ? "#ff9aa0" : undefined }}>
            {fmtMoney(k.monthlyNet)}
          </span>
        </div>
        <div className="stat">
          <span className="label">Subs</span>
          <span className="value num">{fmtInt(k.subs)}</span>
        </div>
        <div className="stat">
          <span className="label">Satisfaction</span>
          <span className="value num">{k.satisfaction}%</span>
        </div>
      </div>

      <div className="hud-group">
        <button
          className={`btn icon ${paused ? "primary" : ""}`}
          onClick={() => void store.send({ cmd: "setPaused", paused: !paused })}
          title={paused ? "Resume (Space)" : "Pause (Space)"}
          data-testid="pause-button"
        >
          {paused ? <IconPlay /> : <IconPause />}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn speed-btn ${state.meta.speed === s && !paused ? "active" : ""}`}
            onClick={() => {
              void store.send({ cmd: "setPaused", paused: false });
              void store.send({ cmd: "setSpeed", speed: s });
            }}
            data-testid={`speed-${s}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="hud-group">
        <button className="btn icon" onClick={() => void store.saveNow()} title="Save game">
          <IconSave />
        </button>
        <button
          className="btn icon"
          onClick={() => openPanel("incidents")}
          title="Incidents"
          data-testid="open-incidents"
        >
          <IconAlert />
          {activeIncidents > 0 && (
            <span className="badge crit" style={{ marginLeft: -4 }}>
              {activeIncidents}
            </span>
          )}
        </button>
      </div>

      <div className="hud-group hide-sm">
        <button
          className={`btn ${snap.panel === "finance" ? "primary" : ""}`}
          onClick={() => openPanel("finance")}
          data-testid="open-finance"
        >
          <IconChart /> Finances
        </button>
        <button
          className={`btn ${snap.panel === "customers" ? "primary" : ""}`}
          onClick={() => openPanel("customers")}
        >
          <IconUsers /> Customers
        </button>
        <button
          className={`btn ${snap.panel === "network" ? "primary" : ""}`}
          onClick={() => openPanel("network")}
        >
          <IconClock /> Network
        </button>
        <button
          className={`btn ${snap.panel === "research" ? "primary" : ""}`}
          onClick={() => openPanel("research")}
        >
          <IconSettings /> Research
        </button>
        <button
          className={`btn ${snap.panel === "admin" ? "primary" : ""}`}
          onClick={() => openPanel("admin")}
        >
          <IconMenu /> Admin
        </button>
      </div>

      <div className="spacer" />

      <div style={{ position: "relative" }}>
        <button
          className="btn icon"
          onClick={() => setLayersOpen(!layersOpen)}
          title="Map layers"
          data-testid="layers-button"
        >
          <IconLayers />
        </button>
        {layersOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setLayersOpen(false)} />
            <div className="context-menu" style={{ top: 44, right: 8, left: "auto" }}>
              {(
                [
                  ["terrain", "Terrain"],
                  ["roads", "Roads"],
                  ["coverage", "Coverage circles"],
                  ["traffic", "Traffic animation"],
                  ["incidents", "Storm regions"],
                  ["competitors", "Competitor footprint"],
                  ["labels", "Labels"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "6px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={snap.layers[key]}
                    onChange={(e) => store.setLayers({ [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        className="btn icon"
        onClick={() => store.confirm("How to play", helpText, () => undefined, { confirmLabel: "Close" })}
        title="Help"
        data-testid="help-button"
      >
        <IconHelp />
      </button>
    </div>
  );
}

const helpText = `
Build a statewide broadband network across the fictional state of Meridian.

• BUILD: choose a tool on the left and click the map. Offices go in towns, cabinets in districts (zoom in), towers anywhere with good line of sight.
• CONNECT: fiber follows roads between sites; microwave links connect towers with line of sight.
• GROW: served districts gain subscribers automatically. Watch capacity — congested links slow customers down and hurt satisfaction.
• POWER: grid outages and storms will strike. Add battery banks and generators; remote towers get a genset automatically.
• FAILURES: equipment breaks. Dispatch repair crews from the Incidents panel — or run storm drills from the map context menu to practice.
• MONEY: track the Finances panel. Issue bonds to fund expansion. Watch monthly net, not just cash.
• COMPETE: rivals hold market share in many towns. Better price/speed/satisfaction wins customers back.
• RESEARCH: unlock better fiber, radios, batteries and operations perks.
• KEYS: Space = pause · 1/2/3/4 = speed · Esc = cancel tool · +/− = zoom · drag or pinch to pan.
`;
