/**
 * Power and backup simulation: grid, batteries, generators, solar.
 * Battery levels are expressed in full-load runtime hours.
 */
import { POWER } from "@heartland/shared";
import type { GameSave, PowerState, Site } from "@heartland/shared";

/** Does the site have access to the power grid? (towns, or fiber-fed towers). */
export function siteHasGrid(save: GameSave, site: Site): boolean {
  if (site.kind !== "tower") return true; // CO/cabinet are always in towns
  if (site.fiberFed) return true; // trunk carries a power tap
  if (site.townId) {
    const town = save.map.towns.find((t) => t.id === site.townId);
    if (town?.gridPower) return true;
  }
  // Towers close to any town with grid.
  return save.map.towns.some((t) => t.gridPower && Math.hypot(t.x - site.x, t.y - site.y) <= 5);
}

/** Cost to add a battery bank of the given tier for a site. */
export function batteryCost(kw: number, tier: number): number {
  const def = POWER.battery.tiers[tier - 1];
  return def ? Math.round(def.costPerKw * Math.max(1, kw)) : 0;
}

export function generatorCost(kw: number, tier: number): number {
  const def = POWER.generator.tiers[tier - 1];
  return def ? Math.round(def.costPerKw * Math.max(1, kw)) : 0;
}

export function siteLoadKw(site: Site): number {
  // Load derived from site kind and tier (see constants).
  switch (site.kind) {
    case "co":
      return [2, 5, 12, 25][site.tier - 1] ?? 2 * site.tier;
    case "tower":
      return [0.6, 0.9, 1.2][site.tier - 1] ?? 0.6 * site.tier;
    default:
      return 0.25;
  }
}

export interface PowerUpdateContext {
  gridDownRadius: { x: number; y: number; r: number }[];
  fuelOrders: { siteId: string; cost: number }[];
}

/**
 * Update power states for all sites for one day.
 */
export function updatePower(save: GameSave, ctx: PowerUpdateContext): void {
  for (const site of save.sites) {
    if (site.status === "decommissioned" || site.status === "building" || site.status === "planned") {
      continue;
    }
    const p = site.power;
    const kw = siteLoadKw(site);
    const gridAvail =
      siteHasGrid(save, site) &&
      !ctx.gridDownRadius.some((g) => Math.hypot(g.x - site.x, g.y - site.y) <= g.r);

    // Fuel consumed per day for the site's load.
    const fuelPerDay = kw * POWER.generator.litersPerKwh * POWER.hoursPerDay;
    const tankLiters =
      kw *
      POWER.generator.litersPerKwh *
      POWER.hoursPerDay *
      (POWER.generator.tiers[p.generatorTier - 1]?.fuelDays ?? 3);

    const drainBattery = () => {
      p.batteryLevelH = Math.max(0, p.batteryLevelH - POWER.hoursPerDay);
    };
    const chargeBattery = () => {
      p.batteryLevelH = Math.min(p.batteryCapacityH, p.batteryLevelH + POWER.hoursPerDay);
    };

    let mode: PowerState["mode"];
    let fuelUsed = 0;

    if (p.source === "grid") {
      if (gridAvail) {
        mode = "grid";
        chargeBattery();
      } else if (p.batteryLevelH > 0) {
        mode = "battery";
        drainBattery();
      } else if (p.generatorTier > 0 && p.fuelPct > 0) {
        mode = "generator";
        fuelUsed = fuelPerDay;
      } else {
        mode = "down";
      }
    } else if (p.source === "solar") {
      // Solar covers the daylight portion; battery carries the night.
      chargeBattery();
      drainBattery();
      if (p.batteryLevelH > 0) {
        mode = "battery";
      } else if (p.generatorTier > 0 && p.fuelPct > 0) {
        mode = "generator";
        fuelUsed = fuelPerDay * (1 - POWER.solar.daylightFraction);
      } else {
        mode = "down";
      }
    } else {
      // generator-only site
      if (p.fuelPct > 0) {
        mode = "generator";
        fuelUsed = fuelPerDay;
      } else if (p.batteryLevelH > 0) {
        mode = "battery";
        drainBattery();
      } else {
        mode = "down";
      }
    }

    if (fuelUsed > 0) {
      p.fuelPct = Math.max(0, p.fuelPct - fuelUsed / tankLiters);
      // Automatic fuel order when running low.
      if (p.fuelPct < 0.2 && p.fuelPct > 0) {
        const liters = tankLiters - p.fuelPct * tankLiters;
        const cost = Math.round(liters * POWER.generator.fuelCostPerLiter + 450);
        ctx.fuelOrders.push({ siteId: site.id, cost });
        p.fuelPct = 1; // delivery truck arrived
      }
    }

    p.mode = mode;
    p.gridAvailable = gridAvail;
    p.opexDaily =
      mode === "grid"
        ? kw * POWER.hoursPerDay * POWER.gridCostPerKwh
        : mode === "down"
          ? 0
          : fuelUsed * POWER.generator.fuelCostPerLiter;
  }
}
