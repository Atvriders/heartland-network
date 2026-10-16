/** Reusable UI components. */
import type { ReactNode } from "react";
import { useSnapshot, useStore } from "../game/store.js";
import { IconX } from "./icons.js";

export function DialogShell(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const d = snap.dialog;
  if (!d) return null;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) store.setDialog(null);
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true">
        <div className="dialog-head">
          <span>{d.title}</span>
          <button className="btn ghost icon" onClick={() => store.setDialog(null)} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="dialog-body">{d.body}</div>
        <div className="dialog-foot">
          <button className="btn" onClick={() => store.setDialog(null)}>
            Cancel
          </button>
          <button
            className={`btn ${d.danger ? "danger" : "primary"}`}
            onClick={() => {
              store.setDialog(null);
              d.onConfirm();
            }}
          >
            {d.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onSelect: (t: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${t.id === active ? "active" : ""}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({
  value,
  max,
  cls,
  title,
}: {
  value: number;
  max: number;
  cls: string;
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress" title={title}>
      <span className={cls} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({
  cls,
  children,
}: {
  cls: "ok" | "warn" | "crit" | "info" | "dim" | "purple";
  children: ReactNode;
}) {
  return <span className={`badge ${cls}`}>{children}</span>;
}

export function Kpi({
  label,
  value,
  sub,
  valueCls,
}: {
  label: string;
  value: string;
  sub?: string;
  valueCls?: string;
}) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className={`value num ${valueCls ?? ""}`}>{value}</span>
      {sub ? <span className="sub">{sub}</span> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      className="row-toggle"
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

/** Overlays rendered once at the app root. */
export function Overlays(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  return (
    <>
      <DialogShell />
      {snap.toasts.length > 0 && (
        <div className="toasts">
          {snap.toasts.map((t) => (
            <div key={t.id} className={`toast ${t.severity}`}>
              <span className="day">Day {t.day}</span>
              {t.message}
            </div>
          ))}
        </div>
      )}
      {snap.contextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 105 }}
            onMouseDown={() => store.setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              store.setContextMenu(null);
            }}
          />
          <div className="context-menu" style={{ left: snap.contextMenu.x, top: snap.contextMenu.y }}>
            {snap.contextMenu.items.map((it, i) =>
              it.label === "---" ? (
                <div key={i} className="sep" />
              ) : (
                <button
                  key={i}
                  className={it.danger ? "danger" : ""}
                  disabled={it.disabled}
                  onClick={() => {
                    store.setContextMenu(null);
                    it.onClick();
                  }}
                >
                  {it.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
      {snap.tooltip && (
        <div className="tooltip" style={{ left: snap.tooltip.x + 12, top: snap.tooltip.y + 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>{snap.tooltip.title}</div>
          {snap.tooltip.lines.map((l, i) => (
            <div key={i} style={{ opacity: 0.85 }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
