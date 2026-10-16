/**
 * Heartland Network — game balance constants.
 * All monetary values are in dollars. Distances in km, capacities in Mbps
 * unless noted. These values are the single source of truth for balance;
 * the simulation code in the server package references them.
 */

import type { PlanClass } from "./types.js";

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export const WORLD = {
  widthKm: 960,
  heightKm: 640,
  /** Elevation grid cell size in km. */
  cellKm: 10,
  /** LOS sampling step along the path in km. */
  losSampleKm: 2,
} as const;

export const STARTING = {
  cash: 2_500_000,
  installCrews: 2,
  repairCrews: 1,
  salesAgents: 1,
} as const;

export const DIFFICULTY = {
  easy: { cash: 3_500_000, stormRate: 0.6, rivalAggression: 0.7, startCrews: 3 },
  normal: { cash: 2_500_000, stormRate: 1.0, rivalAggression: 1.0, startCrews: 2 },
  hard: { cash: 1_500_000, stormRate: 1.5, rivalAggression: 1.3, startCrews: 1 },
} as const;

// ---------------------------------------------------------------------------
// Central offices
// ---------------------------------------------------------------------------

export interface CoTier {
  tier: number;
  name: string;
  /** Subscriber line capacity. */
  capacity: number;
  /** Construction cost. */
  cost: number;
  days: number;
  /** Annual lease if on rented land, $/month. */
  lease: number;
  /** Power draw in kW. */
  powerKw: number;
  /** Maintenance $/day. */
  maintDaily: number;
  /** Requires research tech id (or none). */
  requires?: string;
  /** Land purchase cost (owning avoids the lease). */
  landCost: number;
}

export const CO_TIERS: CoTier[] = [
  {
    tier: 1,
    name: "Local Exchange",
    capacity: 2000,
    cost: 350_000,
    days: 30,
    lease: 1200,
    powerKw: 2,
    maintDaily: 90,
    landCost: 180_000,
  },
  {
    tier: 2,
    name: "Regional Hub",
    capacity: 6000,
    cost: 900_000,
    days: 60,
    lease: 2600,
    powerKw: 5,
    maintDaily: 220,
    landCost: 420_000,
  },
  {
    tier: 3,
    name: "Area Data Center",
    capacity: 16000,
    cost: 2_200_000,
    days: 120,
    lease: 5200,
    powerKw: 12,
    maintDaily: 480,
    requires: "fiber-dwdm",
    landCost: 950_000,
  },
  {
    tier: 4,
    name: "Core Exchange",
    capacity: 40000,
    cost: 5_500_000,
    days: 200,
    lease: 9800,
    powerKw: 25,
    maintDaily: 900,
    requires: "ops-sla",
    landCost: 1_800_000,
  },
] as const;

// ---------------------------------------------------------------------------
// Cabinets (distribution)
// ---------------------------------------------------------------------------

export interface CabinetTier {
  tier: number;
  name: string;
  /** Ports (households/businesses served). */
  capacity: number;
  cost: number;
  days: number;
  lease: number;
  powerKw: number;
  maintDaily: number;
  requires?: string;
  landCost: number;
}

export const CABINET_TIERS: CabinetTier[] = [
  {
    tier: 1,
    name: "GPON-32 Cabinet",
    capacity: 32,
    cost: 14_000,
    days: 7,
    lease: 40,
    powerKw: 0.1,
    maintDaily: 4,
    landCost: 8000,
  },
  {
    tier: 2,
    name: "GPON-64 Cabinet",
    capacity: 64,
    cost: 24_000,
    days: 10,
    lease: 60,
    powerKw: 0.15,
    maintDaily: 6,
    requires: "fiber-gpon64",
    landCost: 10_000,
  },
  {
    tier: 3,
    name: "GPON-128 Cabinet",
    capacity: 128,
    cost: 40_000,
    days: 14,
    lease: 90,
    powerKw: 0.25,
    maintDaily: 9,
    requires: "fiber-gpon128",
    landCost: 14_000,
  },
] as const;

