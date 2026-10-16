import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DBURL ?? "postgres://heartland@127.0.0.1:5433/postgres" });
await c.connect();
for (const db of ["heartland", "heartland_test"]) {
  const r = await c.query("SELECT 1 FROM pg_database WHERE datname=$1", [db]);
  if (r.rowCount === 0) {
    await c.query(`CREATE DATABASE ${db}`);
    console.log("created", db);
  } else {
    console.log("exists", db);
  }
}
await c.end();
