import { generateAdventure } from "@/modules/adventures/generator";
import type { AdventureBlueprint } from "@/modules/adventures/schema";
import { assertSides, type RandomSource } from "@/modules/rules/core/random";
import { deriveSheet, initialState, type OpCharacterBuild } from "@/modules/rules/systems/ordem-paranormal/character";
import { combatentePolicial, especialistaAcademico } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import type { PlayerAction } from "../actions";
import { resolveAction, type ActionOutcome, type EngineContext } from "../engine";
import { initialCampaignState } from "../state";

/** Every die shows `face` (clamped to the die size). */
export function constantRandom(face: number | "max"): RandomSource {
  return {
    die(sides) {
      assertSides(sides);
      return face === "max" ? sides : Math.min(face, sides);
    },
  };
}

export function makeContext(opts: { seed?: string; blueprint?: AdventureBlueprint; build?: OpCharacterBuild; rng?: RandomSource } = {}): EngineContext {
  const blueprint = opts.blueprint ?? generateAdventure(opts.seed ?? "teste").blueprint;
  const build = opts.build ?? combatentePolicial;
  const sheet = deriveSheet(build);
  return { blueprint, state: initialCampaignState(blueprint), character: { build, sheet, state: initialState(build, sheet) }, rng: opts.rng ?? constantRandom("max") };
}

/** Applies an action and returns the context for the next one; throws on rejection. */
export function step(ctx: EngineContext, action: PlayerAction, rng?: RandomSource): { ctx: EngineContext; out: ActionOutcome } {
  const out = resolveAction(rng ? { ...ctx, rng } : ctx, action);
  if (!out.ok) throw new Error(`Ação rejeitada: ${out.reason}`);
  return { ctx: { ...ctx, state: out.state, character: { ...ctx.character, state: out.characterState } }, out };
}

/** Finds a seed whose blueprint satisfies a predicate. */
export function findSeed(pred: (bp: AdventureBlueprint) => boolean, prefix = "s"): string {
  for (let i = 0; i < 500; i++) {
    const seed = `${prefix}${i}`;
    if (pred(generateAdventure(seed).blueprint)) return seed;
  }
  throw new Error("Nenhuma semente encontrada");
}

export { combatentePolicial, especialistaAcademico };