// ---------------------------------------------------------------------------
// Fiber links
// ---------------------------------------------------------------------------

export interface FiberTier {
  tier: number;
  name: string;
  fibers: number;
  /** Backhaul capacity in Mbps. */
  capacityMbps: number;
  /** $/km construction cost. */
  costPerKm: number;
  /** Days per km to build. */
  daysPerKm: number;
  maintDailyPerKm: number;
  requires?: string;
}

export const FIBER_TIERS: FiberTier[] = [
  {
    tier: 1,
    name: "12-strand Trunk",
    fibers: 12,
    capacityMbps: 1_000,
    costPerKm: 9_000,
    daysPerKm: 0.35,
    maintDailyPerKm: 0.8,
  },
  {
    tier: 2,
    name: "24-strand Trunk",
    fibers: 24,
    capacityMbps: 2_500,
    costPerKm: 12_500,
    daysPerKm: 0.4,
    maintDailyPerKm: 1.0,
    requires: "fiber-24",
  },
  {
    tier: 3,
    name: "48-strand Trunk",
    fibers: 48,
    capacityMbps: 6_000,
    costPerKm: 18_000,
    daysPerKm: 0.5,
    maintDailyPerKm: 1.3,
    requires: "fiber-48",
  },
  {
    tier: 4,
    name: "96-strand Trunk",
    fibers: 96,
    capacityMbps: 12_000,
    costPerKm: 26_000,
    daysPerKm: 0.7,
    maintDailyPerKm: 1.6,
    requires: "fiber-96",
  },
] as const;

export const DWDM = {
  costPerKm: 6000,
  capacityMultiplier: 4,
  requires: "fiber-dwdm",
} as const;

// ---------------------------------------------------------------------------
// Towers & wireless
// ---------------------------------------------------------------------------

export interface RadioTier {
  tier: number;
  name: string;
  band: string;
  /** Sector capacity in Mbps. */
  sectorMbps: number;
  /** Max range in km on flat terrain. */
  maxRangeKm: number;
  /** Equipment cost per tower. */
  equipCost: number;
  /** Tower structure cost. */
  structureCost: number;
  days: number;
  heightM: number;
  lease: number;
  powerKw: number;
  maintDaily: number;
  landCost: number;
  /** Backhaul requirement: must be fiber-fed or microwave-chained. */
  requires?: string;
  sectors: number;
}

export const RADIO_TIERS: RadioTier[] = [
  {
    tier: 1,
    name: "W-3 Fixed Wireless",
    band: "3.5 GHz",
    sectorMbps: 250,
    maxRangeKm: 18,
    equipCost: 60_000,
    structureCost: 140_000,
    days: 21,
    heightM: 45,
    lease: 700,
    powerKw: 0.6,
    maintDaily: 30,
    landCost: 90_000,
    sectors: 3,
  },
  {
    tier: 2,
    name: "W-6 Midband",
    band: "6 GHz",
    sectorMbps: 600,
    maxRangeKm: 22,
    equipCost: 120_000,
    structureCost: 170_000,
    days: 28,
    heightM: 55,
    lease: 900,
    powerKw: 0.9,
    maintDaily: 45,
    landCost: 110_000,
    requires: "wireless-w6",
    sectors: 4,
  },
  {
    tier: 3,
    name: "MMW-28 Millimeter",
    band: "28 GHz",
    sectorMbps: 1500,
    maxRangeKm: 9,
    equipCost: 260_000,
    structureCost: 200_000,
    days: 35,
    heightM: 50,
    lease: 1100,
    powerKw: 1.2,
    maintDaily: 70,
    landCost: 130_000,
    requires: "wireless-mmw",
    sectors: 6,
  },
] as const;

export interface MicrowaveTier {
  tier: number;
  name: string;
  capacityMbps: number;
  maxRangeKm: number;
  cost: number;
  days: number;
  powerKw: number;
  maintDaily: number;
  requires?: string;
}

