import postgres, { type Sql } from "postgres";

declare global {
  var leagueLeadersSql: Sql | undefined;
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): Sql {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL не настроен");

  if (!globalThis.leagueLeadersSql) {
    globalThis.leagueLeadersSql = postgres(connectionString, {
      max: 1,
      prepare: false,
      ssl: "require",
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }

  return globalThis.leagueLeadersSql;
}

export async function checkDatabaseConnection() {
  const sql = getDatabase();
  await sql`select 1 as ok`;
}
