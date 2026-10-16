/** Creates a fresh GameSave at the current save version. */
import { BONDS, COMPANY, DIFFICULTY, PLANS, RIVAL_DEFS } from "@heartland/shared";
import type { GameSave, Plan, Rival } from "@heartland/shared";
import { generateMap } from "./mapgen.js";
import { makeRng, rngRange } from "./rng.js";

export interface NewGameOptions {
  name?: string;
  seed?: number;
  difficulty?: "easy" | "normal" | "hard";
}

export function createNewGame(opts: NewGameOptions, saveVersion: number): GameSave {
  const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff) | 1;
  const difficulty = opts.difficulty ?? "normal";
  const diff = DIFFICULTY[difficulty];
  const rng = makeRng(seed);

  // Initial rival footprints: cities well served, villages less so.
  const rivals: Rival[] = RIVAL_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    color: def.color,
    footprint: {},
    marketing: 0,
    aggression: def.aggression * diff.rivalAggression,
  }));
  const map = generateMap(seed);
  for (const town of map.towns) {
    const base =
      town.kind === "capital" ? 0.85 : town.kind === "city" ? 0.75 : town.kind === "town" ? 0.4 : 0.12;
    for (const r of rivals) {
      const share = Math.min(0.95, base * rngRange(rng, 0.5, 1.2));
      const price = r.id === "omnilink" ? 75 : 45;
      const speed = r.id === "omnilink" ? 300 : 40;
      r.footprint[town.id] = {
        tech: r.id === "omnilink" ? "cable" : "dsl",
        share: Math.round(share * 100) / 100,
        price,
        speedMbps: speed,
      };
    }
  }

  const plans: Plan[] = PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    cls: p.cls,
    speedMbps: p.speedMbps,
    price: p.price,
    enabled: true,
  }));

  const now = new Date().toISOString();

  return {
    version: saveVersion,
    meta: {
      name: opts.name?.trim() || `${map.stateName} County Network`,
      seed,
      createdAt: now,
      difficulty,
      gameDay: 0,
      paused: true,
      speed: 1,
      playerCompany: COMPANY.defaultName,
      gameOver: false,
    },
    map,
    sites: [],
    links: [],
    projects: [],
    districtsMarket: Object.fromEntries(
      map.districts.map((d) => [
        d.id,
        {
          districtId: d.id,
          households: d.households,
          businesses: d.businesses,
          subs: { fiber: { hh: 0, biz: 0 }, wireless: { hh: 0, biz: 0 } },
          installQueue: { fiber: 0, wireless: 0 },
          satisfaction: 70,
          rivalShare: 0,
          outageDays30: 0,
          deliveredMbps: 0,
        },
      ]),
    ),
    plans,
    finance: {
      cash: diff.cash,
      bonds: [],
      monthly: [],
      recent: [],
      month: { revenue: 0, opex: 0, capex: 0, interest: 0 },
    },
    research: {},
    staff: {
      installCrews: diff.startCrews,
      repairCrews: 1,
      salesAgents: 1,
    },
    incidents: [],
    rivals,
    campaigns: [],
    marketingLevel: 0,
    settings: {
      autosaveDays: 30,
      alertsEnabled: true,
      ambientStorms: true,
      equipmentFailures: true,
    },
    rngState: rng.state,
    counters: { nextId: 1, nextBond: 1 },
  };
}

export function maxBorrow(): number {
  return BONDS.maxAmount;
}
