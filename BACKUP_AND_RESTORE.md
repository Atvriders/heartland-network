# Backup & Restore

All game saves live in PostgreSQL (`games` table) inside the named volume
`heartland_db`. The application image itself is stateless and can be recreated
freely.

## Backup

The recommended method is `pg_dump` from the database container:

```bash
# One-off backup
docker compose exec -T db pg_dump -U heartland heartland > heartland-backup-$(date +%F).sql

# Restore
docker compose exec -T db psql -U heartland -d heartland < heartland-backup-2026-01-01.sql
```

### Automatic nightly backups

Example cron entry on the Docker host:

```cron
30 2 * * * cd /opt/heartland-network && docker compose exec -T db pg_dump -U heartland heartland | gzip > backups/heartland-$(date +\%F).sql.gz
```

Keep the last 30 backups with a tool of your choice (e.g., `find backups -mtime +30 -delete`).

## Per-game export (in-game)

Every save can also be exported from the **Admin** panel inside the game as a
versioned JSON file, and re-imported later. Exported saves are upgraded by the
built-in migration chain when loaded by a newer game version.

## Restore procedure

1. Stop the app service: `docker compose stop app`
2. Restore the dump into the database container (see above).
3. Start the app again: `docker compose start app`
4. Verify: open the game and check the saved games list.

## What a backup contains

- All saved games (names, game state: map seed, sites, links, finances,
  research, incidents, settings).
- The game's schema-migration ledger.

## Disaster recovery

If the volume is lost, re-create the stack from `compose.yml`, then restore
the latest dump. Saves are the only stateful data.
