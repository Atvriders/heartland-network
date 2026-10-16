/** Derive the client-facing LiveState (KPIs, town stats) from a GameSave. */
import { DEMAND } from "@heartland/shared";
import type { GameSave, Kpis, LiveState, TownStats } from "@heartland/shared";
import { totalSubs } from "./finance.js";

export function deriveLiveState(save: GameSave, id: string): LiveState {
  const townStats: TownStats[] = save.map.towns.map((town) => {
    const districts = save.map.districts.filter((d) => d.townId === town.id);
    let subs = 0;
    let potential = 0;
    let sat = 0;
    let outage = 0;
    let rivalShare = 0;
    for (const d of districts) {
      const dm = save.districtsMarket[d.id];
      if (!dm) continue;
      const s = dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
      subs += s;
      sat += dm.satisfaction;
      outage += dm.outageDays30;
      rivalShare += dm.rivalShare;
      potential +=
        Math.round(d.households * DEMAND.baseTakeRate) + Math.round(d.businesses * DEMAND.businessTakeRate);
    }
    // Uplink capacity: sum of online fiber links touching town sites.
    const townSiteIds = new Set(save.sites.filter((s) => s.townId === town.id).map((s) => s.id));
    let uplink = 0;
    let used = 0;
    for (const l of save.links) {
      if (l.status !== "online") continue;
      if (townSiteIds.has(l.from) || townSiteIds.has(l.to)) {
        uplink += l.capacityMbps;
        used += l.usedMbps;
      }
    }
    const n = districts.length;
    return {
      townId: town.id,
      name: town.name,
      pop: town.pop,
      servedPct: potential > 0 ? Math.round((subs / potential) * 100) : 0,
      subs,
      potential,
      satisfaction: n > 0 ? Math.round(sat / n) : 0,
      uplinkMbps: Math.round(uplink),
      uplinkUsedMbps: Math.round(used),
      outageDays30: n > 0 ? Math.round((outage / n) * 10) / 10 : 0,
      rivalShare: n > 0 ? Math.round((rivalShare / n) * 100) / 100 : 0,
    };
  });

  const subs = totalSubs(save);
  const monthRevenue = monthlyRevenueEstimate(save);
  const monthOpex = monthlyOpexEstimate(save);
  let satSum = 0;
  let satN = 0;
  let outageSum = 0;
  let backlog = 0;
  let churn30 = 0;
  for (const dm of Object.values(save.districtsMarket)) {
    if (dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz === 0) continue;
    satSum += dm.satisfaction;
    satN++;
    outageSum += dm.outageDays30;
    backlog += dm.installQueue.fiber + dm.installQueue.wireless;
    churn30 +=
      ((dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz) *
        (DEMAND.baseChurn + dm.outageDays30 * DEMAND.churnPerOutageDay)) /
      30;
  }
  const linkUsed = save.links.reduce((s, l) => s + (l.status === "online" ? l.usedMbps : 0), 0);
  const linkCap = save.links.reduce((s, l) => s + (l.status === "online" ? l.capacityMbps : 0), 0);

  const kpis: Kpis = {
    cash: Math.round(save.finance.cash),
    subs,
    monthlyRevenue: Math.round(monthRevenue),
    monthlyOpex: Math.round(monthOpex),
    monthlyNet: Math.round(monthRevenue - monthOpex),
    arpu: subs > 0 ? Math.round((monthRevenue / subs) * 30) : 0,
    churn30: Math.round(churn30),
    networkUptime30: satN > 0 ? Math.round((1 - outageSum / satN / 30) * 1000) / 10 : 100,
    satisfaction: satN > 0 ? Math.round(satSum / satN) : 70,
    capacityUtilization: linkCap > 0 ? Math.round((linkUsed / linkCap) * 100) : 0,
    incidentActive: save.incidents.filter((i) => i.status === "active").length,
    installBacklog: backlog,
  };

  return {
    id,
    meta: save.meta,
    sites: save.sites,
    links: save.links,
    projects: save.projects,
    districtsMarket: save.districtsMarket,
    plans: save.plans,
    finance: save.finance,
    research: save.research,
    staff: save.staff,
    incidents: save.incidents,
    rivals: save.rivals,
    campaigns: save.campaigns,
    marketingLevel: save.marketingLevel,
    settings: save.settings,
    townStats,
    kpis,
  };
}

function monthlyRevenueEstimate(save: GameSave): number {
  let total = 0;
  for (const dm of Object.values(save.districtsMarket)) {
    const c = save.plans.filter((p) => p.cls === "consumer" && p.enabled);
    const b = save.plans.filter((p) => p.cls === "business" && p.enabled);
    const avgC = c.length ? c.reduce((s, p) => s + p.price, 0) / c.length : 0;
    const avgB = b.length ? b.reduce((s, p) => s + p.price, 0) / b.length : 0;
    total +=
      (dm.subs.fiber.hh + dm.subs.wireless.hh) * avgC + (dm.subs.fiber.biz + dm.subs.wireless.biz) * avgB;
  }
  return total;
}

function monthlyOpexEstimate(save: GameSave): number {
  let total = 0;
  for (const site of save.sites) {
    if (site.status === "decommissioned" || site.status === "building" || site.status === "planned") continue;
    total += site.leaseMonthly;
    if (site.kind === "co") total += site.tier * 90 * 30;
    else if (site.kind === "tower") total += site.tier * 30 * 30;
    else total += site.tier * 4 * 30;
  }
  for (const link of save.links) {
    if (link.status !== "building" && link.status !== "planned") {
      total += (link.kind === "fiber" ? link.lengthKm * 0.9 : 10) * 30;
    }
  }
  return total;
}
