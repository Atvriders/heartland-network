/** Network panel: sites and links with utilization and status. */
import type { ReactNode } from "react";
import { useSnapshot, useStore } from "../../game/store.js";
import { Progress } from "../components.js";
import { fmtInt, fmtMbps, STATUS_COLORS, utilClass } from "../../game/format.js";
import { IconBuilding, IconCabinet, IconFiber, IconMicrowave, IconTower } from "../icons.js";

export function NetworkPanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const state = snap.state;
  if (!state) return null;
  const sites = state.sites.filter((s) => s.status !== "decommissioned");
  const links = state.links;
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Sites ({sites.length})</div>
      <table className="table" data-testid="site-table">
        <thead>
          <tr>
            <th>Site</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Utilization</th>
            <th>Power</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => {
            const util = utilClass(s.used, s.capacity);
            const color = STATUS_COLORS[s.status];
            return (
              <tr
                key={s.id}
                style={{ cursor: "pointer" }}
                onClick={() => store.select({ kind: "site", id: s.id })}
              >
                <td>
                  {s.kind === "co" ? (
                    <IconBuilding size={12} />
                  ) : s.kind === "tower" ? (
                    <IconTower size={12} />
                  ) : (
                    <IconCabinet size={12} />
                  )}{" "}
                  {s.name}
                </td>
                <td className="num">T{s.tier}</td>
                <td>
                  <span className="badge dim" style={{ color }}>
                    {s.status}
                  </span>
                </td>
                <td style={{ width: 90 }}>
                  {s.kind === "tower" ? (
                    <span className="num" style={{ fontSize: 11 }}>
                      {fmtInt(s.radios?.reduce((a, r) => a + r.usedMbps, 0) ?? 0)} Mbps
                    </span>
                  ) : (
                    <Progress
                      value={s.used}
                      max={s.capacity}
                      cls={util.cls}
                      title={`${fmtInt(s.used)} / ${fmtInt(s.capacity)}`}
                    />
                  )}
                </td>
                <td style={{ fontSize: 11.5 }}>{s.power.mode}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 6px" }}>Links ({links.length})</div>
      <table className="table" data-testid="link-table">
        <thead>
          <tr>
            <th>Link</th>
            <th>Type</th>
            <th>Status</th>
            <th className="right">Length</th>
            <th>Traffic</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const util = utilClass(l.usedMbps, l.capacityMbps);
            return (
              <tr
                key={l.id}
                style={{ cursor: "pointer" }}
                onClick={() => store.select({ kind: "link", id: l.id })}
              >
                <td>{l.name}</td>
                <td>
                  {l.kind === "fiber" ? <IconFiber size={12} /> : <IconMicrowave size={12} />}{" "}
                  {l.kind === "fiber" ? "Fiber" : "Microwave"}
                  {l.dwdm ? " +DWDM" : ""}
                </td>
                <td>
                  <span
                    className="badge dim"
                    style={{
                      color:
                        l.status === "online"
                          ? "#37d67a"
                          : l.status === "cut" || l.status === "failed"
                            ? "#ff5f66"
                            : l.status === "building"
                              ? "#f2b84b"
                              : "#8a97ad",
                    }}
                  >
                    {l.status}
                  </span>
                </td>
                <td className="right num">{l.lengthKm.toFixed(0)} km</td>
                <td style={{ width: 100 }}>
                  <Progress
                    value={l.usedMbps}
                    max={l.capacityMbps}
                    cls={util.cls}
                    title={`${fmtMbps(l.usedMbps)} / ${fmtMbps(l.capacityMbps)}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 6px" }}>
        Projects ({state.projects.length})
      </div>
      {state.projects.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>No active construction.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Type</th>
              <th className="right">Days left</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td style={{ fontSize: 11.5 }}>{p.type}</td>
                <td className="right num">{p.daysRemaining}</td>
                <td style={{ width: 110 }}>
                  <Progress value={p.daysRequired - p.daysRemaining} max={p.daysRequired} cls="util-ok" />
                </td>
                <td>
                  <button
                    className="btn small"
                    onClick={() =>
                      store.confirm(
                        `Cancel ${p.name}?`,
                        "60% of the cost will be refunded.",
                        () => void store.send({ cmd: "cancelProject", projectId: p.id }),
                        { confirmLabel: "Cancel project" },
                      )
                    }
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
