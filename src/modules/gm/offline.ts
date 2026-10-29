import { normalize } from "@/modules/knowledge/text";
import { SKILLS } from "@/modules/rules/systems/ordem-paranormal/data";
import { parseDice } from "@/modules/rules/core/dice";
import { isPresent } from "@/modules/world/grid";
import type { GmContextInput } from "./context";
import type { GmProvider, NarrateRequest } from "./provider";
import type { Interpretation, Narration } from "./schema";

const EMPTY: Interpretation = {
  intent: "narrative",
  objectId: null,
  verb: null,
  skillId: null,
  npcId: null,
  approach: null,
  dt: null,
  reason: null,
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
  ["enter", ["entr", "atravess"]],
  ["close", ["fech"]],
  ["open", ["abr", "abra"]],
  ["take", ["peg", "recolh", "guard"]],
  ["use", ["us", "toc", "ativ"]],
  ["search", ["procur", "vasculh", "investig", "revir", "busc", "analis", "examin", "ler", "leia"]],
  ["inspect", ["olh", "observ", "inspecion", "ver", "vej"]],
];

const KIND_WORDS: Record<string, string[]> = {
  door: ["porta", "passagem", "alcapao"],
  exit: ["porta", "entrada", "saida", "portao", "rua"],
  container: ["gaveta", "caixa", "armario"],
  npc: [],
  threat: ["criatura", "coisa", "monstro", "ameaca", "vulto"],
  artifact: ["artefato", "objeto"],
  clue: [],
  item: [],
  prop: [],
};

