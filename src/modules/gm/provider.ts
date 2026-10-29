import type { ActionOutcome } from "@/modules/campaign/engine";
import type { GmContextInput } from "./context";
import type { Interpretation, Narration } from "./schema";

export interface NarrateRequest {
  input: GmContextInput;
  /** Authoritative outcome (null for scene openings). */
  outcome: Pick<ActionOutcome, "facts" | "suggestions" | "rolls"> | null;
  playerText?: string;
}

/**
 * Provider-independent AI GM interface. Implementations may return anything;
 * the orchestrator validates every response before use.
 */
export interface GmProvider {
  readonly id: string;
  interpret(input: GmContextInput, playerText: string, signal?: AbortSignal): Promise<unknown>;
  narrate(req: NarrateRequest, signal?: AbortSignal): Promise<unknown>;
}

export type { Interpretation, Narration };
