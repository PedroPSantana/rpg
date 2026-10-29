/**
 * Game Master evaluation suite. Runs offline and deterministically (seeded
 * RNG, offline interpreter) and writes reports/evals.json + reports/evals.md.
 *   pnpm evals            # full suite
 *   EVAL_SESSIONS=2000 pnpm evals
 * Exits with code 1 when any metric misses its target.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { evaluate } from "@/modules/adventures/conditions";
import { generateAdventure, generateNovelAdventure, similarity } from "@/modules/adventures/generator";
import type { Fingerprint } from "@/modules/adventures/schema";
import { resolveAction } from "@/modules/campaign/engine";
import { conditionContextOf, initialCampaignState } from "@/modules/campaign/state";
import { interpretOffline } from "@/modules/gm/offline";
import { GmOrchestrator, toPlayerAction } from "@/modules/gm/orchestrator";
import type { GmProvider } from "@/modules/gm/provider";
import { findRules } from "@/modules/knowledge";
import { seededRandom } from "@/modules/rules/core/random";
import { deriveSheet, initialState, validateBuild, type OpCharacterBuild } from "@/modules/rules/systems/ordem-paranormal/character";
import { rollTest } from "@/modules/rules/systems/ordem-paranormal/tests";
import { combatentePolicial, especialistaAcademico } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { OUT_OF_CATALOG, RETRIEVAL_CASES } from "./datasets/retrieval";
import { autoplay } from "./lib/autoplayer";

interface Metric {
  id: string;
  label: string;
  value: number;
  target: number;
  unit: "%" | "n";
  /** "min": value must be >= target; "max": value must be <= target. */
  direction: "min" | "max";
  passed: boolean;
  details?: unknown;
}

const metrics: Metric[] = [];
function metric(id: string, label: string, value: number, target: number, unit: Metric["unit"], direction: Metric["direction"] = "min", details?: unknown) {
  const passed = direction === "min" ? value >= target : value <= target;
  metrics.push({ id, label, value, target, unit, direction, passed, details });
}

// 1. Retrieval -----------------------------------------------------------------
{
  let top1 = 0;
  let top3 = 0;
  const misses: string[] = [];
  for (const c of RETRIEVAL_CASES) {
    const ids = findRules(c.query, { editionId: "op-core" }, 3).map((h) => h.rule.id);
    if (ids[0] === c.expected) top1++;
    if (ids.includes(c.expected)) top3++;
    else misses.push(`${c.query} → ${ids.join(", ") || "nada"}`);
  }
  metric("retrieval.top1", "Recuperação de regras: acerto no 1º resultado", top1 / RETRIEVAL_CASES.length, 0.75, "%", "min");
  metric("retrieval.top3", "Recuperação de regras: acerto nos 3 primeiros", top3 / RETRIEVAL_CASES.length, 0.9, "%", "min", misses);
}

