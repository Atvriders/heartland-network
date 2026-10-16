/** Research tech helpers and perk computation. */
import { TECHS } from "@heartland/shared";
import type { GameSave, ResearchState, TechDef } from "@heartland/shared";

export function techDef(id: string): TechDef | undefined {
  return TECHS.find((t) => t.id === id);
}

export function hasTech(save: GameSave, techId: string): boolean {
  return save.research[techId]?.status === "done";
}

export function techAvailable(save: GameSave, techId: string): boolean {
  const def = techDef(techId);
  if (!def) return false;
  return def.requires.every((r) => hasTech(save, r));
}

/** Initialize the research state for a new game. */
export function initResearch(): ResearchState {
  const state: ResearchState = {};
  for (const t of TECHS) {
    state[t.id] = { status: t.requires.length === 0 ? "available" : "locked" };
  }
  return state;
}

export interface Perks {
  repairSpeedMult: number;
  marketingMult: number;
  businessChurnMult: number;
  solarEnabled: boolean;
}

export function perks(save: GameSave): Perks {
  return {
    repairSpeedMult: hasTech(save, "ops-diagnostics") ? 1.3 : 1,
    marketingMult: hasTech(save, "ops-marketing") ? 1.5 : 1,
    businessChurnMult: hasTech(save, "ops-sla") ? 0.6 : 1,
    solarEnabled: hasTech(save, "power-solar"),
  };
}

/** Unlock states that depend on research (e.g. newly unlocked techs). */
export function refreshResearchState(save: GameSave): void {
  for (const t of TECHS) {
    const st = save.research[t.id];
    if (!st) {
      save.research[t.id] = { status: t.requires.length === 0 ? "available" : "locked" };
      continue;
    }
    if (st.status === "locked" && techAvailable(save, t.id)) {
      st.status = "available";
    }
  }
}
