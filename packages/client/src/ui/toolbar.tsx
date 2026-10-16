/** Left build toolbar and floating build-preview card. */
import type { ReactNode } from "react";
import { useSnapshot, useStore, type Tool } from "../game/store.js";
import {
  IconBattery,
  IconBuilding,
  IconCabinet,
  IconFiber,
  IconGenerator,
  IconMicrowave,
  IconSolar,
  IconTower,
  IconUpgrade,
  IconWrench,
  IconX,
  IconEye,
} from "./icons.js";
import { fmtMoney } from "../game/format.js";

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: "select", label: "Inspect", icon: <IconEye /> },
  { id: "co", label: "Office", icon: <IconBuilding /> },
  { id: "cabinet", label: "Cabinet", icon: <IconCabinet /> },
  { id: "tower", label: "Tower", icon: <IconTower /> },
  { id: "fiber", label: "Fiber", icon: <IconFiber /> },
  { id: "microwave", label: "Radio link", icon: <IconMicrowave /> },
  { id: "battery", label: "Battery", icon: <IconBattery /> },
  { id: "generator", label: "Genset", icon: <IconGenerator /> },
  { id: "solar", label: "Solar", icon: <IconSolar /> },
  { id: "renovate", label: "Repair", icon: <IconWrench /> },
  { id: "upgrade", label: "Upgrade", icon: <IconUpgrade /> },
];

export function Toolbar(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const selectingLink = (snap.tool === "fiber" || snap.tool === "microwave") && !!snap.buildSource;
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`btn tool ${snap.tool === t.id ? "active" : ""}`}
            onClick={() => {
              store.setTool(snap.tool === t.id ? "select" : t.id);
            }}
            title={t.label}
            data-testid={`tool-${t.id}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {selectingLink && (
        <button className="btn small" onClick={() => store.setBuildSource(null)}>
          <IconX size={12} /> Cancel link
        </button>
      )}
    </div>
  );
}

export function BuildPreviewCard(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const p = snap.buildPreview;
  if (!p) return null;
  return (
    <div
      className="panel"
      data-testid="build-preview"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: "min(340px, calc(100vw - 24px))",
        zIndex: 46,
      }}
    >
      <div className="panel-head">
        <span className="panel-title">{p.title}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost icon" onClick={() => store.setBuildPreview(null)} aria-label="Close">
          <IconX />
        </button>
      </div>
      <div className="panel-body">
        {p.tierOptions.length > 1 && (
          <div className="range" style={{ marginBottom: 10 }}>
            <select
              value={p.tier}
              onChange={(e) => p.reestimate(Number(e.target.value))}
              style={{
                flex: 1,
                background: "var(--bg-0)",
                color: "var(--text-0)",
                border: "1px solid var(--line-strong)",
                borderRadius: 5,
                padding: "6px 8px",
              }}
              data-testid="tier-select"
            >
              {p.tierOptions.map((t) => (
                <option key={t.tier} value={t.tier}>
                  Tier {t.tier} — {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {p.loading ? (
          <div style={{ color: "var(--text-1)", fontSize: 13 }}>Estimating cost…</div>
        ) : p.error ? (
          <div style={{ color: "#ff9aa0", fontSize: 13 }}>{p.detail}</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "var(--text-1)" }}>Estimated cost</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {fmtMoney(p.cost)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 12 }}>
              <span style={{ color: "var(--text-1)" }}>Construction time</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {p.days} days
              </span>
            </div>
            <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 12 }}>{p.detail}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn primary"
                style={{ flex: 1 }}
                onClick={() => p.apply(p.tier)}
                data-testid="confirm-build"
              >
                Start construction
              </button>
              <button className="btn" onClick={() => store.setBuildPreview(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
