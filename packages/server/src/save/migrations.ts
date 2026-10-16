/**
 * Save-format migrations.
 *
 * The save format is versioned (`GameSave.version`). When a save with an older
 * version is loaded, it is upgraded step-by-step through the migration chain.
 * Migrations must be pure functions — they never touch the database.
 *
 * History:
 *  v1  Initial save format.
 *      - marketing level stored at `finance.marketingLevel`
 *      - battery level stored at `sites[].power.batteryLevel`
 *  v2  - `finance.marketingLevel` moved to root `marketingLevel`
 *      - `power.batteryLevel` renamed to `power.batteryLevelH`
 *      - added `power.batteryCapacityH`, `power.mode`, `power.opexDaily`
 */
import type { GameSave } from "@heartland/shared";

export const CURRENT_SAVE_VERSION = 2;

/* eslint-disable @typescript-eslint/no-explicit-any */

function migrateV1toV2(save: any): any {
  const s = { ...save };
  s.version = 2;
  s.marketingLevel = save.finance?.marketingLevel ?? 0;
  if (s.finance) delete s.finance.marketingLevel;
  s.sites = (s.sites ?? []).map((site: any) => {
    const power = { ...(site.power ?? {}) };
    if (power.batteryLevel !== undefined) {
      power.batteryLevelH = power.batteryLevel;
      delete power.batteryLevel;
    }
    power.batteryCapacityH = power.batteryCapacityH ?? power.batteryLevelH ?? 0;
    power.mode = power.mode ?? "grid";
    power.opexDaily = power.opexDaily ?? 0;
    return { ...site, power };
  });
  s.campaigns = s.campaigns ?? [];
  return s;
}

const MIGRATIONS: Record<number, (save: any) => any> = {
  1: migrateV1toV2,
};

/**
 * Upgrade any save to the current version.
 * @throws if the save version is unknown or the chain is broken.
 */
export function migrateSave(save: any): GameSave {
  if (save === null || typeof save !== "object") {
    throw new Error("Invalid save: not an object");
  }
  if (typeof save.version !== "number" || save.version < 1) {
    throw new Error(`Invalid save: missing or bad version (${save.version})`);
  }
  if (save.version > CURRENT_SAVE_VERSION) {
    throw new Error(
      `Save version ${save.version} is newer than this build supports (${CURRENT_SAVE_VERSION})`,
    );
  }
  let s = save;
  while (s.version < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new Error(`No migration from save version ${s.version}`);
    s = step(s);
  }
  return s as GameSave;
}

/** Deep clone via structuredClone (available in Node 17+). */
export function cloneSave<T>(save: T): T {
  return structuredClone(save);
}
