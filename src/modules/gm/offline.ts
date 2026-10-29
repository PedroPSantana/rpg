import type { Beat } from "@/modules/campaign/engine";
import { normalize } from "@/modules/knowledge/text";
import { SKILLS } from "@/modules/rules/systems/ordem-paranormal/data";
import { parseDice } from "@/modules/rules/core/dice";
import { areaAt, objectsInArea } from "@/modules/world/areas";
import { isPresent } from "@/modules/world/grid";
import type { MapObject } from "@/modules/world/schema";
import type { GmContextInput } from "./context";
import type { GmProvider, NarrateRequest } from "./provider";
import type { Interpretation, Narration } from "./schema";

const EMPTY: Interpretation = {
  intent: "narrative",
  category: null,
  objectId: null,
  areaId: null,
  verb: null,
  skillId: null,
  npcId: null,
  approach: null,
  dt: null,
  reason: null,
  stakes: null,
  optionId: null,
  weaponId: null,
  special: null,
  clarification: null,
  rulesQuery: null,
};

const has = (text: string, ...stems: string[]) => stems.some((s) => new RegExp(`\\b${s}`).test(text));

const VERB_PATTERNS: [Interpretation["verb"], string[]][] = [
  ["force", ["arromb", "forc", "chut", "derrub", "empurr"]],
  ["unlock", ["destranc", "gazua", "chave", "fechadura"]],
  ["close", ["fech"]],
  ["open", ["abr", "abra"]],
  ["take", ["peg", "recolh", "guard"]],
  ["use", ["uso ", "usar", "toc", "ativ"]],
];

/** Careful examination: may require a test if something is hidden. */
const CAREFUL = ["examin", "procur", "vasculh", "investig", "revir", "busc", "analis", "inspecion", "leio", "ler ", "leia", "compar", "estud", "decifr", "fotograf"];
/** Casual looking: never a test. */
const LOOK = ["olh", "observ", "vej", "ver ", "repar", "contempl", "escut", "ouc", "presto atencao", "o que (eu )?vejo", "ao redor", "em volta"];
const MOTION = ["vou ", "ir ", "sigo", "seguir", "entro ", "entrar", "volto", "voltar", "ando ", "caminh", "atravess", "passo ", "passar", "corro", "correr", "desco", "descer", "subo", "subir", "avanco", "avancar", "me dirijo", "dirijo"];
const SOCIAL = ["fal", "convers", "pergunt", "convenc", "persuad", "intimid", "amea", "pression", "ment", "engan", "blef", "fing", "intu", "desconfi", "sinceri", "pec", "ped", "digo", "diz", "cumpriment", "explic", "garant", "prometo", "acalm", "negoci", "ofere", "chamo", "grito para"];
/** Specific roles: if nobody present fits, ask instead of picking someone else. */
const ROLES = ["porteiro", "vigia", "diretor", "professor", "policial", "guarda", "vizinh", "zelador", "testemunha", "sobrinh", "editor", "padre", "medic", "enfermeir"];
const NPC_ID_WORDS: Record<string, string[]> = { testemunha: ["testemunha"], zelador: ["zelador", "zeladora"], morador: ["morador", "moradora"] };

const KIND_WORDS: Record<string, string[]> = {
  door: ["porta", "passagem", "alcapao"],
  exit: ["entrada", "saida", "portao", "predio", "casa", "casarao", "sobrado", "escola", "solar"],
  container: ["gaveta", "caixa", "armario"],
  threat: ["criatura", "coisa", "monstro", "ameaca", "vulto"],
  artifact: ["artefato"],
  npc: [],
  clue: [],
  item: [],
  prop: [],
};

/**
 * Deterministic, keyword-based Game Master used without an API key and in
 * tests. It is intentionally modest: it maps common Portuguese phrasings to
 * structured actions, asks when it cannot tell what the player means, and
 * narrates the engine's beats without inventing anything.
 */
export class OfflineGmProvider implements GmProvider {
  readonly id = "offline";

  async interpret(input: GmContextInput, playerText: string): Promise<Interpretation> {
    return interpretOffline(input, playerText);
  }

  async narrate(req: NarrateRequest): Promise<Narration> {
    return narrateOffline(req);
  }
}

function listPt(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}

