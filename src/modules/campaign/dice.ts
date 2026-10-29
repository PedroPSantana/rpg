import { z } from "zod";
import { RollRecordSchema } from "@/modules/rules/core/dice";
import type { RandomSource } from "@/modules/rules/core/random";

/**
 * Manual dice for the player.
 *
 * Every roll the player's character makes (tests, attacks, damage,
 * initiative, healing) is a *player roll*. In manual mode the engine stops at
 * the first player roll it has no dice for and describes it as a
 * RollRequest; the player clicks, the server rolls exactly that roll, and the
 * action is replayed from the start with the recorded dice. Because the
 * engine is pure, the replay reaches the same point and continues. Rolls made
 * by the world (enemy attacks, mental damage) are recorded on a separate tape
 * so a replay never re-rolls them.
 */
export const RollRequestSchema = z.object({
  /** Order of this roll among the player's rolls in the action (0-based). */
  index: z.number().int(),
  kind: z.enum(["test", "damage", "effect", "initiative"]),
  label: z.string(),
  skillId: z.string().nullable(),
  /** Human-readable dice, e.g. "3d20 (maior)" or "1d8". */
  expression: z.string(),
  dice: z.object({ count: z.number().int(), sides: z.number().int(), keep: z.enum(["highest", "lowest", "sum"]) }),
  modifiers: z.array(z.object({ source: z.string(), value: z.number().int() })),
  extraDice: z.array(z.object({ source: z.string(), expression: z.string() })),
  target: z.number().int().nullable(),
  targetLabel: z.enum(["DT", "Defesa"]).nullable(),
  peCost: z.number().int(),
  /** What is at stake, in pt-BR: why a roll is needed and what failure costs. */
  stakes: z.string(),
});
export type RollRequest = z.infer<typeof RollRequestSchema>;

export const DiceTapeSchema = z.object({ player: z.array(z.array(z.number().int())), world: z.array(z.number().int()) });
export type DiceTape = z.infer<typeof DiceTapeSchema>;

export const PendingRollSchema = z.object({
  actionId: z.string(),
  /** The validated engine action being resolved (re-validated on every replay). */
  action: z.record(z.string(), z.unknown()),
  text: z.string().nullable(),
  tape: DiceTapeSchema,
  request: RollRequestSchema,
  /** Rolls already made for this action, in order (player and world). */
  rolls: z.array(RollRecordSchema),
  /** True until the first player die is rolled; the player may still back out. */
  cancellable: z.boolean(),
});
export type PendingRoll = z.infer<typeof PendingRollSchema>;

export type DiceMode = { kind: "auto" } | { kind: "manual"; tape: DiceTape; live: number; source: RandomSource };

export class RollRequired extends Error {
  constructor(public request: RollRequest) {
    super(`Rolagem necessária: ${request.label}`);
  }
}

/** Replays recorded faces; strict replays fail loudly if the action took a different path. */
function replay(faces: number[], fallback: RandomSource | null, record?: number[]): RandomSource {
  let i = 0;
  return {
    die(sides) {
      if (i < faces.length) {
        const face = faces[i++];
        if (face < 1 || face > sides) throw new Error(`Fita de dados inconsistente: ${face} em d${sides}`);
        return face;
      }
      if (!fallback) throw new Error("Fita de dados esgotada durante a repetição da ação.");
      const face = fallback.die(sides);
      record?.push(face);
      return face;
    },
  };
}

/** Per-action dice bookkeeping used by the engine's Resolution. */
export class DiceControl {
  private nextPlayer = 0;
  private live: number;
  readonly world: RandomSource;
  /** Tape as it stands after this run (to persist with a pending roll). */
  readonly tape: DiceTape = { player: [], world: [] };

  constructor(
    private mode: DiceMode,
    auto: RandomSource,
  ) {
    if (mode.kind === "auto") {
      this.live = Infinity;
      this.world = auto;
    } else {
      this.live = mode.live;
      this.tape.world = [...mode.tape.world];
      this.world = replay(mode.tape.world, mode.source, this.tape.world);
    }
  }

  get manual() {
    return this.mode.kind === "manual";
  }

  /** Number of player rolls actually made in this run. */
  get playerRolls() {
    return this.nextPlayer;
  }

  player<T>(request: Omit<RollRequest, "index">, roll: (rng: RandomSource) => T, auto: RandomSource): T {
    const index = this.nextPlayer;
    if (this.mode.kind === "auto") {
      this.nextPlayer++;
      return roll(auto);
    }
    const recorded = this.mode.tape.player[index];
    if (recorded) {
      this.nextPlayer++;
      this.tape.player.push(recorded);
      return roll(replay(recorded, null));
    }
    if (this.live <= 0) throw new RollRequired({ ...request, index });
    this.live--;
    this.nextPlayer++;
    const faces: number[] = [];
    this.tape.player.push(faces);
    return roll(replay([], this.mode.source, faces));
  }
}
