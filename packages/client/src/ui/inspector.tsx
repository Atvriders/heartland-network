/** Left inspector: details + actions for the selected map element. */
import type { ReactNode } from "react";
import type { Incident, Link, Site, Town } from "@heartland/shared";
import { CO_TIERS, CABINET_TIERS, RADIO_TIERS, POWER } from "@heartland/shared";
import { useSnapshot, useStore } from "../game/store.js";
import { Badge, Progress } from "./components.js";
import {
  fmtInt,
  fmtMbps,
  POWER_MODE_COLORS,
  POWER_MODE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  utilClass,
} from "../game/format.js";
import {
  IconBattery,
  IconGenerator,
  IconSolar,
  IconUpgrade,
  IconWrench,
  IconTrash,
  IconFuel,
  IconTower,
  IconCabinet,
  IconBuilding,
  IconMicrowave,
  IconFiber,
  IconX,
} from "./icons.js";

export function Inspector(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const sel = snap.selection;
  if (!sel) return null;
  return (
    <div className="left-panel panel" data-testid="inspector">
      <div className="panel-head">
        <span className="panel-title">Inspector</span>
        <span style={{ flex: 1 }} />
        <button className="btn ghost icon" onClick={() => store.select(null)} aria-label="Close">
          <IconX />
        </button>
      </div>
      <div className="panel-body">
        {sel.kind === "site" && <SiteInspector id={sel.id} />}
        {sel.kind === "link" && <LinkInspector id={sel.id} />}
        {sel.kind === "town" && <TownInspector id={sel.id} />}
        {sel.kind === "district" && <DistrictInspector id={sel.id} />}
        {sel.kind === "incident" && <IncidentInspector id={sel.id} />}
      </div>
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: ReactNode; color?: string }) {
  return (
    <div className="ins-row">
      <span className="k">{k}</span>
      <span className="v" style={color ? { color } : undefined}>
        {v}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: Site["status"] | Link["status"] }) {
  const label = (STATUS_LABELS as Record<string, string>)[status] ?? status;
  const color = (STATUS_COLORS as Record<string, string>)[status] ?? "#8a97ad";
  const cls =
    status === "online"
      ? "ok"
      : status === "failed" || status === "cut"
        ? "crit"
        : status === "building" || status === "unpowered"
          ? "warn"
          : "dim";
  return (
    <span className={`badge ${cls}`}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function SiteInspector({ id }: { id: string }) {
  const snap = useSnapshot();
  const store = useStore();
  const site = snap.state?.sites.find((s) => s.id === id);
  if (!site) return <div>Site not found.</div>;
  const links = snap.state?.links.filter((l) => l.from === id || l.to === id) ?? [];
  const util = utilClass(site.used, site.capacity);
  const incident = snap.state?.incidents.find(
    (i) =>
      i.status === "active" &&
      (i.affectedSites.includes(id) || i.affectedLinks.some((l) => links.some((x) => x.id === l))),
  );
  const dm = site.districtId ? snap.state?.districtsMarket[site.districtId] : undefined;
  const subs = dm ? dm.subs.fiber.hh + dm.subs.fiber.biz : 0;
  const kw =
    site.kind === "co"
      ? ([2, 5, 12, 25][site.tier - 1] ?? 2)
      : site.kind === "tower"
        ? ([0.6, 0.9, 1.2][site.tier - 1] ?? 0.6)
        : 0.25;

  const actions: { label: string; icon: ReactNode; disabled?: boolean; onClick: () => void }[] = [];
  if (site.kind === "co" && site.tier < CO_TIERS.length) {
    actions.push({
      label: "Upgrade office",
      icon: <IconUpgrade />,
      onClick: () =>
        void store.send({ cmd: "startProject", type: "upgrade", tier: site.tier + 1, siteId: site.id }),
    });
  }
  if (site.kind === "cabinet" && site.tier < CABINET_TIERS.length) {
    actions.push({
      label: "Upgrade cabinet",
      icon: <IconUpgrade />,
      onClick: () =>
        void store.send({ cmd: "startProject", type: "upgrade", tier: site.tier + 1, siteId: site.id }),
    });
  }
  if (site.kind === "tower" && site.tier < RADIO_TIERS.length) {
    actions.push({
      label: "Upgrade radios",
      icon: <IconUpgrade />,
      onClick: () =>
        void store.send({ cmd: "startProject", type: "upgrade", tier: site.tier + 1, siteId: site.id }),
    });
  }
  const batteryTier = site.power.batteryTier;
  if (batteryTier < POWER.battery.tiers.length) {
    actions.push({
      label: "Add battery",
      icon: <IconBattery />,
      onClick: () =>
        void store.send({ cmd: "startProject", type: "battery", tier: batteryTier + 1, siteId: site.id }),
    });
  }
  if (site.power.generatorTier < POWER.generator.tiers.length) {
    actions.push({
      label: "Add generator",
      icon: <IconGenerator />,
      onClick: () =>
        void store.send({
          cmd: "startProject",
          type: "generator",
          tier: site.power.generatorTier + 1,
          siteId: site.id,
        }),
    });
  }
  if (site.power.source !== "solar") {
    actions.push({
      label: "Add solar",
      icon: <IconSolar />,
      disabled: site.kind === "cabinet",
      onClick: () => void store.send({ cmd: "startProject", type: "solar", tier: 1, siteId: site.id }),
    });
  }
  actions.push({
    label: "Renovate",
    icon: <IconWrench />,
    disabled: site.condition >= 95,
    onClick: () => void store.send({ cmd: "startProject", type: "renovate", tier: 1, siteId: site.id }),
  });
  if (site.power.generatorTier > 0 && site.power.fuelPct < 0.99) {
    actions.push({
      label: "Refuel now",
      icon: <IconFuel />,
      onClick: () => void store.send({ cmd: "refuel", siteId: site.id }),
    });
  }
  if (incident && !incident.crewAssigned) {
    actions.push({
      label: "Dispatch repair crew",
      icon: <IconWrench />,
      onClick: () => void store.send({ cmd: "dispatchCrew", incidentId: incident.id }),
    });
  }
  actions.push({
    label: "Decommission",
    icon: <IconTrash />,
    onClick: () =>
      store.confirm(
        `Decommission ${site.name}?`,
        "Customers served here will churn immediately. A partial scrap refund is paid.",
        () => void store.send({ cmd: "decommission", siteId: site.id }),
        { danger: true, confirmLabel: "Decommission" },
      ),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {site.kind === "co" ? <IconBuilding /> : site.kind === "tower" ? <IconTower /> : <IconCabinet />}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{site.name}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <StatusBadge status={site.status} />
      </div>
      <Row
        k="Type"
        v={`${site.kind === "co" ? "Central office" : site.kind === "tower" ? "Tower" : "Cabinet"} · Tier ${site.tier}`}
      />
      <Row
        k="Location"
        v={
          site.townId ? (snap.staticMap?.towns.find((t) => t.id === site.townId)?.name ?? "—") : "Remote site"
        }
      />
      <Row
        k="Condition"
        v={
          <Progress value={site.condition} max={100} cls="util-ok" title={`${site.condition.toFixed(0)}%`} />
        }
      />
      {site.kind !== "tower" && (
        <>
          <Row k="Capacity" v={`${fmtInt(site.used)} / ${fmtInt(site.capacity)} subscribers`} />
          <Progress value={site.used} max={site.capacity} cls={util.cls} />
        </>
      )}
      {site.kind === "cabinet" && <Row k="Subscribers" v={fmtInt(subs)} />}
      <div style={{ height: 8 }} />
      <Row
        k="Power"
        v={
          <span style={{ color: POWER_MODE_COLORS[site.power.mode] }}>
            {POWER_MODE_LABELS[site.power.mode]}
          </span>
        }
      />
      <Row k="Load" v={`${kw} kW`} />
      {site.power.batteryCapacityH > 0 && (
        <>
          <Row k="Battery" v={`${site.power.batteryLevelH.toFixed(1)} / ${site.power.batteryCapacityH} h`} />
          <Progress
            value={site.power.batteryLevelH}
            max={site.power.batteryCapacityH}
            cls={site.power.batteryLevelH / site.power.batteryCapacityH < 0.25 ? "util-critical" : "util-ok"}
          />
        </>
      )}
      {site.power.generatorTier > 0 && (
        <>
          <Row k="Generator fuel" v={`${Math.round(site.power.fuelPct * 100)}%`} />
          <Progress
            value={site.power.fuelPct * 100}
            max={100}
            cls={site.power.fuelPct < 0.25 ? "util-critical" : "util-ok"}
          />
        </>
      )}
      {site.kind === "tower" && site.radios && (
        <div style={{ marginTop: 8 }}>
          <Row k="Sectors" v={`${site.radios.length} × ${fmtMbps(site.radios[0]?.capacityMbps ?? 0)}`} />
          {site.radios.map((r, i) => {
            const u = utilClass(r.usedMbps, r.capacityMbps);
            return (
              <div key={i} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    color: "var(--text-1)",
                  }}
                >
                  <span>
                    Sector {i + 1} ({r.azimuth}°)
                  </span>
                  <span className="num">
                    {fmtMbps(r.usedMbps)} / {fmtMbps(r.capacityMbps)}
                  </span>
                </div>
                <Progress value={r.usedMbps} max={r.capacityMbps} cls={u.cls} />
              </div>
            );
          })}
        </div>
      )}
      {links.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Row k="Links" v={`${links.length}`} />
          {links.slice(0, 6).map((l) => (
            <div key={l.id} style={{ fontSize: 12, color: "var(--text-1)", padding: "2px 0" }}>
              {l.kind === "fiber" ? <IconFiber size={11} /> : <IconMicrowave size={11} />} {l.name}
            </div>
          ))}
        </div>
      )}
      {incident && (
        <div className="card" style={{ marginTop: 10, borderColor: "rgba(255,95,102,0.5)" }}>
          <b style={{ color: "#ff9aa0" }}>⚠ {incident.name}</b>
          <div style={{ fontSize: 12, color: "var(--text-1)", marginTop: 4 }}>{incident.note}</div>
        </div>
      )}
      <div className="ins-actions">
        {actions.map((a, i) => (
          <button
            key={i}
            className="btn small"
            disabled={a.disabled}
            onClick={a.onClick}
            title={a.disabled ? "Not available" : a.label}
          >
            {a.icon} {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LinkInspector({ id }: { id: string }) {
  const snap = useSnapshot();
  const store = useStore();
  const link = snap.state?.links.find((l) => l.id === id);
  if (!link) return <div>Link not found.</div>;
  const from = snap.state?.sites.find((s) => s.id === link.from);
  const to = snap.state?.sites.find((s) => s.id === link.to);
  const util = utilClass(link.usedMbps, link.capacityMbps);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {link.kind === "fiber" ? <IconFiber /> : <IconMicrowave />}
        <span style={{ fontWeight: 700, fontSize: 15 }}>{link.name}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <StatusBadge status={link.status} />
      </div>
      <Row
        k="Kind"
        v={`${link.kind === "fiber" ? "Fiber trunk" : "Microwave"} · Tier ${link.tier}${link.dwdm ? " + DWDM" : ""}`}
      />
      <Row k="Length" v={`${link.lengthKm.toFixed(1)} km`} />
      <Row k="Endpoints" v={`${from?.name ?? "?"} ↔ ${to?.name ?? "?"}`} />
      <Row k="Condition" v={<Progress value={link.condition} max={100} cls="util-ok" />} />
      <Row k="Traffic" v={`${fmtMbps(link.usedMbps)} / ${fmtMbps(link.capacityMbps)}`} />
      <Progress value={link.usedMbps} max={link.capacityMbps} cls={util.cls} />
      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{util.label} utilization</div>
      <div className="ins-actions" style={{ marginTop: 14 }}>
        <button
          className="btn small danger"
          onClick={() =>
            store.confirm(
              `Remove ${link.name}?`,
              "Traffic reroutes automatically if redundancy exists. No refund.",
              () => void store.send({ cmd: "removeLink", linkId: link.id }),
              { danger: true, confirmLabel: "Remove" },
            )
          }
        >
          <IconTrash /> Remove link
        </button>
      </div>
    </div>
  );
}

function TownInspector({ id }: { id: string }) {
  const snap = useSnapshot();
  const store = useStore();
  const town = snap.staticMap?.towns.find((t) => t.id === id);
  const stats = snap.state?.townStats.find((t) => t.townId === id);
  if (!town) return <div>Town not found.</div>;
  const districts = snap.staticMap?.districts.filter((d) => d.townId === id) ?? [];
  const hasCo = snap.state?.sites.some((s) => s.kind === "co" && s.townId === id);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{town.name}</div>
      <div style={{ fontSize: 12, color: "var(--text-1)", marginBottom: 8 }}>
        {town.kind[0]?.toUpperCase() + town.kind.slice(1)} · Population {fmtInt(town.pop)}
      </div>
      {stats && (
        <>
          <Row k="Served" v={`${stats.servedPct}% (${fmtInt(stats.subs)} of ${fmtInt(stats.potential)})`} />
          <Progress value={stats.servedPct} max={100} cls="util-ok" />
          <Row k="Satisfaction" v={`${stats.satisfaction}%`} />
          <Row k="Uplink" v={`${fmtMbps(stats.uplinkUsedMbps)} / ${fmtMbps(stats.uplinkMbps)}`} />
          <Row k="Outages (30d)" v={`${stats.outageDays30} days`} />
          <Row k="Competitor share" v={`${Math.round(stats.rivalShare * 100)}%`} />
        </>
      )}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>Districts</div>
        {districts.map((d) => {
          const dm = snap.state?.districtsMarket[d.id];
          const subs = dm
            ? dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz
            : 0;
          const hasCab = snap.state?.sites.some((s) => s.kind === "cabinet" && s.districtId === d.id);
          return (
            <div
              key={d.id}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}
            >
              <span>
                {d.name} <span style={{ color: "var(--text-2)" }}>· {fmtInt(d.households)} homes</span>
              </span>
              <span style={{ color: hasCab ? "#37d67a" : "var(--text-2)" }}>
                {hasCab ? "Cabinet" : ""} {subs > 0 ? `· ${subs} subs` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ins-actions" style={{ marginTop: 12 }}>
        {!hasCo && (
          <button
            className="btn small"
            onClick={() => {
              store.setTool("co");
              store.setBuildSource(id);
            }}
          >
            <IconBuilding /> Build office
          </button>
        )}
        <button className="btn small" onClick={() => void store.send({ cmd: "startCampaign", target: id })}>
          <IconTower /> Run promotion
        </button>
      </div>
    </div>
  );
}

function DistrictInspector({ id }: { id: string }) {
  const snap = useSnapshot();
  const store = useStore();
  const d = snap.staticMap?.districts.find((x) => x.id === id);
  const dm = snap.state?.districtsMarket[id];
  if (!d) return <div>District not found.</div>;
  const subs = dm ? dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz : 0;
  const hasCab = snap.state?.sites.some((s) => s.kind === "cabinet" && s.districtId === id);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontSize: 12, color: "var(--text-1)", marginBottom: 8 }}>
        {d.kind[0]?.toUpperCase() + d.kind.slice(1)} district
      </div>
      <Row k="Homes" v={fmtInt(d.households)} />
      <Row k="Businesses" v={fmtInt(d.businesses)} />
      <Row k="Subscribers" v={fmtInt(subs)} />
      <Row k="Fiber" v={`${fmtInt(dm?.subs.fiber.hh ?? 0)} homes · ${fmtInt(dm?.subs.fiber.biz ?? 0)} biz`} />
      <Row
        k="Wireless"
        v={`${fmtInt(dm?.subs.wireless.hh ?? 0)} homes · ${fmtInt(dm?.subs.wireless.biz ?? 0)} biz`}
      />
      <Row k="Satisfaction" v={`${Math.round(dm?.satisfaction ?? 0)}%`} />
      <Row k="Install backlog" v={fmtInt((dm?.installQueue.fiber ?? 0) + (dm?.installQueue.wireless ?? 0))} />
      <Row k="Outages (30d)" v={`${(dm?.outageDays30 ?? 0).toFixed(1)} days`} />
      <div className="ins-actions" style={{ marginTop: 12 }}>
        {!hasCab && (
          <button
            className="btn small"
            onClick={() => {
              store.setTool("cabinet");
              store.setBuildSource(id);
            }}
          >
            <IconCabinet /> Build cabinet
          </button>
        )}
      </div>
    </div>
  );
}

export function IncidentInspector({ id }: { id: string }) {
  const snap = useSnapshot();
  const store = useStore();
  const inc = snap.state?.incidents.find((i) => i.id === id);
  if (!inc) return <div>Incident not found.</div>;
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{inc.name}</div>
      <div style={{ marginBottom: 8 }}>
        <Badge cls={inc.status === "active" ? "crit" : "ok"}>
          {inc.status === "active" ? "Active" : "Resolved"}
        </Badge>
      </div>
      <Row k="Type" v={inc.kind} />
      <Row k="Severity" v={`${inc.severity}/3`} />
      <Row k="Reported" v={`Day ${inc.day}`} />
      <Row k="Sites affected" v={inc.affectedSites.length} />
      <Row k="Links affected" v={inc.affectedLinks.length} />
      <Row k="Customers affected" v={fmtInt(inc.affectedCustomers)} />
      {inc.status === "active" && (
        <>
          <Row
            k="Repair"
            v={inc.crewAssigned ? `Crew assigned (${inc.pointsRemaining} pts left)` : "No crew assigned"}
          />
          <div className="ins-actions" style={{ marginTop: 12 }}>
            <button
              className="btn small"
              disabled={inc.crewAssigned}
              onClick={() => void store.send({ cmd: "dispatchCrew", incidentId: inc.id })}
            >
              <IconWrench /> Dispatch crew
            </button>
            <button
              className="btn small warn"
              disabled={inc.crewAssigned}
              onClick={() => void store.send({ cmd: "dispatchCrew", incidentId: inc.id, emergency: true })}
            >
              <IconFuel /> Emergency ($25K)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Referenced types to keep TS happy about unused imports.
export type { Incident, Link, Site, Town };
