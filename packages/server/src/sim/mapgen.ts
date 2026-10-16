/**
 * Procedural map generation for the fictional state of "Meridian".
 * Deterministic given a seed — the same seed always produces the same state.
 */
import { WORLD } from "@heartland/shared";
import type { District, Landmark, MapData, Road, Town, TownKind, Vec2 } from "@heartland/shared";
import { generateElevationGrid, elevationAt } from "./noise.js";
import { makeRng, rngInt, rngNext, rngRange } from "./rng.js";

const TOWN_NAMES = [
  "Prairieview",
  "Cedar Bend",
  "Fairmont",
  "Redwater",
  "Hollow Creek",
  "Northgate",
  "Millbrook",
  "Sandstone",
  "Cordell",
  "Elk Ridge",
  "Dunesville",
  "Birchwood",
  "Granite Falls",
  "Wheatfield",
  "Crossroads",
  "Silver Lake",
  "Pioneer",
  "New Auburn",
  "Stonewall",
  "Harper's Ford",
  "Cloverdale",
  "Badger Hollow",
  "Timberline",
  "Cedar Vale",
  "Fox Run",
  "Juniper",
  "Plainfield",
  "Walnut Grove",
  "Eastbrook",
  "Marlow",
  "Creston",
  "Oakhurst",
  "Redbird",
  "Summit",
  "Bridgeton",
  "Keystone",
  "Windsor",
  "Mapleton",
  "Riverside",
  "Ashland",
  "Belmont",
  "Canton",
];

const LANDMARK_NAMES = [
  "Whisper Lake",
  "Longpine Forest",
  "The Bluffs",
  "Harvest Flats",
  "Coyote Ridge",
  "Bluebird Reservoir",
  "Eagle Rock",
  "Sunflower Prairie",
  "Twin Buttes",
  "Cedar Hollow",
];

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface GenTown extends Town {
  _x: number;
  _y: number;
}

