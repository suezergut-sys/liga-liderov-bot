import { isDatabaseConfigured } from "@/lib/database";
import { MemoryGameStore } from "@/lib/store/memory";
import { PostgresGameStore } from "@/lib/store/postgres";

declare global {
  var leagueLeadersMemoryStore: MemoryGameStore | undefined;
  var leagueLeadersPostgresStore: PostgresGameStore | undefined;
}

function memoryStore() {
  if (!globalThis.leagueLeadersMemoryStore) {
    globalThis.leagueLeadersMemoryStore = new MemoryGameStore();
  }
  return globalThis.leagueLeadersMemoryStore;
}

function postgresStore() {
  if (!globalThis.leagueLeadersPostgresStore) {
    globalThis.leagueLeadersPostgresStore = new PostgresGameStore();
  }
  return globalThis.leagueLeadersPostgresStore;
}

if (!isDatabaseConfigured() && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL обязателен в production: MemoryGameStore предназначен только для локальной разработки");
}

export const gameStore = isDatabaseConfigured() ? postgresStore() : memoryStore();
