# Heartland Network — Simulation Rules

All monetary values are dollars, distances are km, capacities are Mbps unless
noted. Balance constants live in `packages/shared/src/constants.ts` — the
single source of truth shared by server and client.

## Time

- One game day = one server tick. At 1×, one tick per second; speeds are
  1×/2×/5×/15×, pausable. A month is 30 days.
- The random stream is seeded and persisted, so a save replays identically
  after restarts.

## Construction

- **Offices**: built in towns (one per town), tier 1–4. Cost, capacity and
  build time per tier. Higher tiers require research.
- **Cabinets**: built in districts; GPON tiers 32/64/128 ports.
- **Towers**: placed anywhere; radio tiers with sector count, capacity, range,
  and tower height. If no town/grid power is within 5 km, a diesel generator
  is included automatically.
- **Fiber**: routed along the road graph between the nearest towns of the two
  sites (spur + roads + spur). Cost = km × tier cost × (1 + terrain slope
  factor); build time = km × tier days/km (min 7 days).
- **Microwave**: towers only; must have Fresnel-cleared line of sight and be
  within the tier's range.
- **Improvements**: battery/generator/solar installs, renovations (restore
  condition), and one-tier upgrades on sites.
- Projects pay capex upfront; cancelling refunds 60%. Cash cannot be
  overspent — finance growth with bonds.

## Connectivity & traffic

- Online COs are network roots. Every other site needs a path of online links
  to a root (Dijkstra on live links). Cabinets ride their town's distribution
  fiber: online when the town has a reachable CO or a fiber-fed tower.
- Each district's traffic (subscribers × per-subscriber busy-hour demand,
  where per-sub demand = 0.4 Mbps + 1.2% of plan speed) routes to the nearest
  root along its serving anchor's path. Link and sector utilization is
  aggregated; a path at or above capacity congests the district and reduces
  delivered speed, which hurts satisfaction.

## Wireless coverage

- A district is covered by a tower when it is within range, inside a sector's
  azimuth, and a Fresnel-zone line-of-sight exists (terrain + earth
  curvature, sampled every 2 km). Tower tiers use 3.5/6/28 GHz.
- Sector capacity is shared among covered districts; oversubscribed sectors
  congest.

## Customers & market

- Each district has households and businesses. Take rate ≈ 62% (households),
  80% (businesses) at fair pricing.
- Market share per class is a value contest: `speed^0.4 / price^0.9` times
  satisfaction and marketing, versus the rivals' footprint score.
- Demand above current subscribers feeds an **install queue**; crews install
  up to 6 subscribers per crew per day, limited by free ports/sector Mbps.
- **Churn** monthly rate = 1.8% base + 3.5% per outage day (30-day window)
  + up to 6% at zero satisfaction. The Enterprise SLA research cuts business
  churn by 40%.
- **Satisfaction** tracks outages, congestion, and prices; delivered Mbps and
  outage counters update per district daily.

## Power & backup

- Load per site by kind/tier. Grid power is available in towns and to
  fiber-fed towers; remote towers run generators.
- On grid loss (storm overlay) sites run on battery (capacity in runtime
  hours), then generator (fuel tank = load × liters/kWh × fuel days), then
  power down. Grid sites recharge batteries when back on grid.
- Generators auto-order fuel at 20% tank; a delivery cost is charged.
  Emergency refueling is a player command.
- Solar (research) covers daylight load and recharges batteries; batteries
  carry the night.

## Failures & repair

- Equipment failures: per-element daily probability ≈ 1/MTBF scaled by
  condition (0.5× at 100, up to 6.5× at 0). Cable cuts and vandalism are
  additional daily risks.
- Ambient storms (rate by difficulty, ~every 42 days): a storm region damages
  each exposed site/link with severity-dependent probability and knocks out
  grid power inside the region while active.
- Incidents carry a repair workload (severity points: 4/9/16). Assigned
  crews contribute 4 points/day each (×1.3 with Remote Diagnostics).
  Emergency dispatch costs $25K and halves the remaining workload.
- Redundancy pays: a second route to a root (rings, dual homes) means a cut
  link doesn't take customers down.

## Finance

- Daily revenue: subscribers × plan price / 30 + business uplift. Plans can be
  re-priced from $0 (disabled) to $500.
- Daily opex: leases, maintenance, power/fuel, staff, marketing, campaigns.
  4.5% revenue tax.
- Bonds: 12/60/120-month terms at 6.5/8/9.5%; monthly payments include
  interest. Early repayment allowed. Negative cash triggers automatic
  emergency credit at 14%; above $5M of emergency debt the game ends in
  bankruptcy.
- Monthly P&L rows record revenue, opex, capex, interest, net, subs, ARPU,
  and closing cash.

## Research

15 technologies across fiber, wireless, power, and ops categories gate
equipment tiers and grant perks (repair speed, marketing, business churn,
solar). Research costs cash upfront and takes days.

## Competition

Rivals (OmniLink Cable, PrairieTel) hold per-town footprints with price and
speed. Every 14 days they adjust prices, marketing, and share; aggressive
rivals expand. The player competes on value score, marketing level, and
campaigns.

## Difficulty

- Easy: +$1.0M starting cash, 0.6× storm rate, calmer rivals, 3 install crews.
- Normal: $2.5M, 1× storms, 2 crews.
- Hard: $1.5M, 1.5× storms, more aggressive rivals, 1 crew.