export const MICROWAVE_TIERS: MicrowaveTier[] = [
  {
    tier: 1,
    name: "MW-1 Microwave",
    capacityMbps: 500,
    maxRangeKm: 40,
    cost: 45_000,
    days: 10,
    powerKw: 0.2,
    maintDaily: 8,
  },
  {
    tier: 2,
    name: "MW-2 High-cap",
    capacityMbps: 1500,
    maxRangeKm: 35,
    cost: 95_000,
    days: 14,
    powerKw: 0.3,
    maintDaily: 14,
    requires: "wireless-w6",
  },
  {
    tier: 3,
    name: "MW-E E-band",
    capacityMbps: 4000,
    maxRangeKm: 18,
    cost: 180_000,
    days: 18,
    powerKw: 0.35,
    maintDaily: 22,
    requires: "wireless-mmw",
  },
] as const;

// ---------------------------------------------------------------------------
// Power & backup
// ---------------------------------------------------------------------------

export const POWER = {
  gridCostPerKwh: 0.11,
  /** 24h = 24 kWh per kW per day. */
  hoursPerDay: 24,
  battery: {
    tiers: [
      {
        tier: 1,
        name: "VRLA Battery Bank",
        hours: 4,
        costPerKw: 1200,
        requires: undefined as string | undefined,
      },
      {
        tier: 2,
        name: "LiFePO4 Battery Bank",
        hours: 12,
        costPerKw: 2600,
        requires: "power-lifepo4" as string | undefined,
      },
      {
        tier: 3,
        name: "Grid-scale LiFePO4",
        hours: 36,
        costPerKw: 5200,
        requires: "power-grid-battery" as string | undefined,
      },
    ],
  },
  generator: {
    tiers: [
      {
        tier: 1,
        name: "Diesel Genset",
        fuelDays: 3,
        costPerKw: 900,
        requires: undefined as string | undefined,
      },
      {
        tier: 2,
        name: "Dual-fuel Genset",
        fuelDays: 6,
        costPerKw: 1500,
        requires: "power-dualfuel" as string | undefined,
      },
    ],
    fuelCostPerLiter: 1.15,
    /** Liters per kWh generated. */
    litersPerKwh: 0.28,
  },
  solar: {
    requires: "power-solar",
    costPerKw: 2200,
    /** Fraction of the day solar can carry the load. */
    daylightFraction: 0.45,
    maintDailyPerKw: 0.3,
  },
} as const;

// ---------------------------------------------------------------------------
// Plans (initial prices; player can adjust)
// ---------------------------------------------------------------------------

export interface PlanDef {
  id: string;
  name: string;
  cls: PlanClass;
  speedMbps: number;
  price: number;
}

export const PLANS: PlanDef[] = [
  { id: "c50", name: "Basic 50", cls: "consumer", speedMbps: 50, price: 39 },
  { id: "c100", name: "Home 100", cls: "consumer", speedMbps: 100, price: 55 },
  { id: "c500", name: "Gig Home", cls: "consumer", speedMbps: 500, price: 85 },
  { id: "b250", name: "Business 250", cls: "business", speedMbps: 250, price: 120 },
  { id: "b1000", name: "Business Gig", cls: "business", speedMbps: 1000, price: 250 },
];

// ---------------------------------------------------------------------------
// Staff & crews
// ---------------------------------------------------------------------------

export const STAFF = {
  installCrew: { hireCost: 40_000, dailyCost: 320, installsPerDay: 6 },
  repairCrew: { hireCost: 55_000, dailyCost: 420, repairPointsPerDay: 4 },
  salesAgent: { hireCost: 30_000, dailyCost: 240, marketingPerDay: 0.6 },
} as const;

// ---------------------------------------------------------------------------
// Research tree
// ---------------------------------------------------------------------------

export interface TechDef {
  id: string;
  name: string;
  category: "fiber" | "wireless" | "power" | "ops";
  desc: string;
  cost: number;
  days: number;
  requires: string[];
}

