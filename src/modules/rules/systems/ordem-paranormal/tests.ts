import { parseDice, rollExpression, type DieResult, type RollRecord } from "../../core/dice";
import type { RandomSource } from "../../core/random";
import { SKILL_BY_ID, TRAINING_GRADES } from "./data";
import type { OpCharacterState, OpSheet } from "./character";

export interface TestInput {
  label: string;
  /** Attribute value: number of d20 rolled. */
  attribute: number;
  /** Extra/fewer d20 from effects ("+1d" / "-1d"). */
  diceModifier?: number;
  modifiers?: { source: string; value: number }[];
  /** Additional dice added to the total (e.g. Perito +1d6). */
  extraDice?: { source: string; expression: string }[];
  target?: number;
  kind?: RollRecord["kind"];
}

/**
 * op-core.test.basic — roll a number of d20 equal to the attribute and keep
 * the highest; with 0 or fewer dice, roll (2 - n) d20 and keep the lowest.
 * Add skill/other bonuses and compare with the DT.
 */
export function rollTest(input: TestInput, rng: RandomSource): RollRecord & { natural: number } {
  const n = input.attribute + (input.diceModifier ?? 0);
  const count = n >= 1 ? n : 2 - n;
  const keepHighest = n >= 1;
  const faces = Array.from({ length: count }, () => rng.die(20));
  const chosen = keepHighest ? Math.max(...faces) : Math.min(...faces);
  let keptMarked = false;
  const dice: DieResult[] = faces.map((value) => {
    const kept = !keptMarked && value === chosen;
    if (kept) keptMarked = true;
    return { sides: 20, value, kept };
  });
  const modifiers = (input.modifiers ?? []).filter((m) => m.value !== 0);
  let total = chosen + modifiers.reduce((s, m) => s + m.value, 0);
  const notes: string[] = [];
  for (const extra of input.extraDice ?? []) {
    const r = rollExpression(parseDice(extra.expression), rng);
    dice.push(...r.dice);
    total += r.total;
    notes.push(`${extra.source}: +${r.total} (${extra.expression})`);
  }
  const outcome = input.target === undefined ? "none" : total >= input.target ? "success" : "failure";
  const expression = `${count}d20 (${keepHighest ? "maior" : "menor"})`;
  return {
    label: input.label,
    kind: input.kind ?? "test",
    expression,
    dice,
    modifiers,
    total,
    target: input.target,
    outcome,
    notes,
    natural: chosen,
  };
}

export const SKILL_POWERS = ["saber-e-poder", "110-porcento", "faro-para-pistas", "eclético", "perito"] as const;
export type SkillPower = (typeof SKILL_POWERS)[number];

export interface SkillCheckRequest {
  skillId: string;
  dt?: number;
  label?: string;
  powers?: SkillPower[];
  situational?: { source: string; value: number }[];
  diceModifier?: number;
  /** The test is a search for clues (enables Faro para Pistas). */
  searchingClues?: boolean;
}

export type SkillCheckResult =
  | { ok: true; roll: RollRecord & { natural: number }; peCost: number; sceneUses: string[] }
  | { ok: false; reason: string; ruleId: string };

/** Plans PE costs and bonuses without rolling, so legality can be shown before committing. */
export function planSkillCheck(sheet: OpSheet, state: OpCharacterState, req: SkillCheckRequest) {
  const skill = SKILL_BY_ID.get(req.skillId);
  if (!skill) return { ok: false as const, reason: `Perícia desconhecida: ${req.skillId}`, ruleId: "op-core.skills.list" };
  const entry = sheet.skills.find((s) => s.id === skill.id)!;
  const powers = new Set(req.powers ?? []);
  const abilityIds = new Set(sheet.abilities.map((a) => a.id));
  let grade = entry.grade;
  let peCost = 0;
  const modifiers: { source: string; value: number }[] = [];
  const extraDice: { source: string; expression: string }[] = [];
  const sceneUses: string[] = [];

  for (const p of powers) {
    if (!abilityIds.has(p)) return { ok: false as const, reason: `Você não possui o poder ${p}.`, ruleId: "op-core.ability" };
  }
  if (powers.has("eclético")) {
    if (grade !== "untrained") return { ok: false as const, reason: "Eclético só se aplica a perícias não treinadas.", ruleId: "op-core.ability.ecletico" };
    grade = "trained";
    peCost += 2;
  }
  if (skill.trainedOnly && grade === "untrained") {
    return { ok: false as const, reason: `${skill.name} só pode ser usada por quem é treinado.`, ruleId: "op-core.skills.trained-only" };
  }
  if (TRAINING_GRADES[grade].bonus) modifiers.push({ source: TRAINING_GRADES[grade].label, value: TRAINING_GRADES[grade].bonus });

  if (powers.has("saber-e-poder")) {
    if (skill.attribute !== "INT") return { ok: false as const, reason: "Saber é Poder só vale para testes de Intelecto.", ruleId: "op-core.origin.academico" };
    peCost += 2;
    modifiers.push({ source: "Saber é Poder", value: 5 });
  }
  if (powers.has("110-porcento")) {
    if (!["FOR", "AGI"].includes(skill.attribute) || skill.id === "luta" || skill.id === "pontaria") {
      return { ok: false as const, reason: "110% vale para perícias de Força ou Agilidade, exceto Luta e Pontaria.", ruleId: "op-core.origin.atleta" };
    }
    peCost += 2;
    modifiers.push({ source: "110%", value: 5 });
  }
  if (powers.has("faro-para-pistas")) {
    if (!req.searchingClues) return { ok: false as const, reason: "Faro para Pistas só vale ao procurar pistas.", ruleId: "op-core.origin.investigador" };
    if (state.sceneUses.includes("faro-para-pistas")) return { ok: false as const, reason: "Faro para Pistas já foi usado nesta cena.", ruleId: "op-core.origin.investigador" };
    peCost += 1;
    modifiers.push({ source: "Faro para Pistas", value: 5 });
    sceneUses.push("faro-para-pistas");
  }
  if (powers.has("perito")) {
    if (!sheet.peritoSkills.includes(skill.id)) return { ok: false as const, reason: "Perito só vale para as perícias escolhidas.", ruleId: "op-core.ability.perito" };
    peCost += 2;
    extraDice.push({ source: "Perito", expression: "1d6" });
  }
  if (peCost > state.pe) return { ok: false as const, reason: `PE insuficientes (precisa de ${peCost}, tem ${state.pe}).`, ruleId: "op-core.resources.pe" };
  modifiers.push(...(req.situational ?? []));
  return { ok: true as const, skill, attribute: sheet.attributes[skill.attribute], modifiers, extraDice, peCost, sceneUses };
}

export function skillCheck(sheet: OpSheet, state: OpCharacterState, req: SkillCheckRequest, rng: RandomSource): SkillCheckResult {
  const plan = planSkillCheck(sheet, state, req);
  if (!plan.ok) return plan;
  const roll = rollTest(
    {
      label: req.label ?? plan.skill.name,
      attribute: plan.attribute,
      diceModifier: req.diceModifier,
      modifiers: plan.modifiers,
      extraDice: plan.extraDice,
      target: req.dt,
    },
    rng,
  );
  return { ok: true, roll, peCost: plan.peCost, sceneUses: plan.sceneUses };
}
