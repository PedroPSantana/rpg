import { normalize } from "@/modules/knowledge/text";
import type { GmContextInput } from "./context";
import type { Narration } from "./schema";

/**
 * Safeguards applied to every narration, whichever provider wrote it. They
 * repair repetition (duplicate sentences, sentences recycled from recent
 * turns, echoes of the player's own words) and reject narration that
 * contradicts the dice or leaks secrets, so the orchestrator can retry or
 * fall back. They never truncate prose for length.
 */

const STOP = new Set("a o as os um uma uns umas de do da dos das em no na nos nas por para com sem que e ou se ao aos à às é foi era seu sua seus suas voce você eu me mim lhe ele ela isso isto esse essa este esta mais mas como ja já nao não ha há tem".split(" "));

export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+(?:[.!?…]+["”»]?|$)/g) ?? []).map((s) => s.trim()).filter(Boolean);
}

function words(text: string) {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function similarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

/** Removes sentences that repeat an earlier sentence of the same text or of recent narration. */
export function dedupeSentences(text: string, recent: string[] = []) {
  const recentSplit = recent.flatMap(splitSentences);
  const recentSentences = recentSplit.map(words).filter((w) => w.length >= 5);
  // Short sentences only count as repeats when they are repeated word for word.
  const recentExact = new Set(recentSplit.map((x) => words(x).join(" ")).filter((x) => x.split(" ").length >= 3));
  const kept: string[] = [];
  const seen: string[][] = [];
  const removed: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const out: string[] = [];
    for (const s of splitSentences(paragraph)) {
      const w = words(s);
      const dupHere = seen.some((x) => similarity(x, w) >= 0.85 && Math.abs(x.length - w.length) <= 3);
      const dupRecent = (w.length >= 5 && recentSentences.some((x) => similarity(x, w) >= 0.9)) || recentExact.has(w.join(" "));
      if (dupHere || dupRecent) {
        removed.push(s);
        continue;
      }
      seen.push(w);
      out.push(s);
    }
    if (out.length) kept.push(out.join(" "));
  }
  return { text: kept.join("\n\n"), removed };
}

/** Drops leading sentences that merely restate what the player wrote ("Você examina a porta."). */
export function stripEcho(text: string, playerText?: string) {
  if (!playerText) return text;
  const pw = words(playerText);
  if (pw.length < 2) return text;
  const sentences = splitSentences(text);
  const out = [...sentences];
  while (out.length > 1) {
    const s = out[0];
    const sw = words(s);
    // Compare stems so "examina" (narration) matches "examino" (player).
    const stem = (ws: string[]) => ws.map((w) => w.slice(0, 5));
    const restates = /^voc[eê]\s/i.test(s) && sw.length <= pw.length + 3 && similarity(stem(sw), stem(pw)) >= 0.7;
    if (!restates) break;
    out.shift();
  }
  return out.length === sentences.length ? text : out.join(" ");
}

/** Distinctive 4-word shingles of a secret text. */
function shingles(text: string) {
  const w = normalize(text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + 4 <= w.length; i++) out.push(w.slice(i, i + 4).join(" "));
  return out;
}

/** Finds secret content in narration that the facts of this action do not justify. */
export function findLeaks(text: string, input: GmContextInput, facts: string[]): string[] {
  const n = normalize(text);
  const allowed = normalize(facts.join(" ") + " " + input.state.journal.map((j) => j.text).join(" "));
  const leaks: string[] = [];
  const check = (label: string, secret: string) => {
    if (shingles(secret).some((s) => n.includes(s) && !allowed.includes(s))) leaks.push(label);
  };
  for (const c of input.blueprint.clues) if (!input.state.clues[c.id].discovered) check(`pista oculta "${c.title}"`, c.description);
  for (const npc of input.blueprint.npcs) check(`segredo de ${npc.name}`, npc.secret);
  const met = input.state.encounter || Object.keys(input.state.encountersResolved).length || input.state.mode === "ended";
  const ant = normalize(input.blueprint.antagonist.name).replace(/^(o|a)\s+/, "");
  if (!met && ant.length > 3 && n.includes(ant) && !allowed.includes(ant)) leaks.push("nome do antagonista");
  return leaks;
}

export type GuardResult = { ok: true; narration: Narration; removed: string[] } | { ok: false; issues: string[] };

export function guardNarration(n: Narration, ctx: { input: GmContextInput; facts: string[]; verdict?: Narration["outcome"]; playerText?: string }): GuardResult {
  const issues: string[] = [];
  if (ctx.verdict && ctx.verdict !== "none" && n.outcome !== ctx.verdict) issues.push(`narração descreve "${n.outcome}" mas o resultado foi "${ctx.verdict}"`);
  const leaks = findLeaks([n.narration, ...n.npcDialogue.map((d) => d.line)].join(" "), ctx.input, ctx.facts);
  if (leaks.length) issues.push(`revela ${leaks.join(", ")}`);
  if (issues.length) return { ok: false, issues };
  const recent = ctx.input.history.filter((h) => h.role === "GM").slice(-3).map((h) => h.content);
  const echoFree = stripEcho(n.narration, ctx.playerText);
  const { text, removed } = dedupeSentences(echoFree, recent);
  if (!text.trim()) return { ok: false, issues: ["narração vazia depois de remover repetições"] };
  const seenLines = new Set<string>();
  const npcDialogue = n.npcDialogue.filter((d) => {
    const k = normalize(d.line);
    if (seenLines.has(k) || normalize(text).includes(k)) return false;
    seenLines.add(k);
    return true;
  });
  return { ok: true, narration: { ...n, narration: text, npcDialogue }, removed };
}
