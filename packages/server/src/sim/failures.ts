/**
 * Failure simulation: equipment failures, cable cuts, vandalism, storms,
 * grid outages, and repair-crew resolution.
 */
import { FAILURE, REPAIR, STAFF, WORLD } from "@heartland/shared";
import type { GameEvent, GameSave, Incident, IncidentSeverity } from "@heartland/shared";
import type { RngState } from "./rng.js";
import { rngChance, rngInt, rngRange } from "./rng.js";
import { seqId } from "../util/ids.js";

export function conditionFactor(condition: number): number {
  // 100 -> 0.5x, 0 -> 6.5x failure probability.
  return 0.5 + ((100 - Math.max(0, condition)) / 100) * 6;
}

export function repairPoints(severity: IncidentSeverity): number {
  return REPAIR.pointsPerSeverity[severity - 1] ?? 4;
}

function affectedCustomersFor(save: GameSave, sites: string[], links: string[]): number {
  let n = 0;
  const linkSiteIds = new Set<string>();
  for (const l of links) {
    const link = save.links.find((x) => x.id === l);
    if (!link) continue;
    linkSiteIds.add(link.from);
    linkSiteIds.add(link.to);
  }
  for (const s of sites) linkSiteIds.add(s);
  for (const dm of Object.values(save.districtsMarket)) {
    const district = save.map.districts.find((d) => d.id === dm.districtId);
    if (!district) continue;
    const subs = dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
    if (subs === 0) continue;
    const townSites = save.sites.filter((s) => s.townId === district.townId);
    if (townSites.some((s) => linkSiteIds.has(s.id))) n += subs;
  }
  return n;
}

export interface FailureContext {
  stormRateMult: number;
  ambientStorms: boolean;
  equipmentFailures: boolean;
  rng: RngState;
}

/**
 * Roll random failures for a day and return newly created incidents.
 * Element statuses are set directly (site 'failed', link 'cut'/'failed').
 */
export function rollFailures(save: GameSave, ctx: FailureContext, events: GameEvent[]): void {
  const rng = ctx.rng;

  if (ctx.equipmentFailures) {
    for (const site of save.sites) {
      if (site.status !== "online") continue;
      const p = (1 / FAILURE.siteMtbfDays) * conditionFactor(site.condition);
      if (rngChance(rng, p)) {
        site.status = "failed";
        const sev: IncidentSeverity = rngChance(rng, 0.3) ? 2 : 1;
        const incident = makeIncident(save, {
          kind: "equipmentFailure",
          severity: sev,
          name: `Equipment failure at ${site.name}`,
          x: site.x,
          y: site.y,
          radiusKm: 0,
          affectedSites: [site.id],
          note: "A field repair crew is required.",
        });
        save.incidents.push(incident);
        events.push({
          type: "incident",
          day: save.meta.gameDay,
          severity: sev === 1 ? "warning" : "critical",
          message: incident.name,
        });
      }
    }
    for (const link of save.links) {
      if (link.status !== "online") continue;
      const p = (1 / FAILURE.linkMtbfDays) * conditionFactor(link.condition);
      let hit = rngChance(rng, p);
      if (!hit && rngChance(rng, FAILURE.cableCutChancePerDay)) hit = true;
      if (!hit && rngChance(rng, FAILURE.vandalismChancePerDay)) hit = true;
      if (hit) {
        link.status = "cut";
        const incident = makeIncident(save, {
          kind: "cableCut",
          severity: 1,
          name: `Fiber cut on ${link.name}`,
          x: link.path[Math.floor(link.path.length / 2)]?.x,
          y: link.path[Math.floor(link.path.length / 2)]?.y,
          radiusKm: 0,
          affectedLinks: [link.id],
          note: "A splicing crew must repair the cut.",
        });
        save.incidents.push(incident);
        events.push({
          type: "incident",
          day: save.meta.gameDay,
          severity: "warning",
          message: incident.name,
        });
      }
    }
  }

  if (ctx.ambientStorms) {
    const p = (1 / FAILURE.stormMeanIntervalDays) * ctx.stormRateMult;
    if (rngChance(rng, p)) {
      const sev = rngInt(rng, FAILURE.stormMinSeverity, FAILURE.stormMaxSeverity) as IncidentSeverity;
      const x = rngRange(rng, 40, WORLD.widthKm - 40);
      const y = rngRange(rng, 40, WORLD.heightKm - 40);
      startStorm(
        save,
        sev,
        x,
        y,
        sev === 1 ? 42 : sev === 2 ? 65 : 95,
        rng,
        events,
        "A storm system has moved into the region",
      );
    }
  }
}

/**
 * Start a storm (ambient or player-run exercise). Damages exposed elements
 * and creates the incident.
 */