export const TECHS: TechDef[] = [
  {
    id: "fiber-24",
    name: "24-strand Trunks",
    category: "fiber",
    desc: "Unlocks 24-strand fiber trunk construction.",
    cost: 150_000,
    days: 20,
    requires: [],
  },
  {
    id: "fiber-48",
    name: "48-strand Trunks",
    category: "fiber",
    desc: "Unlocks 48-strand fiber trunk construction.",
    cost: 320_000,
    days: 30,
    requires: ["fiber-24"],
  },
  {
    id: "fiber-96",
    name: "96-strand Trunks",
    category: "fiber",
    desc: "Unlocks 96-strand fiber trunk construction.",
    cost: 600_000,
    days: 40,
    requires: ["fiber-48"],
  },
  {
    id: "fiber-gpon64",
    name: "GPON-64 Cabinets",
    category: "fiber",
    desc: "Unlocks 64-port cabinets.",
    cost: 90_000,
    days: 12,
    requires: [],
  },
  {
    id: "fiber-gpon128",
    name: "GPON-128 Cabinets",
    category: "fiber",
    desc: "Unlocks 128-port cabinets.",
    cost: 200_000,
    days: 22,
    requires: ["fiber-gpon64"],
  },
  {
    id: "fiber-dwdm",
    name: "DWDM Backhaul",
    category: "fiber",
    desc: "Quadruples trunk capacity with wavelength multiplexing. Unlocks Tier-3 offices.",
    cost: 850_000,
    days: 60,
    requires: ["fiber-48"],
  },
  {
    id: "wireless-w6",
    name: "6 GHz Midband",
    category: "wireless",
    desc: "Unlocks W-6 radios and MW-2 backhaul.",
    cost: 240_000,
    days: 25,
    requires: [],
  },
  {
    id: "wireless-mmw",
    name: "Millimeter Wave",
    category: "wireless",
    desc: "Unlocks 28 GHz mmWave radios and E-band backhaul.",
    cost: 520_000,
    days: 35,
    requires: ["wireless-w6"],
  },
  {
    id: "power-lifepo4",
    name: "LiFePO4 Batteries",
    category: "power",
    desc: "Longer battery runtime (12h).",
    cost: 140_000,
    days: 18,
    requires: [],
  },
  {
    id: "power-grid-battery",
    name: "Grid-scale Storage",
    category: "power",
    desc: "36-hour battery banks.",
    cost: 420_000,
    days: 30,
    requires: ["power-lifepo4"],
  },
  {
    id: "power-dualfuel",
    name: "Dual-fuel Gensets",
    category: "power",
    desc: "Gensets carry double fuel, half refuel frequency.",
    cost: 180_000,
    days: 20,
    requires: [],
  },
  {
    id: "power-solar",
    name: "Solar Hybrid",
    category: "power",
    desc: "Remote towers can be fitted with solar to cut generator fuel.",
    cost: 300_000,
    days: 28,
    requires: ["power-lifepo4"],
  },
  {
    id: "ops-diagnostics",
    name: "Remote Diagnostics",
    category: "ops",
    desc: "Repairs resolve 30% faster.",
    cost: 160_000,
    days: 16,
    requires: [],
  },
  {
    id: "ops-marketing",
    name: "Digital Marketing",
    category: "ops",
    desc: "Campaigns are 50% more effective.",
    cost: 120_000,
    days: 14,
    requires: [],
  },
  {
    id: "ops-sla",
    name: "Enterprise SLA",
    category: "ops",
    desc: "Business churn reduced 40%. Unlocks Tier-4 offices.",
    cost: 380_000,
    days: 34,
    requires: ["ops-diagnostics"],
  },
];

// ---------------------------------------------------------------------------
// Rivals
// ---------------------------------------------------------------------------

