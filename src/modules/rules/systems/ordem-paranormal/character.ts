import { z } from "zod";
import {
  ATTRIBUTES,
  ATTRIBUTE_RULES,
  BASE_DEFENSE,
  BASE_SPEED_METERS,
  CLASS_BY_ID,
  ORIGIN_BY_ID,
  PATENTES,
  SKILLS,
  SKILL_BY_ID,
  SUPPORTED_NEX,
  TRAINING_GRADES,
  peLimitForNex,
  type Attribute,
  type ClassDef,
  type TrainingGrade,
} from "./data";
import { ITEM_BY_ID, itemCategoryKey, loadCapacity, type WeaponDef } from "./equipment";

export const AttributesSchema = z.object({
  AGI: z.number().int().min(0).max(5),
  FOR: z.number().int().min(0).max(5),
  INT: z.number().int().min(0).max(5),
  PRE: z.number().int().min(0).max(5),
  VIG: z.number().int().min(0).max(5),
});
export type Attributes = z.infer<typeof AttributesSchema>;

/** Player choices. Everything mechanical is derived from this by `deriveSheet`. */
export const OpCharacterBuildSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(60),
  concept: z.string().trim().max(400).default(""),
  nex: z.number().int(),
  attributes: AttributesSchema,
  originId: z.string(),
  classId: z.string(),
  /** One pick per class fixed choice group, in order. */
  classSkillChoices: z.array(z.string()).default([]),
  freeSkills: z.array(z.string()).default([]),
  /** Especialista "Perito" skills (exactly two). */
  peritoSkills: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
});
export type OpCharacterBuild = z.infer<typeof OpCharacterBuildSchema>;

export interface ValidationIssue {
  field: string;
  message: string;
  ruleId: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  attribute: Attribute;
  grade: TrainingGrade;
  bonus: number;
  trainedOnly: boolean;
}

export interface AttackProfile {
  weaponId: string;
  name: string;
  skill: "luta" | "pontaria";
  damage: string;
  damageBonus: number;
  critThreshold: number;
  critMultiplier: number;
  proficient: boolean;
}

export interface OpSheet {
  systemId: "ordem-paranormal";
  nex: number;
  patente: string;
  className: string;
  originName: string;
  attributes: Attributes;
  pvMax: number;
  peMax: number;
  sanMax: number;
  defense: number;
  peLimit: number;
  speedMeters: number;
  load: { capacity: number; used: number };
  skills: SkillEntry[];
  proficiencies: string[];
  abilities: { id: string; name: string; summary: string; ruleId: string }[];
  attacks: AttackProfile[];
  mentalResistance: number;
  peritoSkills: string[];
}

export function attributeTotals(attrs: Attributes) {
  const zeros = ATTRIBUTES.filter((a) => attrs[a] === 0).length;
  // Lowering an attribute to 0 counts as -1 spent, which is how the extra point is gained.
  const spent = ATTRIBUTES.reduce((sum, a) => sum + (attrs[a] - ATTRIBUTE_RULES.base), 0);
  const budget = ATTRIBUTE_RULES.pointsToDistribute;
  return { zeros, spent, budget, remaining: budget - spent };
}

/** Trained skills granted before free picks (origin + class fixed + class choices). */
export function grantedSkills(build: Pick<OpCharacterBuild, "originId" | "classId" | "classSkillChoices">) {
  const origin = ORIGIN_BY_ID.get(build.originId);
  const cls = CLASS_BY_ID.get(build.classId as ClassDef["id"]);
  const fromClass = [...(cls?.fixedSkills ?? []), ...build.classSkillChoices];
  const fromOrigin = origin ? [...origin.skills] : [];
  const set = new Set<string>(fromClass);
  let overlaps = 0;
  for (const s of fromOrigin) {
    if (set.has(s)) overlaps++;
    else set.add(s);
  }
  return { skills: set, overlaps };
}

export function freeSkillAllowance(build: Pick<OpCharacterBuild, "originId" | "classId" | "classSkillChoices" | "attributes">) {
  const cls = CLASS_BY_ID.get(build.classId as ClassDef["id"]);
  if (!cls) return 0;
  // op-core.character.skill-overlap: a duplicated origin skill becomes a free pick.
  return Math.max(0, cls.freeSkills + build.attributes.INT) + grantedSkills(build).overlaps;
}

