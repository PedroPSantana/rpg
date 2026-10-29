// Ingests a text/markdown/JSON source that the owner is authorized to use
// (e.g. personal notes transcribed from their own book) into the full-text index.
//   pnpm tsx scripts/ingest.ts <sourceId> <file>
// The resulting chunks stay in the local database and are never committed.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { SOURCES } from "../src/modules/knowledge";
import { chunkJson, chunkText } from "../src/modules/knowledge/ingest";
import { storeChunks } from "../src/modules/knowledge/repository";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const [sourceId, file] = process.argv.slice(2);
if (!sourceId || !file || !SOURCES.some((s) => s.id === sourceId)) {
  console.error(`Uso: pnpm tsx scripts/ingest.ts <${SOURCES.map((s) => s.id).join("|")}> <arquivo>`);
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const raw = await readFile(file, "utf8");
const chunks = file.endsWith(".json") ? chunkJson(sourceId, JSON.parse(raw)) : chunkText(sourceId, raw);
await storeChunks(db, sourceId, chunks);
console.log(`${chunks.length} trechos indexados para ${sourceId}.`);
await db.$disconnect();