export function startStorm(
  save: GameSave,
  severity: IncidentSeverity,
  x: number,
  y: number,
  radiusKm: number,
  rng: RngState,
  events: GameEvent[],
  note: string,
): Incident {
  const hitChance = FAILURE.stormHitChance[severity - 1] ?? 0.2;
  const affectedSites: string[] = [];
  const affectedLinks: string[] = [];

  for (const site of save.sites) {
    if (site.status !== "online" && site.status !== "offline" && site.status !== "unpowered") continue;
    if (Math.hypot(site.x - x, site.y - y) <= radiusKm && rngChance(rng, hitChance)) {
      site.status = "failed";
      affectedSites.push(site.id);
    }
  }
  for (const link of save.links) {
    if (link.status === "building" || link.status === "planned") continue;
    const mid = link.path[Math.floor(link.path.length / 2)] ?? { x, y };
    if (Math.hypot(mid.x - x, mid.y - y) <= radiusKm && rngChance(rng, hitChance)) {
      link.status = "cut";
      affectedLinks.push(link.id);
    }
  }

  const incident = makeIncident(save, {
    kind: "storm",
    severity,
    name: `${severityName(severity)} storm system`,
    x,
    y,
    radiusKm,
    affectedSites,
    affectedLinks,
    note,
  });
  save.incidents.push(incident);
  const hitCount = affectedSites.length + affectedLinks.length;
  events.push({
    type: "incident",
    day: save.meta.gameDay,
    severity: severity >= 2 ? "critical" : "warning",
    message: `${incident.name} is affecting the region — ${hitCount} asset(s) damaged, ${incident.affectedCustomers} customer(s) impacted.`,
  });
  return incident;
}

export function severityName(sev: number): string {
  return sev === 3 ? "Severe" : sev === 2 ? "Strong" : "Moderate";
}

function makeIncident(
  save: GameSave,
  args: {
    kind: Incident["kind"];
    severity: IncidentSeverity;
    name: string;
    x?: number;
    y?: number;
    radiusKm?: number;
    affectedSites?: string[];
    affectedLinks?: string[];
    note: string;
  },
): Incident {
  const affectedCustomers = affectedCustomersFor(save, args.affectedSites ?? [], args.affectedLinks ?? []);
  return {
    id: seqId("inc", save.counters),
    kind: args.kind,
    severity: args.severity,
    name: args.name,
    day: save.meta.gameDay,
    status: "active",
    x: args.x,
    y: args.y,
    radiusKm: args.radiusKm,
    affectedSites: args.affectedSites ?? [],
    affectedLinks: args.affectedLinks ?? [],
    affectedCustomers,
    crewAssigned: false,
    pointsRemaining: repairPoints(args.severity),
    note: args.note,
  };
}

/**
 * Advance active incidents by one day. Assigned crews spend repair points
 * (FIFO). Resolved incidents restore their elements.
 */
export function tickIncidents(save: GameSave, repairPointsPerDay: number, events: GameEvent[]): void {
  const active = save.incidents.filter((i) => i.status === "active");
  let pool = repairPointsPerDay;
  for (const inc of active) {
    if (!inc.crewAssigned) continue;
    const spend = Math.min(pool, inc.pointsRemaining);
    inc.pointsRemaining -= spend;
    pool -= spend;
    if (inc.pointsRemaining <= 0) {
      inc.status = "resolved";
      // Restore elements (power will decide whether they can come back online).
      for (const sid of inc.affectedSites) {
        const site = save.sites.find((s) => s.id === sid);
        if (site && site.status === "failed") site.status = "offline";
      }
      for (const lid of inc.affectedLinks) {
        const link = save.links.find((l) => l.id === lid);
        if (link && (link.status === "cut" || link.status === "failed")) link.status = "offline";
      }
      events.push({
        type: "incidentResolved",
        day: save.meta.gameDay,
        severity: "info",
        message: `${inc.name} resolved — service restoration in progress.`,
      });
    }
    if (pool <= 0) break;
  }
}

/** Grid-outage regions implied by active storms (storms knock out grid power). */
export function gridOutageRegions(save: GameSave): { x: number; y: number; r: number }[] {
  const regions: { x: number; y: number; r: number }[] = [];
  for (const inc of save.incidents) {
    if (inc.status !== "active") continue;
    if (inc.kind === "storm" && inc.x !== undefined && inc.y !== undefined && inc.radiusKm) {
      regions.push({ x: inc.x, y: inc.y, r: inc.radiusKm });
    }
  }
  return regions;
}

/** Repair points available per day given staff and perks. */
export function repairPointsPerDay(save: GameSave, perkMult: number): number {
  return save.staff.repairCrews * STAFF.repairCrew.repairPointsPerDay * perkMult;
}