/**
 * Validates a build against the supported rules. Returns every issue so the
 * creator can explain each invalid choice at once.
 */
export function validateBuild(input: unknown): { ok: true; build: OpCharacterBuild } | { ok: false; issues: ValidationIssue[]; build?: OpCharacterBuild } {
  const parsed = OpCharacterBuildSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message, ruleId: "schema" })),
    };
  }
  const build = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (field: string, message: string, ruleId: string) => issues.push({ field, message, ruleId });

  if (!(SUPPORTED_NEX as readonly number[]).includes(build.nex)) {
    add("nex", `Apenas NEX ${SUPPORTED_NEX.join(", ")}% é suportado nesta versão.`, "op-core.progression.nex");
  }

  // Attributes
  const totals = attributeTotals(build.attributes);
  for (const a of ATTRIBUTES) {
    if (build.attributes[a] > ATTRIBUTE_RULES.maxAtCreation) {
      add(`attributes.${a}`, `Nenhum atributo pode começar acima de ${ATTRIBUTE_RULES.maxAtCreation}.`, "op-core.character.attributes");
    }
  }
  if (totals.zeros > ATTRIBUTE_RULES.maxReducedToZero) {
    add("attributes", "Apenas um atributo pode ser reduzido a 0.", "op-core.character.attributes");
  }
  if (totals.remaining > 0) add("attributes", `Ainda restam ${totals.remaining} ponto(s) de atributo para distribuir.`, "op-core.character.attributes");
  if (totals.remaining < 0) add("attributes", `Você gastou ${-totals.remaining} ponto(s) além do permitido.`, "op-core.character.attributes");

  // Origin & class
  const origin = ORIGIN_BY_ID.get(build.originId);
  if (!origin) add("originId", "Escolha uma origem.", "op-core.origin");
  else if (!origin.available) add("originId", `A origem ${origin.name} ainda não é suportada: o poder "${origin.power.name}" não foi implementado.`, "op-core.origin");

  const cls = CLASS_BY_ID.get(build.classId as ClassDef["id"]);
  if (!cls) add("classId", "Escolha uma classe.", "op-core.class");
  else if (!cls.available) add("classId", cls.unavailableReason ?? `A classe ${cls.name} ainda não é suportada.`, cls.ruleId);

  // Skills
  if (cls) {
    if (build.classSkillChoices.length !== cls.fixedSkillChoices.length) {
      add("classSkillChoices", `Escolha ${cls.fixedSkillChoices.map((g) => g.label).join(" e ")}.`, cls.ruleId);
    } else {
      cls.fixedSkillChoices.forEach((group, idx) => {
        if (!group.options.includes(build.classSkillChoices[idx])) {
          add(`classSkillChoices.${idx}`, `Escolha uma opção válida para "${group.label}".`, cls.ruleId);
        }
      });
    }
    const granted = grantedSkills(build).skills;
    const allowance = freeSkillAllowance(build);
    const seen = new Set<string>();
    for (const s of build.freeSkills) {
      if (!SKILL_BY_ID.has(s)) add("freeSkills", `Perícia desconhecida: ${s}.`, "op-core.skills.list");
      else if (granted.has(s)) add("freeSkills", `${SKILL_BY_ID.get(s)!.name} já é treinada pela origem ou classe.`, "op-core.character.skill-overlap");
      else if (seen.has(s)) add("freeSkills", `${SKILL_BY_ID.get(s)!.name} foi escolhida duas vezes.`, "op-core.character.skills");
      seen.add(s);
    }
    if (build.freeSkills.length !== allowance) {
      add("freeSkills", `Escolha exatamente ${allowance} perícia(s) treinada(s) livre(s) (você escolheu ${build.freeSkills.length}).`, `${cls.ruleId}.skills`);
    }

    if (cls.id === "especialista") {
      const trained = new Set([...granted, ...build.freeSkills]);
      const perito = build.peritoSkills;
      if (perito.length !== 2 || new Set(perito).size !== 2) {
        add("peritoSkills", "Perito: escolha duas perícias treinadas diferentes.", "op-core.ability.perito");
      } else {
        for (const s of perito) {
          if (s === "luta" || s === "pontaria") add("peritoSkills", "Perito não pode ser usado com Luta ou Pontaria.", "op-core.ability.perito");
          else if (!trained.has(s)) add("peritoSkills", `Perito exige que ${SKILL_BY_ID.get(s)?.name ?? s} seja treinada.`, "op-core.ability.perito");
        }
      }
    } else if (build.peritoSkills.length) {
      add("peritoSkills", "Apenas Especialistas escolhem perícias para Perito.", "op-core.ability.perito");
    }
  }

  // Equipment
  const limits = PATENTES.recruta.itemLimits;
  const used = { I: 0, II: 0, III: 0, IV: 0 };
  let spaces = 0;
  for (const id of build.equipment) {
    const item = ITEM_BY_ID.get(id);
    if (!item) {
      add("equipment", `Item desconhecido: ${id}.`, "op-core.equipment");
      continue;
    }
    spaces += item.spaces;
    const key = itemCategoryKey(item.category);
    if (key) used[key]++;
    if (cls && (item.kind === "weapon" || item.kind === "protection") && !cls.proficiencies.includes(item.proficiency)) {
      add("equipment", `${cls.name} não tem proficiência para ${item.name}.`, "op-core.equipment.proficiency");
    }
  }
  for (const key of ["I", "II", "III", "IV"] as const) {
    if (used[key] > limits[key]) add("equipment", `Recruta pode levar no máximo ${limits[key]} item(ns) de categoria ${key}.`, "op-core.progression.patente");
  }
  if (build.equipment.filter((id) => ITEM_BY_ID.get(id)?.kind === "protection").length > 1) {
    add("equipment", "Só é possível vestir uma proteção.", "op-core.equipment.protection");
  }
  const capacity = loadCapacity(build.attributes.FOR);
  if (spaces > capacity * 2) {
    add("equipment", `Carga máxima excedida (${spaces}/${capacity * 2} espaços).`, "op-core.equipment.load");
  }

  return issues.length ? { ok: false, issues, build } : { ok: true, build };
}

