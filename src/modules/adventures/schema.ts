import { z } from "zod";
import { AttackSchema } from "@/modules/rules/systems/ordem-paranormal/combat";
import { MapDefinitionSchema } from "@/modules/world/schema";

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { flag: string }
  | { clue: string }
  | { cluesFound: { min: number; of: string[] } }
  | { decision: { id: string; option?: string } }
  | { encounter: { id: string; outcome?: "victory" | "fled" | "defeat" } }
  | { urgencyAtLeast: number }
  | { visited: string }
  | { npcTalked: string };

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
    z.object({ not: ConditionSchema }),
    z.object({ flag: z.string() }),
    z.object({ clue: z.string() }),
    z.object({ cluesFound: z.object({ min: z.number().int(), of: z.array(z.string()) }) }),
    z.object({ decision: z.object({ id: z.string(), option: z.string().optional() }) }),
    z.object({ encounter: z.object({ id: z.string(), outcome: z.enum(["victory", "fled", "defeat"]).optional() }) }),
    z.object({ urgencyAtLeast: z.number().int() }),
    z.object({ visited: z.string() }),
    z.object({ npcTalked: z.string() }),
  ]),
);

const SkillDt = z.object({ skill: z.string(), dt: z.number().int() });

export const DiscoverySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("check"), skill: z.string(), dt: z.number().int(), verb: z.enum(["search", "inspect"]) }),
  z.object({ method: z.literal("npc"), npcId: z.string() }),
  z.object({ method: z.literal("auto"), verb: z.enum(["search", "inspect"]) }),
]);

export const ClueSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Text revealed only once discovered. */
  description: z.string(),
  importance: z.enum(["essential", "supporting", "red_herring"]),
  mapId: z.string(),
  objectId: z.string(),
  discovery: z.array(DiscoverySchema).min(1),
  failure: z.object({ urgency: z.number().int().min(0), text: z.string() }),
  reveals: z.object({ objects: z.array(z.string()).default([]), flags: z.array(z.string()).default([]) }).default({ objects: [], flags: [] }),
});
export type ClueDef = z.infer<typeof ClueSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.string(),
  motivation: z.string(),
  secret: z.string(),
  voice: z.string(),
  mapId: z.string(),
  objectId: z.string(),
  disposition: z.number().int().min(-3).max(3),
  /** Clues this NPC can reveal (only if they willingly talk). */
  knows: z.array(z.string()),
  /** Social approach needed when disposition is low. */
  persuasion: z.object({ options: z.array(SkillDt).min(1) }),
  /** What the NPC says when they will not cooperate. */
  deflection: z.string(),
  isCulprit: z.boolean().default(false),
  /** Item handed over on successful cooperation. */
  gives: z.string().optional(),
});
export type NpcDef = z.infer<typeof NpcSchema>;

export const ThreatSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  element: z.enum(["Sangue", "Morte", "Conhecimento", "Energia", "Medo"]),
  pv: z.number().int().positive(),
  defense: z.number().int(),
  agility: z.number().int(),
  initiativeBonus: z.number().int(),
  attacks: z.array(AttackSchema).min(1),
  damageResistance: z.number().int().min(0),
  disturbingPresence: z.object({ dt: z.number().int(), sanDamage: z.string() }).nullable(),
  weakness: z.object({ flag: z.string(), description: z.string(), defensePenalty: z.number().int(), ignoresResistance: z.boolean() }),
  /** DT of the Atletismo/Acrobacia test to flee. */
  fleeDt: z.number().int(),
  tactics: z.string(),
  /** Statistic provenance: original creature built for this adventure. */
  provenance: z.literal("original"),
});
export type ThreatDef = z.infer<typeof ThreatSchema>;

export const QuestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  optional: z.boolean().default(false),
  objectives: z.array(z.object({ id: z.string(), text: z.string(), when: ConditionSchema, optional: z.boolean().default(false) })),
  failWhen: ConditionSchema.optional(),
});
export type QuestDef = z.infer<typeof QuestSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  objectId: z.string(),
  mapId: z.string(),
  availableWhen: ConditionSchema,
  options: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        requiresFlag: z.string().optional(),
        check: SkillDt.optional(),
        setsFlags: z.array(z.string()).default([]),
        artifactState: z.enum(["destroyed", "sealed", "taken", "activated"]),
      }),
    )
    .min(2),
});
export type DecisionDef = z.infer<typeof DecisionSchema>;

export const EncounterSchema = z.object({
  id: z.string(),
  threatId: z.string(),
  mapId: z.string(),
  objectId: z.string(),
  /** Area that triggers the encounter when entered. */
  triggerArea: z.string(),
  intro: z.string(),
});

export const EndingSchema = z.object({
  id: z.string(),
  title: z.string(),
  tone: z.enum(["vitoria", "agridoce", "derrota"]),
  priority: z.number().int(),
  when: ConditionSchema,
  summary: z.string(),
  rewards: z.object({ prestige: z.number().int().default(0), nexGain: z.number().int().default(0), note: z.string().default("") }),
});
export type EndingDef = z.infer<typeof EndingSchema>;

export const AdventureBlueprintSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  seed: z.string(),
  systemId: z.string(),
  editionId: z.string(),
  archetype: z.string(),
  title: z.string(),
  premise: z.string(),
  hook: z.string(),
  setting: z.object({ city: z.string(), place: z.string(), time: z.string() }),
  antagonist: z.object({ name: z.string(), nature: z.string(), motive: z.string() }),
  maps: z.array(MapDefinitionSchema).min(2),
  startMapId: z.string(),
  npcs: z.array(NpcSchema),
  clues: z.array(ClueSchema),
  items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), mapId: z.string(), objectId: z.string(), effect: z.enum(["key", "heal", "bonus-force", "lore"]), opens: z.string().optional() })),
  threats: z.array(ThreatSchema),
  encounters: z.array(EncounterSchema),
  quests: z.array(QuestSchema),
  decision: DecisionSchema,
  endings: z.array(EndingSchema).min(2),
  urgency: z.object({ max: z.number().int(), effects: z.array(z.object({ at: z.number().int(), text: z.string(), flag: z.string() })) }),
  hypotheses: z.array(z.object({ id: z.string(), text: z.string(), supportedBy: z.array(z.string()) })),
  /** Locked doors and how they can be opened. */
  /** Flags derived from other state, re-evaluated after every action (sticky once true). */
  derivedFlags: z.array(z.object({ flag: z.string(), when: ConditionSchema })).default([]),
  locks: z.array(z.object({ mapId: z.string(), objectId: z.string(), keyItem: z.string().optional(), pick: SkillDt.optional(), force: SkillDt.optional(), noiseUrgency: z.number().int().default(1) })),
});
export type AdventureBlueprint = z.infer<typeof AdventureBlueprintSchema>;

export const FingerprintSchema = z.object({
  archetype: z.string(),
  city: z.string(),
  maps: z.array(z.string()),
  antagonist: z.string(),
  npcNames: z.array(z.string()),
  twist: z.string(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;
