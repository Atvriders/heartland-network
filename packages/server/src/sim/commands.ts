/**
 * Player commands: validation, project planning, and application.
 * All monetary checks happen here; the engine only advances time.
 */
import {
  CABINET_TIERS,
  CO_TIERS,
  DWDM,
  FIBER_TIERS,
  MAINTENANCE,
  MARKETING,
  MICROWAVE_TIERS,
  POWER,
  RADIO_TIERS,
  STAFF,
  TECHS,
  UPGRADES,
  WORLD,
} from "@heartland/shared";
import type {
  Command,
  CommandResult,
  GameEvent,
  GameSave,
  Link,
  Project,
  Site,
  Vec2,
} from "@heartland/shared";
import { elevationAt } from "./noise.js";
import { hashString, makeRng } from "./rng.js";
import { hasTech } from "./research.js";
import { hasLos } from "./wireless.js";
import { siteLoadKw } from "./power.js";
import { startStorm } from "./failures.js";
import { issueBond } from "./finance.js";
import { seqId } from "../util/ids.js";
import { attachRadios, cabinetCapacity, coCapacity, type GameEngine } from "./engine.js";

export interface PlanResult {
  ok: boolean;
  error?: string;
  project?: Omit<Project, "id" | "startedDay" | "targetId">;
  path?: Vec2[];
  cost?: number;
  days?: number;
}

function err(msg: string): PlanResult {
  return { ok: false, error: msg };
}

// ---------------------------------------------------------------------------
// Planning helpers
// ---------------------------------------------------------------------------

/** Shortest road path between two towns (Dijkstra over the road graph). */
export function roadPath(save: GameSave, fromTownId: string, toTownId: string): Vec2[] | null {
  if (fromTownId === toTownId) return [];
  const dist = new Map<string, number>();
  const prev = new Map<string, { town: string; roadId: string }>();
  const pq: { id: string; d: number }[] = [];
  dist.set(fromTownId, 0);
  pq.push({ id: fromTownId, d: 0 });
  while (pq.length > 0) {
    pq.sort((a, b) => b.d - a.d);
    const { id, d } = pq.pop()!;
    if ((dist.get(id) ?? Infinity) < d) continue;
    for (const r of save.map.roads) {
      if (r.from !== id && r.to !== id) continue;
      const other = r.from === id ? r.to : r.from;
      const nd = d + r.lengthKm;
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd);
        prev.set(other, { town: id, roadId: r.id });
        pq.push({ id: other, d: nd });
      }
    }
  }
  if (!dist.has(toTownId)) return null;
  const roadIds: string[] = [];
  let cur = toTownId;
  while (cur !== fromTownId) {
    const p = prev.get(cur);
    if (!p) return null;
    roadIds.unshift(p.roadId);
    cur = p.town;
  }
  const points: Vec2[] = [];
  let at = fromTownId;
  for (const rid of roadIds) {
    const road = save.map.roads.find((r) => r.id === rid);
    if (!road) return null;
    if (road.from === at) {
      points.push(...road.points.slice(1));
      at = road.to;
    } else {
      points.push(...[...road.points].reverse().slice(1));
      at = road.from;
    }
  }
  return points;
}

export function polylineLength(points: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return len;
}

/** Terrain difficulty factor 1..2 based on slope along the path. */
function terrainSlopeFactor(save: GameSave, points: Vec2[]): number {
  let total = 0;
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segKm = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(segKm / 5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const tPrev = (s - 1) / steps;
      const e1 = elevationAt(
        save.map.elevation,
        save.map.gridCols,
        save.map.gridRows,
        WORLD.cellKm,
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
      );
      const e2 = elevationAt(
        save.map.elevation,
        save.map.gridCols,
        save.map.gridRows,
        WORLD.cellKm,
        a.x + (b.x - a.x) * tPrev,
        a.y + (b.y - a.y) * tPrev,
      );
      const runKm = Math.max(0.5, segKm / steps);
      total += Math.min(1, Math.abs(e1 - e2) / runKm / 90);
      n++;
    }
  }
  return n > 0 ? total / n : 0;
}

