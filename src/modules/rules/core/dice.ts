import { z } from "zod";
import type { RandomSource } from "./random";

/** A parsed damage/effect expression such as "2d6+3" or "1d8+1d6-1". */
export interface DiceExpression {
  terms: { count: number; sides: number }[];
  modifier: number;
}

const TERM = /([+-]?)\s*(\d*)d(\d+)|([+-]?)\s*(\d+)/gi;

export function parseDice(expression: string): DiceExpression {
  const source = expression.replace(/\s+/g, "").toLowerCase();
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(source)) {
    throw new Error(`Expressão de dados inválida: "${expression}"`);
  }
  const terms: DiceExpression["terms"] = [];
  let modifier = 0;
  for (const match of source.matchAll(TERM)) {
    if (match[3]) {
      if (match[1] === "-") throw new Error("Subtração de dados não é suportada");
      const count = match[2] ? Number(match[2]) : 1;
      const sides = Number(match[3]);
      if (count < 1 || count > 100) throw new Error(`Quantidade de dados inválida: ${count}`);
      terms.push({ count, sides });
    } else if (match[5]) {
      modifier += (match[4] === "-" ? -1 : 1) * Number(match[5]);
    }
  }
  return { terms, modifier };
}

export function formatDice(expr: DiceExpression): string {
  const dice = expr.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  if (!expr.modifier) return dice || "0";
  const sign = expr.modifier > 0 ? "+" : "-";
  return `${dice || ""}${dice ? sign : expr.modifier < 0 ? "-" : ""}${Math.abs(expr.modifier)}`;
}

export const DieResultSchema = z.object({
  sides: z.number().int(),
  value: z.number().int(),
  /** False when the die was rolled but discarded (e.g. keep-highest). */
  kept: z.boolean(),
});
export type DieResult = z.infer<typeof DieResultSchema>;

/** Persisted breakdown of a single roll; what the UI renders and the log stores. */
export const RollRecordSchema = z.object({
  label: z.string(),
  kind: z.enum(["test", "damage", "effect", "initiative"]),
  expression: z.string(),
  dice: z.array(DieResultSchema),
  modifiers: z.array(z.object({ source: z.string(), value: z.number().int() })),
  total: z.number().int(),
  /** Target number (DT or Defesa) when the roll is compared against one. */
  target: z.number().int().optional(),
  outcome: z.enum(["success", "failure", "critical", "none"]).default("none"),
  notes: z.array(z.string()).default([]),
});
export type RollRecord = z.infer<typeof RollRecordSchema>;

export function rollExpression(
  expr: DiceExpression,
  rng: RandomSource,
  options: { multiplyDice?: number } = {},
): { dice: DieResult[]; total: number } {
  const mult = options.multiplyDice ?? 1;
  const dice: DieResult[] = [];
  for (const term of expr.terms) {
    for (let i = 0; i < term.count * mult; i++) {
      dice.push({ sides: term.sides, value: rng.die(term.sides), kept: true });
    }
  }
  const total = dice.reduce((sum, d) => sum + d.value, 0) + expr.modifier;
  return { dice, total };
}
