import type { Condition } from "./schema";

/** Minimal view of campaign state needed to evaluate blueprint conditions. */
export interface ConditionContext {
  flags: Record<string, boolean>;
  clues: Record<string, { discovered: boolean }>;
  decisions: Record<string, string>;
  encountersResolved: Record<string, "victory" | "fled" | "defeat">;
  urgency: number;
  visitedMaps: string[];
  npcsTalked: string[];
}

export function evaluate(c: Condition, ctx: ConditionContext): boolean {
  if ("all" in c) return c.all.every((x) => evaluate(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluate(x, ctx));
  if ("not" in c) return !evaluate(c.not, ctx);
  if ("flag" in c) return !!ctx.flags[c.flag];
  if ("clue" in c) return !!ctx.clues[c.clue]?.discovered;
  if ("cluesFound" in c) return c.cluesFound.of.filter((id) => ctx.clues[id]?.discovered).length >= c.cluesFound.min;
  if ("decision" in c) return c.decision.id in ctx.decisions && (!c.decision.option || ctx.decisions[c.decision.id] === c.decision.option);
  if ("encounter" in c) return c.encounter.id in ctx.encountersResolved && (!c.encounter.outcome || ctx.encountersResolved[c.encounter.id] === c.encounter.outcome);
  if ("urgencyAtLeast" in c) return ctx.urgency >= c.urgencyAtLeast;
  if ("visited" in c) return ctx.visitedMaps.includes(c.visited);
  if ("npcTalked" in c) return ctx.npcsTalked.includes(c.npcTalked);
  return false;
}