export function linkCapacityMbps(link: Pick<Link, "kind" | "tier" | "dwdm">): number {
  const base =
    link.kind === "fiber"
      ? (FIBER_TIERS[link.tier - 1]?.capacityMbps ?? 1000)
      : (MICROWAVE_TIERS[link.tier - 1]?.capacityMbps ?? 500);
  if (link.kind === "fiber" && link.dwdm) return base * DWDM.capacityMultiplier;
  return base;
}

/** Nearest town to a site, or null when far from the road network. */
export function siteTown(save: GameSave, site: Site): { id: string } | null {
  if (site.townId) return { id: site.townId };
  let best: { id: string; d: number } | null = null;
  for (const t of save.map.towns) {
    const d = Math.hypot(t.x - site.x, t.y - site.y);
    if (!best || d < best.d) best = { id: t.id, d };
  }
  return best && best.d <= 30 ? best : null;
}

/** Deduplicate consecutive near-identical points. */
function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.1) out.push(p);
  }
  return out;
}

export function planLink(
  save: GameSave,
  kind: "fiber" | "microwave",
  tier: number,
  fromId: string,
  toId: string,
): PlanResult {
  const from = save.sites.find((s) => s.id === fromId);
  const to = save.sites.find((s) => s.id === toId);
  if (!from || !to) return err("Unknown site.");
  if (from.id === to.id) return err("A link needs two different sites.");
  if (from.status === "decommissioned" || to.status === "decommissioned")
    return err("Site is decommissioned.");
  if (kind === "fiber" && (tier < 1 || tier > FIBER_TIERS.length)) return err("Invalid fiber tier.");
  if (kind === "microwave" && (from.kind !== "tower" || to.kind !== "tower")) {
    return err("Microwave links connect two towers.");
  }

  if (kind === "fiber") {
    const def = FIBER_TIERS[tier - 1];
    if (!def) return err("Invalid fiber tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.name}.`);
    const townA = siteTown(save, from);
    const townB = siteTown(save, to);
    if (!townA || !townB) return err("Cannot route fiber: a site is too far from any town.");
    const route = roadPath(save, townA.id, townB.id);
    if (route === null) return err("No road path between those towns.");
    const a = save.map.towns.find((t) => t.id === townA.id)!;
    const b = save.map.towns.find((t) => t.id === townB.id)!;
    const path = dedupe([
      { x: from.x, y: from.y },
      { x: a.x, y: a.y },
      ...route,
      { x: b.x, y: b.y },
      { x: to.x, y: to.y },
    ]);
    const lengthKm = polylineLength(path);
    if (lengthKm < 0.5) return err("Sites are essentially in the same place.");
    const slopeF = terrainSlopeFactor(save, path);
    const cost = Math.round(lengthKm * def.costPerKm * (1 + slopeF));
    const days = Math.max(7, Math.round(lengthKm * def.daysPerKm));
    return {
      ok: true,
      cost,
      days,
      path,
      project: {
        type: "fiber",
        name: `Fiber ${from.name} → ${to.name}`,
        tier,
        from: from.id,
        to: to.id,
        costTotal: cost,
        daysRequired: days,
        daysRemaining: days,
        buildProgress: 0,
      },
    };
  }

  const def = MICROWAVE_TIERS[tier - 1];
  if (!def) return err("Invalid microwave tier.");
  if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.name}.`);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist > def.maxRangeKm) {
    return err(`Too far for this equipment (${dist.toFixed(1)} km > ${def.maxRangeKm} km).`);
  }
  const hFrom =
    elevationAt(save.map.elevation, save.map.gridCols, save.map.gridRows, WORLD.cellKm, from.x, from.y) +
    (RADIO_TIERS[from.tier - 1]?.heightM ?? 40);
  const hTo =
    elevationAt(save.map.elevation, save.map.gridCols, save.map.gridRows, WORLD.cellKm, to.x, to.y) +
    (RADIO_TIERS[to.tier - 1]?.heightM ?? 40);
  if (!hasLos(save, from.x, from.y, hFrom, to.x, to.y, hTo, 18)) {
    return err("No line of sight between the towers (terrain blocks the path).");
  }
  return {
    ok: true,
    cost: def.cost,
    days: def.days,
    path: [
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
    ],
    project: {
      type: "microwave",
      name: `Microwave ${from.name} → ${to.name}`,
      tier,
      from: from.id,
      to: to.id,
      costTotal: def.cost,
      daysRequired: def.days,
      daysRemaining: def.days,
      buildProgress: 0,
    },
  };
}

export function planSiteProject(
  save: GameSave,
  type: "co" | "tower" | "cabinet",
  tier: number,
  args: { x?: number; y?: number; townId?: string; districtId?: string; name?: string },
): PlanResult {
  let x: number | undefined;
  let y: number | undefined;
  let townId: string | undefined;
  let districtId: string | undefined;
  let cost = 0;
  let days = 0;

  if (type === "co") {
    const def = CO_TIERS[tier - 1];
    if (!def) return err("Invalid office tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    if (!args.townId) return err("Choose a town for the office.");
    const town = save.map.towns.find((t) => t.id === args.townId);
    if (!town) return err("Unknown town.");
    if (save.sites.some((s) => s.kind === "co" && s.townId === town.id)) {
      return err("This town already has a central office.");
    }
    x = town.x;
    y = town.y;
    townId = town.id;
    districtId = args.districtId ?? town.districtIds[0];
    cost = def.cost;
    days = def.days;
  } else if (type === "cabinet") {
    const def = CABINET_TIERS[tier - 1];
    if (!def) return err("Invalid cabinet tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    if (!args.districtId) return err("Choose a district for the cabinet.");
    const district = save.map.districts.find((d) => d.id === args.districtId);
    if (!district) return err("Unknown district.");
    if (save.sites.some((s) => s.kind === "cabinet" && s.districtId === district.id)) {
      return err("This district already has a cabinet.");
    }
    x = district.x;
    y = district.y;
    townId = district.townId;
    districtId = district.id;
    cost = def.cost;
    days = def.days;
  } else {
    const def = RADIO_TIERS[tier - 1];
    if (!def) return err("Invalid radio tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    if (args.x === undefined || args.y === undefined) return err("Choose a location for the tower.");
    if (args.x < 0 || args.x > WORLD.widthKm || args.y < 0 || args.y > WORLD.heightKm) {
      return err("Tower location is outside the state.");
    }
    x = args.x;
    y = args.y;
    const nearest = save.map.towns
      .map((t) => ({ t, d: Math.hypot(t.x - x!, t.y - y!) }))
      .sort((a, b) => a.d - b.d)[0];
    townId = nearest && nearest.d <= 8 ? nearest.t.id : undefined;
    const grid = townId !== undefined;
    const autoGen = grid
      ? 0
      : Math.round(POWER.generator.tiers[0]!.costPerKw * siteLoadKw({ kind: "tower", tier } as Site));
    cost = def.structureCost + def.equipCost + autoGen;
    days = def.days;
  }

  const name = args.name?.trim() || defaultSiteName(save, type, townId, districtId);
  return {
    ok: true,
    cost,
    days,
    project: {
      type,
      name,
      tier,
      x,
      y,
      costTotal: cost,
      daysRequired: days,
      daysRemaining: days,
      buildProgress: 0,
    },
  };
}

function defaultSiteName(
  save: GameSave,
  type: "co" | "tower" | "cabinet",
  townId?: string,
  districtId?: string,
): string {
  if (type === "co" && townId) {
    const town = save.map.towns.find((t) => t.id === townId);
    return `${town?.name ?? "Town"} Central Office`;
  }
  if (type === "cabinet" && districtId) {
    const d = save.map.districts.find((x) => x.id === districtId);
    return `${d?.name ?? "District"} Cabinet`;
  }
  const n = save.sites.filter((s) => s.kind === "tower").length + 1;
  return `Tower ${String(n).padStart(2, "0")}`;
}

export function planImprovement(
  save: GameSave,
  type: "battery" | "generator" | "solar" | "renovate" | "upgrade",
  tier: number,
  siteId: string,
): PlanResult {
  const site = save.sites.find((s) => s.id === siteId);
  if (!site) return err("Unknown site.");
  if (site.status === "decommissioned") return err("Site is decommissioned.");
  const kw = siteLoadKw(site);

  switch (type) {
    case "battery": {
      const def = POWER.battery.tiers[tier - 1];
      if (!def) return err("Invalid battery tier.");
      if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
      if (site.power.batteryTier >= tier)
        return err("A battery of this tier or better is already installed.");
      const cost = UPGRADES.batteryCost(tier, kw);
      return {
        ok: true,
        cost,
        days: UPGRADES.batteryDays,
        project: {
          type,
          name: `${def.name} at ${site.name}`,
          tier,
          siteId: site.id,
          costTotal: cost,
          daysRequired: UPGRADES.batteryDays,
          daysRemaining: UPGRADES.batteryDays,
          buildProgress: 0,
        },
      };
    }
    case "generator": {
      const def = POWER.generator.tiers[tier - 1];
      if (!def) return err("Invalid generator tier.");
      if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
      if (site.power.generatorTier >= tier)
        return err("A generator of this tier or better is already installed.");
      const cost = UPGRADES.generatorCost(tier, kw);
      return {
        ok: true,
        cost,
        days: UPGRADES.generatorDays,
        project: {
          type,
          name: `${def.name} at ${site.name}`,
          tier,
          siteId: site.id,
          costTotal: cost,
          daysRequired: UPGRADES.generatorDays,
          daysRemaining: UPGRADES.generatorDays,
          buildProgress: 0,
        },
      };
    }
    case "solar": {
      if (!hasTech(save, POWER.solar.requires)) return err("Requires research: power-solar.");
      if (site.power.source === "solar") return err("Solar is already installed.");
      const cost = UPGRADES.solarCost(kw);
      return {
        ok: true,
        cost,
        days: UPGRADES.solarDays,
        project: {
          type,
          name: `Solar array at ${site.name}`,
          tier: 1,
          siteId: site.id,
          costTotal: cost,
          daysRequired: UPGRADES.solarDays,
          daysRemaining: UPGRADES.solarDays,
          buildProgress: 0,
        },
      };
    }
    case "renovate": {
      if (site.condition >= 95) return err("This site does not need renovation.");
      const cost = MAINTENANCE.renovateCost(site.tier);
      return {
        ok: true,
        cost,
        days: MAINTENANCE.renovateDays,
        project: {
          type,
          name: `Renovate ${site.name}`,
          tier: site.tier,
          siteId: site.id,
          costTotal: cost,
          daysRequired: MAINTENANCE.renovateDays,
          daysRemaining: MAINTENANCE.renovateDays,
          buildProgress: 0,
        },
      };
    }
    case "upgrade": {
      const targetTier = tier;
      if (targetTier !== site.tier + 1) return err("Upgrades move one tier at a time.");
      const info = upgradeInfo(save, site, targetTier);
      if (!info.ok) return info;
      return {
        ok: true,
        cost: info.cost,
        days: info.days,
        project: {
          type,
          name: `Upgrade ${site.name} to Tier ${targetTier}`,
          tier: targetTier,
          siteId: site.id,
          costTotal: info.cost!,
          daysRequired: info.days!,
          daysRemaining: info.days!,
          buildProgress: 0,
        },
      };
    }
    default:
      return err("Unknown project type.");
  }
}

function upgradeInfo(save: GameSave, site: Site, targetTier: number): PlanResult {
  if (site.kind === "co") {
    const def = CO_TIERS[targetTier - 1];
    if (!def) return err("No such office tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    const cur = CO_TIERS[site.tier - 1]!;
    return { ok: true, cost: Math.round((def.cost - cur.cost) * 0.8), days: Math.round(def.days * 0.6) };
  }
  if (site.kind === "cabinet") {
    const def = CABINET_TIERS[targetTier - 1];
    if (!def) return err("No such cabinet tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    const cur = CABINET_TIERS[site.tier - 1]!;
    return { ok: true, cost: Math.round((def.cost - cur.cost) * 0.8), days: Math.round(def.days * 0.6) };
  }
  if (site.kind === "tower") {
    const def = RADIO_TIERS[targetTier - 1];
    if (!def) return err("No such radio tier.");
    if (def.requires && !hasTech(save, def.requires)) return err(`Requires research: ${def.requires}.`);
    const cur = RADIO_TIERS[site.tier - 1]!;
    return {
      ok: true,
      cost: Math.round((def.equipCost - cur.equipCost) * 0.9),
      days: Math.round(def.days * 0.5),
    };
  }
  return err("Upgrades are not available for this element.");
}

// ---------------------------------------------------------------------------
// Command application
// ---------------------------------------------------------------------------

export function applyCommand(save: GameSave, engine: GameEngine, cmd: Command): CommandResult {
  const events: GameEvent[] = [];
  const day = save.meta.gameDay;
  const event = (type: GameEvent["type"], severity: GameEvent["severity"], message: string) =>
    events.push({ type, day, severity, message });

  switch (cmd.cmd) {
    case "setSpeed":
      if (![1, 2, 5, 15].includes(cmd.speed)) return { ok: false, error: "Invalid speed.", events };
      save.meta.speed = cmd.speed;
      break;
    case "setPaused":
      save.meta.paused = cmd.paused;
      break;
    case "rename": {
      const name = cmd.name.trim();
      if (name.length < 2 || name.length > 80)
        return { ok: false, error: "Name must be 2–80 characters.", events };
      save.meta.name = name;
      break;
    }
    case "startProject": {
      const result = startProject(save, engine, cmd);
      if (!result.ok) return result;
      events.push(...result.events);
      break;
    }
    case "cancelProject": {
      const proj = save.projects.find((p) => p.id === cmd.projectId);
      if (!proj) return { ok: false, error: "Unknown project.", events };
      const refund = Math.round(proj.costTotal * 0.6);
      save.finance.cash += refund;
      save.projects = save.projects.filter((p) => p.id !== proj.id);
      if (proj.type === "fiber" || proj.type === "microwave") {
        save.links = save.links.filter((l) => l.id !== proj.targetId);
      } else if (proj.targetId && (proj.type === "co" || proj.type === "tower" || proj.type === "cabinet")) {
        save.sites = save.sites.filter((s) => s.id !== proj.targetId);
        engine.invalidateCoverage();
      }
      event("info", "info", `Project cancelled — $${refund.toLocaleString()} refunded.`);
      break;
    }
    case "setPlanPrice": {
      const plan = save.plans.find((p) => p.id === cmd.planId);
      if (!plan) return { ok: false, error: "Unknown plan.", events };
      const price = Math.round(cmd.price);
      if (price < 0 || price > 500)
        return { ok: false, error: "Price must be $0–$500 (0 disables).", events };
      plan.price = price;
      plan.enabled = price > 0;
      break;
    }
    case "setMarketing": {
      const level = Math.round(cmd.level);
      if (level < 0 || level > MARKETING.maxLevel)
        return { ok: false, error: "Marketing level 0–6.", events };
      save.marketingLevel = level;
      break;
    }
    case "startCampaign": {
      if (save.campaigns.filter((c) => c.daysLeft > 0).length >= 3) {
        return { ok: false, error: "Maximum of 3 simultaneous campaigns.", events };
      }
      if (cmd.target !== "all" && !save.map.towns.some((t) => t.id === cmd.target)) {
        return { ok: false, error: "Unknown campaign target.", events };
      }
      const targetName =
        cmd.target === "all" ? "statewide" : save.map.towns.find((t) => t.id === cmd.target)?.name;
      save.campaigns.push({
        id: seqId("camp", save.counters),
        name: `Promotion (${targetName})`,
        costDaily: 2500,
        effect: 0.12,
        daysLeft: 30,
        target: cmd.target,
      });
      event("info", "info", "Marketing campaign started.");
      break;
    }
    case "startResearch": {
      const st = save.research[cmd.techId];
      const tech = TECHS.find((t) => t.id === cmd.techId);
      if (!st || !tech) return { ok: false, error: "Unknown technology.", events };
      if (st.status === "done") return { ok: false, error: "Already researched.", events };
      if (st.status === "researching") return { ok: false, error: "Already in progress.", events };
      if (st.status !== "available") return { ok: false, error: "Prerequisites not met.", events };
      if (save.finance.cash < tech.cost)
        return { ok: false, error: "Insufficient funds for research.", events };
      save.finance.cash -= tech.cost;
      save.finance.month.capex += tech.cost;
      st.status = "researching";
      st.startedDay = day;
      event("info", "info", `Research started: ${tech.name}.`);
      break;
    }
    case "borrow": {
      const amount = Math.round(cmd.amount);
      const ok = issueBond(save, amount, cmd.months);
      if (!ok) return { ok: false, error: "Invalid bond terms.", events };
      event("info", "info", `Bond issued for $${amount.toLocaleString()}.`);
      break;
    }
    case "repayBond": {
      const bond = save.finance.bonds.find((b) => b.id === cmd.bondId);
      if (!bond) return { ok: false, error: "Unknown bond.", events };
      if (save.finance.cash < bond.outstanding)
        return { ok: false, error: "Insufficient cash to repay the bond.", events };
      save.finance.cash -= bond.outstanding;
      save.finance.bonds = save.finance.bonds.filter((b) => b.id !== bond.id);
      event("info", "info", `Bond "${bond.name}" repaid early.`);
      break;
    }
    case "hire": {
      const delta = Math.round(cmd.delta);
      if (delta === 0) break;
      const kind = cmd.kind;
      const next = save.staff[kind] + delta;
      if (next < 0 || next > 50) return { ok: false, error: "Crew count out of range (0–50).", events };
      const cost =
        Math.abs(delta) *
        (kind === "repairCrews"
          ? STAFF.repairCrew.hireCost
          : kind === "installCrews"
            ? STAFF.installCrew.hireCost
            : STAFF.salesAgent.hireCost);
      if (delta > 0 && save.finance.cash < cost)
        return { ok: false, error: "Insufficient funds to hire.", events };
      save.staff[kind] = next;
      if (delta > 0) save.finance.cash -= cost;
      else save.finance.cash += Math.round(cost * 0.3);
      event("info", "info", `${delta > 0 ? "Hired" : "Let go"} ${Math.abs(delta)} ${kindLabel(kind)}.`);
      break;
    }
    case "dispatchCrew": {
      const inc = save.incidents.find((i) => i.id === cmd.incidentId);
      if (!inc || inc.status !== "active")
        return { ok: false, error: "Incident not found or already resolved.", events };
      if (inc.crewAssigned) return { ok: false, error: "A crew is already assigned.", events };
      inc.crewAssigned = true;
      if (cmd.emergency) {
        if (save.finance.cash < 25_000)
          return { ok: false, error: "Insufficient funds for emergency dispatch.", events };
        save.finance.cash -= 25_000;
        inc.pointsRemaining = Math.max(1, Math.ceil(inc.pointsRemaining / 2));
        event("info", "info", "Emergency crew dispatched (expedited repair).");
      } else {
        event("info", "info", `Crew dispatched to ${inc.name}.`);
      }
      break;
    }
    case "removeLink": {
      const link = save.links.find((l) => l.id === cmd.linkId);
      if (!link) return { ok: false, error: "Unknown link.", events };
      save.links = save.links.filter((l) => l.id !== link.id);
      for (const s of save.sites) {
        if (s.kind === "tower") {
          s.fiberFed = save.links.some(
            (x) =>
              x.kind === "fiber" &&
              (x.from === s.id || x.to === s.id) &&
              x.status !== "building" &&
              x.status !== "planned",
          );
        }
      }
      event("info", "info", `${link.name} removed.`);
      break;
    }
    case "decommission": {
      const site = save.sites.find((s) => s.id === cmd.siteId);
      if (!site) return { ok: false, error: "Unknown site.", events };
      const refund = Math.round(siteTierCost(site.kind, site.tier) * 0.1);
      save.links = save.links.filter((l) => l.from !== site.id && l.to !== site.id);
      for (const s of save.sites) {
        if (s.kind === "tower") {
          s.fiberFed = save.links.some(
            (x) =>
              x.kind === "fiber" &&
              (x.from === s.id || x.to === s.id) &&
              x.status !== "building" &&
              x.status !== "planned",
          );
        }
      }
      save.sites = save.sites.filter((s) => s.id !== site.id);
      save.finance.cash += refund;
      for (const dm of Object.values(save.districtsMarket)) {
        if (site.kind === "cabinet" && dm.districtId === site.districtId) {
          dm.subs.fiber = { hh: 0, biz: 0 };
          dm.installQueue.fiber = 0;
        }
        const d = save.map.districts.find((x) => x.id === dm.districtId);
        if (d && d.townId === site.townId && (site.kind === "co" || site.kind === "tower")) {
          const lost = dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
          if (lost > 0) {
            event(
              "churn",
              "warning",
              `${lost} customer(s) lost in ${d.name} after ${site.name} was decommissioned.`,
            );
          }
          dm.subs = { fiber: { hh: 0, biz: 0 }, wireless: { hh: 0, biz: 0 } };
        }
      }
      engine.invalidateCoverage();
      event("info", "info", `${site.name} decommissioned.`);
      break;
    }
    case "refuel": {
      const site = save.sites.find((s) => s.id === cmd.siteId);
      if (!site) return { ok: false, error: "Unknown site.", events };
      if (site.power.generatorTier === 0) return { ok: false, error: "Site has no generator.", events };
      const kw = siteLoadKw(site);
      const tank =
        kw *
        POWER.generator.litersPerKwh *
        POWER.hoursPerDay *
        (POWER.generator.tiers[site.power.generatorTier - 1]?.fuelDays ?? 3);
      const need = tank * (1 - site.power.fuelPct);
      const cost = Math.round(need * POWER.generator.fuelCostPerLiter + 800);
      if (save.finance.cash < cost) return { ok: false, error: "Insufficient funds for fuel.", events };
      save.finance.cash -= cost;
      site.power.fuelPct = 1;
      event("info", "info", `Emergency fuel delivered to ${site.name} ($${cost.toLocaleString()}).`);
      break;
    }
    case "stormExercise": {
      const rng = makeRng((save.rngState ^ (hashString("storm") + day)) >>> 0);
      startStorm(
        save,
        cmd.severity,
        cmd.x,
        cmd.y,
        cmd.radiusKm,
        rng,
        events,
        "Operator-initiated storm drill.",
      );
      save.rngState = rng.state;
      break;
    }
    case "setSetting": {
      if (cmd.key === "autosaveDays") {
        const v = Math.round(Number(cmd.value));
        if (!Number.isFinite(v) || v < 1 || v > 365)
          return { ok: false, error: "Autosave interval 1–365 days.", events };
        save.settings.autosaveDays = v;
      } else {
        save.settings[cmd.key] = Boolean(cmd.value);
      }
      break;
    }
    default:
      return { ok: false, error: "Unknown command.", events };
  }
  return { ok: true, events };
}

function startProject(
  save: GameSave,
  engine: GameEngine,
  args: Extract<Command, { cmd: "startProject" }>,
): CommandResult {
  const day = save.meta.gameDay;

  let plan: PlanResult;
  if (args.type === "co" || args.type === "tower" || args.type === "cabinet") {
    plan = planSiteProject(save, args.type, args.tier, {
      x: args.x,
      y: args.y,
      townId: args.townId,
      districtId: args.districtId,
      name: args.name,
    });
  } else if (args.type === "fiber" || args.type === "microwave") {
    if (!args.fromSiteId || !args.toSiteId)
      return { ok: false, error: "A link needs both endpoints.", events: [] };
    plan = planLink(save, args.type, args.tier, args.fromSiteId, args.toSiteId);
  } else {
    if (!args.siteId) return { ok: false, error: "Choose a site.", events: [] };
    plan = planImprovement(save, args.type, args.tier, args.siteId);
  }

  if (!plan.ok || plan.cost === undefined || plan.project === undefined) {
    return { ok: false, error: plan.error ?? "Invalid project.", events: [] };
  }
  if (save.finance.cash < plan.cost) {
    return {
      ok: false,
      error: `Insufficient funds — this project costs $${plan.cost.toLocaleString()}.`,
      events: [],
    };
  }
  if (save.projects.length >= 40) return { ok: false, error: "Too many active projects.", events: [] };

  save.finance.cash -= plan.cost;
  save.finance.month.capex += plan.cost;
  save.finance.recent.push({ day, kind: "capex", amount: -plan.cost, note: plan.project.name });

  const id = seqId("proj", save.counters);
  const project: Project = { ...plan.project, id, startedDay: day };

  if (args.type === "co" || args.type === "tower" || args.type === "cabinet") {
    const siteId = seqId("site", save.counters);
    project.targetId = siteId;
    const kind = args.type;
    const def =
      kind === "co"
        ? CO_TIERS[args.tier - 1]
        : kind === "cabinet"
          ? CABINET_TIERS[args.tier - 1]
          : RADIO_TIERS[args.tier - 1];
    const town = args.townId ? save.map.towns.find((t) => t.id === args.townId) : undefined;
    const district = args.districtId ? save.map.districts.find((d) => d.id === args.districtId) : undefined;
    const grid =
      kind !== "tower" ||
      save.map.towns.some(
        (t) => t.gridPower && Math.hypot(t.x - (project.x ?? 0), t.y - (project.y ?? 0)) <= 5,
      );
    const site: Site = {
      id: siteId,
      kind,
      name: project.name,
      x: project.x ?? district?.x ?? town?.x ?? 0,
      y: project.y ?? district?.y ?? town?.y ?? 0,
      townId: town?.id ?? district?.townId,
      districtId: district?.id,
      tier: args.tier,
      status: "building",
      buildProgress: 0,
      buildStartedDay: day,
      condition: 100,
      power: !grid
        ? {
            source: "generator",
            mode: "generator",
            gridAvailable: false,
            batteryCapacityH: 0,
            batteryLevelH: 0,
            batteryTier: 0,
            generatorTier: 1,
            fuelPct: 1,
            opexDaily: 0,
          }
        : {
            source: "grid",
            mode: "grid",
            gridAvailable: true,
            batteryCapacityH: 0,
            batteryLevelH: 0,
            batteryTier: 0,
            generatorTier: 0,
            fuelPct: 0,
            opexDaily: 0,
          },
      capacity: kind === "co" ? coCapacity(args.tier) : kind === "cabinet" ? cabinetCapacity(args.tier) : 0,
      used: 0,
      landOwned: false,
      leaseMonthly: def?.lease ?? 0,
      fiberFed: kind !== "tower",
    };
    if (site.kind === "tower") attachRadios(site);
    save.sites.push(site);
    engine.invalidateCoverage();
  } else if (args.type === "fiber" || args.type === "microwave") {
    const linkId = seqId("link", save.counters);
    project.targetId = linkId;
    const from = save.sites.find((s) => s.id === args.fromSiteId)!;
    const to = save.sites.find((s) => s.id === args.toSiteId)!;
    const path = plan.path ?? [
      { x: from.x, y: from.y },
      { x: to.x, y: to.y },
    ];
    const lengthKm = polylineLength(path);
    const link: Link = {
      id: linkId,
      kind: args.type,
      name: project.name,
      from: from.id,
      to: to.id,
      path,
      lengthKm,
      tier: args.tier,
      dwdm: false,
      status: "building",
      buildProgress: 0,
      buildStartedDay: day,
      condition: 100,
      capacityMbps: linkCapacityMbps({ kind: args.type, tier: args.tier, dwdm: false }),
      usedMbps: 0,
      flowMbps: 0,
    };
    save.links.push(link);
  }
  save.projects.push(project);
  return {
    ok: true,
    events: [
      {
        type: "info",
        day,
        severity: "info",
        message: `Project started: ${project.name} — $${project.costTotal.toLocaleString()} (${project.daysRequired} days).`,
      },
    ],
  };
}

function siteTierCost(kind: Site["kind"], tier: number): number {
  if (kind === "co") return CO_TIERS[tier - 1]?.cost ?? 350_000;
  if (kind === "tower") {
    const r = RADIO_TIERS[tier - 1];
    return (r?.structureCost ?? 140_000) + (r?.equipCost ?? 60_000);
  }
  return CABINET_TIERS[tier - 1]?.cost ?? 14_000;
}

function kindLabel(kind: "installCrews" | "repairCrews" | "salesAgents"): string {
  return kind === "repairCrews"
    ? "repair crew(s)"
    : kind === "installCrews"
      ? "install crew(s)"
      : "sales agent(s)";
}
