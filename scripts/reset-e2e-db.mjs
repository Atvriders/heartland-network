/** Reset the E2E test database before a test run. */
import pg from "pg";

const PG_PORT = process.env.PG_PORT ?? "5433";
const PG_PASS = process.env.PG_PASSWORD ?? "heartland";

const admin = new pg.Client({
  connectionString: `postgres://heartland:${PG_PASS}@127.0.0.1:${PG_PORT}/postgres`,
});
await admin.connect();
const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", ["heartland_e2e"]);
if (exists.rowCount === 0) {
  await admin.query("CREATE DATABASE heartland_e2e");
  console.log("created heartland_e2e");
}
await admin.end();

const db = new pg.Client({
  connectionString: `postgres://heartland:${PG_PASS}@127.0.0.1:${PG_PORT}/heartland_e2e`,
});
await db.connect();
await db.query("DROP SCHEMA public CASCADE");
await db.query("CREATE SCHEMA public");
await db.end();
console.log("e2e database reset");
