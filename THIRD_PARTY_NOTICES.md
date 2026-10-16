# Third-Party Notices

Heartland Network is original work. The game's code, UI, icons, map art, and
balance are created for this project. No third-party media assets (images,
fonts, models, sounds) are used, so no media attribution is required.

## Open-source components

The project depends on the following open-source packages. Their licenses
permit this use; each dependency's full license text ships in its package.

| Component | License | Use |
| --- | --- | --- |
| Node.js | MIT-style | Runtime |
| React / React DOM | MIT | Web client |
| Express | MIT | HTTP server |
| ws | MIT | WebSocket server |
| pg (node-postgres) | MIT | PostgreSQL client |
| Vite | MIT | Client build tool |
| TypeScript | Apache-2.0 | Language |
| Vitest | MIT | Test runner |
| Playwright | Apache-2.0 | Browser testing |
| ESLint / @typescript-eslint | MIT | Static analysis |
| Prettier | MIT | Formatting |
| tsx | MIT | Development runner |
| PostgreSQL | PostgreSQL License | Database |
| postgres Docker image (Docker Official Image) | PostgreSQL License | Container base |

## Runtime image base

The production image is built on `node:22-bookworm-slim` (Debian 12) and the
compose file uses `postgres:17-alpine` (Alpine Linux). These official images
redistribute their respective operating systems under their own licenses.

## Browser fonts

The UI uses the operating system's built-in font stack; no fonts are bundled
or redistributed.

## Verification note

`npm ls` at release time confirms the dependency tree above. No package with a
copyleft or otherwise incompatible license is linked into the production
image (production dependencies are limited to Express, ws, pg, and their
transitive dependencies).
