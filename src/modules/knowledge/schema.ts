import { z } from "zod";

/**
 * Knowledge model. Four separate facts are tracked for each rule:
 *  - ingestion: is there source text available to the project? (SourceChunk)
 *  - verification: has a human confirmed the description against an authorized source?
 *  - implementation: is the mechanic encoded in the rules engine?
 *  - tests: do automated tests exercise it, and did they pass on the last run?
 * None of these implies another.
 */
export const VERIFICATION_STATUSES = ["unverified", "owner_verified", "source_verified", "uncertain", "conflict"] as const;
export const IMPLEMENTATION_STATUSES = ["not_implemented", "partial", "implemented", "narrative_only"] as const;

export const VERIFICATION_LABELS: Record<(typeof VERIFICATION_STATUSES)[number], string> = {
  unverified: "Não verificada",
  owner_verified: "Verificada pelo proprietário",
  source_verified: "Verificada na fonte",
  uncertain: "Incerta",
  conflict: "Conflito",
};
export const IMPLEMENTATION_LABELS: Record<(typeof IMPLEMENTATION_STATUSES)[number], string> = {
  not_implemented: "Não implementada",
  partial: "Parcial",
  implemented: "Implementada",
  narrative_only: "Somente narrativa",
};

export const RuleSourceSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  editionId: z.string(),
  title: z.string(),
  publisher: z.string(),
  version: z.string(),
  kind: z.enum(["rulebook", "license", "product_page", "errata", "original"]),
  accessStatus: z.enum(["accessible", "requires_owner_document", "unavailable"]),
  authorized: z.boolean(),
  url: z.string().optional(),
  notes: z.string(),
  verifiedAt: z.string().optional(),
});
export type RuleSource = z.infer<typeof RuleSourceSchema>;

export const RuleRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "id estável no formato edicao.categoria.nome"),
  systemId: z.string(),
  editionId: z.string(),
  category: z.enum(["test", "character", "class", "origin", "skills", "derived", "progression", "equipment", "combat", "conditions", "sanity", "resources", "ability", "investigation", "threat", "rest"]),
  title: z.string(),
  /** Short original paraphrase — never reproduced rulebook text. */
  summary: z.string(),
  preconditions: z.array(z.string()).default([]),
  procedure: z.array(z.string()).default([]),
  exceptions: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  sourceId: z.string(),
  /** Chapter/section/page locator inside the source; "a confirmar" when unknown. */
  sourceLocator: z.string(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  implementationStatus: z.enum(IMPLEMENTATION_STATUSES),
  /** Source files implementing the rule. */
  implementedIn: z.array(z.string()).default([]),
  /** Test names (vitest full names, substring match) covering the rule. */
  testRefs: z.array(z.string()).default([]),
  limitations: z.string().default(""),
  /** Notes about conflicting interpretations and how they are resolved. */
  conflictNotes: z.string().optional(),
});
export type RuleRecord = z.infer<typeof RuleRecordSchema>;
export type RuleRecordInput = z.input<typeof RuleRecordSchema>;
