// Syncs the rule catalog into the database and ingests the project's own
// original-procedure documents. Copyrighted rulebook text is never ingested
// here: the owner can ingest their own authorized copy with scripts/ingest.ts.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { ALL_RULES, SOURCES } from "../src/modules/knowledge";
import { chunkText } from "../src/modules/knowledge/ingest";
import { storeChunks, syncCatalog } from "../src/modules/knowledge/repository";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  await syncCatalog(db, SOURCES, ALL_RULES);
  const doc = await readFile(new URL("../docs/rules/original-procedures.md", import.meta.url), "utf8").catch(() => null);
  if (doc) await storeChunks(db, "rpg-original", chunkText("rpg-original", doc));
  console.log(`Catálogo sincronizado: ${SOURCES.length} fontes, ${ALL_RULES.length} regras${doc ? ", procedimentos originais indexados" : ""}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
