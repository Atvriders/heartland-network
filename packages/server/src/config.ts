/** Server configuration from environment variables. */
export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  tickMs: number;
  maxGames: number;
  adminToken: string | null;
  clientDirCandidates: string[];
  version: string;
}

function intFromEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) ? v : def;
}

export function loadConfig(): Config {
  const cwd = process.cwd();
  const candidates = [
    process.env.CLIENT_DIR,
    new URL("../../client/dist", import.meta.url).pathname,
    `${cwd}/packages/client/dist`,
    `${cwd}/client/dist`,
  ].filter((p): p is string => !!p);
  return {
    port: intFromEnv("PORT", 8080),
    host: process.env.HOST ?? "0.0.0.0",
    databaseUrl: process.env.DATABASE_URL ?? "postgres://heartland:heartland@127.0.0.1:5433/heartland",
    tickMs: intFromEnv("TICK_MS", 1000),
    maxGames: intFromEnv("MAX_GAMES", 12),
    adminToken: process.env.ADMIN_TOKEN || null,
    clientDirCandidates: candidates,
    version: process.env.npm_package_version ?? "1.0.0",
  };
}
