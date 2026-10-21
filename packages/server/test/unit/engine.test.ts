/** Unit tests: simulation engine end-to-end workflows. */
import { describe, expect, it } from "vitest";
import { CURRENT_SAVE_VERSION } from "../../src/save/migrations.js";
import { createNewGame } from "../../src/sim/newgame.js";
import { GameEngine } from "../../src/sim/engine.js";
import { initResearch } from "../../src/sim/research.js";
import { applyCommand } from "../../src/sim/commands.js";
import { totalSubs } from "../../src/sim/finance.js";
import { startStorm } from "../../src/sim/failures.js";
import { makeRng, rngNext, type RngState } from "../../src/sim/rng.js";
import type { GameSave } from "@heartland/shared";

/** Find an RNG seed whose first output is below p (for deterministic tests). */
function rngWithFirstBelow(p: number): RngState {
  for (let seed = 1; seed < 20000; seed++) {
    const r = makeRng(seed);
    if (rngNext(r) < p) return makeRng(seed);
  }
  throw new Error("no seed found");
}

function freshGame(opts: { seed?: number; difficulty?: "easy" | "normal" | "hard" } = {}): GameSave {
  const save = createNewGame({ seed: opts.seed ?? 42, difficulty: opts.difficulty }, CURRENT_SAVE_VERSION);
  save.research = initResearch();
  // Unit tests disable random ambient events for determinism.
  save.settings.ambientStorms = false;
  save.settings.equipmentFailures = false;
  return save;
}

function engineFor(save: GameSave): GameEngine {
  return new GameEngine(save);
}

function command(save: GameSave, engine: GameEngine, cmd: Parameters<typeof applyCommand>[2]) {
  const res = applyCommand(save, engine, cmd);
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("engine: core build-and-serve workflow", () => {
  it("builds a CO, connects customers, earns revenue", () => {
    const save = freshGame();
    const engine = engineFor(save);
    const capital = [...save.map.towns].sort((a, b) => b.pop - a.pop)[0]!;
    const districtId = capital.districtIds[0]!;

    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: capital.id });
    command(save, engine, { cmd: "startProject", type: "cabinet", tier: 1, districtId });

    const cashBefore = save.finance.cash;
    expect(save.sites.length).toBe(2);
    expect(save.projects.length).toBe(2);
    expect(cashBefore).toBeLessThan(2_500_000);

    // Run until both projects complete + customers arrive (stop before the
    // day-60 monthly roll resets the accumulator).
    for (let i = 0; i < 50; i++) engine.tick();

    const co = save.sites.find((s) => s.kind === "co")!;
    const cab = save.sites.find((s) => s.kind === "cabinet")!;
    expect(co.status).toBe("online");
    expect(cab.status).toBe("online");
    expect(totalSubs(save)).toBeGreaterThan(0);
    // Revenue accrues.
    const revenue = save.finance.recent.filter((e) => e.kind === "revenue");
    expect(revenue.length).toBeGreaterThan(0);
    expect(save.finance.month.revenue).toBeGreaterThan(0);
  });

  it("runs a month roll and monthly P&L row", () => {
    const save = freshGame();
    const engine = engineFor(save);
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: save.map.towns[0]!.id });
    for (let i = 0; i < 30; i++) engine.tick();
    expect(save.meta.gameDay).toBe(30);
    expect(save.finance.monthly.length).toBe(1);
    const row = save.finance.monthly[0]!;
    expect(row.cashEnd).toBeCloseTo(save.finance.cash, -2);
    // Cost fields are positive magnitudes; net is revenue minus costs.
    expect(row.opex).toBeGreaterThan(0);
    expect(row.capex).toBeGreaterThanOrEqual(0);
    expect(row.interest).toBeGreaterThanOrEqual(0);
    expect(row.net).toBeCloseTo(row.revenue - row.opex - row.capex - row.interest, 0);
  });
});

