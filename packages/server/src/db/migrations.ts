/** PostgreSQL migrations. Applied in order; tracked in schema_migrations. */

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "init",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS games (
        id text PRIMARY KEY,
        slot integer,
        name text NOT NULL,
        save_version integer NOT NULL,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        last_saved_day integer NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_games_slot ON games(slot);
    `,
  },
  {
    version: 2,
    name: "games_playtime",
    sql: `
      ALTER TABLE games ADD COLUMN IF NOT EXISTS playtime_s integer NOT NULL DEFAULT 0;
    `,
  },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
