import { seededRandom } from "@/modules/rules/core/random";
import { EDITION_ID, SYSTEM_ID } from "@/modules/rules/systems/ordem-paranormal/data";
import { buildMap, type SlotBinding } from "@/modules/world/build";
import { TEMPLATE_BY_ID } from "@/modules/world/templates";
import { ARCHETYPES } from "./content/archetypes";
import { CITIES, FIRST_NAMES, LAST_NAMES, PLACE_NAMES, TIMES } from "./content/pools";
import type { Archetype, Vars } from "./content/types";
import { AdventureBlueprintSchema, type AdventureBlueprint, type Condition, type Fingerprint } from "./schema";

type Rng = ReturnType<typeof seededRandom>;
const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng.next() * list.length)];
function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SEARCH_SKILLS = [
  { primary: "percepcao", alt: "investigacao" },
  { primary: "investigacao", alt: "percepcao" },
] as const;

/**
 * Deterministically generates an original adventure from a seed. Structure
 * varies (archetype, maps, culprit twist, entry lock, key holder, which clue
 * is behind the lock, DTs) — not just names.
 */
export function generateAdventure(seed: string, options: { archetypeId?: string } = {}): { blueprint: AdventureBlueprint; fingerprint: Fingerprint } {
  const rng = seededRandom(`adventure:${seed}`);
  const archetype: Archetype = options.archetypeId ? ARCHETYPES.find((a) => a.id === options.archetypeId)! : pick(rng, ARCHETYPES);
  const extTemplate = TEMPLATE_BY_ID.get(pick(rng, ["ext-rua", "ext-sitio"]))!;
  const intTemplate = TEMPLATE_BY_ID.get(pick(rng, ["int-casarao", "int-escola"]))!;
  const placeKind = intTemplate.id === "int-casarao" ? "casarao" : "escola";

  const culpritTwist = rng.next() < 0.5;
  const names = { f: shuffle(rng, FIRST_NAMES.f), m: shuffle(rng, FIRST_NAMES.m) };
  const lasts = shuffle(rng, LAST_NAMES);
  let lastIdx = 0;
  const person = (g: "f" | "m") => `${names[g].shift()} ${lasts[lastIdx++]}`;
  // Role genders are fixed by the archetype texts; names must agree with them.
  const probe: Vars = { city: "", place: "", placeKind, victim: "", witness: "", caretaker: "", insider: "" };
  const insiderGender = (culpritTwist ? archetype.insider.culprit(probe) : archetype.insider.survivor(probe)).gender;
  const placeName = pick(rng, PLACE_NAMES[placeKind]).replace("{last}", lasts[10]).replace("{first}", names.f[8]);
  const v: Vars = {
    city: pick(rng, CITIES),
    place: placeName,
    placeKind,
    victim: person(archetype.victimGender),
    witness: person(archetype.witness(probe).gender),
    caretaker: person(archetype.caretaker(probe).gender),
    insider: person(insiderGender),
  };

  const entryLocked = rng.next() < 0.6;
  const lockedClue = pick(rng, ["document", "ritual"] as const);
  const searchSkill = pick(rng, SEARCH_SKILLS);
  const dt = (base: number) => base + (rng.next() < 0.3 ? 5 : 0);

  const EXT = "exterior";
  const INT = "interior";
  const id = (map: string, slot: string) => `${map}.${slot}`;

  // ---- Clues -------------------------------------------------------------
  const trace = archetype.clues.trace(v);
  const testimony = archetype.clues.testimony(v);
  const doc = archetype.clues.document(v);
  const passage = archetype.clues.passage(v);
  const ritual = archetype.clues.ritual(v);

  // Interior clue slots: c1, c2, c3. Locked room (behind d2 or the secret door) holds the threat.
  const docSlot = lockedClue === "document" ? "c3" : "c1";
  const ritualSlot = lockedClue === "ritual" ? "c3" : "c1";
  const secretDoor = intTemplate.id === "int-casarao" ? "d5" : "d4";
  const lockedDoor = intTemplate.id === "int-casarao" ? "d2" : "d1";

  const clues: AdventureBlueprint["clues"] = [
    {
      id: "pista-rastro",
      title: trace.title,
      description: trace.description,
      importance: "supporting",
      mapId: EXT,
      objectId: id(EXT, "c1"),
      discovery: [
        { method: "check", skill: searchSkill.primary, dt: dt(10), verb: "search" },
        { method: "check", skill: searchSkill.alt, dt: dt(15), verb: "search" },
      ],
      failure: { urgency: 1, text: trace.failure },
      reveals: { objects: [], flags: [] },
    },
    {
      id: "pista-testemunho",
      title: testimony.title,
      description: testimony.description,
      importance: "supporting",
      mapId: EXT,
      objectId: id(EXT, "n1"),
      discovery: [{ method: "npc", npcId: "testemunha" }],
      failure: { urgency: 0, text: "" },
      reveals: { objects: [], flags: [] },
    },
    {
      id: "pista-documento",
      title: doc.title,
      description: doc.description,
      importance: "essential",
      mapId: INT,
      objectId: id(INT, docSlot),
      discovery: [
        { method: "check", skill: "investigacao", dt: dt(15), verb: "search" },
        { method: "check", skill: "atualidades", dt: 20, verb: "search" },
      ],
      failure: { urgency: 1, text: doc.failure },
      reveals: { objects: [], flags: ["entende-fraqueza-parcial"] },
    },
    {
      id: "pista-passagem",
      title: passage.title,
      description: passage.description,
      importance: "supporting",
      mapId: INT,
      objectId: id(INT, "c2"),
      discovery: [
        { method: "check", skill: "percepcao", dt: dt(15), verb: "search" },
        { method: "check", skill: "investigacao", dt: 20, verb: "search" },
      ],
      failure: { urgency: 1, text: passage.failure },
      reveals: { objects: [id(INT, secretDoor)], flags: [] },
    },
    {
      id: "pista-ritual",
      title: ritual.title,
      description: ritual.description,
      importance: "essential",
      mapId: INT,
      objectId: id(INT, ritualSlot),
      discovery: [
        { method: "check", skill: "ocultismo", dt: dt(10), verb: "inspect" },
        { method: "check", skill: "religiao", dt: 15, verb: "inspect" },
        { method: "check", skill: "investigacao", dt: 20, verb: "inspect" },
      ],
      failure: { urgency: 1, text: ritual.failure },
      reveals: { objects: [], flags: ["entende-fraqueza-parcial"] },
    },
  ];

  const weaknessFlag = "conhece-fraqueza";

  // ---- NPCs --------------------------------------------------------------
  const witnessText = archetype.witness(v);
  const caretakerText = archetype.caretaker(v);
  const insiderText = culpritTwist ? archetype.insider.culprit(v) : archetype.insider.survivor(v);
  const npcs: AdventureBlueprint["npcs"] = [
    { id: "testemunha", name: v.witness, ...omitGender(witnessText), mapId: EXT, objectId: id(EXT, "n1"), disposition: pick(rng, [-1, 0, 1]), knows: ["pista-testemunho"], persuasion: { options: [{ skill: "diplomacia", dt: 10 }, { skill: "intimidacao", dt: 15 }, { skill: "enganacao", dt: 15 }] }, isCulprit: false },
    { id: "zelador", name: v.caretaker, ...omitGender(caretakerText), mapId: EXT, objectId: id(EXT, "n2"), disposition: entryLocked ? -1 : 0, knows: [], persuasion: { options: [{ skill: "diplomacia", dt: 15 }, { skill: "intimidacao", dt: 15 }] }, isCulprit: false, gives: entryLocked ? "chave-entrada" : "kit-improvisado" },
    {
      id: "morador",
      name: v.insider,
      ...omitGender(insiderText),
      mapId: INT,
      objectId: id(INT, "n1"),
      disposition: culpritTwist ? -2 : 0,
      knows: [lockedClue === "document" ? "pista-ritual" : "pista-documento"],
      persuasion: { options: culpritTwist ? [{ skill: "intuicao", dt: 15 }, { skill: "intimidacao", dt: 20 }] : [{ skill: "diplomacia", dt: 10 }, { skill: "intuicao", dt: 10 }] },
      isCulprit: culpritTwist,
      gives: "chave-quarto",
    },
  ];

  // ---- Items -------------------------------------------------------------
  const items: AdventureBlueprint["items"] = [
    { id: "chave-entrada", name: "Chave da entrada", description: `Uma chave antiga com etiqueta: "${v.place}".`, mapId: EXT, objectId: "", effect: "key", opens: id(EXT, "x1") },
    { id: "kit-improvisado", name: "Ataduras e analgésicos", description: "Primeiros socorros improvisados.", mapId: EXT, objectId: "", effect: "heal" },
    { id: "pe-de-cabra", name: "Pé de cabra", description: "Ferramenta pesada, ideal para forçar portas (+5 em testes para arrombar).", mapId: EXT, objectId: id(EXT, "k1"), effect: "bonus-force" },
    { id: "chave-quarto", name: "Chave pequena de latão", description: "Abre a porta trancada do interior.", mapId: INT, objectId: id(INT, "k1"), effect: "key", opens: id(INT, lockedDoor) },
  ];

  // ---- Maps --------------------------------------------------------------
  const threatText = archetype.threat;
  const artifact = archetype.artifact(v);
  const npcBinding = (n: (typeof npcs)[number]): SlotBinding => ({ kind: "npc", name: n.name, description: `${n.role[0].toUpperCase()}${n.role.slice(1)}.`, model: n.isCulprit ? "npc-calm" : "npc", initialState: "idle", verbs: ["talk", "inspect"] });
  const clueBinding = (c: (typeof clues)[number], obj: { name: string; description: string; model: string }): SlotBinding => ({ kind: "clue", name: obj.name, description: obj.description, model: obj.model, initialState: "untouched", verbs: ["inspect", "search"] });

  const exterior = buildMap(extTemplate, {
    id: EXT,
    name: `${extTemplate.name} — ${v.city}`,
    exitTo: { mapId: INT, spawn: "exit" },
    exitName: `Entrada ${placeOf(v)}`,
    bindings: {
      c1: clueBinding(clues[0], trace.object),
      n1: npcBinding(npcs[0]),
      n2: npcBinding(npcs[1]),
      k1: { kind: "container", name: "Caixa de ferramentas largada", description: "Uma caixa de metal enferrujada.", model: "toolbox", initialState: "closed", verbs: ["open", "search", "inspect"] },
    },
  });
  const interior = buildMap(intTemplate, {
    id: INT,
    name: v.place,
    exitTo: { mapId: EXT, spawn: "exit" },
    exitName: "Porta da rua",
    bindings: {
      [docSlot]: clueBinding(clues[2], doc.object),
      c2: clueBinding(clues[3], passage.object),
      [ritualSlot]: clueBinding(clues[4], ritual.object),
      n1: npcBinding(npcs[2]),
      t1: { kind: "threat", name: threatText.name, description: "Algo se move na escuridão.", model: `threat-${archetype.element.toLowerCase()}`, initialState: "dormant", verbs: ["inspect"] },
      a1: { kind: "artifact", name: artifact.name, description: artifact.description, model: artifact.model, initialState: "intact", verbs: ["inspect", "use"] },
      k1: { kind: "container", name: "Gaveta emperrada", description: "Uma gaveta que não abre direito.", model: "drawer", initialState: "closed", verbs: ["open", "search", "inspect"] },
    },
  });
  // Entry lock is part of the generated structure.
  if (entryLocked) exterior.objects.find((o) => o.kind === "exit")!.initialState = "locked";

  // ---- Threat & encounter -----------------------------------------------
  const threatId = `ameaca-${archetype.id}`;
  const threats: AdventureBlueprint["threats"] = [
    {
      ...threatText,
      id: threatId,
      provenance: "original",
      weakness: { flag: weaknessFlag, description: threatText.weakness.description, defensePenalty: 5, ignoresResistance: true },
    },
  ];
  const encounters = [{ id: "confronto", threatId, mapId: INT, objectId: id(INT, "t1"), triggerArea: "covil", intro: `${threatText.description}` }];

  // ---- Quests ------------------------------------------------------------
  const allClues = clues.map((c) => c.id);
  const quests: AdventureBlueprint["quests"] = [
    {
      id: "missao-principal",
      title: `Investigar ${placeThe(v)}`,
      description: archetype.hook(v),
      optional: false,
      objectives: [
        { id: "chegar", text: `Entrar ${placeIn(v)}`, when: { visited: INT }, optional: false },
        { id: "entender", text: "Descobrir a fraqueza da entidade", when: { flag: weaknessFlag }, optional: true },
        { id: "confrontar", text: `Enfrentar ${archetype.antagonist(v).name}`, when: { encounter: { id: "confronto" } }, optional: false },
        { id: "decidir", text: `Decidir o destino do ${artifact.name.toLowerCase()}`, when: { decision: { id: "destino-artefato" } }, optional: false },
      ],
      failWhen: { any: [{ flag: "personagem-caido" }, { encounter: { id: "confronto", outcome: "fled" } }] },
    },
    {
      id: "missao-vitima",
      title: `Encontrar ${v.victim}`,
      description: `${v.victim} pode estar viva. Cada minuto conta.`,
      optional: true,
      objectives: [
        { id: "ouvir", text: "Conversar com quem viu algo", when: { npcTalked: "testemunha" }, optional: true },
        { id: "salvar", text: `Resolver o caso antes que seja tarde para ${v.victim}`, when: { flag: "vitima-salva" }, optional: false },
      ],
      failWhen: { flag: "vitima-perdida" },
    },
  ];

  // ---- Decision & endings -----------------------------------------------
  const dec = archetype.decision(v);
  const decision: AdventureBlueprint["decision"] = {
    id: "destino-artefato",
    prompt: dec.prompt,
    mapId: INT,
    objectId: id(INT, "a1"),
    availableWhen: { encounter: { id: "confronto", outcome: "victory" } },
    options: [
      { id: "destruir", label: dec.destroy.label, description: dec.destroy.description, setsFlags: ["artefato-destruido"], artifactState: "destroyed" },
      { id: "selar", label: dec.seal.label, description: dec.seal.description, requiresFlag: weaknessFlag, check: { skill: "ocultismo", dt: 15 }, setsFlags: ["artefato-selado"], artifactState: "sealed" },
      { id: "levar", label: dec.take.label, description: dec.take.description, setsFlags: ["artefato-levado", "corrompido"], artifactState: "taken" },
    ],
  };
  const e = archetype.endings(v);
  const saved: Condition = { flag: "vitima-salva" };
  const endings: AdventureBlueprint["endings"] = [
    { id: "derrota", title: "Perdido para o Outro Lado", tone: "derrota", priority: 100, when: { flag: "personagem-caido" }, summary: e.defeat, rewards: { prestige: 0, nexGain: 0, note: "Missão fracassada." } },
    { id: "fuga", title: "A porta se fecha", tone: "derrota", priority: 90, when: { encounter: { id: "confronto", outcome: "fled" } }, summary: e.fled, rewards: { prestige: 0, nexGain: 0, note: "A ameaça continua ativa." } },
    { id: "destruido-salvo", title: "Silêncio, enfim", tone: "vitoria", priority: 50, when: { all: [{ decision: { id: "destino-artefato", option: "destruir" } }, saved] }, summary: e.destroyed, rewards: { prestige: 10, nexGain: 5, note: "Vítima resgatada." } },
    { id: "destruido-tarde", title: "Tarde demais", tone: "agridoce", priority: 40, when: { decision: { id: "destino-artefato", option: "destruir" } }, summary: e.destroyedLate, rewards: { prestige: 5, nexGain: 5, note: "A ameaça foi destruída, mas houve perdas." } },
    { id: "selado", title: "Contenção", tone: "vitoria", priority: 45, when: { decision: { id: "destino-artefato", option: "selar" } }, summary: e.sealed, rewards: { prestige: 15, nexGain: 5, note: "Artefato contido para estudo." } },
    { id: "levado", title: "Algo veio junto", tone: "agridoce", priority: 30, when: { decision: { id: "destino-artefato", option: "levar" } }, summary: e.taken, rewards: { prestige: 0, nexGain: 5, note: "Você carrega um item paranormal não registrado." } },
  ];

  const urgencyText = archetype.urgency(v);
  const locks: AdventureBlueprint["locks"] = [
    ...(entryLocked ? [{ mapId: EXT, objectId: id(EXT, "x1"), keyItem: "chave-entrada", pick: { skill: "crime", dt: 15 }, force: { skill: "atletismo", dt: 15 }, noiseUrgency: 1 }] : []),
    { mapId: INT, objectId: id(INT, lockedDoor), keyItem: "chave-quarto", pick: { skill: "crime", dt: 15 }, force: { skill: "atletismo", dt: dt(15) }, noiseUrgency: 1 },
  ];

  const ant = archetype.antagonist(v);
  const blueprint = AdventureBlueprintSchema.parse({
    schemaVersion: 1,
    id: `aventura-${seed}`,
    seed,
    systemId: SYSTEM_ID,
    editionId: EDITION_ID,
    archetype: archetype.id,
    title: archetype.title(v),
    premise: archetype.premise(v),
    hook: archetype.hook(v),
    setting: { city: v.city, place: v.place, time: pick(rng, TIMES) },
    antagonist: ant,
    maps: [exterior, interior],
    startMapId: EXT,
    npcs,
    clues,
    items,
    threats,
    encounters,
    quests,
    decision,
    endings,
    urgency: {
      max: 6,
      effects: [
        { at: 3, text: urgencyText.half, flag: "urgencia-media" },
        { at: 5, text: `Você sente que ${v.victim} não vai aguentar muito mais.`, flag: "vitima-perdida" },
        { at: 6, text: urgencyText.full, flag: "ameaca-cacando" },
      ],
    },
    hypotheses: [
      { id: "h-fraqueza", text: `${ant.name[0].toUpperCase()}${ant.name.slice(1)} tem um ponto fraco ligado ao ritual.`, supportedBy: ["pista-documento", "pista-ritual"] },
      { id: "h-culpado", text: `${v.insider} sabe mais do que diz.`, supportedBy: culpritTwist ? ["pista-testemunho", "pista-documento"] : [] },
      { id: "h-passagem", text: "Existe outro caminho até o cômodo trancado.", supportedBy: ["pista-passagem"] },
    ],
    derivedFlags: [
      {
        flag: weaknessFlag,
        when: {
          any: [
            { cluesFound: { min: 2, of: ["pista-documento", "pista-ritual"] } },
            { all: [{ cluesFound: { min: 1, of: ["pista-documento", "pista-ritual"] } }, { cluesFound: { min: 3, of: allClues } }] },
          ],
        },
      },
    ],
    locks,
  });

  const fingerprint: Fingerprint = {
    archetype: archetype.id,
    city: v.city,
    maps: [extTemplate.id, intTemplate.id],
    antagonist: ant.name,
    npcNames: [v.victim, v.witness, v.caretaker, v.insider],
    twist: `${culpritTwist ? "culpado-interno" : "sobrevivente"}|${entryLocked ? "entrada-trancada" : "entrada-livre"}|${lockedClue}`,
  };
  return { blueprint, fingerprint };
}

