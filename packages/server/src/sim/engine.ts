/**
 * The simulation engine: one tick = one game day.
 * Order of operations within a day:
 *   1. advance construction projects
 *   2. update power & backup
 *   3. roll random failures (equipment, cuts, ambient storms)
 *   4. advance incidents / crew repairs
 *   5. recompute element statuses
 *   6. compute wireless coverage
 *   7. compute connectivity + route traffic
 *   8. advance customers (demand, installs, churn, satisfaction)
 *   9. apply congestion to delivered speeds
 *  10. finance: revenue, opex, interest, bonds, monthly roll
 *  11. research, campaigns, rivals, condition decay
 */
import { CABINET_TIERS, CO_TIERS, DEMAND, DIFFICULTY, POWER, TECHS } from "@heartland/shared";
import type { GameEvent, GameSave, Project, Site } from "@heartland/shared";
import { makeRng, type RngState } from "./rng.js";
import { computeConnectivity, cabinetTownServed } from "./connectivity.js";
import { bestCoverage, computeCoverage, type CoverageEntry } from "./wireless.js";
import { updatePower } from "./power.js";
import { gridOutageRegions, repairPointsPerDay, rollFailures, tickIncidents } from "./failures.js";
import { districtServices, enabledPlans, marketingEffect, planMix, tickCustomers } from "./customers.js";
import {
  dailyInterest,
  dailyOpex,
  dailyRevenue,
  emergencyCredit,
  ledger,
  processBondPayments,
  revenueTax,
  rollMonth,
} from "./finance.js";
import { perks, refreshResearchState } from "./research.js";
import { tickCompetition } from "./competition.js";

const DAYS_PER_MONTH = 30;

export class GameEngine {
  readonly save: GameSave;
  private rng: RngState;
  private coverageCache: { fingerprint: string; best: Map<string, CoverageEntry> } | null = null;

  constructor(save: GameSave) {
    this.save = save;
    this.rng = makeRng(save.rngState);
    this.coverageCache = null;
  }

  /** Call when towers are created/removed/upgraded so coverage recomputes. */
  invalidateCoverage(): void {
    this.coverageCache = null;
  }

  private coverageFingerprint(): string {
    return this.save.sites
      .filter((s) => s.kind === "tower")
      .map((s) => `${s.id}:${s.tier}:${s.status}`)
      .join("|");
  }

  private coverage(): Map<string, CoverageEntry> {
    const fp = this.coverageFingerprint();
    if (this.coverageCache && this.coverageCache.fingerprint === fp) {
      return this.coverageCache.best;
    }
    const best = bestCoverage(computeCoverage(this.save));
    this.coverageCache = { fingerprint: fp, best };
    return best;
  }

