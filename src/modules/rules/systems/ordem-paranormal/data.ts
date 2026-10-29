/**
 * Ordem Paranormal RPG — structured rules data for edition `op-core`.
 *
 * IMPORTANT: values here were encoded from the project's working knowledge of
 * the core rulebook and are tracked as *unverified* in the knowledge catalog
 * (src/modules/knowledge/catalog/op-core.ts) until checked against the
 * owner's authorized copy. Descriptions are short original paraphrases, never
 * rulebook text. Every entry carries the rule id that governs it.
 */

export const SYSTEM_ID = "ordem-paranormal";
export const EDITION_ID = "op-core";

export const ATTRIBUTES = ["AGI", "FOR", "INT", "PRE", "VIG"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const ATTRIBUTE_INFO: Record<Attribute, { name: string; hint: string }> = {
  AGI: { name: "Agilidade", hint: "Coordenação, reflexos e destreza." },
  FOR: { name: "Força", hint: "Potência física e dano corpo a corpo." },
  INT: { name: "Intelecto", hint: "Raciocínio, memória e perícias treinadas extras." },
  PRE: { name: "Presença", hint: "Força de vontade, carisma e Pontos de Esforço." },
  VIG: { name: "Vigor", hint: "Saúde, resistência e Pontos de Vida." },
};

/** op-core.character.attributes */
export const ATTRIBUTE_RULES = {
  base: 1,
  pointsToDistribute: 4,
  maxAtCreation: 3,
  /** One attribute may be lowered to 0 to gain one extra point. */
  maxReducedToZero: 1,
} as const;

export interface SkillDef {
  id: string;
  name: string;
  attribute: Attribute;
  /** Can only be used when trained. */
  trainedOnly: boolean;
  /** Suffers armor/load penalty. */
  loadPenalty: boolean;
}

/** op-core.skills.list */
export const SKILLS: SkillDef[] = [
  { id: "acrobacia", name: "Acrobacia", attribute: "AGI", trainedOnly: false, loadPenalty: true },
  { id: "adestramento", name: "Adestramento", attribute: "PRE", trainedOnly: true, loadPenalty: false },
  { id: "artes", name: "Artes", attribute: "PRE", trainedOnly: true, loadPenalty: false },
  { id: "atletismo", name: "Atletismo", attribute: "FOR", trainedOnly: false, loadPenalty: false },
  { id: "atualidades", name: "Atualidades", attribute: "INT", trainedOnly: false, loadPenalty: false },
  { id: "ciencias", name: "Ciências", attribute: "INT", trainedOnly: true, loadPenalty: false },
  { id: "crime", name: "Crime", attribute: "AGI", trainedOnly: true, loadPenalty: true },
  { id: "diplomacia", name: "Diplomacia", attribute: "PRE", trainedOnly: false, loadPenalty: false },
  { id: "enganacao", name: "Enganação", attribute: "PRE", trainedOnly: false, loadPenalty: false },
  { id: "fortitude", name: "Fortitude", attribute: "VIG", trainedOnly: false, loadPenalty: false },
  { id: "furtividade", name: "Furtividade", attribute: "AGI", trainedOnly: false, loadPenalty: true },
  { id: "iniciativa", name: "Iniciativa", attribute: "AGI", trainedOnly: false, loadPenalty: false },
  { id: "intimidacao", name: "Intimidação", attribute: "PRE", trainedOnly: false, loadPenalty: false },
  { id: "intuicao", name: "Intuição", attribute: "PRE", trainedOnly: false, loadPenalty: false },
  { id: "investigacao", name: "Investigação", attribute: "INT", trainedOnly: false, loadPenalty: false },
  { id: "luta", name: "Luta", attribute: "FOR", trainedOnly: false, loadPenalty: false },
  { id: "medicina", name: "Medicina", attribute: "INT", trainedOnly: false, loadPenalty: false },
  { id: "ocultismo", name: "Ocultismo", attribute: "INT", trainedOnly: true, loadPenalty: false },
  { id: "percepcao", name: "Percepção", attribute: "PRE", trainedOnly: false, loadPenalty: false },
  { id: "pilotagem", name: "Pilotagem", attribute: "AGI", trainedOnly: true, loadPenalty: false },
  { id: "pontaria", name: "Pontaria", attribute: "AGI", trainedOnly: false, loadPenalty: false },
  { id: "profissao", name: "Profissão", attribute: "INT", trainedOnly: true, loadPenalty: false },
  { id: "reflexos", name: "Reflexos", attribute: "AGI", trainedOnly: false, loadPenalty: false },
  { id: "religiao", name: "Religião", attribute: "PRE", trainedOnly: true, loadPenalty: false },
  { id: "sobrevivencia", name: "Sobrevivência", attribute: "INT", trainedOnly: false, loadPenalty: false },
  { id: "tatica", name: "Tática", attribute: "INT", trainedOnly: true, loadPenalty: false },
  { id: "tecnologia", name: "Tecnologia", attribute: "INT", trainedOnly: true, loadPenalty: false },
  { id: "vontade", name: "Vontade", attribute: "PRE", trainedOnly: false, loadPenalty: false },
];
export type SkillId = (typeof SKILLS)[number]["id"];
export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** op-core.skills.training-grades */
export const TRAINING_GRADES = {
  untrained: { label: "Destreinado", bonus: 0, minNex: 0 },
  trained: { label: "Treinado", bonus: 5, minNex: 0 },
  veteran: { label: "Veterano", bonus: 10, minNex: 35 },
  expert: { label: "Expert", bonus: 15, minNex: 70 },
} as const;
export type TrainingGrade = keyof typeof TRAINING_GRADES;

/** op-core.test.difficulty-table */
export const DIFFICULTY_TABLE = [
  { dt: 5, label: "Fácil" },
  { dt: 10, label: "Média" },
  { dt: 15, label: "Difícil" },
  { dt: 20, label: "Desafiadora" },
  { dt: 25, label: "Formidável" },
  { dt: 30, label: "Heroica" },
  { dt: 40, label: "Quase impossível" },
] as const;
export const ALLOWED_DTS: readonly number[] = DIFFICULTY_TABLE.map((d) => d.dt);

export type ClassId = "combatente" | "especialista" | "ocultista";

export interface ClassDef {
  id: ClassId;
  name: string;
  summary: string;
  pv: { base: number; perNex: number };
  pe: { base: number; perNex: number };
  san: { base: number; perNex: number };
  /** Groups where exactly one skill must be chosen, before free picks. */
  fixedSkillChoices: { label: string; options: string[] }[];
  /** Skills always trained. */
  fixedSkills: string[];
  /** Free trained skills = freeSkills + INT. */
  freeSkills: number;
  proficiencies: ("simples" | "taticas" | "pesadas" | "protecao-leve" | "protecao-pesada")[];
  /** Class ability gained at NEX 5% (implemented id in abilities.ts). */
  startingAbility: string;
  /** Selectable in the creator — only when every mechanic it needs is implemented. */
  available: boolean;
  unavailableReason?: string;
  ruleId: string;
}

/** op-core.class.* — PV/PE add the attribute; see derived.ts */
export const CLASSES: ClassDef[] = [
  {
    id: "combatente",
    name: "Combatente",
    summary: "Treinado para lutar. Aguenta mais dano e domina armas táticas.",
    pv: { base: 20, perNex: 4 },
    pe: { base: 2, perNex: 2 },
    san: { base: 12, perNex: 3 },
    fixedSkillChoices: [
      { label: "Luta ou Pontaria", options: ["luta", "pontaria"] },
      { label: "Fortitude ou Reflexos", options: ["fortitude", "reflexos"] },
    ],
    fixedSkills: [],
    freeSkills: 1,
    proficiencies: ["simples", "taticas", "protecao-leve"],
    startingAbility: "ataque-especial",
    available: true,
    ruleId: "op-core.class.combatente",
  },
  {
    id: "especialista",
    name: "Especialista",
    summary: "Versátil e perito. Recebe mais perícias treinadas.",
    pv: { base: 16, perNex: 3 },
    pe: { base: 3, perNex: 3 },
    san: { base: 16, perNex: 4 },
    fixedSkillChoices: [],
    fixedSkills: [],
    freeSkills: 7,
    proficiencies: ["simples", "protecao-leve"],
    startingAbility: "eclético",
    available: true,
    ruleId: "op-core.class.especialista",
  },
  {
    id: "ocultista",
    name: "Ocultista",
    summary: "Estudioso do Outro Lado, conjura rituais.",
    pv: { base: 12, perNex: 2 },
    pe: { base: 4, perNex: 4 },
    san: { base: 20, perNex: 5 },
    fixedSkillChoices: [],
    fixedSkills: ["ocultismo", "vontade"],
    freeSkills: 3,
    proficiencies: ["simples"],
    startingAbility: "escolhido-pelo-outro-lado",
    available: false,
    unavailableReason:
      "O sistema de rituais ainda não foi implementado e testado. A classe será liberada quando os rituais de 1º círculo forem verificados.",
    ruleId: "op-core.class.ocultista",
  },
];
export const CLASS_BY_ID = new Map(CLASSES.map((c) => [c.id, c]));

export interface OriginDef {
  id: string;
  name: string;
  skills: [string, string];
  power: { id: string; name: string; summary: string };
  /** Only origins whose power is implemented in the engine can be selected. */
  available: boolean;
}

/**
 * op-core.origin.* — names and trained skills of the 26 core origins.
 * Power summaries are short original paraphrases for UI hints.
 */
export const ORIGINS: OriginDef[] = [
  { id: "academico", name: "Acadêmico", skills: ["ciencias", "investigacao"], power: { id: "saber-e-poder", name: "Saber é Poder", summary: "Ao fazer um teste de Intelecto, pode gastar 2 PE para +5 no teste." }, available: true },
  { id: "agente-de-saude", name: "Agente de Saúde", skills: ["intuicao", "medicina"], power: { id: "tecnica-medicinal", name: "Técnica Medicinal", summary: "Cura aplicada soma o Intelecto." }, available: false },
  { id: "amnesico", name: "Amnésico", skills: ["percepcao", "intuicao"], power: { id: "vislumbres-do-passado", name: "Vislumbres do Passado", summary: "Recupera lembranças fragmentadas com testes de Intelecto." }, available: false },
  { id: "artista", name: "Artista", skills: ["artes", "enganacao"], power: { id: "magnum-opus", name: "Magnum Opus", summary: "Sua fama abre portas socialmente." }, available: false },
  { id: "atleta", name: "Atleta", skills: ["acrobacia", "atletismo"], power: { id: "110-porcento", name: "110%", summary: "Em testes de perícia de Força ou Agilidade (exceto Luta e Pontaria), pode gastar 2 PE para +5." }, available: true },
  { id: "chef", name: "Chef", skills: ["fortitude", "profissao"], power: { id: "ingrediente-secreto", name: "Ingrediente Secreto", summary: "Refeições preparadas concedem benefícios no interlúdio." }, available: false },
  { id: "criminoso", name: "Criminoso", skills: ["crime", "furtividade"], power: { id: "o-crime-compensa", name: "O Crime Compensa", summary: "Pode levar um item extra escondido para a missão." }, available: false },
  { id: "cultista-arrependido", name: "Cultista Arrependido", skills: ["ocultismo", "religiao"], power: { id: "tracos-do-outro-lado", name: "Traços do Outro Lado", summary: "Conhecimento paranormal ao custo de Sanidade." }, available: false },
  { id: "desgarrado", name: "Desgarrado", skills: ["fortitude", "sobrevivencia"], power: { id: "calejado", name: "Calejado", summary: "+1 PV para cada 5% de NEX." }, available: true },
  { id: "engenheiro", name: "Engenheiro", skills: ["profissao", "tecnologia"], power: { id: "ferramentas-favoritas", name: "Ferramentas Favoritas", summary: "Um item de categoria I conta como categoria abaixo." }, available: false },
  { id: "executivo", name: "Executivo", skills: ["diplomacia", "profissao"], power: { id: "processo-otimizado", name: "Processo Otimizado", summary: "Bônus em testes estendidos e burocracia." }, available: false },
  { id: "investigador", name: "Investigador", skills: ["investigacao", "percepcao"], power: { id: "faro-para-pistas", name: "Faro para Pistas", summary: "Uma vez por cena, ao procurar pistas, pode gastar 1 PE para +5 no teste." }, available: true },
  { id: "lutador", name: "Lutador", skills: ["luta", "reflexos"], power: { id: "mao-pesada", name: "Mão Pesada", summary: "+2 em rolagens de dano com ataques corpo a corpo." }, available: true },
  { id: "magnata", name: "Magnata", skills: ["diplomacia", "pilotagem"], power: { id: "patrocinador-da-ordem", name: "Patrocinador da Ordem", summary: "Limite de crédito maior." }, available: false },
  { id: "mercenario", name: "Mercenário", skills: ["iniciativa", "intimidacao"], power: { id: "posicao-de-combate", name: "Posição de Combate", summary: "No primeiro turno, ação de movimento extra por PE." }, available: false },
  { id: "militar", name: "Militar", skills: ["pontaria", "tatica"], power: { id: "para-bellum", name: "Para Bellum", summary: "+2 em rolagens de dano com armas de fogo." }, available: true },
  { id: "operario", name: "Operário", skills: ["fortitude", "profissao"], power: { id: "ferramenta-de-trabalho", name: "Ferramenta de Trabalho", summary: "Bônus com uma ferramenta usada como arma." }, available: false },
  { id: "policial", name: "Policial", skills: ["percepcao", "pontaria"], power: { id: "patrulha", name: "Patrulha", summary: "+2 em Defesa." }, available: true },
  { id: "religioso", name: "Religioso", skills: ["religiao", "vontade"], power: { id: "acalentar", name: "Acalentar", summary: "Conforta aliados e recupera Sanidade." }, available: false },
  { id: "servidor-publico", name: "Servidor Público", skills: ["intuicao", "vontade"], power: { id: "espirito-civico", name: "Espírito Cívico", summary: "Melhora ações de ajuda." }, available: false },
  { id: "teorico-da-conspiracao", name: "Teórico da Conspiração", skills: ["investigacao", "ocultismo"], power: { id: "eu-ja-sabia", name: "Eu Já Sabia", summary: "Resistência a dano mental igual ao seu Intelecto." }, available: true },
  { id: "ti", name: "T.I.", skills: ["investigacao", "tecnologia"], power: { id: "motor-de-busca", name: "Motor de Busca", summary: "Com acesso à internet, troca testes por Tecnologia." }, available: false },
  { id: "trabalhador-rural", name: "Trabalhador Rural", skills: ["adestramento", "sobrevivencia"], power: { id: "desbravador", name: "Desbravador", summary: "Ignora terreno difícil natural." }, available: false },
  { id: "trambiqueiro", name: "Trambiqueiro", skills: ["crime", "enganacao"], power: { id: "impostor", name: "Impostor", summary: "Substitui testes sociais por Enganação." }, available: false },
  { id: "universitario", name: "Universitário", skills: ["atualidades", "investigacao"], power: { id: "dedicacao", name: "Dedicação", summary: "+1 PE, e +1 PE adicional a cada NEX ímpar." }, available: true },
  { id: "vitima", name: "Vítima", skills: ["reflexos", "vontade"], power: { id: "cicatrizes-psicologicas", name: "Cicatrizes Psicológicas", summary: "+1 de Sanidade para cada 5% de NEX." }, available: true },
];
export const ORIGIN_BY_ID = new Map(ORIGINS.map((o) => [o.id, o]));

/** op-core.progression.nex — the first slice runs at NEX 5%. */
export const SUPPORTED_NEX = [5] as const;

/** op-core.progression.pe-limit — PE spent per turn limited by NEX. */
export function peLimitForNex(nex: number): number {
  return Math.max(1, Math.floor(nex / 5));
}

/** op-core.progression.patente — item limits per category for Recruta. */
export const PATENTES = {
  recruta: { name: "Recruta", minPrestige: 0, itemLimits: { I: 2, II: 0, III: 0, IV: 0 }, credit: "Baixo" },
} as const;

export const BASE_SPEED_METERS = 9;
export const BASE_DEFENSE = 10;
