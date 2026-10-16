# Test Status

The release gate is: **typecheck + lint + format + build + unit + integration
+ E2E (desktop & mobile) all green**.

## Latest release run (v1.0.0)

| Gate | Command | Result |
| --- | --- | --- |
| Type checking | `npm run typecheck` | ✅ pass |
| Lint | `npm run lint` | ✅ pass |
| Format | `npm run format:check` | ✅ pass |
| Build | `npm run build` | ✅ pass |
| Unit tests | `npm run test:unit` | ✅ 18/18 |
| Integration tests | `npm run test:integration` | ✅ 8/8 |
| E2E desktop | `npx playwright test --project=desktop` | ✅ 6/6 |
| E2E mobile | `npx playwright test --project=mobile` | ✅ 1/1 |

### Unit tests (`packages/server/test/unit`)

- Map generation: determinism, layout invariants, road connectivity.
- Save migrations: v1→v2 upgrade, idempotency, rejection of bad versions,
  JSON round-trip.
- Engine: build-and-serve workflow, month roll, storm/repair cycle, ring
  redundancy, battery backup, command validation.

### Integration tests (`packages/server/test/integration`)

Run against a live server process and a real PostgreSQL database:
health, migration idempotency, game creation, build-and-serve over the API,
storm → dispatch → resolution, save across a server restart,
export/import round-trip, command error handling.

### E2E tests (`e2e/`)

Playwright against the production client bundle served by the production
server:

- New game shows the statewide map.
- Player builds an office and gains subscribers (UI-driven construction).
- Storm damages the network; crew dispatch restores service (UI-driven).
- Save, restart, reload: topology/finances preserved.
- Keyboard shortcuts control time.
- Map pans and zooms.
- Mobile viewport: map interaction, inspector, panel navigation.

## How to reproduce

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check && npm run build
npm run test:unit
npm run test:integration   # needs PostgreSQL (see packages/server/README)
npx playwright install chromium
npm run test:e2e
```

Integration and E2E tests use dedicated databases (`heartland_test`,
`heartland_e2e`) and reset them automatically.