export function interpretOffline(input: GmContextInput, playerText: string): Interpretation {
  const text = ` ${normalize(playerText)} `;
  const { blueprint: bp, state, sheet, character } = input;
  const skillId = SKILLS.find((s) => text.includes(` ${normalize(s.name)} `))?.id ?? null;

  if (has(text, "regra", "como funciona", "o que acontece se")) return { ...EMPTY, intent: "narrative", category: "meta", rulesQuery: playerText };

  if (state.mode === "combat") {
    if (has(text, "fug", "fuj", "corr", "escap", "recu", "saio")) return { ...EMPTY, intent: "flee", category: "movement", skillId: has(text, "acrobac", "pul", "rol") ? "acrobacia" : "atletismo" };
    if (has(text, "cur", "socorr", "atadur", "curativ")) return { ...EMPTY, intent: "first_aid", category: "physical" };
    const owned = sheet.attacks.filter((a) => a.weaponId === "desarmado" || character.inventory.some((i) => i.itemId === a.weaponId));
    const named = owned.find((a) => text.includes(normalize(a.name)));
    const best = [...owned].sort((a, b) => avg(b.damage) + b.damageBonus - (avg(a.damage) + a.damageBonus))[0];
    const special = has(text, "especial", "com tudo", "forca total") ? (has(text, "mir", "precis") ? "ataque" : "dano") : "none";
    return { ...EMPTY, intent: "attack", category: "attack", weaponId: (named ?? best).weaponId, special };
  }

  const decisionOpen = state.encountersResolved[bp.encounters[0]?.id] === "victory" && !(bp.decision.id in state.decisions);
  if (decisionOpen) {
    if (has(text, "destru", "queim", "quebr", "esmag", "sobrecarreg", "explod")) return { ...EMPTY, intent: "decide", optionId: "destruir" };
    if (has(text, "sel", "lacr", "rasur", "salg", "deslig", "dar corda")) return { ...EMPTY, intent: "decide", optionId: "selar" };
    if (has(text, "lev", "guard", "fic", "grav")) return { ...EMPTY, intent: "decide", optionId: "levar" };
  }
  if (has(text, "abandon", "desist", "ir embora")) return { ...EMPTY, intent: "abandon", category: "meta" };

  const map = bp.maps.find((m) => m.id === state.currentMapId)!;
  const ms = state.maps[map.id];
  const here = areaAt(map, ms.player);
  const inRoom = new Set(here ? objectsInArea(map, ms, here.id).map((o) => o.id) : []);
  const present = map.objects.filter((o) => isPresent(map, ms, o.id));
  const target = input.targetId ? present.find((o) => o.id === input.targetId) : undefined;
  const dist = (o: MapObject) => Math.max(Math.abs(o.position.x - ms.player.x), Math.abs(o.position.y - ms.player.y));

  // People
  const npcHere = bp.npcs.filter((n) => n.mapId === map.id && state.npcs[n.id].state !== "gone" && state.npcs[n.id].state !== "dead");
  const npcRef =
    (target?.kind === "npc" ? npcHere.find((n) => n.objectId === target.id) : undefined) ??
    npcHere.find((n) => n.name.split(" ").some((part) => part.length > 2 && text.includes(` ${normalize(part)} `))) ??
    npcHere.find((n) => (NPC_ID_WORDS[n.id] ?? []).some((w) => text.includes(` ${w}`))) ??
    npcHere.find((n) => normalize(n.role).split(" ").filter((w) => w.length > 4).some((w) => text.includes(` ${w}`)));
  const quoted = /["“”«»]|^\s*[-—]/.test(playerText);
  const social = quoted || has(text, ...SOCIAL);
  if (social && (npcRef || npcHere.length)) {
    let npc = npcRef;
    if (!npc) {
      const named = ROLES.find((w) => has(text, w));
      const inThisRoom = npcHere.filter((n) => inRoom.has(n.objectId));
      if (named) {
        return { ...EMPTY, intent: "clarify", category: "dialogue", clarification: `Não há ninguém assim por aqui. ${npcHere.length ? `Quem está neste lugar: ${npcHere.map((n) => `${n.name} (${n.role})`).join("; ")}.` : ""} Com quem você quer falar?` };
      }
      if (inThisRoom.length === 1) npc = inThisRoom[0];
      else if (npcHere.length === 1) npc = npcHere[0];
      else return { ...EMPTY, intent: "clarify", category: "dialogue", clarification: `Com quem você fala: ${listPt(npcHere.map((n) => n.name))}?` };
    }
    // Reading someone ("se está mentindo") is checked before lying ("minto").
    const approach: Interpretation["approach"] = has(text, "intimid", "amea", "pression", "exijo", "grito com")
      ? "intimidar"
      : has(text, "intu", "desconfi", "sinceri", "esta mentindo", "se mente", "ler as inten", "observo se", "percebo se", "reparo se")
        ? "intuir"
        : has(text, "ment", "engan", "blef", "fing", "invent")
          ? "enganar"
          : has(text, "convenc", "persuad", "implor", "acalm", "garant", "prometo", "estou aqui para ajud", "negoci", "ofere")
            ? "persuadir"
            : "conversar";
    const category = approach === "conversar" ? (has(text, "pergunt", "quer saber", "se alguem") || playerText.includes("?") ? "question" : "dialogue") : "social";
    return { ...EMPTY, intent: "talk", category, npcId: npc.id, approach, reason: playerText };
  }

  // Rooms of this location
  const areaScore = map.areas
    .filter((a) => !a.hidden || ms.revealedAreas.includes(a.id))
    .map((a) => ({ a, score: normalize(a.name).split(" ").filter((w) => w.length > 3 && text.includes(` ${w}`)).length }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)[0]?.a;
  const exit = present.find((o) => o.kind === "exit");

  // Looking for another way in is observation: the scene lists every known passage.
  if (has(text, "outra entrada", "entrada alternativa", "outro caminho", "outra forma de entrar", "outro jeito de entrar", "procuro uma entrada", "procuro uma passagem")) {
    return { ...EMPTY, intent: "observe", category: has(text, "sem chamar", "escondid", "furtiv", "silencio") ? "stealth" : "observation" };
  }

  // Object references
  const scored = present
    .filter((o) => o.kind !== "npc")
    .map((o) => {
      const nameWords = normalize(o.name).split(" ").filter((w) => w.length > 3);
      let score = nameWords.filter((w) => text.includes(` ${w}`)).length * 2;
      if ((KIND_WORDS[o.kind] ?? []).some((w) => text.includes(` ${w}`))) score += 1.5;
      if (score > 0 && inRoom.has(o.id)) score += 1;
      if (o.id === target?.id) score += 3;
      return { o, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || dist(a.o) - dist(b.o));
  const obj = scored[0]?.o ?? target;

  const motion = has(text, ...MOTION);
  const leaving = has(text, "saio", "sair", "deixo o", "deixo a", "para a rua", "para fora", "la fora");
  if (exit && ((map.kind === "interior" && leaving) || (map.kind === "exterior" && motion && (has(text, "entro", "entrar") || scored[0]?.o.id === exit.id)))) {
    return { ...EMPTY, intent: "interact", category: "movement", objectId: exit.id, verb: "enter" };
  }
  // A room of the other map ("vou para a biblioteca" from the street): the engine walks in through the exit.
  const elsewhere = !areaScore && motion ? bp.maps.filter((m) => m.id !== map.id).flatMap((m) => m.areas.filter((a) => !a.hidden).map((a) => ({ a, score: normalize(a.name).split(" ").filter((w) => w.length > 3 && text.includes(` ${w}`)).length }))).filter((x) => x.score > 0).sort((x, y) => y.score - x.score)[0]?.a : undefined;
  if (elsewhere) return { ...EMPTY, intent: "go", category: "movement", areaId: elsewhere.id };
  if (motion && areaScore && areaScore.id !== here?.id && !(obj && scored[0]?.score >= 2 && obj.kind !== "door")) {
    return { ...EMPTY, intent: "go", category: "movement", areaId: areaScore.id };
  }

  const careful = has(text, ...CAREFUL);
  const looking = has(text, ...LOOK);
  const verb = VERB_PATTERNS.find(([, stems]) => has(text, ...stems))?.[0] ?? null;

  if (obj && verb && obj.verbs.includes(verb)) return { ...EMPTY, intent: "interact", category: "physical", objectId: obj.id, verb, skillId };
  if (obj && careful) {
    const v = obj.verbs.includes("search") ? "search" : obj.verbs.includes("inspect") ? "inspect" : null;
    if (v) return { ...EMPTY, intent: "interact", category: "investigation", objectId: obj.id, verb: v, skillId };
  }
  if (obj && (looking || !verb)) return { ...EMPTY, intent: "observe", category: "observation", objectId: obj.id };
  if (careful || looking) return { ...EMPTY, intent: "observe", category: "observation" };
  if (verb) return { ...EMPTY, intent: "clarify", category: "physical", clarification: "Em que exatamente você quer fazer isso? Diga o nome ou clique no objeto na cena." };
  if (motion && areaScore?.id === here?.id) return { ...EMPTY, intent: "observe", category: "movement" };

  if (skillId && has(text, "tento", "tentar", "uso", "usar")) {
    const skill = SKILLS.find((s) => s.id === skillId)!;
    return { ...EMPTY, intent: "skill_check", category: "physical", skillId, dt: 15, reason: playerText.slice(0, 200), stakes: `Você decidiu arriscar ${skill.name}. Se falhar, a tentativa não dá certo.` };
  }
  return { ...EMPTY, intent: "narrative", category: "meta", reason: playerText };
}

function avg(expr: string) {
  const d = parseDice(expr);
  return d.terms.reduce((s, t) => s + (t.count * (t.sides + 1)) / 2, 0) + d.modifier;
}

const MECHANIC_PREFIXES = ["Teste de", "Você gastou", "Urgência +", "Iniciativa", "Ataque com", "Dano mental", "Ação descritiva", "Teste improvisado", "Você sofre", "Você recupera", "Turno ", "Explorando a fraqueza"];
const PROGRESS_PREFIXES = ["Objetivo cumprido", "Missão", "Item obtido", "Pista registrada", "Fim da investigação", "Recompensas", "Combate contra", "Decisão:", "FIM —", "Pista descoberta"];

/** Older stored actions only kept flat facts; classify them so they read the same way. */
function beatsOf(req: NarrateRequest): Beat[] {
  if (req.outcome.beats) return req.outcome.beats;
  return req.outcome.facts.map((text) => ({
    kind: MECHANIC_PREFIXES.some((p) => text.startsWith(p)) ? "mechanic" : PROGRESS_PREFIXES.some((p) => text.startsWith(p)) ? "progress" : "narration",
    text,
  }));
}

const SPEECH = ["diz", "responde", "murmura", "rebate", "fala"];
const QUIET = ["Nada ao seu redor reage.", "O lugar continua como estava.", "Ninguém reage, e nada muda."];

export function narrateOffline(req: NarrateRequest): Narration {
  const { input } = req;
  const beats = beatsOf(req);
  const parts: string[] = [];
  let danger: string[] = [];
  let speech = input.state.actionCount;
  let introducedTalk = false;
  for (const b of beats) {
    if (b.kind === "mechanic" || b.kind === "progress") continue;
    if (b.kind === "danger") {
      danger.push(b.text);
      continue;
    }
    if (b.kind === "dialogue") {
      const npc = input.blueprint.npcs.find((n) => n.id === b.npcId);
      const who = npc ? npc.name.split(" ")[0] : "a pessoa";
      parts.push(`— ${b.text.replace(/^["“]|["”]$/g, "")} — ${SPEECH[speech++ % SPEECH.length]} ${who}.`);
      continue;
    }
    if (b.kind === "discovery" && req.actionType === "talk" && !introducedTalk) {
      const npcId = (req.outcome.events ?? []).find((e) => e.type === "npc_updated");
      const npc = npcId && "npcId" in npcId ? input.blueprint.npcs.find((n) => n.id === npcId.npcId) : undefined;
      if (npc) parts.push(`${npc.name.split(" ")[0]} pensa um pouco antes de responder e conta o que sabe.`);
      introducedTalk = true;
    }
    parts.push(b.text);
  }
  danger = [...new Set(danger)];
  let narration = [parts.join(" "), danger.join(" ")].filter(Boolean).join("\n\n");
  if (!narration) {
    const recent = input.history.filter((h) => h.role === "GM").slice(-3).map((h) => h.content);
    narration = QUIET.find((q) => !recent.some((r) => r.includes(q))) ?? QUIET[0];
  }
  const effects: Narration["effects"] = danger.length ? ["lights_flicker"] : (req.outcome.events ?? []).some((e) => e.type === "encounter_started") ? ["heartbeat"] : [];
  return {
    narration,
    npcDialogue: [],
    outcome: req.outcome.verdict ?? "none",
    effects,
    gmNotes: "Narração gerada pelo modo offline determinístico.",
  };
}