function omitGender<T extends { gender: string }>(r: T): Omit<T, "gender"> {
  const { gender: _g, ...rest } = r;
  void _g;
  return rest;
}

const placeIn = (v: Vars) => (v.placeKind === "casarao" ? `no ${v.place}` : `na ${v.place}`);
const placeOf = (v: Vars) => (v.placeKind === "casarao" ? `do ${v.place}` : `da ${v.place}`);
const placeThe = (v: Vars) => (v.placeKind === "casarao" ? `o ${v.place}` : `a ${v.place}`);

/** 0..1 similarity between two campaign fingerprints. */
export function similarity(a: Fingerprint, b: Fingerprint): number {
  let s = 0;
  if (a.archetype === b.archetype) s += 0.45;
  if (a.city === b.city) s += 0.1;
  if (a.maps.join() === b.maps.join()) s += 0.15;
  if (a.twist === b.twist) s += 0.15;
  const sharedNames = a.npcNames.filter((n) => b.npcNames.includes(n)).length;
  s += Math.min(0.15, sharedNames * 0.05);
  return s;
}

/**
 * Generates a campaign that differs from previous ones: retries with derived
 * seeds and prefers unused archetypes until all have been played.
 */
export function generateNovelAdventure(seed: string, previous: Fingerprint[], maxAttempts = 24) {
  const used = new Set(previous.map((p) => p.archetype));
  const unused = ARCHETYPES.map((a) => a.id).filter((id) => !used.has(id));
  let best: ReturnType<typeof generateAdventure> | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < maxAttempts; i++) {
    const attemptSeed = i === 0 ? seed : `${seed}~${i}`;
    const archetypeId = unused.length ? unused[i % unused.length] : undefined;
    const candidate = generateAdventure(attemptSeed, { archetypeId });
    const score = previous.length ? Math.max(...previous.map((p) => similarity(candidate.fingerprint, p))) : 0;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (score < 0.5) break;
  }
  return { ...best!, similarity: bestScore };
}
