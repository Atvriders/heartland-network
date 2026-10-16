# Implementation Status

> Authoritative progress record. Updated at each release.

## Completed systems

| System | Where | Tests |
| --- | --- | --- |
| Procedural map (terrain/towns/roads/districts/landmarks) | `packages/server/src/sim/mapgen.ts` | unit |
| Day-tick simulation engine | `sim/engine.ts` | unit + integration |
| Network construction (sites, links, projects, upgrades) | `sim/commands.ts` | unit + integration + E2E |
| Connectivity & traffic routing | `sim/connectivity.ts` | unit (ring redundancy) |
| Wireless LOS & coverage | `sim/wireless.ts` | exercised via E2E builds |
| Power & backup (grid/battery/generator/solar/fuel) | `sim/power.ts` | unit |
| Failures & incidents (storms, cuts, equipment) | `sim/failures.ts` | unit + integration + E2E |
| Repair crews & emergency dispatch | `sim/failures.ts`, `commands.ts` | unit + E2E |
| Customers & market (demand, plans, churn, satisfaction) | `sim/customers.ts` | unit + integration |
| Finance (P&L, bonds, ledger, emergency credit) | `sim/finance.ts` | unit + integration |
| Research tree & perks | `sim/research.ts`, shared constants | exercised via commands |
| Rivals & competition | `sim/competition.ts` | exercised via long-run E2E |
| Save system + versioned migrations | `save/migrations.ts` | unit |
| SQL migrations + persistence | `db/*` | integration |
| REST API + WebSocket | `api/*` | integration + E2E |
| Web client (map, HUD, panels, dialogs) | `packages/client` | E2E desktop + mobile |
| Docker image + compose | `Dockerfile`, `compose*.yml` | release workflow |
| CI / release workflows | `.github/workflows` | GitHub Actions |

## Partially completed systems

None.

## Unimplemented systems

None required by the v1.0.0 specification.

## Known defects

- None known to affect the v1.0.0 release at the time of writing.
- Historical: cabinet `townId` assignment bug, cabinet offline-on-restore bug,
  project progress not updating, and an early-game traffic model that
  congested tier-1 trunks were fixed before release (see commit history).

## Failed tests

- None in the release run. See TEST_STATUS.md for the latest results.

## Database migration status

- SQL schema version: **2** (`001 init`, `002 games_playtime`).
- Save-format version: **2** (migration chain from v1 verified by unit tests).
- Status: current. No pending migrations.

## Current playable workflow

1. Create a network on the picker screen (name, difficulty, optional seed).
2. Build a central office in a town, cabinets in its districts.
3. Unpause and watch subscribers connect; add towers for wireless towns.
4. Connect towns with fiber along roads; microwave-chain remote towers.
5. Manage power/backup, dispatch repair crews during storms.
6. Price plans, run campaigns, research, borrow bonds, expand statewide.

## Exact next implementation task

None — v1.0.0 is complete and released. (Post-release ideas in ROADMAP.md.)
