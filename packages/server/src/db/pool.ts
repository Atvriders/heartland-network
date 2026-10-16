import pg from "pg";
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from "./migrations.js";

export type Pool = pg.Pool;

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 8,
    idleTimeoutMillis: 30_000,
  });
}

/** Apply all pending migrations. Returns the resulting schema version. */
export async function migrate(pool: Pool): Promise<number> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const res = await pool.query<{ version: number }>(
    "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
  );
  let current = res.rows[0]?.version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        m.version,
        m.name,
      ]);
      await client.query("COMMIT");
      current = m.version;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return current;
}

export async function schemaVersion(pool: Pool): Promise<number> {
  try {
    const res = await pool.query<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    );
    return res.rows[0]?.version ?? 0;
  } catch {
    return -1;
  }
}

export async function ping(pool: Pool): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export { CURRENT_SCHEMA_VERSION };
