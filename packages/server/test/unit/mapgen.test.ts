/** Unit tests: map generation determinism and geometry. */
import { describe, expect, it } from "vitest";
import { WORLD } from "@heartland/shared";
import { generateMap } from "../../src/sim/mapgen.js";
import { elevationAt } from "../../src/sim/noise.js";

describe("map generation", () => {
  it("is deterministic for a given seed", () => {
    const a = generateMap(42);
    const b = generateMap(42);
    expect(a).toEqual(b);
  });

  it("is different for different seeds", () => {
    const a = generateMap(7);
    const b = generateMap(8);
    expect(a.towns.map((t) => t.x)).not.toEqual(b.towns.map((t) => t.x));
  });

  it("produces a plausible state layout", () => {
    const m = generateMap(123);
    expect(m.towns.length).toBeGreaterThanOrEqual(28);
    expect(m.towns.length).toBeLessThanOrEqual(32);
    expect(m.roads.length).toBeGreaterThan(m.towns.length - 1); // MST + rings
    expect(m.districts.length).toBeGreaterThan(m.towns.length);
    expect(m.elevation.length).toBe(m.gridCols * m.gridRows);
    // One capital.
    expect(m.towns.filter((t) => t.kind === "capital").length).toBe(1);
    // All towns have names and grid power.
    for (const t of m.towns) {
      expect(t.name.length).toBeGreaterThan(1);
      expect(t.gridPower).toBe(true);
    }
  });

  it("all towns are connected by the road network", () => {
    const m = generateMap(99);
    // Union-find over roads.
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x) ?? x;
      if (p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => {
      parent.set(find(a), find(b));
    };
    for (const r of m.roads) union(r.from, r.to);
    const roots = new Set(m.towns.map((t) => find(t.id)));
    expect(roots.size).toBe(1);
  });

  it("elevation interpolation returns sane values", () => {
    const m = generateMap(5);
    for (let i = 0; i < 20; i++) {
      const e = elevationAt(
        m.elevation,
        m.gridCols,
        m.gridRows,
        WORLD.cellKm,
        (i * 47) % m.widthKm,
        (i * 89) % m.heightKm,
      );
      expect(e).toBeGreaterThan(100);
      expect(e).toBeLessThan(800);
    }
  });
});