  /** Advance one game day. Returns events for the client log. */
  tick(): GameEvent[] {
    const save = this.save;
    const events: GameEvent[] = [];
    const day = save.meta.gameDay + 1;
    save.meta.gameDay = day;

    // 1. Projects -----------------------------------------------------------------
    this.tickProjects(events);

    // 2. Power --------------------------------------------------------------------
    const gridDown = gridOutageRegions(save);
    const fuelOrders: { siteId: string; cost: number }[] = [];
    updatePower(save, { gridDownRadius: gridDown, fuelOrders });
    for (const f of fuelOrders) {
      ledger(save, "opex", f.cost, `Fuel delivery to ${siteName(save, f.siteId)}`);
    }

    // 3. Failures -----------------------------------------------------------------
    const diffRate = DIFFICULTY[save.meta.difficulty].stormRate;
    rollFailures(
      save,
      {
        stormRateMult: diffRate,
        ambientStorms: save.settings.ambientStorms,
        equipmentFailures: save.settings.equipmentFailures,
        rng: this.rng,
      },
      events,
    );

    // 4. Incidents ----------------------------------------------------------------
    const p = perks(save);
    tickIncidents(save, repairPointsPerDay(save, p.repairSpeedMult), events);

    // 5. Statuses -----------------------------------------------------------------
    this.refreshStatuses();

    // 6. Coverage -----------------------------------------------------------------
    const coverage = this.coverage();

    // 7. Connectivity (topology only first pass) -----------------------------------
    const emptyTraffic = new Map<string, number>();
    const emptyAnchor = new Map<string, string>();
    const conn0 = computeConnectivity(save, emptyTraffic, emptyAnchor);

    // Cabinets need a served town to be online.
    for (const s of save.sites) {
      if (s.kind !== "cabinet") continue;
      if (s.status !== "online") continue;
      if (!cabinetTownServed(save, s, conn0)) s.status = "offline";
    }

    // District services & anchors.
    const services = districtServices(save, {
      conn: conn0,
      coverage,
      marketingEffect: 0,
      businessChurnMult: 1,
      rng: this.rng,
      events,
    });
    const districtTraffic = new Map<string, number>();
    const districtAnchor = new Map<string, string>();
    const consumerMix = planMix(enabledPlans(save, "consumer"));
    const businessMix = planMix(enabledPlans(save, "business"));
    for (const dm of Object.values(save.districtsMarket)) {
      const svc = services.get(dm.districtId);
      if (!svc || !svc.anchorId) continue;
      const subs = dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
      if (subs === 0) continue;
      const hhSubs = dm.subs.fiber.hh + dm.subs.wireless.hh;
      const bizSubs = dm.subs.fiber.biz + dm.subs.wireless.biz;
      const avgSpeed = subs > 0 ? (hhSubs * consumerMix.avgSpeed + bizSubs * businessMix.avgSpeed) / subs : 0;
      districtTraffic.set(dm.districtId, subs * DEMAND.perSubMbps(avgSpeed));
      districtAnchor.set(dm.districtId, svc.anchorId);
    }

    // 8. Full connectivity + routing ----------------------------------------------
    const conn = computeConnectivity(save, districtTraffic, districtAnchor);
    for (const s of save.sites) {
      // Cabinets ride on town distribution fiber (see cabinetTownServed);
      // COs are roots. Only towers/other sites are gated by graph reachability.
      if (s.kind === "cabinet" || s.kind === "co") continue;
      if (s.status === "online" && !conn.sites.get(s.id)?.reachable) {
        s.status = "offline";
      }
    }
    // Link usage + flows.
    for (const l of save.links) {
      l.usedMbps = Math.round(conn.linkUsed.get(l.id) ?? 0);
      l.flowMbps = l.usedMbps;
    }

    // 9. Customers ----------------------------------------------------------------
    const mktEffect = marketingEffect(save, p.marketingMult);
    const outcomes = tickCustomers(save, {
      conn,
      coverage,
      marketingEffect: mktEffect,
      businessChurnMult: p.businessChurnMult,
      rng: this.rng,
      events,
    });

    // Congestion: delivered speed limited by backhaul and sector capacity.
    for (const [districtId, outcome] of outcomes) {
      const dm = outcome.market;
      const svc = services.get(districtId);
      const subs = dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
      if (!svc?.anchorId || subs === 0) {
        dm.deliveredMbps = 0;
        continue;
      }
      const connD = conn.sites.get(svc.anchorId);
      let factor = 1;
      if (connD && connD.pathLinkIds.length > 0) {
        for (const lid of connD.pathLinkIds) {
          const link = save.links.find((l) => l.id === lid);
          if (!link || link.usedMbps <= 0) continue;
          factor = Math.min(factor, link.capacityMbps / link.usedMbps);
        }
      }
      const cov = coverage.get(districtId);
      if (cov) {
        const tower = save.sites.find((t) => t.id === cov.towerId);
        const sector = tower?.radios?.[cov.sectorIdx];
        if (sector && sector.usedMbps > 0) {
          factor = Math.min(factor, sector.capacityMbps / sector.usedMbps);
        }
      }
      const avgSpeed = planMix(enabledPlans(save, "consumer")).avgSpeed;
      dm.deliveredMbps = Math.max(0, avgSpeed * Math.min(1, factor));
      if (factor < 0.85 && subs >= 25 && save.meta.gameDay % 5 === 0) {
        events.push({
          type: "congestion",
          day,
          severity: factor < 0.5 ? "critical" : "warning",
          message: `${districtName(save, districtId)} is congested — delivered speeds at ${Math.round(Math.min(1, factor) * 100)}%.`,
        });
      }
      // Track sector usage.
      if (cov) {
        const tower = save.sites.find((t) => t.id === cov.towerId);
        const sector = tower?.radios?.[cov.sectorIdx];
        if (sector && outcome.market) {
          const wSubs = dm.subs.wireless.hh + dm.subs.wireless.biz;
          sector.usedMbps += wSubs * DEMAND.perSubMbps(consumerMix.avgSpeed);
        }
      }
    }

    // Site capacity usage.
    for (const s of save.sites) {
      if (s.kind === "cabinet") {
        const dm = save.districtsMarket[s.districtId ?? ""];
        s.used = dm ? dm.subs.fiber.hh + dm.subs.fiber.biz : 0;
      } else if (s.kind === "co") {
        s.used = 0;
      }
    }
    // CO usage: subscribers whose path roots at this CO.
    for (const [districtId, anchorId] of districtAnchor) {
      const root = connRootOf(conn, anchorId);
      if (!root) continue;
      const co = save.sites.find((x) => x.id === root && x.kind === "co");
      if (!co) continue;
      const dm = save.districtsMarket[districtId];
      if (dm) {
        co.used += dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
      }
    }

    // 10. Finance ----------------------------------------------------------------
    const revenue = dailyRevenue(save) + this.b2bRevenue();
    const tax = revenueTax(save, revenue);
    const opex = dailyOpex(save, fuelOrders);
    const interest = dailyInterest(save);
    save.finance.cash += revenue - opex - interest - tax;
    ledger(save, "revenue", revenue, "Subscription revenue");
    ledger(save, "opex", -opex, "Operating expenses");
    ledger(save, "interest", -interest, "Bond interest");
    ledger(save, "opex", -tax, "Revenue taxes");

    // Monthly roll: end of month at day % 30 === 0; bond payments on day 1.
    if (day % DAYS_PER_MONTH === 0) {
      rollMonth(save);
    }
    if (day % DAYS_PER_MONTH === 1) {
      processBondPayments(save, events);
    }
    emergencyCredit(save, events);

    // 11. Research / campaigns / rivals / condition ------------------------------
    for (const [techId, st] of Object.entries(save.research)) {
      if (st.status !== "researching") continue;
      if (st.startedDay !== undefined && day - st.startedDay >= techDays(techId)) {
        st.status = "done";
        st.doneDay = day;
        refreshResearchState(save);
        events.push({
          type: "researchDone",
          day,
          severity: "info",
          message: `Research complete: ${techName(techId)}.`,
        });
      }
    }
    for (const c of save.campaigns) {
      c.daysLeft -= 1;
    }
    save.campaigns = save.campaigns.filter((c) => c.daysLeft > 0);
    tickCompetition(save, this.rng);

    for (const s of save.sites) {
      if (s.status === "online" && s.condition > 5) s.condition = Math.max(5, s.condition - 0.02);
    }
    for (const l of save.links) {
      if (l.status === "online" && l.condition > 5) l.condition = Math.max(5, l.condition - 0.02);
    }

    save.rngState = this.rng.state;
    return events;
  }

