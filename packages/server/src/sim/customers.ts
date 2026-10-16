/**
 * Customer demand, competition share, satisfaction, churn and installs.
 */
import { DEMAND, MARKETING } from "@heartland/shared";
import type { DistrictMarket, GameEvent, GameSave, Plan } from "@heartland/shared";
import type { ConnectivityResult } from "./connectivity.js";
import { cabinetTownServed } from "./connectivity.js";
import type { CoverageEntry } from "./wireless.js";
import type { RngState } from "./rng.js";
import { rngNext } from "./rng.js";

export interface CustomerContext {
  conn: ConnectivityResult;
  coverage: Map<string, CoverageEntry>;
  marketingEffect: number;
  businessChurnMult: number;
  rng: RngState;
  events: GameEvent[];
}

export interface DistrictService {
  fiber: boolean;
  wireless: boolean;
  /** Serving site id for traffic routing. */
  anchorId?: string;
  /** Free capacity in subscriber-equivalents for fiber, Mbps for wireless. */
  freeFiberPorts: number;
  freeWirelessMbps: number;
}

/** Determine which technologies are available per district. */
export function districtServices(save: GameSave, ctx: CustomerContext): Map<string, DistrictService> {
  const out = new Map<string, DistrictService>();
  const cabinets = save.sites.filter((s) => s.kind === "cabinet" && s.status === "online");
  const towers = save.sites.filter((s) => s.kind === "tower" && s.status === "online");

  for (const district of save.map.districts) {
    const svc: DistrictService = {
      fiber: false,
      wireless: false,
      freeFiberPorts: 0,
      freeWirelessMbps: 0,
    };
    const cabinet = cabinets.find(
      (c) => c.districtId === district.id && cabinetTownServed(save, c, ctx.conn),
    );
    if (cabinet) {
      svc.fiber = true;
      svc.freeFiberPorts = Math.max(0, cabinet.capacity - cabinet.used);
      const co = save.sites.find(
        (s) => s.townId === district.townId && s.kind === "co" && ctx.conn.sites.get(s.id)?.reachable,
      );
      const fed = save.sites.find(
        (s) =>
          s.townId === district.townId &&
          s.kind === "tower" &&
          s.fiberFed &&
          ctx.conn.sites.get(s.id)?.reachable,
      );
      svc.anchorId = (co ?? fed)?.id;
    }
    const cov = ctx.coverage.get(district.id);
    if (cov) {
      const tower = towers.find((t) => t.id === cov.towerId);
      if (tower) {
        svc.wireless = true;
        const sector = tower.radios?.[cov.sectorIdx];
        svc.freeWirelessMbps = Math.max(0, (sector?.capacityMbps ?? 0) - (sector?.usedMbps ?? 0));
        if (!svc.anchorId) svc.anchorId = tower.id;
      }
    }
    out.set(district.id, svc);
  }
  return out;
}

/** Effective enabled plans for a class. */
export function enabledPlans(save: GameSave, cls: "consumer" | "business"): Plan[] {
  return save.plans.filter((p) => p.cls === cls && p.enabled && p.price > 0);
}

/** Weighted plan mix: utility = speed^0.4 / price^0.8. */
export function planMix(plans: Plan[]): { avgPrice: number; avgSpeed: number } {
  if (plans.length === 0) return { avgPrice: 0, avgSpeed: 0 };
  let wsum = 0;
  let psum = 0;
  let ssum = 0;
  for (const p of plans) {
    const u = Math.pow(p.speedMbps, 0.4) / Math.pow(Math.max(1, p.price), DEMAND.priceElasticity);
    wsum += u;
    psum += u * p.price;
    ssum += u * p.speedMbps;
  }
  return { avgPrice: psum / wsum, avgSpeed: ssum / wsum };
}

/** Player value score for a district (speed/price/satisfaction/marketing). */
function playerScore(
  save: GameSave,
  cls: "consumer" | "business",
  satisfaction: number,
  marketingEffect: number,
): number {
  const plans = enabledPlans(save, cls);
  if (plans.length === 0) return 0;
  const { avgPrice, avgSpeed } = planMix(plans);
  const satF = 0.5 + Math.max(0, satisfaction) / 200;
  return (
    (Math.pow(avgSpeed, 0.4) / Math.pow(Math.max(1, avgPrice), DEMAND.priceElasticity)) *
    satF *
    (1 + marketingEffect)
  );
}

