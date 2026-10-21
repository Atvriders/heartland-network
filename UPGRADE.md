# Upgrade

The production image is versioned; the database volume and saves survive all
upgrades.

## Standard upgrade

```bash
cd <deployment-directory>
docker compose pull          # fetch the new pinned image
docker compose up -d         # recreate the app container
docker compose ps            # confirm healthy
```

Saves are preserved automatically: they live in the PostgreSQL volume, and
the game upgrades older save formats in place on load.

## Pinned vs latest

The default `compose.yml` pins an immutable tag (`...:1.0.2`). Upgrade by
overriding `HEARTLAND_IMAGE` in your shell (or a `.env` file, if you use one)
to the new version tag and re-pulling:

```bash
export HEARTLAND_IMAGE=ghcr.io/atvriders/heartland-network:1.1.0
docker compose pull && docker compose up -d
```

If you set `HEARTLAND_IMAGE=...:latest`, a plain `pull && up -d` tracks every
release. Pinning is recommended for production; see the release notes before
upgrading.

## Before upgrading

1. Take a backup (see BACKUP_AND_RESTORE.md).
2. Check the release notes for migration notes. Save-format migrations are
   automatic and forward-only; a backup lets you roll back by restoring the
   dump and the previous image tag.

## Rollback

```bash
export HEARTLAND_IMAGE=ghcr.io/atvriders/heartland-network:1.0.0
docker compose pull && docker compose up -d
# Restore the pre-upgrade backup if the save format moved forward:
docker compose exec -T db psql -U heartland -d heartland < backup.sql
```

## Development / source installs

```bash
git pull
npm ci
npm run build
# restart your dev server
```

## Version compatibility

- Database schema migrations run automatically at startup and are additive.
- Save migrations upgrade `GameSave.version` step by step; old versions load
  on new servers, but new saves cannot load on old servers.
