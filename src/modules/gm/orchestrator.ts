import { PlayerActionSchema, type PlayerAction } from "@/modules/campaign/actions";
import { findRules } from "@/modules/knowledge";
import type { GmContextInput } from "./context";
import { OfflineGmProvider } from "./offline";
import type { GmProvider, NarrateRequest } from "./provider";
import { InterpretationSchema, NarrationSchema, type Interpretation, type Narration } from "./schema";

export interface OrchestratorOptions {
  timeoutMs?: number;
  retries?: number;
}

export type InterpretResult =
  | { kind: "action"; action: PlayerAction; interpretation: Interpretation; provider: string }
  | { kind: "clarify"; question: string; provider: string }
  | { kind: "rules"; answer: string; provider: string };

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Tempo esgotado aguardando a IA")))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Converts a validated interpretation into a candidate engine action (still validated by the engine). */
export function toPlayerAction(i: Interpretation, playerText: string): PlayerAction | null {
  const candidate = (() => {
    switch (i.intent) {
      case "interact":
        return { type: "interact", objectId: i.objectId, verb: i.verb, skillId: i.skillId ?? undefined, powers: [] };
      case "talk":
        return { type: "talk", npcId: i.npcId, approach: i.approach ?? "conversar", message: playerText.slice(0, 1000), powers: [] };
      case "skill_check":
        return { type: "skill_check", skillId: i.skillId, dt: i.dt, reason: (i.reason ?? playerText).slice(0, 300), powers: [] };
      case "decide":
        return { type: "decide", optionId: i.optionId };
      case "attack":
        return { type: "attack", weaponId: i.weaponId, special: i.special ?? "none" };
      case "flee":
        return { type: "flee", skillId: i.skillId === "acrobacia" ? "acrobacia" : "atletismo" };
      case "first_aid":
        return { type: "first_aid" };
      case "abandon":
        return { type: "abandon" };
      case "narrative":
        return { type: "narrative", text: playerText.slice(0, 2000) };
      default:
        return null;
    }
  })();
  const parsed = PlayerActionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Runs the AI GM with validation, bounded retries, timeouts, and a safe
 * deterministic fallback. Never touches persistence.
 */
export class GmOrchestrator {
  private fallback = new OfflineGmProvider();

  constructor(
    private provider: GmProvider,
    private opts: OrchestratorOptions = {},
  ) {}

  get providerId() {
    return this.provider.id;
  }

  async interpret(input: GmContextInput, playerText: string): Promise<InterpretResult> {
    const attempts = (this.opts.retries ?? 1) + 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const raw = await withTimeout((signal) => this.provider.interpret(input, playerText, signal), this.opts.timeoutMs ?? 45000);
        const parsed = InterpretationSchema.safeParse(raw);
        if (!parsed.success) continue;
        return this.finishInterpretation(parsed.data, playerText, this.provider.id);
      } catch {
        // retry, then fall back
      }
    }
    if (this.provider.id !== this.fallback.id) {
      const raw = await this.fallback.interpret(input, playerText);
      return this.finishInterpretation(raw, playerText, `${this.fallback.id} (fallback)`);
    }
    return { kind: "clarify", question: "Não entendi a ação. Pode descrever de outro jeito?", provider: this.provider.id };
  }

  private finishInterpretation(i: Interpretation, playerText: string, provider: string): InterpretResult {
    if (i.rulesQuery) {
      const hits = findRules(i.rulesQuery, { editionId: "op-core" }, 2);
      const answer = hits.length
        ? hits.map((h) => `${h.rule.title}: ${h.rule.summary} (${h.citation}; status: ${h.rule.verificationStatus === "unverified" ? "não verificada" : h.rule.verificationStatus})`).join("\n")
        : "Não encontrei essa regra no catálogo verificado do projeto. Não vou inventar uma resposta oficial.";
      if (i.intent === "narrative" || i.intent === "clarify") return { kind: "rules", answer, provider };
    }
    if (i.intent === "clarify") return { kind: "clarify", question: i.clarification ?? "Pode detalhar o que pretende fazer?", provider };
    const action = toPlayerAction(i, playerText);
    if (!action) return { kind: "clarify", question: "Não consegui transformar isso em uma ação válida. Pode ser mais específico?", provider };
    return { kind: "action", action, interpretation: i, provider };
  }

  /** Never throws: narration failures degrade to deterministic narration of the same facts. */
  async narrate(req: NarrateRequest): Promise<Narration & { provider: string; degraded: boolean }> {
    if (req.routine) {
      // Plain movement: deterministic narration keeps clicks fast and free.
      const n = await this.fallback.narrate(req);
      return { ...n, provider: this.fallback.id, degraded: false };
    }
    const attempts = (this.opts.retries ?? 1) + 1;
    const npcIds = new Set(req.input.blueprint.npcs.map((n) => n.id));
    for (let i = 0; i < attempts; i++) {
      try {
        const raw = await withTimeout((signal) => this.provider.narrate(req, signal), this.opts.timeoutMs ?? 45000);
        const parsed = NarrationSchema.safeParse(raw);
        if (!parsed.success) continue;
        const n = parsed.data;
        return { ...n, npcDialogue: n.npcDialogue.filter((d) => npcIds.has(d.npcId)), provider: this.provider.id, degraded: false };
      } catch {
        // retry
      }
    }
    const n = await this.fallback.narrate(req);
    return { ...n, provider: this.fallback.id, degraded: this.provider.id !== this.fallback.id };
  }
}
