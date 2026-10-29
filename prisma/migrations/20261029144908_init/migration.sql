-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('RESOLVED', 'NARRATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NarrativeRole" AS ENUM ('GM', 'PLAYER', 'SYSTEM');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT 'Agente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "blueprint" JSONB NOT NULL,
    "fingerprint" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "build" JSONB NOT NULL,
    "sheet" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "status" "ActionStatus" NOT NULL,
    "narration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollLog" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actionId" TEXT,
    "label" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NarrativeEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "actionId" TEXT,
    "role" "NarrativeRole" NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NarrativeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMemory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSource" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "accessStatus" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL,
    "notes" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "RuleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleRecord" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "preconditions" JSONB NOT NULL,
    "procedure" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL,
    "dependencies" TEXT[],
    "sourceId" TEXT NOT NULL,
    "sourceLocator" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "implementationStatus" TEXT NOT NULL,
    "testRefs" TEXT[],
    "limitations" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_ownerId_status_idx" ON "Campaign"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Character_campaignId_key" ON "Character"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionLog_campaignId_idempotencyKey_key" ON "ActionLog"("campaignId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActionLog_campaignId_sequence_key" ON "ActionLog"("campaignId", "sequence");

-- CreateIndex
CREATE INDEX "RollLog_campaignId_createdAt_idx" ON "RollLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "NarrativeEntry_campaignId_createdAt_idx" ON "NarrativeEntry"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignMemory_campaignId_kind_idx" ON "CampaignMemory"("campaignId", "kind");

-- CreateIndex
CREATE INDEX "RuleRecord_systemId_editionId_category_idx" ON "RuleRecord"("systemId", "editionId", "category");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollLog" ADD CONSTRAINT "RollLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollLog" ADD CONSTRAINT "RollLog_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NarrativeEntry" ADD CONSTRAINT "NarrativeEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMemory" ADD CONSTRAINT "CampaignMemory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleRecord" ADD CONSTRAINT "RuleRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "RuleSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
