/** Right-side management panel host. */
import type { ReactNode } from "react";
import { useSnapshot, useStore } from "../game/store.js";
import { IconX } from "./icons.js";
import { FinancePanel } from "./panels/FinancePanel.js";
import { CustomersPanel } from "./panels/CustomersPanel.js";
import { NetworkPanel } from "./panels/NetworkPanel.js";
import { ResearchPanel } from "./panels/ResearchPanel.js";
import { IncidentsPanel } from "./panels/IncidentsPanel.js";
import { AdminPanel } from "./panels/AdminPanel.js";

const TITLES: Record<string, string> = {
  finance: "Finances",
  customers: "Customers & market",
  network: "Network",
  research: "Research",
  incidents: "Incidents",
  admin: "Administration",
};

export function PanelHost(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  if (!snap.panel) return null;
  return (
    <div className="side-panel panel" data-testid="side-panel">
      <div className="panel-head">
        <span className="panel-title">{TITLES[snap.panel] ?? snap.panel}</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost icon" onClick={() => store.setPanel(null)} aria-label="Close panel">
          <IconX />
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {snap.panel === "finance" && <FinancePanel />}
        {snap.panel === "customers" && <CustomersPanel />}
        {snap.panel === "network" && <NetworkPanel />}
        {snap.panel === "research" && <ResearchPanel />}
        {snap.panel === "incidents" && <IncidentsPanel />}
        {snap.panel === "admin" && <AdminPanel />}
      </div>
    </div>
  );
}