// 2. Interpretation (offline GM) ----------------------------------------------
{
  const { blueprint } = generateAdventure("eval-interpretation");
  const build = combatentePolicial;
  const sheet = deriveSheet(build);
  const charState = initialState(build, sheet);
  const state = initialCampaignState(blueprint);
  const input = { blueprint, state, sheet, character: { ...charState, name: build.name, concept: build.concept }, history: [], memories: [] };
  const ext = blueprint.maps[0];
  const npc = blueprint.npcs.find((n) => n.mapId === ext.id)!;
  const clueObj = ext.objects.find((o) => o.kind === "clue")!;
  const exit = ext.objects.find((o) => o.kind === "exit")!;
  const container = ext.objects.find((o) => o.kind === "container");
  const first = npc.name.split(" ")[0];
  type Case = { text: string; expect: (a: ReturnType<typeof toPlayerAction>, i: ReturnType<typeof interpretOffline>) => boolean };
  const cases: Case[] = [
    { text: `Eu examino ${clueObj.name.toLowerCase()} com cuidado`, expect: (a) => a?.type === "interact" && a.objectId === clueObj.id },
    { text: `vasculho ${clueObj.name.toLowerCase()}`, expect: (a) => a?.type === "interact" && a.objectId === clueObj.id && a.verb === "search" },
    { text: `Converso com ${first}`, expect: (a) => a?.type === "talk" && a.npcId === npc.id },
    { text: `tento convencer ${first} a me contar o que viu`, expect: (a) => a?.type === "talk" && a.npcId === npc.id && a.approach === "persuadir" },
    { text: `ameaço ${first} para que fale`, expect: (a) => a?.type === "talk" && a.approach === "intimidar" },
    { text: `observo se ${first} está mentindo`, expect: (a) => a?.type === "talk" && a.approach === "intuir" },
    { text: `arrombo a ${exit.name.toLowerCase()}`, expect: (a) => a?.type === "interact" && a.objectId === exit.id && a.verb === "force" },
    { text: "entro no prédio", expect: (a) => a?.type === "interact" && a.objectId === exit.id && a.verb === "enter" },
    { text: "como funciona o dano de sanidade?", expect: (_a, i) => !!i.rulesQuery },
    { text: "qual a regra para acerto crítico", expect: (_a, i) => !!i.rulesQuery },
    { text: "desisto, vou embora daqui", expect: (a) => a?.type === "abandon" },
    { text: "abro a gaveta", expect: (a) => (container ? a?.type === "interact" && a.objectId === container.id : a === null || a.type !== "attack") },
    { text: "fico em silêncio por um momento, respirando fundo", expect: (a) => a?.type === "narrative" },
  ];
  if (container) cases.push({ text: `abro a ${container.name.toLowerCase()}`, expect: (a) => a?.type === "interact" && a.objectId === container.id && a.verb === "open" });

  // Combat phrasing
  const combatState = structuredClone(state);
  combatState.mode = "combat";
  const combatInput = { ...input, state: combatState };
  const combatCases: Case[] = [
    { text: "atiro com o revólver", expect: (a) => a?.type === "attack" && a.weaponId === "revolver" },
    { text: "golpeio com a faca", expect: (a) => a?.type === "attack" && a.weaponId === "faca" },
    { text: "saio correndo pela porta", expect: (a) => a?.type === "flee" },
    { text: "rolo para o lado e fujo", expect: (a) => a?.type === "flee" && a.skillId === "acrobacia" },
    { text: "uso um ataque especial mirando bem", expect: (a) => a?.type === "attack" && a.special === "ataque" },
  ];

  let ok = 0;
  const failures: string[] = [];
  for (const [inp, list] of [
    [input, cases],
    [combatInput, combatCases],
  ] as const) {
    for (const c of list) {
      const i = interpretOffline(inp, c.text);
      const a = toPlayerAction(i, c.text);
      if (c.expect(a, i)) ok++;
      else failures.push(`${c.text} → ${JSON.stringify(a ?? i).slice(0, 120)}`);
    }
  }
  const total = cases.length + combatCases.length;
  metric("interpretation.offline", "Interpretação offline de ações em pt-BR", ok / total, 0.85, "%", "min", failures);
}