export const RIVAL_DEFS = [
  {
    id: "omnilink",
    name: "OmniLink Cable",
    color: "#e8726a",
    tech: "cable" as const,
    basePrice: 75,
    baseSpeed: 300,
    aggression: 1.0,
  },
  {
    id: "prairietel",
    name: "PrairieTel",
    color: "#c58be0",
    tech: "dsl" as const,
    basePrice: 45,
    baseSpeed: 40,
    aggression: 0.7,
  },
];

// ---------------------------------------------------------------------------
// Failure & incident tuning
// ---------------------------------------------------------------------------

export const FAILURE = {
  /** Base probability/day that a site fails (scaled by condition). */
  siteMtbfDays: 400,
  linkMtbfDays: 300,
  cableCutChancePerDay: 0.0008,
  vandalismChancePerDay: 0.0004,
  /** Storm parameters. */
  stormMeanIntervalDays: 42,
  stormMinSeverity: 1,
  stormMaxSeverity: 3,
  /** Probability an exposed element is hit per storm per severity. */
  stormHitChance: [0.12, 0.3, 0.55],
  stormDowntimeDays: [1, 2.5, 5],
  /** Power grid outage length in days by severity. */
  gridOutageDays: [0.5, 1.5, 3],
} as const;

export const REPAIR = {
  /** Repair points needed per severity level. */
  pointsPerSeverity: [4, 9, 16],
  emergencyDispatchCost: 25_000,
} as const;

// ---------------------------------------------------------------------------
// Demand & churn
// ---------------------------------------------------------------------------

export const DEMAND = {
  /** Base household interest in broadband at fair pricing. */
  baseTakeRate: 0.62,
  businessTakeRate: 0.8,
  /** Price sensitivity exponent. */
  priceElasticity: 0.9,
  /** Churn per month base at perfect service. */
  baseChurn: 0.018,
  /** Extra monthly churn per outage day in the last 30 days. */
  churnPerOutageDay: 0.035,
  /** Extra monthly churn at 0 satisfaction. */
  churnAtZeroSat: 0.06,
  /** Plan choice weight for speed (log). */
  speedWeight: 0.7,
  priceWeight: 1.0,
  /** Base busy-hour traffic per subscriber (Mbps). */
  baseMbpsPerSub: 0.4,
  /** Busy-hour Mbps per subscriber grows sublinearly with plan speed. */
  speedMbpsFactor: 0.012,
  /** Classic oversubscription ratio (kept for reference/tests). */
  peakUtilization: 0.06,
  /** Busy-hour demand per subscriber at a given plan speed. */
  perSubMbps: (planSpeedMbps: number) => 0.4 + planSpeedMbps * 0.012,
} as const;

export const MARKETING = {
  maxLevel: 6,
  costPerLevelDaily: 1500,
  effectPerLevel: 0.08,
} as const;

export const BONDS = {
  minAmount: 100_000,
  maxAmount: 10_000_000,
  terms: [
    { months: 12, ratePct: 6.5 },
    { months: 60, ratePct: 8.0 },
    { months: 120, ratePct: 9.5 },
  ],
} as const;

export const TAXES = {
  /** Property/sales tax on gross revenue. */
  revenueTaxPct: 0.045,
} as const;

export const MAINTENANCE = {
  /** $/day per condition point below 100 across all sites, per element. */
  conditionRepairCost: 0,
  /** Renovation restores condition to 100. */
  renovateCost: (tier: number) => 40_000 * tier,
  renovateDays: 14,
} as const;

export const UPGRADES = {
  /** Cost to add a battery bank of the given tier for a site's load. */
  batteryCost: (tier: number, kw: number) => Math.round((POWER.battery.tiers[tier - 1]?.costPerKw ?? 0) * kw),
  generatorCost: (tier: number, kw: number) =>
    Math.round((POWER.generator.tiers[tier - 1]?.costPerKw ?? 0) * kw),
  solarCost: (kw: number) => Math.round(POWER.solar.costPerKw * kw),
  batteryDays: 10,
  generatorDays: 8,
  solarDays: 14,
} as const;

export const COMPANY = {
  defaultName: "Heartland Networks",
} as const;
