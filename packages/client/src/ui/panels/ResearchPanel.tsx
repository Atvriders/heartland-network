/** Research panel: tech tree. */
import type { ReactNode } from "react";
import { TECHS } from "@heartland/shared";
import { useSnapshot, useStore } from "../../game/store.js";
import { fmtMoney } from "../../game/format.js";
import { IconFlask } from "../icons.js";

const CATEGORIES = ["fiber", "wireless", "power", "ops"] as const;
const CAT_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  fiber: "Fiber",
  wireless: "Wireless",
  power: "Power & backup",
  ops: "Operations",
};

export function ResearchPanel(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const research = snap.state?.research ?? {};
  const day = snap.state?.meta.gameDay ?? 0;
  return (
    <div style={{ padding: 12 }}>
      {CATEGORIES.map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>{CAT_LABELS[cat]}</div>
          <div className="tech-list">
            {TECHS.filter((t) => t.category === cat).map((t) => {
              const st = research[t.id];
              const status = st?.status ?? "locked";
              const progress = st?.startedDay !== undefined ? Math.min(1, (day - st.startedDay) / t.days) : 0;
              return (
                <div key={t.id} className={`tech-item ${status}`} data-testid={`tech-${t.id}`}>
                  <IconFlask size={16} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-1)", margin: "2px 0" }}>{t.desc}</div>
                    {t.requires.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--text-2)" }}>
                        Requires: {t.requires.map((r) => TECHS.find((x) => x.id === r)?.name ?? r).join(", ")}
                      </div>
                    )}
                    {status === "researching" && (
                      <div
                        className="progress"
                        style={{ marginTop: 6 }}
                        data-testid={`tech-progress-${t.id}`}
                      >
                        <span className="util-ok" style={{ width: `${progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {status === "done" ? (
                      <span className="badge ok">Done</span>
                    ) : status === "researching" ? (
                      <span className="badge info">
                        Researching · {Math.max(0, Math.ceil(t.days - (day - (st?.startedDay ?? day))))}d
                      </span>
                    ) : (
                      <>
                        <span className="num" style={{ fontSize: 12.5 }}>
                          {fmtMoney(t.cost)} · {t.days}d
                        </span>
                        <button
                          className="btn small primary"
                          disabled={status !== "available"}
                          onClick={() => void store.send({ cmd: "startResearch", techId: t.id })}
                        >
                          Research
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