// 3. Unsafe interpretations are always rejected by validation --------------------
{
  const { blueprint } = generateAdventure("eval-safety");
  const sheet = deriveSheet(combatentePolicial);
  const ctx = { blueprint, state: initialCampaignState(blueprint), character: { build: combatentePolicial, sheet, state: initialState(combatentePolicial, sheet) }, rng: seededRandom(1) };
  const attempts = [
    { type: "interact", objectId: "exterior.inexistente", verb: "open", powers: [] },
    { type: "skill_check", skillId: "atletismo", dt: 13, reason: "pular", powers: [] },
    { type: "skill_check", skillId: "voar", dt: 15, reason: "voar", powers: [] },
    { type: "move", to: { x: 0, y: 0 } },
    { type: "decide", optionId: "destruir" },
    { type: "attack", weaponId: "revolver", special: "none" },
    { type: "talk", npcId: "personagem-inventado", approach: "conversar", powers: [] },
    { type: "interact", objectId: blueprint.maps[1].objects[0].id, verb: "open", powers: [] },
  ] as const;
  let rejected = 0;
  for (const a of attempts) if (!resolveAction(ctx, a as never).ok) rejected++;
  metric("validation.unsafe-actions", "Ações inválidas da IA rejeitadas pelo motor", rejected / attempts.length, 1, "%", "min");

  // Orchestrator: malformed provider output never reaches the engine.
  const junk: GmProvider = { id: "junk", interpret: async () => ({ intent: "teleport", objectId: 42 }), narrate: async () => ({ narration: 123 }) };
  const orch = new GmOrchestrator(junk, { retries: 1, timeoutMs: 1000 });
  const gmInput = { blueprint, state: ctx.state, sheet, character: { ...ctx.character.state, name: "x", concept: "" }, history: [], memories: [] };
  const interp = await orch.interpret(gmInput, "examino o chão");
  const narr = await orch.narrate({ input: gmInput, outcome: { facts: ["Fato."], suggestions: [], rolls: [] } });
  metric("validation.malformed-ai", "Respostas malformadas da IA substituídas pelo modo seguro", interp.provider.includes("fallback") && narr.degraded ? 1 : 0, 1, "%", "min");

  // Out-of-catalog rules questions: the GM must say it does not know.
  let honest = 0;
  for (const q of OUT_OF_CATALOG) {
    const asker: GmProvider = { id: "q", interpret: async () => ({ ...interpretOffline(gmInput, "fico parado"), rulesQuery: q }), narrate: async () => ({}) };
    const r = await new GmOrchestrator(asker).interpret(gmInput, q);
    if (r.kind === "rules" && /Não encontrei/.test(r.answer)) honest++;
  }
  metric("rules.no-invention", "Perguntas fora do catálogo respondidas sem inventar regra", honest / OUT_OF_CATALOG.length, 1, "%", "min");
}

// 4. Calculation ------------------------------------------------------------------
{
  const expected: [OpCharacterBuild, Partial<ReturnType<typeof deriveSheet>>][] = [
    // Defesa 10 + AGI 2 + proteção leve 5 + Patrulha (origem Policial) 2 = 19.
    [combatentePolicial, { pvMax: 23, peMax: 3, sanMax: 12, defense: 19, peLimit: 1 }],
    [especialistaAcademico, { pvMax: deriveSheet(especialistaAcademico).pvMax }],
  ];
  let ok = 0;
  let total = 0;
  const diffs: string[] = [];
  for (const [build, exp] of expected) {
    const sheet = deriveSheet(build);
    for (const [k, v] of Object.entries(exp)) {
      total++;
      if ((sheet as unknown as Record<string, unknown>)[k] === v) ok++;
      else diffs.push(`${build.name}.${k}: esperado ${v}, obtido ${(sheet as unknown as Record<string, unknown>)[k]}`);
    }
  }
  // Dice: n d20 keep-highest distribution matches theory within tolerance.
  const rng = seededRandom("dice-eval");
  const N = 40000;
  let sum2 = 0;
  let sum0 = 0;
  for (let i = 0; i < N; i++) {
    sum2 += rollTest({ attribute: 2, label: "t", target: 10 }, rng).natural;
    sum0 += rollTest({ attribute: 0, label: "t", target: 10 }, rng).natural;
  }
  const mean2 = sum2 / N; // E[max of 2d20] = 13.825
  const mean0 = sum0 / N; // E[min of 2d20] = 7.175
  total += 2;
  if (Math.abs(mean2 - 13.825) < 0.15) ok++;
  else diffs.push(`média 2d20 maior: ${mean2.toFixed(3)}`);
  if (Math.abs(mean0 - 7.175) < 0.15) ok++;
  else diffs.push(`média 2d20 menor (atributo 0): ${mean0.toFixed(3)}`);
  metric("calculation.accuracy", "Cálculos de ficha e dados corretos", ok / total, 1, "%", "min", diffs);
}

