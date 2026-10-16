/** Incidents panel: active and recent incidents with dispatch actions. */
import type { ReactNode } from "react";
import { useSnapshot, useStore } from "../../game/store.js";
import { Badge } from "../components.js";
import { fmtInt } from "../../game/format.js";
import { IconAlert, IconFuel, IconWrench } from "../icons.js";

export function IncidentsPanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const incidents = snap.state?.incidents ?? [];
  const active = incidents.filter((i) => i.status === "active");
  const recent = incidents
    .filter((i) => i.status === "resolved")
    .slice(-15)
    .reverse();
  return (
    <div style={{ padding: 12 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 8,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <IconAlert size={15} /> Active incidents ({active.length})
      </div>
      {active.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 12 }}>
          Network is calm. Storms will come.
        </div>
      ) : (
        active.map((inc) => (
          <div
            key={inc.id}
            className="card"
            style={{ marginBottom: 8, borderColor: "rgba(255,95,102,0.4)" }}
            data-testid={`incident-card-${inc.id}`}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{inc.name}</div>
              <Badge cls="crit">Sev {inc.severity}</Badge>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-1)", margin: "4px 0" }}>
              Day {inc.day} · {inc.affectedSites.length} sites · {inc.affectedLinks.length} links ·{" "}
              {fmtInt(inc.affectedCustomers)} customers
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                className="btn small"
                disabled={inc.crewAssigned}
                onClick={() => void store.send({ cmd: "dispatchCrew", incidentId: inc.id })}
              >
                <IconWrench /> {inc.crewAssigned ? "Crew assigned" : "Dispatch crew"}
              </button>
              <button
                className="btn small warn"
                disabled={inc.crewAssigned}
                onClick={() => void store.send({ cmd: "dispatchCrew", incidentId: inc.id, emergency: true })}
              >
                <IconFuel /> Emergency ($25K)
              </button>
              <button
                className="btn small ghost"
                onClick={() => store.select({ kind: "incident", id: inc.id })}
              >
                Inspect
              </button>
            </div>
            {inc.crewAssigned && (
              <div style={{ marginTop: 6 }}>
                <div className="progress">
                  <span
                    className="util-ok"
                    style={{
                      width: `${Math.max(0, Math.min(100, 100 - (inc.pointsRemaining / Math.max(1, inc.pointsRemaining + 6)) * 100))}%`,
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 3 }}>Repair in progress…</div>
              </div>
            )}
          </div>
        ))
      )}
      <div style={{ fontWeight: 700, fontSize: 14, margin: "12px 0 8px" }}>Recent</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>No resolved incidents yet.</div>
      ) : (
        recent.map((inc) => (
          <div key={inc.id} className="ins-row" style={{ fontSize: 12.5 }}>
            <span className="k">
              {inc.name} <span style={{ color: "var(--text-2)" }}>· day {inc.day}</span>
            </span>
            <span className="v">
              <Badge cls="ok">Resolved</Badge>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