  private b2bRevenue(): number {
    // Business plans already include B2B contracts; this is the enterprise uplift.
    let uplift = 0;
    const bizPlans = enabledPlans(this.save, "business");
    if (bizPlans.length === 0) return 0;
    for (const dm of Object.values(this.save.districtsMarket)) {
      uplift += ((dm.subs.fiber.biz + dm.subs.wireless.biz) * 8) / 30;
    }
    return uplift;
  }

  private tickProjects(events: GameEvent[]): void {
    const save = this.save;
    for (const proj of [...save.projects]) {
      proj.daysRemaining -= 1;
      proj.buildProgress = proj.daysRequired > 0 ? 1 - proj.daysRemaining / proj.daysRequired : 1;
      // Mirror progress onto the map element for the construction animation.
      const el =
        proj.type === "fiber" || proj.type === "microwave"
          ? save.links.find((l) => l.id === proj.targetId)
          : save.sites.find((s) => s.id === proj.targetId);
      if (el) el.buildProgress = proj.buildProgress;
      if (proj.daysRemaining > 0) continue;
      save.projects = save.projects.filter((p) => p.id !== proj.id);
      this.completeProject(proj, events);
    }
  }

  private completeProject(proj: Project, events: GameEvent[]): void {
    const save = this.save;
    switch (proj.type) {
      case "co":
      case "tower":
      case "cabinet": {
        const site = save.sites.find((s) => s.id === proj.targetId);
        if (site) {
          site.status = "online";
          site.builtDay = save.meta.gameDay;
          site.condition = 100;
          this.invalidateCoverage();
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `${site.name} is commissioned and online.`,
          });
        }
        break;
      }
      case "fiber":
      case "microwave": {
        const link = save.links.find((l) => l.id === proj.targetId);
        if (link) {
          link.status = "online";
          link.builtDay = save.meta.gameDay;
          link.condition = 100;
          if (link.kind === "fiber") {
            const t = save.sites.find((s) => s.id === link.to);
            if (t?.kind === "tower") t.fiberFed = true;
            const f = save.sites.find((s) => s.id === link.from);
            if (f?.kind === "tower") f.fiberFed = true;
          }
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `${link.name} is live.`,
          });
        }
        break;
      }
      case "battery": {
        const site = save.sites.find((s) => s.id === proj.siteId);
        if (site) {
          site.power.batteryTier = proj.tier;
          const def = batteryHours(proj.tier);
          site.power.batteryCapacityH = def;
          site.power.batteryLevelH = def;
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `Battery bank installed at ${site.name} (${def}h runtime).`,
          });
        }
        break;
      }
      case "generator": {
        const site = save.sites.find((s) => s.id === proj.siteId);
        if (site) {
          site.power.generatorTier = proj.tier;
          site.power.fuelPct = 1;
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `Generator installed at ${site.name}.`,
          });
        }
        break;
      }
      case "solar": {
        const site = save.sites.find((s) => s.id === proj.siteId);
        if (site) {
          site.power.source = "solar";
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `Solar array installed at ${site.name}.`,
          });
        }
        break;
      }
      case "renovate": {
        const site = save.sites.find((s) => s.id === proj.siteId);
        if (site) {
          site.condition = 100;
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `Renovation complete at ${site.name}.`,
          });
        }
        break;
      }
      case "upgrade": {
        const site = save.sites.find((s) => s.id === proj.siteId);
        if (site) {
          this.applyUpgrade(site, proj.tier);
          this.invalidateCoverage();
          events.push({
            type: "projectDone",
            day: save.meta.gameDay,
            severity: "info",
            message: `${site.name} upgraded to tier ${proj.tier}.`,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  private applyUpgrade(site: Site, tier: number): void {
    site.tier = tier;
    site.condition = 100;
    if (site.kind === "co") {
      site.capacity = coCapacity(tier);
    } else if (site.kind === "cabinet") {
      site.capacity = cabinetCapacity(tier);
    } else if (site.kind === "tower") {
      attachRadios(site);
    }
  }

  /** Recompute derived statuses from power/mode. */
  refreshStatuses(): void {
    for (const s of this.save.sites) {
      if (s.status === "building" || s.status === "planned" || s.status === "decommissioned") continue;
      if (s.status === "failed") continue;
      if (s.power.mode === "down") {
        s.status = "unpowered";
      } else if (s.status === "unpowered" || s.status === "offline") {
        s.status = "online";
      }
    }
    for (const l of this.save.links) {
      if (l.status === "building" || l.status === "planned") continue;
      if (l.status === "cut" || l.status === "failed") continue;
      l.status = "online";
    }
  }
}

// --- Helpers ------------------------------------------------------------------

function connRootOf(conn: ReturnType<typeof computeConnectivity>, anchorId: string): string | undefined {
  return conn.sites.get(anchorId)?.rootId;
}

function siteName(save: GameSave, id: string): string {
  return save.sites.find((s) => s.id === id)?.name ?? id;
}

function districtName(save: GameSave, id: string): string {
  return save.map.districts.find((d) => d.id === id)?.name ?? id;
}

const RADIO_TIERS = [
  { sectorMbps: 250, maxRangeKm: 18 },
  { sectorMbps: 600, maxRangeKm: 22 },
  { sectorMbps: 1500, maxRangeKm: 9 },
] as const;
const RADIO_SECTORS = [3, 4, 6] as const;

export function coCapacity(tier: number): number {
  return CO_TIERS[tier - 1]?.capacity ?? 2000 * tier;
}

export function cabinetCapacity(tier: number): number {
  return CABINET_TIERS[tier - 1]?.capacity ?? 32 * tier;
}

export function batteryHours(tier: number): number {
  return POWER.battery.tiers[tier - 1]?.hours ?? 4;
}

function techDays(id: string): number {
  return TECHS.find((t) => t.id === id)?.days ?? 10;
}

function techName(id: string): string {
  return TECHS.find((t) => t.id === id)?.name ?? id;
}

/** Build the radio sector array for a tower of the given tier. */
export function attachRadios(site: Site): void {
  const sectors = RADIO_SECTORS[site.tier] ?? 3;
  const step = 360 / sectors;
  site.radios = Array.from({ length: sectors }, (_, i) => ({
    azimuth: i * step,
    rangeKm: RADIO_TIERS[site.tier - 1]?.maxRangeKm ?? 15,
    capacityMbps: RADIO_TIERS[site.tier - 1]?.sectorMbps ?? 250,
    usedMbps: 0,
  }));
}