const ABILITY_INFO: Record<string, { name: string; summary: string; ruleId: string }> = {
  "ataque-especial": { name: "Ataque Especial", summary: "Ao atacar, gaste 2 PE para +5 no teste de ataque ou na rolagem de dano.", ruleId: "op-core.ability.ataque-especial" },
  "eclético": { name: "Eclético", summary: "Gaste 2 PE para fazer um teste como se fosse treinado na perícia.", ruleId: "op-core.ability.ecletico" },
  perito: { name: "Perito", summary: "Gaste 2 PE para somar +1d6 em um teste de uma das perícias escolhidas.", ruleId: "op-core.ability.perito" },
};

/** Computes every derived statistic. Pure; safe on client and server. */
export function deriveSheet(build: OpCharacterBuild): OpSheet {
  const cls = CLASS_BY_ID.get(build.classId as ClassDef["id"]);
  const origin = ORIGIN_BY_ID.get(build.originId);
  if (!cls || !origin) throw new Error("Build inválido: origem ou classe desconhecida");
  const a = build.attributes;
  const nexSteps = build.nex / 5;

  // op-core.derived.pv/pe/san — values at NEX 5%; higher NEX not yet supported.
  let pvMax = cls.pv.base + a.VIG;
  let peMax = cls.pe.base + a.PRE;
  let sanMax = cls.san.base;
  if (origin.power.id === "calejado") pvMax += nexSteps;
  if (origin.power.id === "dedicacao") peMax += 1;
  if (origin.power.id === "cicatrizes-psicologicas") sanMax += nexSteps;

  const trained = new Set([...grantedSkills(build).skills, ...build.freeSkills]);
  const skills: SkillEntry[] = SKILLS.map((s) => {
    const grade: TrainingGrade = trained.has(s.id) ? "trained" : "untrained";
    return { id: s.id, name: s.name, attribute: s.attribute, grade, bonus: TRAINING_GRADES[grade].bonus, trainedOnly: s.trainedOnly };
  });

  let defense = BASE_DEFENSE + a.AGI;
  let used = 0;
  for (const id of build.equipment) {
    const item = ITEM_BY_ID.get(id);
    if (!item) continue;
    used += item.spaces;
    if (item.kind === "protection") defense += item.defense;
  }
  if (origin.power.id === "patrulha") defense += 2;

  const attacks: AttackProfile[] = build.equipment
    .map((id) => ITEM_BY_ID.get(id))
    .filter((i): i is WeaponDef => i?.kind === "weapon")
    .map((w) => attackProfile(w, a, cls, origin.power.id));
  // Unarmed strike is always available.
  attacks.push(unarmedAttack(a, origin.power.id));

  const abilities = [cls.startingAbility, ...(cls.id === "especialista" ? ["perito"] : [])].map((id) => ({ id, ...ABILITY_INFO[id] }));
  abilities.push({ id: origin.power.id, name: origin.power.name, summary: origin.power.summary, ruleId: `op-core.origin.${origin.id}` });

  return {
    systemId: "ordem-paranormal",
    nex: build.nex,
    patente: PATENTES.recruta.name,
    className: cls.name,
    originName: origin.name,
    attributes: a,
    pvMax,
    peMax,
    sanMax,
    defense,
    peLimit: peLimitForNex(build.nex),
    speedMeters: BASE_SPEED_METERS,
    load: { capacity: loadCapacity(a.FOR), used },
    skills,
    proficiencies: cls.proficiencies,
    abilities,
    attacks,
    mentalResistance: origin.power.id === "eu-ja-sabia" ? a.INT : 0,
    peritoSkills: build.peritoSkills,
  };
}

