/** Unit tests: save-format migration chain. */
import { describe, expect, it } from "vitest";
import { CURRENT_SAVE_VERSION, migrateSave } from "../../src/save/migrations.js";
import { createNewGame } from "../../src/sim/newgame.js";

describe("save migrations", () => {
  it("writes new games at the current save version", () => {
    const save = createNewGame({ seed: 1 }, CURRENT_SAVE_VERSION);
    expect(save.version).toBe(CURRENT_SAVE_VERSION);
  });

  it("upgrades a v1 save to the current version", () => {
    const v1 = createV1Fixture();
    const migrated = migrateSave(v1);
    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    // marketingLevel moved to root.
    expect(migrated.marketingLevel).toBe(2);
    expect((migrated.finance as Record<string, unknown>).marketingLevel).toBeUndefined();
    // batteryLevel renamed.
    const site = migrated.sites[0]!;
    expect(site.power.batteryLevelH).toBe(3.5);
    expect((site.power as Record<string, unknown>).batteryLevel).toBeUndefined();
    expect(site.power.batteryCapacityH).toBe(4);
    // campaigns defaulted.
    expect(migrated.campaigns).toEqual([]);
  });

  it("migrating twice is idempotent", () => {
    const once = migrateSave(createV1Fixture());
    const twice = migrateSave(once);
    expect(twice).toEqual(once);
  });

  it("rejects unknown or future versions", () => {
    expect(() => migrateSave({ version: 0 })).toThrow();
    expect(() => migrateSave({ version: CURRENT_SAVE_VERSION + 1 })).toThrow();
    expect(() => migrateSave(null)).toThrow();
    expect(() => migrateSave("nope")).toThrow();
  });

  it("round-trips through JSON serialization", () => {
    const save = createNewGame({ seed: 42 }, CURRENT_SAVE_VERSION);
    const round = migrateSave(JSON.parse(JSON.stringify(save)));
    expect(round).toEqual(save);
  });
});

/** A minimal but realistic v1 save (the pre-migration format). */
function createV1Fixture(): Record<string, unknown> {
  return {
    version: 1,
    meta: {
      name: "V1 Save",
      seed: 5,
      createdAt: "2025-01-01T00:00:00.000Z",
      difficulty: "normal",
      gameDay: 120,
      paused: false,
      speed: 1,
      playerCompany: "Heartland Networks",
      gameOver: false,
    },
    map: {
      seed: 5,
      stateName: "Meridian",
      widthKm: 960,
      heightKm: 640,
      elevation: [0.5, 0.5, 0.5, 0.5],
      gridCols: 2,
      gridRows: 2,
      towns: [],
      roads: [],
      districts: [],
      landmarks: [],
    },
    sites: [
      {
        id: "site_1",
        kind: "co",
        name: "Old CO",
        x: 10,
        y: 20,
        townId: "town_0",
        tier: 1,
        status: "online",
        buildProgress: 1,
        condition: 90,
        power: {
          source: "grid",
          gridAvailable: true,
          batteryLevel: 3.5,
          batteryCapacityH: 4,
          batteryTier: 1,
          generatorTier: 0,
          fuelPct: 0,
        },
        capacity: 2000,
        used: 10,
        landOwned: false,
        leaseMonthly: 1200,
        fiberFed: true,
      },
    ],
    links: [],
    projects: [],
    districtsMarket: {},
    plans: [],
    finance: {
      cash: 500000,
      bonds: [],
      monthly: [],
      recent: [],
      marketingLevel: 2,
      month: { revenue: 0, opex: 0, capex: 0, interest: 0 },
    },
    research: {},
    staff: { installCrews: 2, repairCrews: 1, salesAgents: 1 },
    incidents: [],
    rivals: [],
    marketingLevel: undefined,
    settings: {
      autosaveDays: 30,
      alertsEnabled: true,
      ambientStorms: true,
      equipmentFailures: true,
    },
    rngState: 12345,
    counters: { nextId: 50, nextBond: 3 },
  };
}
