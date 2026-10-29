import { z } from "zod";
import { formatDice, parseDice, rollExpression, type RollRecord } from "../../core/dice";
import type { RandomSource } from "../../core/random";
import { rollTest } from "./tests";

/** A combat-ready attack, for PCs (from the sheet) or threats (from their stat block). */
export const AttackSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Number of d20 rolled (attribute value). */
  attackDice: z.number().int(),
  attackBonus: z.number().int(),
  damage: z.string(),
  damageBonus: z.number().int().default(0),
  critThreshold: z.number().int().min(2).max(20).default(20),
  critMultiplier: z.number().int().min(2).max(5).default(2),
  /** "mental" damage reduces SAN instead of PV. */
  damageKind: z.enum(["physical", "mental"]).default("physical"),
});
export type Attack = z.infer<typeof AttackSchema>;

export interface AttackResolution {
  attackRoll: RollRecord & { natural: number };
  hit: boolean;
  critical: boolean;
  damageRoll?: RollRecord;
  damage: number;
}

/**
 * op-core.combat.attack — attack test (Luta/Pontaria) against the target's
 * Defesa; a hit whose kept d20 is within the threat range is critical and
 * multiplies the weapon dice (not fixed bonuses). op-core.combat.critical
 */
export function resolveAttack(
  attack: Attack,
  targetDefense: number,
  rng: RandomSource,
  options: { attackModifiers?: { source: string; value: number }[]; damageModifiers?: { source: string; value: number }[]; diceModifier?: number; damageResistance?: number } = {},
): AttackResolution {
  const attackRoll = rollTest(
    {
      label: `Ataque: ${attack.name}`,
      attribute: attack.attackDice,
      diceModifier: options.diceModifier,
      modifiers: [{ source: "Perícia de ataque", value: attack.attackBonus }, ...(options.attackModifiers ?? [])],
      target: targetDefense,
    },
    rng,
  );
  const hit = attackRoll.total >= targetDefense;
  const critical = hit && attackRoll.natural >= attack.critThreshold;
  if (critical) attackRoll.outcome = "critical";
  if (!hit) return { attackRoll, hit, critical: false, damage: 0 };

  const expr = parseDice(attack.damage);
  const mult = critical ? attack.critMultiplier : 1;
  const rolled = rollExpression(expr, rng, { multiplyDice: mult });
  const modifiers = [{ source: "Bônus de dano", value: attack.damageBonus }, ...(options.damageModifiers ?? [])].filter((m) => m.value !== 0);
  const raw = rolled.total + modifiers.reduce((s, m) => s + m.value, 0);
  const resistance = options.damageResistance ?? 0;
  const damage = Math.max(0, raw - resistance);
  const notes: string[] = [];
  if (critical) notes.push(`Crítico: dados multiplicados ×${mult}`);
  if (resistance) notes.push(`Resistência a dano: -${resistance}`);
  const damageRoll: RollRecord = {
    label: `Dano: ${attack.name}`,
    kind: "damage",
    expression: formatDice({ terms: expr.terms.map((t) => ({ ...t, count: t.count * mult })), modifier: expr.modifier }),
    dice: rolled.dice,
    modifiers,
    total: damage,
    outcome: "none",
    notes,
  };
  return { attackRoll, hit, critical, damageRoll, damage };
}

export interface InitiativeEntrant {
  id: string;
  name: string;
  agility: number;
  initiativeBonus: number;
}

/** op-core.combat.initiative — Iniciativa test; ties broken by higher AGI, then id for determinism. */
export function rollInitiative(entrants: InitiativeEntrant[], rng: RandomSource) {
  const rolls = entrants.map((e) => ({
    entrant: e,
    roll: rollTest({ label: `Iniciativa: ${e.name}`, attribute: e.agility, modifiers: [{ source: "Iniciativa", value: e.initiativeBonus }], kind: "initiative" }, rng),
  }));
  rolls.sort((a, b) => b.roll.total - a.roll.total || b.entrant.agility - a.entrant.agility || a.entrant.id.localeCompare(b.entrant.id));
  return rolls;
}

/**
 * op-core.combat.damage / op-core.conditions.morrendo — applies PV loss.
 * At 0 PV a character is "morrendo"; extra damage while dying does not
 * reduce PV below 0.
 */
export function applyPhysicalDamage(pv: number, damage: number) {
  const next = Math.max(0, pv - Math.max(0, damage));
  return { pv: next, droppedToZero: pv > 0 && next === 0 };
}

/** op-core.sanity.damage — SAN loss reduced by mental resistance; 0 SAN = enlouquecendo. */
export function applyMentalDamage(san: number, damage: number, resistance = 0) {
  const effective = Math.max(0, damage - resistance);
  const next = Math.max(0, san - effective);
  return { san: next, effective, insane: san > 0 && next === 0 };
}

/** op-core.conditions.morrendo — dies when starting the 3rd turn dying in the same scene. */
export const DYING_ROUNDS_TO_DEATH = 3;