function attackProfile(w: WeaponDef, a: Attributes, cls: ClassDef, power: string): AttackProfile {
  let damageBonus = w.addsStrength ? a.FOR : 0;
  if (power === "mao-pesada" && w.range === "corpo-a-corpo") damageBonus += 2;
  if (power === "para-bellum" && w.firearm) damageBonus += 2;
  return {
    weaponId: w.id,
    name: w.name,
    skill: w.range === "corpo-a-corpo" ? "luta" : "pontaria",
    damage: w.damage,
    damageBonus,
    critThreshold: w.critThreshold,
    critMultiplier: w.critMultiplier,
    proficient: cls.proficiencies.includes(w.proficiency),
  };
}

function unarmedAttack(a: Attributes, power: string): AttackProfile {
  return {
    weaponId: "desarmado",
    name: "Ataque desarmado",
    skill: "luta",
    damage: "1d3",
    damageBonus: a.FOR + (power === "mao-pesada" ? 2 : 0),
    critThreshold: 20,
    critMultiplier: 2,
    proficient: true,
  };
}

/** Mutable runtime state stored with the character. */
export const OpCharacterStateSchema = z.object({
  pv: z.number().int(),
  pe: z.number().int(),
  san: z.number().int(),
  conditions: z.array(z.object({ id: z.string(), source: z.string(), rounds: z.number().int().optional() })).default([]),
  inventory: z.array(z.object({ itemId: z.string(), name: z.string(), quantity: z.number().int().min(0), equipped: z.boolean().default(false), story: z.boolean().default(false) })).default([]),
  /** Rounds spent dying in the current scene; null when not dying. */
  dyingRounds: z.number().int().nullable().default(null),
  /** "Once per scene" powers already used in the current scene. */
  sceneUses: z.array(z.string()).default([]),
});
export type OpCharacterState = z.infer<typeof OpCharacterStateSchema>;

export function initialState(build: OpCharacterBuild, sheet: OpSheet): OpCharacterState {
  return {
    pv: sheet.pvMax,
    pe: sheet.peMax,
    san: sheet.sanMax,
    conditions: [],
    inventory: build.equipment.map((id) => ({ itemId: id, name: ITEM_BY_ID.get(id)?.name ?? id, quantity: 1, equipped: true, story: false })),
    dyingRounds: null,
    sceneUses: [],
  };
}
