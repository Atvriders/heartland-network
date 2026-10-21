# Deployment

Heartland Network ships as a single application image published to GitHub
Container Registry, deployed with Docker Compose beside PostgreSQL 17.

## Requirements

- A Docker host (Linux, macOS, or Windows) with Docker Engine + Compose v2.
- 1 GB RAM free, ~500 MB disk for the image plus database growth.
- No cloud account, no external services, no public map tiles — the game runs
  entirely on your LAN.

## Standard installation

No `.env` file is required — the compose file ships safe defaults (see
“What the compose file provides” below).

```bash
mkdir heartland-network && cd heartland-network

# Download the compose file (no need to clone the source repository):
curl -LO https://raw.githubusercontent.com/Atvriders/heartland-network/main/compose.yml
```

Then start:

```bash
docker compose pull
docker compose up -d
docker compose ps        # both services should be healthy
```

Open `http://<docker-host-ip>:8080` in a browser on your network and click
"Found the network" to start playing.

## What the compose file provides

| Concern | Detail |
| --- | --- |
| Image | `ghcr.io/atvriders/heartland-network:1.0.2` (immutable, pinned default) |
| Database | `postgres:17-alpine`, persistent named volume `heartland_db` |
| Network | private bridge network; PostgreSQL is never exposed to the host |
| Restart | `unless-stopped` on both services |
| Health | `pg_isready` for the DB; `/api/health` for the app |
| Saves | Survive image upgrades via the named volume + database |
| Ports | Host `${HEARTLAND_PORT:-8080}` → container 8080 |

## Configuration (environment variables)

Every setting has a default and is entirely optional. To override one,
export it in your shell before `docker compose up -d` (a `.env` file also
works, but is never required):

```bash
export POSTGRES_PASSWORD='a-long-random-value'   # example override
docker compose up -d
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `heartland` | Database user |
| `POSTGRES_PASSWORD` | `heartland` | Database password — only used on first database initialization; safe by default because PostgreSQL is never published to the host |
| `POSTGRES_DB` | `heartland` | Database name |
| `HEARTLAND_PORT` | `8080` | Host port for the game UI/API |
| `HEARTLAND_IMAGE` | `ghcr.io/atvriders/heartland-network:1.0.2` | Image override |
| `TICK_MS` | `1000` | Milliseconds per game day at 1× speed |
| `MAX_GAMES` | `12` | Maximum number of saves |
| `ADMIN_TOKEN` | *(empty)* | Optional shared secret for admin-only endpoints |

### Switching to the latest tag

The default pins the immutable `1.0.2` tag so upgrades are deliberate. To
track releases automatically instead:

```bash
export HEARTLAND_IMAGE=ghcr.io/atvriders/heartland-network:latest
docker compose pull && docker compose up -d
```

Be aware `latest` moves with every release — see UPGRADE.md for the
recommended procedure.

## Local-network access

The app listens on `0.0.0.0:8080` inside the container and is published on
`HEARTLAND_PORT`. Open that port in your host firewall and reach it at
`http://<host-ip>:<port>` from any device on your LAN (phones work — the UI
is touch-optimized).

## TLS / reverse proxy (optional)

The app serves plain HTTP. To use HTTPS on the internet, put a reverse proxy
in front:

```yaml
# Example with Caddy:
caddy:
  image: caddy:2-alpine
  ports: ["80:80", "443:443"]
  volumes: [caddy_data:/data]
  environment:
    SERVER_NAME: net.example.com
    SERVER_PROXY: app:8080
```

Any reverse proxy works; the game itself needs no changes.

## Secrets hygiene

- The database runs on a private Docker network only; no PostgreSQL port is
  ever published to the host, so the default credentials are safe for
  LAN-only use.
- To use your own password, `export POSTGRES_PASSWORD='...'` before the
  **first** `docker compose up -d` (the password is applied when the database
  volume is initialized; changing it later requires `ALTER ROLE` inside the
  container).
- If you expose the app beyond your LAN, set `ADMIN_TOKEN` and use the
  `X-Admin-Token` header for import/delete endpoints.

## Health verification

```bash
curl http://localhost:8080/api/health
# {"ok":true,"service":"heartland-network","version":"1.0.2","db":"connected",...}
docker compose ps   # both services report (healthy)
```

## Development deployment (build from source)

```bash
git clone https://github.com/Atvriders/heartland-network.git
cd heartland-network
docker compose -f compose.dev.yml up --build
```
