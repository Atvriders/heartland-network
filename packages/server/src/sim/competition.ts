/**
 * Competitor AI: pricing walks, footprint expansion, marketing.
 */
import { RIVAL_DEFS } from "@heartland/shared";
import type { GameSave } from "@heartland/shared";
import { rngChance, rngRange, type RngState } from "./rng.js";

export function rivalBase(defId: string): { price: number; speed: number } {
  const def = RIVAL_DEFS.find((d) => d.id === defId);
  return { price: def?.basePrice ?? 60, speed: def?.baseSpeed ?? 100 };
}

export function tickCompetition(save: GameSave, rng: RngState): void {
  // Rivals act every 14 days.
  if (save.meta.gameDay % 14 !== 0) return;

  for (const rival of save.rivals) {
    const base = rivalBase(rival.id);
    rival.marketing = Math.max(0, rival.marketing + rngRange(rng, -1500, 4000));
    for (const town of save.map.towns) {
      const f = rival.footprint[town.id];
      if (!f || f.tech === "none") continue;
      // Price walk around the base price.
      f.price = Math.max(20, f.price + rngRange(rng, -4, 4));
      const pull = base.price - f.price;
      f.price = Math.max(20, Math.min(base.price * 1.6, f.price + pull * 0.02));
      // Footprint expansion when aggressive.
      if (rngChance(rng, 0.06 * rival.aggression)) {
        f.share = Math.min(0.92, f.share + rngRange(rng, 0.01, 0.04));
      }
      if (rngChance(rng, 0.02)) {
        f.share = Math.max(0.05, f.share - rngRange(rng, 0.01, 0.03));
      }
      // Occasionally speed upgrades in cities.
      if (town.kind === "city" && rngChance(rng, 0.03) && f.speedMbps < 1000) {
        f.speedMbps = Math.min(1000, f.speedMbps + 100);
      }
    }
  }
}
