import type { PrismaClient } from "@/generated/prisma/client";
import type { SourceChunk } from "./ingest";
import type { RuleRecord, RuleSource } from "./schema";

/** Upserts the code-defined catalog into PostgreSQL so it can be queried and full-text searched. */
export async function syncCatalog(db: PrismaClient, sources: RuleSource[], rules: RuleRecord[]) {
  await db.$transaction(async (tx) => {
    for (const s of sources) {
      const data = {
        systemId: s.systemId,
        editionId: s.editionId,
        title: s.title,
        publisher: s.publisher,
        version: s.version,
        kind: s.kind,
        accessStatus: s.accessStatus,
        authorized: s.authorized,
        notes: s.notes,
        url: s.url ?? null,
        verifiedAt: s.verifiedAt ? new Date(s.verifiedAt) : null,
      };
      await tx.ruleSource.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
    }
    for (const r of rules) {
      const data = {
        systemId: r.systemId,
        editionId: r.editionId,
        category: r.category,
        title: r.title,
        summary: r.summary,
        preconditions: r.preconditions,
        procedure: r.procedure,
        exceptions: r.exceptions,
        dependencies: r.dependencies,
        sourceId: r.sourceId,
        sourceLocator: r.sourceLocator,
        verificationStatus: r.verificationStatus,
        implementationStatus: r.implementationStatus,
        implementedIn: r.implementedIn,
        testRefs: r.testRefs,
        limitations: r.limitations,
        conflictNotes: r.conflictNotes ?? null,
      };
      await tx.ruleRecord.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
    }
  });
}

/** Replaces all chunks for a source atomically. */
export async function storeChunks(db: PrismaClient, sourceId: string, chunks: SourceChunk[]) {
  await db.$transaction([
    db.sourceChunk.deleteMany({ where: { sourceId } }),
    db.sourceChunk.createMany({
      data: chunks.map((c) => ({ sourceId, ordinal: c.ordinal, headingPath: c.headingPath, page: c.page, content: c.content, flags: c.flags })),
    }),
  ]);
}

export interface ChunkHit {
  id: string;
  sourceId: string;
  headingPath: string[];
  page: number | null;
  snippet: string;
  rank: number;
}

/** PostgreSQL full-text search over ingested chunks, filtered by edition through their source. */
export async function searchChunks(db: PrismaClient, query: string, editionId: string, limit = 5): Promise<ChunkHit[]> {
  return db.$queryRaw<ChunkHit[]>`
    SELECT c.id, c."sourceId", c."headingPath", c.page,
      ts_headline('portuguese', c.content, websearch_to_tsquery('portuguese', rpg_unaccent(${query})), 'MaxWords=40, MinWords=15') AS snippet,
      ts_rank(rpg_chunk_document(c."headingPath", c.content), websearch_to_tsquery('portuguese', rpg_unaccent(${query}))) AS rank
    FROM "SourceChunk" c JOIN "RuleSource" s ON s.id = c."sourceId"
    WHERE s."editionId" = ${editionId}
      AND rpg_chunk_document(c."headingPath", c.content) @@ websearch_to_tsquery('portuguese', rpg_unaccent(${query}))
    ORDER BY rank DESC LIMIT ${limit}`;
}

/** PostgreSQL full-text search over structured rule records. */
export async function searchRuleRecords(db: PrismaClient, query: string, editionId: string, limit = 5) {
  return db.$queryRaw<{ id: string; title: string; rank: number }[]>`
    SELECT r.id, r.title, ts_rank(rpg_rule_document(r.title, r.summary), websearch_to_tsquery('portuguese', rpg_unaccent(${query}))) AS rank
    FROM "RuleRecord" r
    WHERE r."editionId" = ${editionId}
      AND rpg_rule_document(r.title, r.summary) @@ websearch_to_tsquery('portuguese', rpg_unaccent(${query}))
    ORDER BY rank DESC LIMIT ${limit}`;
}
