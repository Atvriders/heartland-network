/** Finance panel: KPIs, monthly chart, bonds, ledger. */
import { useState } from "react";
import type { ReactNode } from "react";
import { BONDS, type MonthlyPnL } from "@heartland/shared";
import { useSnapshot, useStore } from "../../game/store.js";
import { EmptyState, Kpi, Tabs } from "../components.js";
import { fmtMoney } from "../../game/format.js";
import { IconDollar } from "../icons.js";

export function FinancePanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const [tab, setTab] = useState<"overview" | "bonds" | "ledger">("overview");
  const [amount, setAmount] = useState(500000);
  const [months, setMonths] = useState(60);
  const state = snap.state;
  if (!state) return null;
  const f = state.finance;
  const k = state.kpis;

  return (
    <div>
      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "bonds", label: "Financing" },
          { id: "ledger", label: "Ledger" },
        ]}
        active={tab}
        onSelect={setTab}
      />
      <div style={{ padding: 12 }}>
        {tab === "overview" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <Kpi
                label="Cash"
                value={fmtMoney(k.cash)}
                sub={`Day ${state.meta.gameDay}`}
                valueCls={k.cash < 0 ? "neg" : ""}
              />
              <Kpi label="Monthly revenue" value={fmtMoney(k.monthlyRevenue)} />
              <Kpi label="Monthly opex" value={fmtMoney(k.monthlyOpex)} />
              <Kpi
                label="Monthly net"
                value={fmtMoney(k.monthlyNet)}
                valueCls={k.monthlyNet < 0 ? "neg" : ""}
              />
              <Kpi label="ARPU" value={`$${k.arpu}`} />
              <Kpi label="Churn (30d)" value={`${k.churn30}`} />
            </div>
            <MonthlyChart />
            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
              Green: revenue · Amber: operating expenses · Blue line: net result per month
            </div>
          </>
        )}
        {tab === "bonds" && (
          <>
            {f.bonds.length === 0 ? (
              <EmptyState title="No outstanding bonds">
                <div>Raise capital to fund expansion.</div>
              </EmptyState>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Bond</th>
                    <th className="right">Outstanding</th>
                    <th className="right">Payment / mo</th>
                    <th className="right">Months left</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {f.bonds.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.name} <span style={{ color: "var(--text-2)", fontSize: 11 }}>({b.ratePct}%)</span>
                      </td>
                      <td className="right num">{fmtMoney(b.outstanding)}</td>
                      <td className="right num">{fmtMoney(b.monthlyPayment)}</td>
                      <td className="right num">{b.monthsLeft}</td>
                      <td className="right">
                        <button
                          className="btn small"
                          disabled={k.cash < b.outstanding}
                          onClick={() =>
                            store.confirm(
                              `Repay "${b.name}"?`,
                              `This costs ${fmtMoney(b.outstanding)} from current cash (${fmtMoney(k.cash)}).`,
                              () => void store.send({ cmd: "repayBond", bondId: b.id }),
                              { confirmLabel: "Repay" },
                            )
                          }
                        >
                          Repay
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="card" style={{ marginTop: 12 }}>
              <div
                style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}
              >
                <IconDollar size={14} /> Issue infrastructure bond
              </div>
              <div className="field">
                <label>Amount</label>
                <input
                  type="number"
                  min={BONDS.minAmount}
                  max={BONDS.maxAmount}
                  step={100000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  data-testid="bond-amount"
                />
              </div>
              <div className="field">
                <label>Term</label>
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {BONDS.terms.map((t) => (
                    <option key={t.months} value={t.months}>
                      {t.months} months @ {t.ratePct}%
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn primary"
                onClick={() => {
                  void store.send({ cmd: "borrow", amount, months });
                }}
              >
                Issue bond
              </button>
            </div>
          </>
        )}
        {tab === "ledger" && (
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {[...f.recent]
              .reverse()
              .slice(0, 120)
              .map((e, i) => (
                <div key={i} className="ins-row">
                  <span className="k">
                    Day {e.day} · {e.note}
                  </span>
                  <span className="v" style={{ color: e.amount >= 0 ? "#6eeaa0" : "#ffa3a8" }}>
                    {fmtMoney(e.amount)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthlyChart(): ReactNode {
  const snap = useSnapshot();
  const rows = snap.state?.finance.monthly.slice(-24) ?? [];
  if (rows.length < 2) {
    return <EmptyState title="Not enough history yet">Complete at least one month of operations.</EmptyState>;
  }
  const W = 330;
  const H = 150;
  // Cost fields are positive magnitudes in current saves; `abs()` also keeps
  // legacy saves (which stored negative costs) rendering correctly.
  const opex = (r: MonthlyPnL) => Math.abs(r.opex);
  const capex = (r: MonthlyPnL) => Math.abs(r.capex);
  const interest = (r: MonthlyPnL) => Math.abs(r.interest);
  const netOf = (r: MonthlyPnL) => r.revenue - opex(r) - capex(r) - interest(r);
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.revenue, opex(r), capex(r), interest(r))));
  const bw = W / rows.length;
  const bar = (v: number) => (Math.max(0, v) / maxVal) * (H - 30);
  const line = rows
    .map((r, i) => {
      const x = i * bw + bw / 2;
      const y = H - 8 - (Math.max(-maxVal, Math.min(maxVal, netOf(r))) / maxVal) * (H - 34);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: "var(--bg-0)", borderRadius: 6 }}>
      {rows.map((r, i) => (
        <g key={i}>
          <rect
            x={i * bw + 1}
            y={H - 8 - bar(r.revenue)}
            width={bw * 0.35}
            height={bar(r.revenue)}
            fill="#2fa86c"
            rx={1.5}
          />
          <rect
            x={i * bw + bw * 0.42}
            y={H - 8 - bar(opex(r))}
            width={bw * 0.35}
            height={bar(opex(r))}
            fill="#b98a3c"
            rx={1.5}
          />
        </g>
      ))}
      <path d={line} fill="none" stroke="#5ba7ff" strokeWidth={1.6} />
      {rows.length > 8 &&
        [0, Math.floor((rows.length - 1) / 2), rows.length - 1].map((i) => (
          <text key={i} x={i * bw + bw / 2} y={H - 3} fontSize={8} fill="#7183a5" textAnchor="middle">
            M{rows[i]?.month}
          </text>
        ))}
    </svg>
  );
}
