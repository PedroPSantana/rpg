import { z } from "zod";
import { SKILL_POWERS } from "@/modules/rules/systems/ordem-paranormal/tests";
import { PositionSchema, VERBS } from "@/modules/world/schema";

export const PlayerActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), to: PositionSchema }),
  /** Walk to another room of the current location. */
  z.object({ type: z.literal("go"), areaId: z.string() }),
  /** Look around (or at one thing) without touching anything: no test, no state change. */
  z.object({ type: z.literal("observe"), objectId: z.string().optional() }),
  z.object({ type: z.literal("interact"), objectId: z.string(), verb: z.enum(VERBS), skillId: z.string().optional(), powers: z.array(z.enum(SKILL_POWERS)).default([]) }),
  z.object({
    type: z.literal("talk"),
    npcId: z.string(),
    approach: z.enum(["conversar", "persuadir", "intimidar", "enganar", "intuir"]),
    message: z.string().max(1000).optional(),
    powers: z.array(z.enum(SKILL_POWERS)).default([]),
  }),
  z.object({
    type: z.literal("skill_check"),
    skillId: z.string(),
    dt: z.number().int(),
    reason: z.string().max(300),
    /** Why the outcome matters, shown before the roll. */
    stakes: z.string().max(300).optional(),
    powers: z.array(z.enum(SKILL_POWERS)).default([]),
  }),
  z.object({ type: z.literal("decide"), optionId: z.string() }),
  z.object({ type: z.literal("attack"), weaponId: z.string(), special: z.enum(["none", "ataque", "dano"]).default("none") }),
  z.object({ type: z.literal("flee"), skillId: z.enum(["atletismo", "acrobacia"]) }),
  z.object({ type: z.literal("first_aid") }),
  z.object({ type: z.literal("abandon") }),
  z.object({ type: z.literal("narrative"), text: z.string().min(1).max(2000) }),
]);
export type PlayerAction = z.infer<typeof PlayerActionSchema>;
