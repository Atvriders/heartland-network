# Heartland Network — Data Model

The complete data model is defined in `packages/shared/src/types.ts`. This
document explains the entities and their relationships.

## Entity overview

```mermaid
erDiagram
    MAP ||--o{ TOWN : contains
    TOWN ||--o{ DISTRICT : contains
    TOWN ||--o{ ROAD : connects
    MAP ||--o{ LANDMARK : contains
    SITE }o--o| TOWN : located-in
    SITE }o--o| DISTRICT : serves
    LINK }o--|| SITE : from
    LINK }o--|| SITE : to
    DISTRICT ||--o| DISTRICT_MARKET : has
    INCIDENT }o--o{ SITE : damages
    INCIDENT }o--o{ LINK : damages
    GAME ||--o{ SITE : owns
    GAME ||--o{ LINK : owns
    GAME ||--o{ PROJECT : runs
    GAME ||--o{ BOND : owes
    GAME ||--o{ PLAN : sells
```

## The save (`GameSave`, versioned)

| Field | Meaning |
| --- | --- |
| `version` | Save-format version; upgraded on load by the migration chain. |
| `meta` | Name, seed, difficulty, game day, pause/speed, game-over flag. |
| `map` | Static world: elevation grid, towns, roads, districts, landmarks. |
| `sites` | All player infrastructure (CO, tower, cabinet) with status, tier, condition, power, capacity. |
| `links` | Fiber trunks and microwave backhaul with path, tier, capacity, utilization, condition. |
| `projects` | Construction in progress (cost, days, progress, target element). |
| `districtsMarket` | Per-district demand/market state: subscribers by tech and class, install queue, satisfaction, rival share, outages, delivered speed. |
| `plans` | Sellable service plans (consumer/business, price, speed, enabled). |
| `finance` | Cash, bonds, monthly P&L history, ledger, current-month accumulators. |
| `research` | Tech status per tech id. |
| `staff` | Install crews, repair crews, sales agents. |
| `incidents` | Active/resolved incidents with affected elements and repair workload. |
| `rivals` | Competitor footprints per town, marketing, aggression. |
| `campaigns`, `marketingLevel` | Marketing state. |
| `settings` | Autosave interval and failure toggles. |
| `rngState` | Seeded random stream position (continuity across restarts). |
| `counters` | Id counters for save-internal objects. |

## Map (`MapData`)

- `elevation` is a row-major height grid (10 km cells); terrain factors into
  fiber cost (slope) and wireless line-of-sight.
- `towns` carry population, kind (`capital|city|town|village`), and grid-power
  availability. `roads` are polylines between towns with a road class.
- `districts` are neighborhoods inside towns with household/business counts —
  the granular unit for service demand.

## Sites

| Kind | Capacity | Serves |
| --- | --- | --- |
| `co` (central office) | subscriber lines by tier (1–4) | Internet root; routing target |
| `cabinet` | GPON ports (32/64/128) | Its district (fiber), when the town is connected |
| `tower` | sector Mbps by radio tier | Districts with terrain line-of-sight |

Every site has a `power` block: source (grid/generator/solar), battery
runtime-hours, generator tier and fuel, and the current power mode
(`grid|battery|generator|down`).

## Links

- `fiber` — follows roads between sites; capacity by strand tier (12–96), DWDM
  quadruples capacity after research.
- `microwave` — point-to-point between towers; requires line-of-sight; limited
  by tier range.

## Market (`DistrictMarket`)

Per district, subscribers are tracked as counts split by technology
(`fiber|wireless`) and class (`hh|biz`). The simulation aggregates demand from
households/businesses and moves subscribers through an install queue subject
to crew capacity and free network capacity.

## Database schema (SQL migrations)

```sql
schema_migrations (version int PK, name text, applied_at timestamptz)
games (
  id text PK,
  slot int,
  name text,
  save_version int,
  data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_saved_day int,
  playtime_s int
)
```

The `data` column holds the full `GameSave`. SQL schema versioning and save
versioning are independent: SQL migrations manage tables, save migrations
manage the JSON format.