/**
 * Deterministic, keyword-based Game Master used without an API key and in
 * tests. It is intentionally modest: it maps common Portuguese phrasings to
 * structured actions and narrates authoritative facts without embellishing
 * mechanics.
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

export function interpretOffline(input: GmContextInput, playerText: string): Interpretation {
  const text = normalize(playerText);
  const { blueprint: bp, state, sheet, character } = input;
  const skillId = SKILLS.find((s) => text.includes(normalize(s.name)))?.id ?? null;

  if (has(text, "regra", "como funciona", "o que acontece se")) return { ...EMPTY, intent: "narrative", rulesQuery: playerText };

  if (state.mode === "combat") {
    if (has(text, "fug", "corr", "escap", "recu")) return { ...EMPTY, intent: "flee", skillId: has(text, "acrobac", "pul", "rol") ? "acrobacia" : "atletismo" };
    if (has(text, "cur", "socorr", "atadur", "curativ")) return { ...EMPTY, intent: "first_aid" };
    const owned = sheet.attacks.filter((a) => a.weaponId === "desarmado" || character.inventory.some((i) => i.itemId === a.weaponId));
    const named = owned.find((a) => text.includes(normalize(a.name)));
    const best = [...owned].sort((a, b) => avg(b.damage) + b.damageBonus - (avg(a.damage) + a.damageBonus))[0];
    const special = has(text, "especial", "com tudo", "forca total") ? (has(text, "mir", "precis") ? "ataque" : "dano") : "none";
    return { ...EMPTY, intent: "attack", weaponId: (named ?? best).weaponId, special };
  }

  const decisionOpen = state.encountersResolved[bp.encounters[0]?.id] === "victory" && !(bp.decision.id in state.decisions);
  if (decisionOpen) {
    if (has(text, "destru", "queim", "quebr", "esmag", "sobrecarreg", "explod")) return { ...EMPTY, intent: "decide", optionId: "destruir" };
    if (has(text, "sel", "lacr", "rasur", "salg", "deslig", "dar corda")) return { ...EMPTY, intent: "decide", optionId: "selar" };
    if (has(text, "lev", "guard", "fic", "grav")) return { ...EMPTY, intent: "decide", optionId: "levar" };
  }
  if (has(text, "abandon", "desist", "ir embora")) return { ...EMPTY, intent: "abandon" };

  const map = bp.maps.find((m) => m.id === state.currentMapId)!;
  const ms = state.maps[map.id];
  const present = map.objects.filter((o) => isPresent(map, ms, o.id));
  const dist = (o: (typeof present)[number]) => Math.max(Math.abs(o.position.x - ms.player.x), Math.abs(o.position.y - ms.player.y));

  // Dialogue
  const npcHere = bp.npcs.filter((n) => n.mapId === map.id && state.npcs[n.id].state !== "gone");
  const namedNpc = npcHere.find((n) => n.name.split(" ").some((part) => text.includes(normalize(part))));
  const socialVerb = has(text, "fal", "convers", "pergunt", "convenc", "persuad", "intimid", "amea", "pression", "ment", "engan", "blef", "intu", "desconfi", "sinceri", "pec", "ped");
  if (namedNpc || (socialVerb && npcHere.length)) {
    const npc = namedNpc ?? [...npcHere].sort((a, b) => dist(present.find((o) => o.id === a.objectId)!) - dist(present.find((o) => o.id === b.objectId)!))[0];
    const approach: Interpretation["approach"] = has(text, "intimid", "amea", "pression")
      ? "intimidar"
      : has(text, "ment", "engan", "blef", "fing")
        ? "enganar"
        : has(text, "intu", "desconfi", "sinceri", "esta mentindo", "ler as inten")
          ? "intuir"
          : has(text, "convenc", "persuad", "ped", "implor", "acalm")
            ? "persuadir"
            : "conversar";
    return { ...EMPTY, intent: "talk", npcId: npc.id, approach, reason: playerText };
  }

  // Object interaction
  const verb = VERB_PATTERNS.find(([, stems]) => has(text, ...stems))?.[0] ?? null;
  const scored = present
    .filter((o) => o.kind !== "npc")
    .map((o) => {
      const words = normalize(`${o.name} ${o.description}`).split(" ").filter((w) => w.length > 3);
      let score = words.filter((w) => text.includes(w)).length * 2;
      if ((KIND_WORDS[o.kind] ?? []).some((w) => text.includes(w))) score += 1.5;
      return { o, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || dist(a.o) - dist(b.o));
  let target: (typeof present)[number] | undefined = scored[0]?.o;
  if (!target && verb) target = present.filter((o) => o.verbs.includes(verb)).sort((a, b) => dist(a) - dist(b)).find((o) => dist(o) <= 3);
  if (target) {
    const v = verb && target.verbs.includes(verb) ? verb : target.kind === "clue" ? "search" : target.verbs[0];
    return { ...EMPTY, intent: "interact", objectId: target.id, verb: v, skillId };
  }
  if (verb) return { ...EMPTY, intent: "clarify", clarification: "Em que exatamente você quer fazer isso? Clique no objeto ou diga o nome dele." };

  if (skillId) return { ...EMPTY, intent: "skill_check", skillId, dt: 15, reason: playerText };
  return { ...EMPTY, intent: "narrative", reason: playerText };
}

function avg(expr: string) {
  const d = parseDice(expr);
  return d.terms.reduce((s, t) => s + (t.count * (t.sides + 1)) / 2, 0) + d.modifier;
}

const OPENERS: Record<string, string[]> = {
  exterior: ["A garoa fina insiste em cair.", "Um poste pisca no fim da rua.", "O vento traz um cheiro de terra molhada."],
  interior: ["O assoalho range sob seus pés.", "O ar aqui dentro é parado e frio.", "Em algum cômodo, algo goteja sem ritmo."],
};

export function narrateOffline(req: NarrateRequest): Narration {
  const { input, outcome, playerText } = req;
  const map = input.blueprint.maps.find((m) => m.id === input.state.currentMapId)!;
  const openers = OPENERS[map.kind];
  const opener = openers[(input.state.actionCount + (playerText?.length ?? 0)) % openers.length];
  const facts = outcome?.facts ?? [];
  const dialogue: Narration["npcDialogue"] = [];
  for (const npc of input.blueprint.npcs) {
    const deflect = facts.find((f) => f.startsWith(`${npc.name} não coopera`));
    if (deflect) dialogue.push({ npcId: npc.id, line: npc.deflection });
    else if (facts.some((f) => f.startsWith("Pista descoberta") && f.includes(npc.name)) || facts.some((f) => f.includes(`${npc.name} entrega`))) {
      dialogue.push({ npcId: npc.id, line: "Tá bem... vou contar o que eu sei. Mas não diga que fui eu." });
    }
  }
  const effects: Narration["effects"] = input.state.urgency >= 3 ? ["lights_flicker"] : [];
  const narration = facts.length
    ? [opener, ...facts.filter((f) => !f.startsWith("Teste de") && !f.startsWith("Você gastou")).slice(0, 5)].join(" ")
    : playerText
      ? `${opener} Você ${playerText.trim().replace(/^eu\s+/i, "").replace(/[.!]*$/, "")}. Nada muda de imediato, mas a sensação de estar sendo observado não vai embora.`
      : `${opener} ${input.blueprint.hook}`;
  return {
    narration,
    npcDialogue: dialogue.slice(0, 4),
    suggestions: (outcome?.suggestions ?? []).slice(0, 4),
    effects,
    gmNotes: "Narração gerada pelo modo offline determinístico.",
    memory: null,
  };
}
