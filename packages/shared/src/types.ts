/**
 * Heartland Network — shared type definitions.
 *
 * These types define the full data model used by the server simulation, the
 * save format, the REST API, and the web client. See DATA_MODEL.md for the
 * entity-relationship description and SIMULATION_RULES.md for the rules that
 * operate on these structures.
 */

// ---------------------------------------------------------------------------
// Geometry & map
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

/** A single polyline (roads, fiber routes, terrain sampling). */
export interface Polyline {
  points: Vec2[];
}

export type TownKind = "capital" | "city" | "town" | "village";

export interface Town {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Elevation in meters at the town center. */
  elevation: number;
  kind: TownKind;
  /** Total population (households are derived). */
  pop: number;
  districtIds: string[];
  /** Whether the town has a grid-power tap available for sites. */
  gridPower: boolean;
}

export interface Road {
  id: string;
  from: string;
  to: string;
  name: string;
  points: Vec2[];
  lengthKm: number;
  /** 0 = improved gravel, 1 = two-lane, 2 = highway. Affects construction cost. */
  class: number;
}

export type DistrictKind = "urban" | "suburban" | "rural";

export interface District {
  id: string;
  townId: string;
  name: string;
  x: number;
  y: number;
  kind: DistrictKind;
  households: number;
  businesses: number;
}

export interface Landmark {
  id: string;
  name: string;
  x: number;
  y: number;
  kind: "lake" | "forest" | "ridge" | "windfarm" | "quarry";
  radiusKm: number;
}

export interface MapData {
  seed: number;
  stateName: string;
  widthKm: number;
  heightKm: number;
  /** Elevation grid, row-major, rows = heightCells, cols = widthCells. */
  elevation: number[];
  gridCols: number;
  gridRows: number;
  towns: Town[];
  roads: Road[];
  districts: District[];
  landmarks: Landmark[];
}

// ---------------------------------------------------------------------------
// Network elements
// ---------------------------------------------------------------------------

export type SiteKind = "co" | "tower" | "cabinet";

export type SiteStatus =
  "planned" | "building" | "online" | "offline" | "unpowered" | "failed" | "decommissioned";

export type PowerSource = "grid" | "generator" | "solar";

export type PowerMode = "grid" | "battery" | "generator" | "down";

export interface PowerState {
  source: PowerSource;
  mode: PowerMode;
  gridAvailable: boolean;
  /** Battery capacity in hours of full-load runtime. 0 = no battery. */
  batteryCapacityH: number;
  /** Current battery charge in runtime-hours. */
  batteryLevelH: number;
  batteryTier: number;
  generatorTier: number;
  /** Generator fuel as 0..1 fraction. */
  fuelPct: number;
  /** Annualized $/day to run this power configuration. */
  opexDaily: number;
}

export interface RadioSector {
  azimuth: number;
  rangeKm: number;
  capacityMbps: number;
  usedMbps: number;
}

export interface Site {
  id: string;
  kind: SiteKind;
  name: string;
  x: number;
  y: number;
  townId?: string;
  districtId?: string;
  tier: number;
  status: SiteStatus;
  buildProgress: number;
  buildStartedDay?: number;
  builtDay?: number;
  /** 0..100. Degrades over time; low condition increases failure probability. */
  condition: number;
  power: PowerState;
  /** Subscriber-facing capacity (subs for co/cabinet, Mbps for tower). */
  capacity: number;
  used: number;
  radios?: RadioSector[];
  /** Does the player own the land (no lease). */
  landOwned: boolean;
  leaseMonthly: number;
  /** Backhaul available at the site (fiber drop) — towers can be fiber-fed. */
  fiberFed: boolean;
}

export type LinkKind = "fiber" | "microwave";

export type LinkStatus = "planned" | "building" | "online" | "offline" | "failed" | "cut";

export interface Link {
  id: string;
  kind: LinkKind;
  name: string;
  from: string;
  to: string;
  path: Vec2[];
  lengthKm: number;
  tier: number;
  dwdm: boolean;
  status: LinkStatus;
  buildProgress: number;
  buildStartedDay?: number;
  builtDay?: number;
  condition: number;
  capacityMbps: number;
  usedMbps: number;
  /** Last routed traffic snapshot in Mbps for the map animation. */
  flowMbps: number;
}

// ---------------------------------------------------------------------------
// Construction, projects
// ---------------------------------------------------------------------------

export type ProjectType =
  | "co"
  | "tower"
  | "cabinet"
  | "fiber"
  | "microwave"
  | "battery"
  | "generator"
  | "solar"
  | "renovate"
  | "upgrade";

export interface Project {
  id: string;
  type: ProjectType;
  name: string;
  x?: number;
  y?: number;
  from?: string;
  to?: string;
  siteId?: string;
  tier: number;
  costTotal: number;
  daysRequired: number;
  daysRemaining: number;
  startedDay: number;
  /** 0..1 construction progress. */
  buildProgress: number;
  /** Payload for completion, e.g. target site id or link endpoint ids. */
  targetId?: string;
}

// ---------------------------------------------------------------------------
// Customers, plans, market
// ---------------------------------------------------------------------------

export type CustomerTech = "fiber" | "wireless";
export type PlanClass = "consumer" | "business";

export interface Plan {
  id: string;
  name: string;
  cls: PlanClass;
  speedMbps: number;
  /** Monthly price. 0 = plan disabled. */
  price: number;
  enabled: boolean;
}