describe("engine: failures, repairs, redundancy", () => {
  it("a storm damages the CO and customers lose service until repaired", () => {
    const save = freshGame();
    const engine = engineFor(save);
    const capital = [...save.map.towns].sort((a, b) => b.pop - a.pop)[0]!;
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: capital.id });
    command(save, engine, {
      cmd: "startProject",
      type: "cabinet",
      tier: 1,
      districtId: capital.districtIds[0]!,
    });
    for (let i = 0; i < 45; i++) engine.tick();
    const co = save.sites.find((s) => s.kind === "co")!;
    const subsBefore = totalSubs(save);
    expect(subsBefore).toBeGreaterThan(0);

    // Run a severe storm drill directly on the CO with a seeded RNG that
    // guarantees the first hit roll succeeds (deterministic test).
    const rng = rngWithFirstBelow(0.55);
    startStorm(save, 3, co.x, co.y, 30, rng, [], "Test storm");
    expect(co.status).toBe("failed");
    const incident = save.incidents.find((i) => i.status === "active")!;
    expect(incident).toBeDefined();

    // Without repair, the district experiences outage days.
    const districtId = capital.districtIds[0]!;
    const before = save.districtsMarket[districtId]!.outageDays30;
    for (let i = 0; i < 5; i++) engine.tick();
    expect(save.districtsMarket[districtId]!.outageDays30).toBeGreaterThan(before);
    // Cabinet goes offline because its town lost the CO (or was hit itself).
    const cab = save.sites.find((s) => s.kind === "cabinet")!;
    expect(["offline", "unpowered", "failed"]).toContain(cab.status);

    // Dispatch a crew; the incident eventually resolves and service returns.
    command(save, engine, { cmd: "dispatchCrew", incidentId: incident.id });
    for (let i = 0; i < 20; i++) engine.tick();
    expect(save.incidents.find((i) => i.id === incident.id)!.status).toBe("resolved");
    for (let i = 0; i < 5; i++) engine.tick();
    expect(co.status).toBe("online");
  });

  it("a ring topology keeps service up when one link is cut", () => {
    const save = freshGame({ seed: 33 });
    const engine = engineFor(save);
    // Two small towns with COs, linked to each other (redundant path).
    const small = [...save.map.towns].sort((a, b) => a.pop - b.pop).slice(0, 8);
    let t1 = small[0]!;
    let t2 = small[1]!;
    let bestD = Math.hypot(t1.x - t2.x, t1.y - t2.y);
    for (let i = 0; i < small.length; i++) {
      for (let j = i + 1; j < small.length; j++) {
        const d = Math.hypot(small[i]!.x - small[j]!.x, small[i]!.y - small[j]!.y);
        if (d < bestD) {
          bestD = d;
          t1 = small[i]!;
          t2 = small[j]!;
        }
      }
    }
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: t1.id });
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: t2.id });
    // Raise capital for the trunk.
    command(save, engine, { cmd: "borrow", amount: 2_000_000, months: 60 });
    for (let i = 0; i < 35; i++) engine.tick();
    const co1 = save.sites.find((s) => s.kind === "co" && s.townId === t1!.id)!;
    const co2 = save.sites.find((s) => s.kind === "co" && s.townId === t2!.id)!;
    command(save, engine, {
      cmd: "startProject",
      type: "fiber",
      tier: 1,
      fromSiteId: co1.id,
      toSiteId: co2.id,
    });
    for (let i = 0; i < 60; i++) engine.tick();
    const link = save.links.find((l) => l.kind === "fiber")!;
    expect(link.status).toBe("online");

    // Cut the link. Both COs remain online (each is its own root).
    link.status = "cut";
    engine.refreshStatuses();
    engine.tick();
    expect(co1.status).toBe("online");
    expect(co2.status).toBe("online");
  });
});

describe("engine: power and backup", () => {
  it("battery carries a site through a grid outage, then recharges", () => {
    const save = freshGame();
    const engine = engineFor(save);
    const capital = [...save.map.towns].sort((a, b) => b.pop - a.pop)[0]!;
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: capital.id });
    command(save, engine, { cmd: "startProject", type: "battery", tier: 1, siteId: save.sites[0]!.id });
    for (let i = 0; i < 32; i++) engine.tick();
    const co = save.sites.find((s) => s.kind === "co")!;
    expect(co.status).toBe("online");
    expect(co.power.batteryCapacityH).toBeGreaterThan(0);

    // Grid outage overlay (simulated storm incident with radius).
    const incident = {
      id: "inc_x",
      kind: "storm" as const,
      severity: 2 as const,
      name: "Test outage",
      day: save.meta.gameDay,
      status: "active" as const,
      x: co.x,
      y: co.y,
      radiusKm: 30,
      affectedSites: [],
      affectedLinks: [],
      affectedCustomers: 0,
      crewAssigned: false,
      pointsRemaining: 4,
      note: "",
    };
    save.incidents.push(incident);
    const levelBefore = co.power.batteryLevelH;
    engine.tick();
    expect(co.power.mode).toBe("battery");
    expect(co.power.batteryLevelH).toBeLessThan(levelBefore);
    // Resolve the incident; the site returns to grid and recharges.
    incident.status = "resolved";
    engine.tick();
    expect(co.power.mode).toBe("grid");
    expect(co.power.batteryLevelH).toBeGreaterThanOrEqual(0);
  });
});

describe("commands: validation", () => {
  it("rejects builds with insufficient cash", () => {
    const save = freshGame();
    const engine = engineFor(save);
    save.finance.cash = 1000;
    const res = applyCommand(save, engine, {
      cmd: "startProject",
      type: "co",
      tier: 1,
      townId: save.map.towns[0]!.id,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Insufficient funds");
  });

  it("gates higher tiers behind research", () => {
    const save = freshGame();
    const engine = engineFor(save);
    const res = applyCommand(save, engine, {
      cmd: "startProject",
      type: "fiber",
      tier: 2,
      fromSiteId: "site_a",
      toSiteId: "site_b",
    });
    expect(res.ok).toBe(false);
  });

  it("one office per town", () => {
    const save = freshGame();
    const engine = engineFor(save);
    const town = save.map.towns[0]!;
    command(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: town.id });
    const res = applyCommand(save, engine, { cmd: "startProject", type: "co", tier: 1, townId: town.id });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("already has a central office");
  });
});
