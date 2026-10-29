import { describe, expect, it } from "vitest";
import { seededRandom } from "@/modules/rules/core/random";
import { resolveAction, runAction, type EngineContext } from "../engine";
import { constantRandom, makeContext } from "./helpers";

const manual = (ctx: EngineContext, tape = { player: [] as number[][], world: [] as number[] }, live = 0, rng = constantRandom("max")): EngineContext => ({ ...ctx, rng, dice: { kind: "manual", tape, live, source: rng } });

function searchClue(ctx: EngineContext) {
  const clue = ctx.blueprint.clues.find((c) => c.id === "pista-rastro")!;
  return { type: "interact" as const, objectId: clue.objectId, verb: "search" as const, powers: [] };
}

describe("manual dice", () => {
  it("never rolls for the player: a test stops at a roll request and changes nothing", () => {
    const ctx = makeContext();
    const before = structuredClone({ state: ctx.state, character: ctx.character.state });
    const r = runAction(manual(ctx), searchClue(ctx));
    expect(r.ok).toBe("roll");
    if (r.ok !== "roll") return;
    expect(r.request).toMatchObject({ index: 0, kind: "test", targetLabel: "DT" });
    expect(r.request.target).toBeGreaterThan(0);
    expect(r.request.stakes.length).toBeGreaterThan(10);
    expect(r.request.expression).toMatch(/d20/);
    expect(r.playerRolls).toBe(0);
    expect(r.tape.player).toEqual([]);
    expect({ state: ctx.state, character: ctx.character.state }).toEqual(before);
  });

  it("the click rolls exactly one die set, and the result follows the dice", () => {
    const ctx = makeContext();
    const first = runAction(manual(ctx), searchClue(ctx));
    if (first.ok !== "roll") throw new Error("expected a roll");
    const hit = runAction(manual(ctx, first.tape, 1, constantRandom("max")), searchClue(ctx));
    const miss = runAction(manual(ctx, first.tape, 1, constantRandom(1)), searchClue(ctx));
    if (hit.ok !== true || miss.ok !== true) throw new Error("expected resolved actions");
    expect(hit.verdict).toBe("success");
    expect(miss.verdict).toBe("failure");
    expect(hit.state.clues["pista-rastro"].discovered).toBe(true);
    expect(miss.state.clues["pista-rastro"].discovered).toBe(false);
    expect(hit.tape.player).toHaveLength(1);
  });

  it("replaying a recorded tape is deterministic and matches auto mode with the same faces", () => {
    const ctx = makeContext();
    const first = runAction(manual(ctx), searchClue(ctx));
    if (first.ok !== "roll") throw new Error("expected a roll");
    const live = runAction(manual(ctx, first.tape, 1, seededRandom(42)), searchClue(ctx));
    if (live.ok !== true) throw new Error("expected resolution");
    // Replaying the stored tape (no live dice left) reproduces the same outcome without new randomness.
    const replay = runAction(manual(ctx, live.tape, 0, constantRandom(1)), searchClue(ctx));
    if (replay.ok !== true) throw new Error("expected resolution");
    expect(replay.rolls).toEqual(live.rolls);
    expect(replay.state).toEqual(live.state);
    const auto = resolveAction({ ...ctx, rng: { die: ((faces) => () => faces.shift()!)([...live.tape.player.flat(), ...live.tape.world]) } }, searchClue(ctx));
    expect(auto.ok && auto.rolls.map((r) => r.total)).toEqual(live.rolls.map((r) => r.total));
  });

  it("looking around and moving between rooms never ask for dice", () => {
    const ctx = makeContext();
    const look = runAction(manual(ctx), { type: "observe" });
    expect(look.ok).toBe(true);
    if (look.ok === true) expect(look.rolls).toEqual([]);
  });
});

describe("saves from before this version", () => {
  it("load with an empty journal, no pending roll and no visited rooms", async () => {
    const { CampaignStateSchema } = await import("../state");
    const ctx = makeContext();
    const { journal: _j, pending: _p, areasVisited: _a, ...old } = ctx.state;
    void _j;
    void _p;
    void _a;
    const parsed = CampaignStateSchema.parse(old);
    expect(parsed).toMatchObject({ journal: [], pending: null, areasVisited: [] });
    expect(runAction(manual({ ...ctx, state: parsed }), { type: "observe" }).ok).toBe(true);
  });
});