export interface DistrictMarket {
  districtId: string;
  households: number;
  businesses: number;
  /** Active subscribers by tech, split by class. */
  subs: { fiber: { hh: number; biz: number }; wireless: { hh: number; biz: number } };
  /** Orders waiting for installation. */
  installQueue: { fiber: number; wireless: number };
  /** 0..100 aggregate satisfaction. */
  satisfaction: number;
  /** Share of market taken by competitors (0..1). */
  rivalShare: number;
  /** Days of total outage experienced in the last 30 days. */
  outageDays30: number;
  /** Delivered average speed in Mbps. */
  deliveredMbps: number;
}

export interface Rival {
  id: string;
  name: string;
  color: string;
  /** Technology and footprint per town. */
  footprint: Record<
    string,
    { tech: "cable" | "dsl" | "fiber" | "none"; share: number; price: number; speedMbps: number }
  >;
  /** Rough monthly marketing spend by the rival. */
  marketing: number;
  aggression: number;
}

export interface Campaign {
  id: string;
  name: string;
  costDaily: number;
  effect: number;
  daysLeft: number;
  target: string | "all";
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export interface Bond {
  id: string;
  name: string;
  principal: number;
  outstanding: number;
  monthlyPayment: number;
  monthsLeft: number;
  ratePct: number;
  startedDay: number;
}

export interface LedgerEntry {
  day: number;
  kind: "revenue" | "opex" | "capex" | "interest" | "loan" | "repayment" | "other";
  amount: number;
  note: string;
}

export interface MonthlyPnL {
  month: number;
  revenue: number;
  opex: number;
  capex: number;
  interest: number;
  net: number;
  subs: number;
  arpu: number;
  cashEnd: number;
}

export interface FinanceState {
  cash: number;
  bonds: Bond[];
  monthly: MonthlyPnL[];
  recent: LedgerEntry[];
  /** Accumulators for the current month being tallied. */
  month: { revenue: number; opex: number; capex: number; interest: number };
}

// ---------------------------------------------------------------------------
// Research, staff, incidents
// ---------------------------------------------------------------------------

export type ResearchStatus = "locked" | "available" | "researching" | "done";

export interface ResearchState {
  [techId: string]: { status: ResearchStatus; startedDay?: number; doneDay?: number };
}

export interface Staff {
  installCrews: number;
  repairCrews: number;
  salesAgents: number;
}

export type IncidentKind = "storm" | "equipmentFailure" | "cableCut" | "powerOutage" | "vandalism";

export type IncidentSeverity = 1 | 2 | 3;

export interface Incident {
  id: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  name: string;
  day: number;
  status: "active" | "resolved";
  x?: number;
  y?: number;
  radiusKm?: number;
  affectedSites: string[];
  affectedLinks: string[];
  affectedCustomers: number;
  repairDay?: number;
  crewAssigned: boolean;
  /** Repair workload remaining (repair points). Resolves at 0. */
  pointsRemaining: number;
  note: string;
}

// ---------------------------------------------------------------------------
// The save (versioned)
// ---------------------------------------------------------------------------

export interface GameMeta {
  name: string;
  seed: number;
  createdAt: string;
  difficulty: "easy" | "normal" | "hard";
  gameDay: number;
  paused: boolean;
  speed: number;
  playerCompany: string;
  gameOver: boolean;
  gameOverReason?: string;
}

export interface GameSettings {
  autosaveDays: number;
  alertsEnabled: boolean;
  ambientStorms: boolean;
  equipmentFailures: boolean;
}

export interface GameSave {
  version: number;
  meta: GameMeta;
  map: MapData;
  sites: Site[];
  links: Link[];
  projects: Project[];
  districtsMarket: Record<string, DistrictMarket>;
  plans: Plan[];
  finance: FinanceState;
  research: ResearchState;
  staff: Staff;
  incidents: Incident[];
  rivals: Rival[];
  campaigns: Campaign[];
  marketingLevel: number;
  settings: GameSettings;
  /** Simulated RNG state so server restarts continue the random stream. */
  rngState: number;
  counters: { nextId: number; nextBond: number };
}

export interface GameSummary {
  id: string;
  name: string;
  day: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  cash: number;
  subs: number;
}

// ---------------------------------------------------------------------------
// Client-facing "dynamic" state (everything the map + panels render)
// ---------------------------------------------------------------------------

export interface LiveState {
  id: string;
  meta: GameMeta;
  sites: Site[];
  links: Link[];
  projects: Project[];
  districtsMarket: Record<string, DistrictMarket>;
  plans: Plan[];
  finance: FinanceState;
  research: ResearchState;
  staff: Staff;
  incidents: Incident[];
  rivals: Rival[];
  campaigns: Campaign[];
  marketingLevel: number;
  settings: GameSettings;
  /** Per-town derived stats for the network screen. */
  townStats: TownStats[];
  /** KPI rollups. */
  kpis: Kpis;
}

export interface TownStats {
  townId: string;
  name: string;
  pop: number;
  servedPct: number;
  subs: number;
  potential: number;
  satisfaction: number;
  uplinkMbps: number;
  uplinkUsedMbps: number;
  outageDays30: number;
  rivalShare: number;
}

export interface Kpis {
  cash: number;
  subs: number;
  monthlyRevenue: number;
  monthlyOpex: number;
  monthlyNet: number;
  arpu: number;
  churn30: number;
  networkUptime30: number;
  satisfaction: number;
  capacityUtilization: number;
  incidentActive: number;
  installBacklog: number;
}

export interface GameEvent {
  type:
    | "projectDone"
    | "incident"
    | "incidentResolved"
    | "researchDone"
    | "bankruptcy"
    | "bondDue"
    | "congestion"
    | "churn"
    | "newSubscriber"
    | "info";
  day: number;
  severity: "info" | "warning" | "critical";
  message: string;
}