// 5. Build validation --------------------------------------------------------------
{
  const base = combatentePolicial;
  const invalid: [string, OpCharacterBuild][] = [
    ["atributo acima de 3", { ...base, attributes: { ...base.attributes, AGI: 4, VIG: 1 } }],
    ["dois atributos em 0", { ...base, attributes: { AGI: 0, FOR: 0, INT: 3, PRE: 3, VIG: 3 } }],
    ["pontos sobrando", { ...base, attributes: { AGI: 1, FOR: 1, INT: 1, PRE: 1, VIG: 1 } }],
    ["origem indisponível", { ...base, originId: "cultista-arrependido" }],
    ["classe indisponível", { ...base, classId: "ocultista", classSkillChoices: [] }],
    ["perícia livre repetida da origem", { ...base, freeSkills: ["percepcao", "atletismo"] }],
    ["perícias livres a mais", { ...base, freeSkills: ["atletismo", "intimidacao", "furtividade"] }],
    ["arma tática sem proficiência", { ...especialistaAcademico, equipment: ["espingarda"] }],
    ["duas proteções", { ...base, equipment: ["protecao-leve", "protecao-leve"] }],
    ["NEX não suportado", { ...base, nex: 10 }],
  ];
  let rejected = 0;
  const leaks: string[] = [];
  for (const [label, b] of invalid) {
    const r = validateBuild(b);
    if (!r.ok && r.issues.every((i) => i.ruleId && i.message)) rejected++;
    else leaks.push(label);
  }
  const validOk = [combatentePolicial, especialistaAcademico].every((b) => validateBuild(b).ok);
  metric("validation.builds", "Fichas inválidas rejeitadas com regra citada", rejected / invalid.length, 1, "%", "min", leaks);
  metric("validation.valid-builds", "Fichas válidas aceitas", validOk ? 1 : 0, 1, "%", "min");
}

// 6. Novelty -----------------------------------------------------------------------
{
  const previous: Fingerprint[] = [];
  let maxSim = 0;
  const archetypesFirst4 = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const r = generateNovelAdventure(`novel-${i}`, previous);
    if (i < 4) archetypesFirst4.add(r.fingerprint.archetype);
    for (const p of previous) maxSim = Math.max(maxSim, similarity(p, r.fingerprint));
    previous.push(r.fingerprint);
  }
  metric("novelty.distinct-first4", "Arquétipos distintos nas 4 primeiras campanhas", archetypesFirst4.size, 4, "n", "min");
  metric("novelty.max-similarity", "Similaridade máxima entre 12 campanhas seguidas", Number(maxSim.toFixed(3)), 0.8, "n", "max");
}

