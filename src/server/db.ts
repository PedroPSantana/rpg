import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

export function createDb(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForDb = globalThis as unknown as { __rpgDb?: PrismaClient };

/** Process-wide Prisma client (reused across hot reloads in development). */
export function getDb(): PrismaClient {
  if (!globalForDb.__rpgDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada. Veja .env.example.");
    globalForDb.__rpgDb = createDb(url);
  }
  return globalForDb.__rpgDb;
}
