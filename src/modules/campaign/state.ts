import { z } from "zod";
import type { ConditionContext } from "@/modules/adventures/conditions";
import type { AdventureBlueprint } from "@/modules/adventures/schema";
import { initialMapState } from "@/modules/world/events";
import { MapStateSchema } from "@/modules/world/schema";

export const EncounterStateSchema = z.object({
  id: z.string(),
  threatId: z.string(),
  round: z.number().int(),
  order: z.array(z.object({ id: z.string(), kind: z.enum(["pc", "threat"]), name: z.string(), initiative: z.number().int() })),
  turnIndex: z.number().int(),
  threat: z.object({ pv: z.number().int(), pvMax: z.number().int(), status: z.enum(["active", "defeated"]) }),
  presenceResolved: z.boolean(),
  /** Combat log lines (authoritative outcomes, pt-BR). */
  log: z.array(z.string()),
});
export type EncounterState = z.infer<typeof EncounterStateSchema>;

export const CampaignStateSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["exploration", "combat", "ended"]),
  currentMapId: z.string(),
  maps: z.record(z.string(), MapStateSchema),
  clues: z.record(z.string(), z.object({ discovered: z.boolean(), discoveredBy: z.string().nullable(), attempts: z.number().int() })),
  npcs: z.record(
    z.string(),
    z.object({ disposition: z.number().int(), talked: z.boolean(), cooperative: z.boolean(), gaveItem: z.boolean(), state: z.string() }),
  ),
  quests: z.record(z.string(), z.object({ status: z.enum(["active", "completed", "failed"]), objectives: z.record(z.string(), z.boolean()) })),
  flags: z.record(z.string(), z.boolean()),
  decisions: z.record(z.string(), z.string()),
  urgency: z.number().int(),
  urgencyEffectsApplied: z.array(z.number().int()),
  encounter: EncounterStateSchema.nullable(),
  /** Threat PV persisted between encounter attempts (after fleeing). */
  threatPv: z.record(z.string(), z.number().int()),
  encountersResolved: z.record(z.string(), z.enum(["victory", "fled", "defeat"])),
  ending: z
    .object({ id: z.string(), title: z.string(), tone: z.string(), summary: z.string(), rewards: z.object({ prestige: z.number(), nexGain: z.number(), note: z.string() }) })
    .nullable(),
  rewardsGranted: z.boolean(),
  scene: z.number().int(),
  actionCount: z.number().int(),
});
export type CampaignState = z.infer<typeof CampaignStateSchema>;

export function initialCampaignState(bp: AdventureBlueprint): CampaignState {
  const maps = Object.fromEntries(bp.maps.map((m) => [m.id, initialMapState(m, m.id === bp.startMapId ? "start" : "exit")]));
  maps[bp.startMapId].visited = true;
  return {
    schemaVersion: 1,
    mode: "exploration",
    currentMapId: bp.startMapId,
    maps,
    clues: Object.fromEntries(bp.clues.map((c) => [c.id, { discovered: false, discoveredBy: null, attempts: 0 }])),
    npcs: Object.fromEntries(bp.npcs.map((n) => [n.id, { disposition: n.disposition, talked: false, cooperative: false, gaveItem: false, state: "idle" }])),
    quests: Object.fromEntries(bp.quests.map((q) => [q.id, { status: "active" as const, objectives: Object.fromEntries(q.objectives.map((o) => [o.id, false])) }])),
    flags: {},
    decisions: {},
    urgency: 0,
    urgencyEffectsApplied: [],
    encounter: null,
    threatPv: Object.fromEntries(bp.threats.map((t) => [t.id, t.pv])),
    encountersResolved: {},
    ending: null,
    rewardsGranted: false,
    scene: 1,
    actionCount: 0,
  };
}

export function conditionContextOf(state: CampaignState): ConditionContext {
  return {
    flags: state.flags,
    clues: state.clues,
    decisions: state.decisions,
    encountersResolved: state.encountersResolved,
    urgency: state.urgency,
    visitedMaps: Object.values(state.maps).filter((m) => m.visited).map((m) => m.mapId),
    npcsTalked: Object.entries(state.npcs).filter(([, n]) => n.talked).map(([id]) => id),
  };
}
