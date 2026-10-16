# Roadmap

## Completed (v1.0.0)

1. **Architecture** — monorepo (shared/server/client), server-authoritative
   simulation, REST + WebSocket API, PostgreSQL persistence.
2. **Repository setup** — npm workspaces, TypeScript strict, ESLint, Prettier,
   Vitest, Playwright, Docker, GitHub Actions.
3. **Core simulation** — day-tick engine with seeded RNG, projects, statuses.
4. **Statewide map** — procedural terrain, 30 towns, roads, districts,
   landmarks, fully offline.
5. **Network construction** — offices, cabinets, towers, fiber along roads,
   microwave with LOS, cost previews, upgrades, renovations.
6. **Customer & financial systems** — demand, plans/pricing, installs, churn,
   satisfaction, revenue/opex, bonds, monthly P&L, bankruptcy.
7. **City & property gameplay** — per-town offices, per-district cabinets,
   leases, land vs. lease cost models.
8. **Wireless & line-of-sight** — Fresnel-zone LOS with earth curvature,
   sector coverage, microwave backhaul rules.
9. **Power & backup** — grid/battery/generator/solar, fuel logistics,
   battery runtime, auto-refuel, grid outage overlays.
10. **Failures, repairs, redundancy** — equipment failures, cable cuts,
    vandalism, ambient storms, storm drills, repair crews, emergency dispatch,
    ring/dual-homed redundancy.
11. **Research & equipment** — 15-tech tree gating tiers and perks.
12. **Competition & advanced business** — two rivals, pricing walks,
    footprint growth, marketing level, campaigns, staff hiring.
13. **Save migration & administration** — versioned saves with a migration
    chain, autosave, export/import, game list, settings, storm drills.
14. **Interface polish** — NOC-style design system, animated map, tooltips,
    context menus, dialogs, toasts, keyboard + touch controls.
15. **Automated testing** — unit, integration (live server + PostgreSQL),
    Playwright E2E desktop & mobile.
16. **Docker deployment** — single production image, compose files, health
    checks, environment-driven configuration.
17. **Documentation** — README, DEPLOYMENT, BACKUP_AND_RESTORE, UPGRADE,
    ARCHITECTURE, DATA_MODEL, SIMULATION_RULES, THIRD_PARTY_NOTICES.
18. **Production verification** — release checklist (see
    RELEASE_CHECKLIST.md).
19. **GitHub publication** — repository, v1.0.0 tag and release.
20. **GitHub Container Registry** — multi-arch production image published by
    the release workflow.

## Future ideas (not in v1.0.0)

- More state shapes / custom seeds UI
- B2B contract RFPs as explicit quarterly events
- Seasonal weather models (tornado season, ice storms)
- Multiplayer / co-op territories
- Blender-rendered site sprites and loading-screen artwork
- Sound design (needs licensed/created audio)