export function generateMap(seed: number): MapData {
  const rng = makeRng(seed ^ 0x5f3759df);
  const cols = Math.round(WORLD.widthKm / WORLD.cellKm);
  const rows = Math.round(WORLD.heightKm / WORLD.cellKm);
  const elevation = generateElevationGrid(rng, cols, rows);

  // --- Towns -----------------------------------------------------------
  const townCount = 30;
  const towns: GenTown[] = [];
  const margin = 60;
  let guard = 0;
  while (towns.length < townCount && guard++ < 4000) {
    const x = rngRange(rng, margin, WORLD.widthKm - margin);
    const y = rngRange(rng, margin, WORLD.heightKm - margin);
    const minD = 34;
    if (towns.some((t) => dist(t, { x, y }) < minD)) continue;
    towns.push({
      id: `town_${towns.length}`,
      name: "",
      x,
      y,
      elevation: 0,
      kind: "village",
      pop: 0,
      districtIds: [],
      gridPower: true,
      _x: x,
      _y: y,
    });
  }

  // Assign names and population ranks.
  const names = [...TOWN_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = rngInt(rng, 0, i);
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  towns.sort((a, b) => a._x - b._x); // arbitrary but stable order
  // Give a population rank via gamma-ish distribution.
  const pops = towns.map(() => 300 + Math.pow(rngNext(rng), 2.2) * 250_000).sort((a, b) => b - a);
  towns.forEach((t, i) => {
    t.pop = Math.round(pops[i] ?? 500);
  });
  towns.sort((a, b) => b.pop - a.pop);
  towns.forEach((t, i) => {
    if (i === 0) t.kind = "capital";
    else if (i < 6) t.kind = "city";
    else if (i < 18) t.kind = "town";
    else t.kind = "village";
  });
  const kindNames: Record<TownKind, string[]> = {
    capital: [],
    city: [],
    town: [],
    village: [],
  };
  towns.forEach((t) => kindNames[t.kind].push(t.id));
  towns.forEach((t, i) => {
    t.name = names[i % names.length] ?? `Town ${i}`;
    t.elevation = elevationAt(elevation, cols, rows, WORLD.cellKm, t.x, t.y);
    delete (t as Partial<GenTown>)._x;
    delete (t as Partial<GenTown>)._y;
  });

  // --- Roads (MST + ring shortcuts) ------------------------------------
  const edges: { a: number; b: number; d: number }[] = [];
  for (let i = 0; i < towns.length; i++) {
    for (let j = i + 1; j < towns.length; j++) {
      edges.push({ a: i, b: j, d: dist(towns[i]!, towns[j]!) });
    }
  }
  edges.sort((e1, e2) => e1.d - e2.d);
  const parent = towns.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x] ?? x)));
  const mstEdges: { a: number; b: number; d: number }[] = [];
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[ra] = rb;
      mstEdges.push(e);
      if (mstEdges.length === towns.length - 1) break;
    }
  }
  // Add a few shortcuts between nearby pairs to form rings.
  const roads: Road[] = [];
  const chosen = new Set<string>();
  const addRoad = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (chosen.has(key)) return;
    chosen.add(key);
    const tA = towns[a]!;
    const tB = towns[b]!;
    const points: Vec2[] = [tA, tB];
    if (dist(tA, tB) > 80) {
      // Two-segment bend for realism on long roads.
      const mx = (tA.x + tB.x) / 2 + rngRange(rng, -12, 12);
      const my = (tA.y + tB.y) / 2 + rngRange(rng, -12, 12);
      points.splice(1, 0, { x: mx, y: my });
    }
    const lengthKm = points.reduce((s, p, i) => s + (i === 0 ? 0 : dist(points[i - 1]!, p)), 0);
    const cls = tA.pop > 25000 && tB.pop > 25000 ? 2 : tA.pop > 4000 || tB.pop > 4000 ? 1 : 0;
    roads.push({
      id: `road_${roads.length}`,
      from: tA.id,
      to: tB.id,
      name: `${tA.name}–${tB.name} Rd`,
      points,
      lengthKm,
      class: cls,
    });
  };
  mstEdges.forEach((e) => addRoad(e.a, e.b));
  // Ring shortcuts: for each town, link to its 2 nearest unconnected neighbors.
  const sorted = [...edges].filter((e) => !chosen.has(`${e.a}-${e.b}`) && !chosen.has(`${e.b}-${e.a}`));
  sorted.forEach((e) => {
    if (roads.length < mstEdges.length + 14) addRoad(e.a, e.b);
  });
  for (const t of towns) {
    t.districtIds = [];
  }

  // --- Districts ---------------------------------------------------------
  const districts: District[] = [];
  for (const t of towns) {
    const n = Math.max(1, Math.min(8, Math.round(Math.sqrt(t.pop) / 14)));
    const weights: number[] = [];
    let wsum = 0;
    for (let i = 0; i < n; i++) {
      const w = rngRange(rng, 0.5, 1.5);
      weights.push(w);
      wsum += w;
    }
    const hh = Math.round(t.pop / 2.6);
    let assigned = 0;
    for (let i = 0; i < n; i++) {
      const kind = i === 0 ? "urban" : i < Math.ceil(n / 2) ? "suburban" : "rural";
      const frac = weights[i]! / wsum;
      const dHh = i === n - 1 ? hh - assigned : Math.round(hh * frac);
      assigned += dHh;
      const bizFactor = kind === "urban" ? 0.09 : kind === "suburban" ? 0.045 : 0.015;
      const ang = (i / n) * Math.PI * 2 + rngRange(rng, -0.4, 0.4);
      const rad = Math.max(2, Math.sqrt(t.pop) / 16);
      const d: District = {
        id: `dist_${districts.length}`,
        townId: t.id,
        name: `${t.name} ${["Central", "North", "East", "South", "West", "Heights", "Meadows", "Lakeside"][i] ?? `District ${i + 1}`}`,
        x: t.x + Math.cos(ang) * rad,
        y: t.y + Math.sin(ang) * rad,
        kind,
        households: Math.max(10, dHh),
        businesses: Math.max(1, Math.round(dHh * bizFactor)),
      };
      districts.push(d);
      t.districtIds.push(d.id);
    }
  }

  // --- Landmarks ---------------------------------------------------------
  const landmarks: Landmark[] = [];
  const lCount = rngInt(rng, 6, 9);
  for (let i = 0; i < lCount; i++) {
    const x = rngRange(rng, 60, WORLD.widthKm - 60);
    const y = rngRange(rng, 60, WORLD.heightKm - 60);
    const kind = i % 3 === 0 ? "lake" : i % 3 === 1 ? "forest" : "ridge";
    landmarks.push({
      id: `land_${i}`,
      name: LANDMARK_NAMES[i % LANDMARK_NAMES.length] ?? `Landmark ${i}`,
      x,
      y,
      kind,
      radiusKm: rngRange(rng, 8, kind === "lake" ? 22 : 30),
    });
  }

  return {
    seed,
    stateName: "Meridian",
    widthKm: WORLD.widthKm,
    heightKm: WORLD.heightKm,
    elevation,
    gridCols: cols,
    gridRows: rows,
    towns,
    roads,
    districts,
    landmarks,
  };
}
