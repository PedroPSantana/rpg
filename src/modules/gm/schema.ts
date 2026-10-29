import { z } from "zod";

/**
 * Structured protocol between the backend and the AI Game Master.
 * Everything the model returns is parsed with these schemas and then
 * validated again by the rules/campaign engine before anything is committed.
 */
export const INTENTS = ["interact", "talk", "skill_check", "decide", "attack", "flee", "first_aid", "abandon", "narrative", "clarify"] as const;

export const InterpretationSchema = z.object({
  intent: z.enum(INTENTS),
  objectId: z.string().nullable(),
  verb: z.enum(["inspect", "search", "open", "close", "unlock", "force", "take", "use", "talk", "enter"]).nullable(),
  skillId: z.string().nullable(),
  npcId: z.string().nullable(),
  approach: z.enum(["conversar", "persuadir", "intimidar", "enganar", "intuir"]).nullable(),
  /** Only for improvised skill checks; must be a DT from the official table. */
  dt: z.number().int().nullable(),
  reason: z.string().nullable(),
  optionId: z.string().nullable(),
  weaponId: z.string().nullable(),
  special: z.enum(["none", "ataque", "dano"]).nullable(),
  /** Question to ask the player when the intention is ambiguous. */
  clarification: z.string().nullable(),
  /** Rules lookup the GM wants performed (answered from the verified catalog). */
  rulesQuery: z.string().nullable(),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const COSMETIC_EFFECTS = ["lights_flicker", "whisper", "door_creak", "cold_breath", "static_noise", "heartbeat", "none"] as const;

export const NarrationSchema = z.object({
  /** Player-facing narration in pt-BR. Must not contradict the facts. */
  narration: z.string().min(1).max(4000),
  npcDialogue: z.array(z.object({ npcId: z.string(), line: z.string().max(800) })).max(4),
  /** Optional suggestions — never restrictions. */
  suggestions: z.array(z.string().max(160)).max(4),
  /** Purely cosmetic scene effects, validated against a whitelist. */
  effects: z.array(z.enum(COSMETIC_EFFECTS)).max(3),
  /** Hidden GM planning; stored, never shown to the player. */
  gmNotes: z.string().max(1500),
  /** Optional one-line memory for continuity (non-authoritative). */
  memory: z.string().max(300).nullable(),
});
export type Narration = z.infer<typeof NarrationSchema>;
