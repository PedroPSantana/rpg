-- AlterTable
ALTER TABLE "RuleRecord" ADD COLUMN     "conflictNotes" TEXT,
ADD COLUMN     "implementedIn" TEXT[];

-- AlterTable
ALTER TABLE "RuleSource" ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "headingPath" TEXT[],
    "page" INTEGER,
    "content" TEXT NOT NULL,
    "flags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_sourceId_ordinal_key" ON "SourceChunk"("sourceId", "ordinal");

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RuleSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search support (Portuguese, accent-insensitive).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION rpg_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
CREATE OR REPLACE FUNCTION rpg_chunk_document(text[], text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT to_tsvector('portuguese'::regconfig, rpg_unaccent(coalesce(array_to_string($1, ' '), '') || ' ' || coalesce($2, ''))) $$;
CREATE INDEX "SourceChunk_fts_idx" ON "SourceChunk" USING GIN (rpg_chunk_document("headingPath", "content"));
CREATE OR REPLACE FUNCTION rpg_rule_document(text, text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT to_tsvector('portuguese'::regconfig, rpg_unaccent(coalesce($1, '') || ' ' || coalesce($2, ''))) $$;
CREATE INDEX "RuleRecord_fts_idx" ON "RuleRecord" USING GIN (rpg_rule_document("title", "summary"));
