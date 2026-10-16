/** Customers panel: plans, pricing, marketing, town table. */
import type { ReactNode } from "react";
import { MARKETING, STAFF } from "@heartland/shared";
import { useSnapshot, useStore } from "../../game/store.js";
import { Progress, Toggle } from "../components.js";
import { fmtInt, fmtMoney } from "../../game/format.js";
import { IconMegaphone, IconUsers } from "../icons.js";

export function CustomersPanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const state = snap.state;
  if (!state) return null;

  return (
    <div>
      <div style={{ padding: 12 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <IconUsers size={15} /> Plans & pricing
        </div>
        {state.plans.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                {p.cls === "business" ? "Business" : "Consumer"} · {p.speedMbps} Mbps
              </div>
            </div>
            <span
              className="num"
              style={{ fontSize: 13, color: p.enabled ? "var(--text-0)" : "var(--text-2)" }}
            >
              {p.enabled ? `$${p.price}/mo` : "Disabled"}
            </span>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={p.price}
              style={{ width: 110 }}
              onChange={(e) =>
                void store.send(
                  { cmd: "setPlanPrice", planId: p.id, price: Number(e.target.value) },
                  { silent: true },
                )
              }
              onPointerUp={() => undefined}
              data-testid={`plan-price-${p.id}`}
            />
          </div>
        ))}
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 4 }}>
          $0 disables a plan. Lower prices attract customers; too-low prices erode margin.
        </div>

        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            display: "flex",
            gap: 6,
            alignItems: "center",
            margin: "14px 0 8px",
          }}
        >
          <IconMegaphone size={15} /> Marketing
        </div>
        <div className="range">
          <input
            type="range"
            min={0}
            max={MARKETING.maxLevel}
            step={1}
            value={state.marketingLevel}
            onChange={(e) =>
              void store.send({ cmd: "setMarketing", level: Number(e.target.value) }, { silent: true })
            }
            data-testid="marketing-level"
          />
          <span className="num" style={{ width: 90, textAlign: "right", fontSize: 13 }}>
            L{state.marketingLevel} · {fmtMoney(state.marketingLevel * MARKETING.costPerLevelDaily * 30)}/mo
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn small"
              onClick={() => void store.send({ cmd: "startCampaign", target: "all" })}
            >
              Statewide campaign
            </button>
          </div>
          {state.campaigns
            .filter((c) => c.daysLeft > 0)
            .map((c) => (
              <div key={c.id} style={{ fontSize: 12.5, color: "var(--text-1)", marginTop: 6 }}>
                {c.name} — {c.daysLeft} days left · {fmtMoney(c.costDaily)}/day
              </div>
            ))}
        </div>

        <div style={{ fontWeight: 700, fontSize: 14, margin: "14px 0 8px" }}>Staff</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StaffControl kind="installCrews" label="Install crews" />
          <StaffControl kind="repairCrews" label="Repair crews" />
          <StaffControl kind="salesAgents" label="Sales agents" />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
          Install crews clear the backlog ({STAFF.installCrew.installsPerDay}/day each) · repair crews restore
          service after failures.
        </div>
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Towns</div>
        <table className="table" data-testid="town-table">
          <thead>
            <tr>
              <th>Town</th>
              <th className="right">Pop</th>
              <th>Served</th>
              <th className="right">Subs</th>
              <th className="right">Sat</th>
              <th className="right">Outage 30d</th>
            </tr>
          </thead>
          <tbody>
            {state.townStats.map((t) => (
              <tr
                key={t.townId}
                onClick={() => store.select({ kind: "town", id: t.townId })}
                style={{ cursor: "pointer" }}
              >
                <td>{t.name}</td>
                <td className="right num">{fmtInt(t.pop)}</td>
                <td style={{ width: 90 }}>
                  <Progress value={t.servedPct} max={100} cls="util-ok" title={`${t.servedPct}%`} />
                </td>
                <td className="right num">{fmtInt(t.subs)}</td>
                <td
                  className="right num"
                  style={{
                    color: t.satisfaction >= 70 ? "#6eeaa0" : t.satisfaction >= 45 ? "#ffd894" : "#ff9aa0",
                  }}
                >
                  {t.satisfaction}%
                </td>
                <td className="right num">{t.outageDays30}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffControl({
  kind,
  label,
}: {
  kind: "installCrews" | "repairCrews" | "salesAgents";
  label: string;
}) {
  const snap = useSnapshot();
  const store = useStore();
  const state = snap.state;
  if (!state) return null;
  const cur = state.staff[kind];
  const cost =
    kind === "repairCrews"
      ? STAFF.repairCrew.hireCost
      : kind === "installCrews"
        ? STAFF.installCrew.hireCost
        : STAFF.salesAgent.hireCost;
  return (
    <div className="card" style={{ padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--text-2)" }}>{fmtMoney(cost)} to hire</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="btn icon small"
            onClick={() => void store.send({ cmd: "hire", kind, delta: -1 })}
          >
            −
          </button>
          <span className="num" style={{ fontWeight: 700, minWidth: 18, textAlign: "center" }}>
            {cur}
          </span>
          <button className="btn icon small" onClick={() => void store.send({ cmd: "hire", kind, delta: 1 })}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle imported for reuse in Admin panel via barrel re-export.
void Toggle;