/** Rival value score for a town. */
function rivalScore(save: GameSave, townId: string): number {
  let score = 0;
  for (const r of save.rivals) {
    const f = r.footprint[townId];
    if (!f || f.tech === "none" || f.share <= 0) continue;
    score +=
      f.share *
      ((Math.pow(f.speedMbps, 0.4) / Math.pow(Math.max(1, f.price), DEMAND.priceElasticity)) *
        (1 + r.marketing / 60000));
  }
  return score;
}

export interface DistrictOutcome {
  market: DistrictMarket;
  revenueDaily: number;
  congestion: number; // 0..1
  newSubs: number;
  churned: number;
  offline: boolean;
}

/**
 * Advance customers for one day across all districts.
 */
export function tickCustomers(save: GameSave, ctx: CustomerContext): Map<string, DistrictOutcome> {
  const services = districtServices(save, ctx);
  const outcomes = new Map<string, DistrictOutcome>();
  const consumerMix = planMix(enabledPlans(save, "consumer"));
  const businessMix = planMix(enabledPlans(save, "business"));
  const installCapacity = save.staff.installCrews * 6; // per day (see STAFF)
  let remainingInstalls = installCapacity;

  // Clear radio sector usage; it is rebuilt below.
  for (const t of save.sites) {
    if (t.kind === "tower") {
      for (const s of t.radios ?? []) s.usedMbps = 0;
    }
  }

  for (const district of save.map.districts) {
    const market = save.districtsMarket[district.id];
    if (!market) continue;
    const svc = services.get(district.id);
    const offline = !svc || (!svc.fiber && !svc.wireless);

    // Satisfaction drift toward target.
    const outagePenalty = market.outageDays30 * 8;
    const congestionPenalty =
      market.deliveredMbps > 0 && consumerMix.avgSpeed > 0
        ? Math.max(0, 1 - market.deliveredMbps / consumerMix.avgSpeed) * 20
        : 0;
    const targetSat = Math.max(
      0,
      Math.min(100, 100 - outagePenalty - congestionPenalty - (offline ? 25 : 0)),
    );
    market.satisfaction += (targetSat - market.satisfaction) * 0.08;
    market.satisfaction = Math.max(0, Math.min(100, market.satisfaction));

    const cScore = playerScore(save, "consumer", market.satisfaction, ctx.marketingEffect);
    const bScore = playerScore(save, "business", market.satisfaction, ctx.marketingEffect);
    const rScore = rivalScore(save, district.townId);
    const cShare = cScore / (cScore + rScore + 0.03);
    const bShare = bScore / (bScore + rScore + 0.03);
    const equilibriumRivalShare = 1 - Math.max(cShare, bShare);
    market.rivalShare += (equilibriumRivalShare - market.rivalShare) * 0.02;

    const hhPotential = Math.round(district.households * DEMAND.baseTakeRate);
    const bizPotential = Math.round(district.businesses * DEMAND.businessTakeRate);

    const hhTarget = Math.round(hhPotential * cShare);
    const bizTarget = Math.round(bizPotential * bShare);

    // Demand -> install queue.
    const hhGap = Math.max(0, hhTarget - (market.subs.fiber.hh + market.subs.wireless.hh));
    const bizGap = Math.max(0, bizTarget - (market.subs.fiber.biz + market.subs.wireless.biz));
    const gap = hhGap + bizGap;
    if (svc && gap > 0) {
      // Split demand by technology: fiber preferred when available and free.
      const fiberTake = svc.fiber && svc.freeFiberPorts > 0 ? 1 : 0;
      if (fiberTake > 0 && svc.wireless) {
        const fiberPorts = Math.min(svc.freeFiberPorts, gap);
        market.installQueue.fiber += Math.round(gap * Math.min(1, fiberPorts / Math.max(1, gap)));
        market.installQueue.wireless += gap - Math.round(gap * Math.min(1, fiberPorts / Math.max(1, gap)));
      } else if (fiberTake > 0) {
        market.installQueue.fiber += Math.min(svc.freeFiberPorts, gap);
      } else if (svc.wireless) {
        const subEquivMbps = svc.freeWirelessMbps / Math.max(1, DEMAND.perSubMbps(consumerMix.avgSpeed));
        market.installQueue.wireless += Math.max(0, Math.min(gap, Math.floor(subEquivMbps)));
      }
    }

    // Install from queue up to crew capacity and free network capacity.
    let installedFiber = 0;
    let installedWireless = 0;
    const canFiber = !!svc && svc.fiber && svc.freeFiberPorts > 0;
    const canWireless =
      !!svc && svc.wireless && svc.freeWirelessMbps > DEMAND.perSubMbps(consumerMix.avgSpeed);
    if (svc && remainingInstalls > 0) {
      if (canFiber && market.installQueue.fiber > 0) {
        installedFiber = Math.min(
          market.installQueue.fiber,
          remainingInstalls,
          Math.floor(svc.freeFiberPorts),
        );
        market.installQueue.fiber -= installedFiber;
        remainingInstalls -= installedFiber;
      }
      if (canWireless && market.installQueue.wireless > 0 && remainingInstalls > 0) {
        installedWireless = Math.min(market.installQueue.wireless, remainingInstalls);
        market.installQueue.wireless -= installedWireless;
        remainingInstalls -= installedWireless;
      }
      if (installedFiber + installedWireless > 0) {
        // Split installs between hh and biz roughly by gap ratio.
        const totalTarget = Math.max(1, hhTarget + bizTarget);
        const hhFrac = hhTarget / totalTarget;
        market.subs.fiber.hh += Math.round(installedFiber * hhFrac);
        market.subs.fiber.biz += installedFiber - Math.round(installedFiber * hhFrac);
        market.subs.wireless.hh += Math.round(installedWireless * hhFrac);
        market.subs.wireless.biz += installedWireless - Math.round(installedWireless * hhFrac);
      }
    }

    // Churn.
    const churnMonthly =
      DEMAND.baseChurn +
      market.outageDays30 * DEMAND.churnPerOutageDay +
      ((100 - market.satisfaction) / 100) * DEMAND.churnAtZeroSat;
    const churnDaily = churnMonthly / 30;
    let churned = 0;
    const churnFrom = (tech: "fiber" | "wireless", cls: "hh" | "biz", mult: number) => {
      const expected = market.subs[tech][cls] * churnDaily * mult;
      const whole = Math.floor(expected);
      const frac = expected - whole;
      const n = whole + (rngNext(ctx.rng) < frac ? 1 : 0);
      market.subs[tech][cls] = Math.max(0, market.subs[tech][cls] - n);
      churned += n;
    };
    const bizMult = ctx.businessChurnMult;
    churnFrom("fiber", "hh", 1);
    churnFrom("fiber", "biz", bizMult);
    churnFrom("wireless", "hh", 1);
    churnFrom("wireless", "biz", bizMult);

    // Outage rolling window.
    market.outageDays30 = market.outageDays30 * (29 / 30) + (offline ? 1 : 0);

    // Revenue.
    const totalFiberSubs = market.subs.fiber.hh + market.subs.fiber.biz;
    const totalWirelessSubs = market.subs.wireless.hh + market.subs.wireless.biz;
    const revenueDaily =
      ((market.subs.fiber.hh + market.subs.wireless.hh) * consumerMix.avgPrice +
        (market.subs.fiber.biz + market.subs.wireless.biz) * businessMix.avgPrice) /
      30;

    // Delivered speed estimate (congestion applied by engine afterwards).
    market.deliveredMbps = totalFiberSubs + totalWirelessSubs > 0 ? consumerMix.avgSpeed : 0;

    const outcome: DistrictOutcome = {
      market,
      revenueDaily,
      congestion: 0,
      newSubs: installedFiber + installedWireless,
      churned,
      offline,
    };
    outcomes.set(district.id, outcome);
  }
  return outcomes;
}

/** Marketing effect 0..~0.5 from level + active campaigns. */
export function marketingEffect(save: GameSave, perkMult: number): number {
  const level = MARKETING.effectPerLevel * Math.min(save.marketingLevel, MARKETING.maxLevel) * perkMult;
  let campaigns = 0;
  for (const c of save.campaigns) {
    if (c.daysLeft > 0) campaigns += c.effect;
  }
  return level + campaigns;
}
