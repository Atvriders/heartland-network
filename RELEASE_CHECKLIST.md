# Release Checklist

## Before tagging

- [x] 1. Start from a clean checkout (`git clone` into a fresh directory).
- [x] 2. Build the complete project (`npm ci && npm run build`).
- [x] 3. Formatting (`npm run format:check`).
- [x] 4. Static analysis (`npm run lint`).
- [x] 5. TypeScript type checking (`npm run typecheck`).
- [x] 6. Unit tests (`npm run test:unit`).
- [x] 7. Integration tests (`npm run test:integration`).
- [x] 8. Database migration tests (covered by integration: fresh schema +
  idempotent re-run).
- [x] 9. API tests (covered by integration).
- [x] 10. Simulation tests (unit: engine, power, failures, finance).
- [x] 11. Save/load compatibility tests (unit: v1→v2 migration chain;
  integration: save across server restart; E2E: reload after restart).
- [x] 12. Production container build (release workflow; multi-arch amd64/arm64).
- [x] 13. Start the game with the final Docker Compose configuration.
- [x] 14. Health checks verified (`/api/health`, `pg_isready`).
- [x] 15. Create a new game.
- [x] 16. Complete the main playable network-expansion workflow
  (build office + cabinets, gain subscribers) — E2E.
- [x] 17. Cause a real network failure (storm drill) — E2E.
- [x] 18. Verify affected customers lose service — E2E.
- [x] 19. Restore service via repair crews — E2E.
- [x] 20. Save the game.
- [x] 21. Restart the deployment.
- [x] 22. Reload the save and verify topology, finances, customers, research,
  projects, incidents, equipment, and time are preserved — integration + E2E.
- [x] 23. Interface tested at desktop and mobile viewports — E2E projects.
- [x] 24. No cloud account required for local play (no auth, no external calls).
- [x] 25. Normal gameplay does not depend on public map-tile services
  (procedural map; no external requests).
- [x] 26. No placeholder credentials or development-only bypasses
  (production uses `.env`; storm drills are an intentional training feature).
- [x] 27. No critical TODO, mock implementation, empty handler, or fake
  response remains (verified by review; lint enforces no unused code).

## Before pushing

- [x] Temporary files, build artifacts, secrets, caches removed.
- [x] `.gitignore` and `.dockerignore` verified.
- [x] No password, token, private key, database dump, or private configuration
  present (reviewed every tracked file).
- [x] Clean final release commit.
- [x] Repository pushed once with the completed work.
- [x] Tag `v1.0.0` created.
- [x] GitHub release for `v1.0.0` with installation, upgrade, backup, restore,
  and troubleshooting instructions.
- [x] Container image `ghcr.io/atvriders/heartland-network:1.0.0` and `:latest`
  published by the release workflow.
- [x] Compose deployment verified with the published image.
