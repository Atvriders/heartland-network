/**
 * Fixed-wireless coverage: terrain line-of-sight with Fresnel-zone clearance
 * and earth-curvature correction, plus sector assignment.
 */
import { RADIO_TIERS, WORLD } from "@heartland/shared";
import type { District, GameSave } from "@heartland/shared";
import { elevationAt } from "./noise.js";
import { hashString } from "./rng.js";

export interface CoverageEntry {
  districtId: string;
  towerId: string;
  sectorIdx: number;
  distKm: number;
}

/** Frequency in GHz for a radio tier (used for Fresnel radius). */
function freqGhz(tier: number): number {
  return tier === 3 ? 28 : tier === 2 ? 6 : 3.5;
}

/** Fresnel zone clearance requirement for the given frequency, in meters. */
export function fresnelClearance(fGhz: number, d1Km: number, d2Km: number): number {
  const d = d1Km + d2Km;
  if (d <= 0) return 0;
  const radius = 8.657 * Math.sqrt((d1Km * d2Km) / (fGhz * d));
  return 0.6 * radius;
}

/** Earth bulge in meters at distance t along a path of length d (km). */
function earthBulge(tKm: number, dKm: number): number {
  // d1*d2 / (2R), R = 6371 km -> km * 1000 m
  return ((tKm * (dKm - tKm)) / (2 * 6371)) * 1000;
}

/**
 * Line-of-sight between two points with Fresnel clearance.
 * heights in meters (absolute terrain + antenna).
 */
export function hasLos(
  save: GameSave,
  x1: number,
  y1: number,
  h1: number,
  x2: number,
  y2: number,
  h2: number,
  fGhz: number,
): boolean {
  const { elevation, gridCols, gridRows } = save.map;
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.5) return true;
  const step = WORLD.losSampleKm;
  const n = Math.max(2, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const t = (i / n) * d;
    const fx = x1 + ((x2 - x1) * i) / n;
    const fy = y1 + ((y2 - y1) * i) / n;
    const terrain = elevationAt(elevation, gridCols, gridRows, WORLD.cellKm, fx, fy);
    const lineH = h1 + ((h2 - h1) * t) / d - earthBulge(t, d);
    const clearance = fresnelClearance(fGhz, t, d - t);
    if (terrain > lineH - clearance) return false;
  }
  return true;
}

/** Sector azimuth offset so different towers don't perfectly overlap. */
export function sectorOffset(towerId: string): number {
  return hashString(towerId) % 60;
}

/**
 * Compute wireless coverage: which districts each online tower can serve.
 * Cached by callers via a fingerprint; this is the raw computation.
 */
export function computeCoverage(save: GameSave): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  const towers = save.sites.filter((s) => s.kind === "tower" && s.status === "online" && s.radios?.length);
  if (towers.length === 0) return entries;

  for (const t of towers) {
    const radio = RADIO_TIERS[t.tier - 1];
    if (!radio) continue;
    const sectors = t.radios ?? [];
    const towerHeight =
      elevationAt(save.map.elevation, save.map.gridCols, save.map.gridRows, WORLD.cellKm, t.x, t.y) +
      radio.heightM;

    for (const d of save.map.districts) {
      const distKm = Math.hypot(d.x - t.x, d.y - t.y);
      if (distKm > radio.maxRangeKm) continue;
      // Sector facing the district.
      const ang = (Math.atan2(d.y - t.y, d.x - t.x) * 180) / Math.PI;
      const sectorWidth = 360 / sectors.length;
      let sectorIdx = -1;
      for (let i = 0; i < sectors.length; i++) {
        const az = sectors[i]?.azimuth ?? 0 + i * sectorWidth;
        let rel = (((ang - az) % 360) + 360) % 360;
        if (rel > 180) rel = 360 - rel;
        if (rel <= sectorWidth / 2 + 8) {
          sectorIdx = i;
          break;
        }
      }
      if (sectorIdx < 0) continue;

      const districtHeight =
        elevationAt(save.map.elevation, save.map.gridCols, save.map.gridRows, WORLD.cellKm, d.x, d.y) + 10;
      if (!hasLos(save, t.x, t.y, towerHeight, d.x, d.y, districtHeight, freqGhz(t.tier))) {
        continue;
      }
      entries.push({ districtId: d.id, towerId: t.id, sectorIdx, distKm });
    }
  }
  return entries;
}

/** Pick the best tower per district (shortest distance). */
export function bestCoverage(entries: CoverageEntry[]): Map<string, CoverageEntry> {
  const best = new Map<string, CoverageEntry>();
  for (const e of entries) {
    const cur = best.get(e.districtId);
    if (!cur || e.distKm < cur.distKm) best.set(e.districtId, e);
  }
  return best;
}

export function districtsOfTown(save: GameSave, townId: string): District[] {
  return save.map.districts.filter((d) => d.townId === townId);
}
