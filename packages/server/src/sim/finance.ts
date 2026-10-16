/**
 * Finance: revenue, operating expenses, bonds, ledger, monthly P&L.
 */
import { BONDS, MARKETING, STAFF, TAXES } from "@heartland/shared";
import type { GameEvent, GameSave, LedgerEntry } from "@heartland/shared";

export function ledger(save: GameSave, kind: LedgerEntry["kind"], amount: number, note: string): void {
  save.finance.recent.push({ day: save.meta.gameDay, kind, amount: Math.round(amount), note });
  if (save.finance.recent.length > 400) save.finance.recent.splice(0, save.finance.recent.length - 400);
  if (kind === "revenue") save.finance.month.revenue += amount;
  else if (kind === "opex") save.finance.month.opex += amount;
  else if (kind === "capex") save.finance.month.capex += amount;
  else if (kind === "interest") save.finance.month.interest += amount;
}

/** Daily operating expenses (sites, power, staff, marketing, campaigns, fuel orders). */
export function dailyOpex(save: GameSave, extraFuel: { siteId: string; cost: number }[]): number {
  let total = 0;
  for (const site of save.sites) {
    if (site.status === "decommissioned") continue;
    if (site.status === "building" || site.status === "planned") continue;
    total += site.leaseMonthly / 30;
    total += site.power.opexDaily;
    // Maintenance by kind.
    if (site.kind === "co") total += site.tier * 90;
    else if (site.kind === "tower") total += site.tier * 30;
    else total += site.tier * 4;
  }
  for (const link of save.links) {
    if (link.status === "building" || link.status === "planned") continue;
    if (link.kind === "fiber") total += link.lengthKm * 0.9;
    else total += 10;
  }
  total += save.staff.installCrews * STAFF.installCrew.dailyCost;
  total += save.staff.repairCrews * STAFF.repairCrew.dailyCost;
  total += save.staff.salesAgents * STAFF.salesAgent.dailyCost;
  total += Math.min(save.marketingLevel, MARKETING.maxLevel) * MARKETING.costPerLevelDaily;
  for (const c of save.campaigns) {
    if (c.daysLeft > 0) total += c.costDaily;
  }
  for (const f of extraFuel) total += f.cost;
  return total;
}

export function dailyRevenue(save: GameSave): number {
  let total = 0;
  for (const dm of Object.values(save.districtsMarket)) {
    const plansC = save.plans.filter((p) => p.cls === "consumer" && p.enabled && p.price > 0);
    const plansB = save.plans.filter((p) => p.cls === "business" && p.enabled && p.price > 0);
    const avgC = plansC.length ? plansC.reduce((s, p) => s + p.price, 0) / plansC.length : 0;
    const avgB = plansB.length ? plansB.reduce((s, p) => s + p.price, 0) / plansB.length : 0;
    total +=
      ((dm.subs.fiber.hh + dm.subs.wireless.hh) * avgC + (dm.subs.fiber.biz + dm.subs.wireless.biz) * avgB) /
      30;
  }
  return total;
}

/** Accrue bond interest daily. */
export function dailyInterest(save: GameSave): number {
  let interest = 0;
  for (const b of save.finance.bonds) {
    interest += (b.outstanding * (b.ratePct / 100)) / 365;
  }
  return interest;
}

/** Monthly bond payments on the 1st of each month (day % 30 === 1). */
export function processBondPayments(save: GameSave, events: GameEvent[]): void {
  for (const b of [...save.finance.bonds]) {
    const interestPortion = b.outstanding * (b.ratePct / 100 / 12);
    const principalPortion = Math.min(b.outstanding, b.monthlyPayment - interestPortion);
    const payment = interestPortion + principalPortion;
    b.outstanding = Math.max(0, b.outstanding - principalPortion);
    b.monthsLeft -= 1;
    save.finance.cash -= payment;
    ledger(save, "repayment", -payment, `Bond payment: ${b.name}`);
    if (b.monthsLeft <= 0 || b.outstanding <= 1) {
      save.finance.bonds = save.finance.bonds.filter((x) => x.id !== b.id);
      events.push({
        type: "info",
        day: save.meta.gameDay,
        severity: "info",
        message: `Bond "${b.name}" fully repaid.`,
      });
    }
  }
}

/** Issue a bond. Returns the bond or null on invalid input. */
export function issueBond(save: GameSave, amount: number, months: number, label?: string): boolean {
  const term = BONDS.terms.find((t) => t.months === months);
  if (!term) return false;
  if (amount < BONDS.minAmount || amount > BONDS.maxAmount) return false;
  const r = term.ratePct / 100;
  const monthly = r / 12 / (1 - Math.pow(1 + r / 12, -months));
  const payment = amount * monthly;
  const id = `bond_${save.counters.nextBond++}`;
  save.finance.bonds.push({
    id,
    name: label ?? `${months / 12}-yr Infrastructure Bond`,
    principal: amount,
    outstanding: amount,
    monthlyPayment: Math.round(payment),
    monthsLeft: months,
    ratePct: term.ratePct,
    startedDay: save.meta.gameDay,
  });
  save.finance.cash += amount;
  ledger(save, "loan", amount, `Issued ${label ?? "bond"} (${months} mo @ ${term.ratePct}%)`);
  return true;
}

/** Emergency credit to cover a negative cash position. */
export function emergencyCredit(save: GameSave, events: GameEvent[]): void {
  if (save.finance.cash >= 0) return;
  const need = Math.ceil(-save.finance.cash + 60_000);
  const emergencyDebt = save.finance.bonds
    .filter((b) => b.name.startsWith("Emergency"))
    .reduce((s, b) => s + b.outstanding, 0);
  if (emergencyDebt > 5_000_000) {
    if (!save.meta.gameOver) {
      save.meta.gameOver = true;
      save.meta.gameOverReason = "Lenders have refused further credit. The company is bankrupt.";
      save.meta.paused = true;
      events.push({
        type: "bankruptcy",
        day: save.meta.gameDay,
        severity: "critical",
        message: "BANKRUPTCY — lenders have refused further credit.",
      });
    }
    return;
  }
  issueBond(save, Math.min(need, BONDS.maxAmount), 12, "Emergency Credit");
  events.push({
    type: "info",
    day: save.meta.gameDay,
    severity: "warning",
    message: `Emergency credit of $${Math.round(need).toLocaleString()} extended at 14% interest.`,
  });
}

/** Close out the month and start a new P&L row. */
export function rollMonth(save: GameSave): void {
  const m = save.finance.month;
  const subs = totalSubs(save);
  const revenue = m.revenue;
  const arpu = subs > 0 ? (revenue / subs) * 12 : 0; // monthly-ish ARPU
  save.finance.monthly.push({
    month: save.finance.monthly.length + 1,
    revenue: Math.round(m.revenue),
    opex: Math.round(m.opex),
    capex: Math.round(m.capex),
    interest: Math.round(m.interest),
    net: Math.round(m.revenue - m.opex - m.capex - m.interest),
    subs,
    arpu: Math.round(arpu),
    cashEnd: Math.round(save.finance.cash),
  });
  if (save.finance.monthly.length > 120) save.finance.monthly.shift();
  save.finance.month = { revenue: 0, opex: 0, capex: 0, interest: 0 };
}

export function totalSubs(save: GameSave): number {
  let n = 0;
  for (const dm of Object.values(save.districtsMarket)) {
    n += dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz;
  }
  return n;
}

export function revenueTax(save: GameSave, revenue: number): number {
  return revenue * TAXES.revenueTaxPct;
}