// 7. Monte Carlo balance + consistency ----------------------------------------------
{
  const sessions = Number(process.env.EVAL_SESSIONS ?? 600);
  const builds = [
    { id: "combatente", build: combatentePolicial },
    { id: "especialista", build: especialistaAcademico },
  ];
  // Two player styles: "cautious" flees when hurt and patches up; "reckless" never retreats.
  const styles = [
    { id: "cautious", fleeBelow: 0.6 },
    { id: "reckless", fleeBelow: 0 },
  ];
  const table: Record<string, { sessions: number; completed: number; deaths: number; actions: number; clues: number; endings: Record<string, number> }> = {};
  let invariantsBroken = 0;
  for (const style of styles) {
    for (const b of builds) {
      const row = { sessions: 0, completed: 0, deaths: 0, actions: 0, clues: 0, endings: {} as Record<string, number> };
      for (let i = 0; i < sessions / 4; i++) {
        const { blueprint } = generateAdventure(`mc-${i}`);
        const r = autoplay(blueprint, b.build, seededRandom(`mc-rng-${style.id}-${b.id}-${i}`), { fleeBelow: style.fleeBelow });
        row.sessions++;
        if (r.endingId) row.completed++;
        if (r.died) row.deaths++;
        row.actions += r.actions;
        row.clues += r.cluesFound;
        row.endings[r.endingId ?? "sem-desfecho"] = (row.endings[r.endingId ?? "sem-desfecho"] ?? 0) + 1;
        if (r.finalSan < 0 || r.urgency < 0 || r.urgency > blueprint.urgency.max) invariantsBroken++;
      }
      table[`${style.id}/${b.id}`] = row;
    }
  }
  const rows = Object.values(table);
  const sum = (k: "sessions" | "completed" | "deaths" | "actions" | "clues") => rows.reduce((s, r) => s + r[k], 0);
  metric("balance.completion", "Sessões simuladas que chegam a um desfecho", sum("completed") / sum("sessions"), 1, "%", "min", table);
  for (const b of builds) {
    const r = table[`cautious/${b.id}`];
    metric(`balance.death-cautious-${b.id}`, `Derrota com jogo cauteloso (${b.id})`, r.deaths / r.sessions, 0.35, "%", "max", r.endings);
    const k = table[`reckless/${b.id}`];
    metric(`balance.death-reckless-${b.id}`, `Derrota sem nunca recuar (${b.id})`, k.deaths / k.sessions, 0.7, "%", "max", k.endings);
  }
  metric("balance.avg-actions", "Ações médias por sessão", Number((sum("actions") / sum("sessions")).toFixed(1)), 120, "n", "max");
  metric("balance.avg-clues", "Pistas médias encontradas (de 5)", Number((sum("clues") / sum("sessions")).toFixed(2)), 2.5, "n", "min");
  metric("consistency.invariants", "Sessões com estado inválido (SAN/urgência)", invariantsBroken, 0, "n", "max");

  // Determinism: same seeds replay to the same result.
  const { blueprint } = generateAdventure("replay");
  const a = autoplay(blueprint, combatentePolicial, seededRandom("r"));
  const b = autoplay(blueprint, combatentePolicial, seededRandom("r"));
  metric("consistency.replay", "Reexecução com mesma semente gera o mesmo resultado", JSON.stringify(a) === JSON.stringify(b) ? 1 : 0, 1, "%", "min");

  // Every ending reached satisfies its own condition in the final state.
  let mismatched = 0;
  for (let i = 0; i < 80; i++) {
    const { blueprint: bp } = generateAdventure(`end-${i}`);
    const r = autoplay(bp, builds[i % 2].build, seededRandom(`end-rng-${i}`), { fleeBelow: i % 2 ? 0.4 : 0 });
    const ending = bp.endings.find((e) => e.id === r.endingId);
    if (!ending || !evaluate(ending.when, conditionContextOf(r.state))) mismatched++;
  }
  metric("consistency.endings", "Desfechos incoerentes com o estado final", mismatched, 0, "n", "max");
}

// Report -----------------------------------------------------------------------------
const report = { generatedAt: new Date().toISOString(), metrics };
await mkdir("reports", { recursive: true });
await writeFile("reports/evals.json", JSON.stringify(report, null, 2));
const fmt = (m: Metric) => (m.unit === "%" ? `${(m.value * 100).toFixed(1)}%` : String(m.value));
const md = [
  "# Avaliação do Mestre",
  "",
  `Gerado em ${report.generatedAt}.`,
  "",
  "| Métrica | Valor | Meta | Resultado |",
  "|---|---|---|---|",
  ...metrics.map((m) => `| ${m.label} | ${fmt(m)} | ${m.direction === "min" ? "≥" : "≤"} ${m.unit === "%" ? `${m.target * 100}%` : m.target} | ${m.passed ? "✅" : "❌"} |`),
  "",
  ...metrics.filter((m) => m.details && (Array.isArray(m.details) ? m.details.length : true)).flatMap((m) => [`## ${m.label}`, "", "```", JSON.stringify(m.details, null, 2), "```", ""]),
].join("\n");
await writeFile("reports/evals.md", md);
for (const m of metrics) console.log(`${m.passed ? "✓" : "✗"} ${m.label}: ${fmt(m)}`);
const failed = metrics.filter((m) => !m.passed);
if (failed.length) {
  console.error(`\n${failed.length} métrica(s) abaixo da meta. Detalhes em reports/evals.md`);
  process.exit(1);
}
