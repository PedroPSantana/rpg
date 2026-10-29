import { describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { AdventureBlueprintSchema } from "@/modules/adventures/schema";
import { resolveAction, type EngineContext } from "../engine";
import { CampaignStateSchema } from "../state";
import { combatentePolicial, constantRandom, especialistaAcademico, findSeed, makeContext, step } from "./helpers";

const extObj = (ctx: EngineContext, kind: string) => ctx.blueprint.maps[0].objects.find((o) => o.kind === kind)!;
const intDef = (ctx: EngineContext) => ctx.blueprint.maps[1];

/** Gets the player inside the interior map, opening/unlocking the entrance as needed. */
function enterInterior(ctx: EngineContext): EngineContext {
  const exit = extObj(ctx, "exit");
  if (ctx.state.maps.exterior.objects[exit.id].state === "locked") {
    ctx = step(ctx, { type: "interact", objectId: exit.id, verb: "force", powers: [] }, constantRandom("max")).ctx;
  }
  return step(ctx, { type: "interact", objectId: exit.id, verb: "enter", powers: [] }).ctx;
}

describe("campaign initial state", () => {
  it("is schema-valid and starts in exploration on the start map", () => {
    const ctx = makeContext();
    expect(() => CampaignStateSchema.parse(ctx.state)).not.toThrow();
    expect(() => AdventureBlueprintSchema.parse(ctx.blueprint)).not.toThrow();
    expect(ctx.state.mode).toBe("exploration");
    expect(ctx.state.currentMapId).toBe("exterior");
  });
});

describe("movement and purity", () => {
  it("rejects moving into walls and accepts reachable tiles", () => {
    const ctx = makeContext();
    expect(resolveAction(ctx, { type: "move", to: { x: 0, y: 0 } })).toMatchObject({ ok: false });
    const start = ctx.state.maps.exterior.player;
    const r = step(ctx, { type: "move", to: { x: start.x + 1, y: start.y } });
    expect(r.ctx.state.maps.exterior.player).toEqual({ x: start.x + 1, y: start.y });
    expect(ctx.state.maps.exterior.player).toEqual(start); // input not mutated
  });
});

describe("investigation", () => {
  it("successful search discovers the clue, updates the map object and records the roll", () => {
    const ctx = makeContext();
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    const { ctx: next, out } = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] });
    expect(next.state.clues["pista-rastro"].discovered).toBe(true);
    expect(next.state.maps.exterior.objects[clue.objectId].state).toBe("found");
    expect(out.rolls).toHaveLength(1);
    expect(out.events).toContainEqual({ type: "clue_discovered", clueId: "pista-rastro" });
    // Searching again does not roll again.
    const again = step(next, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] });
    expect(again.out.rolls).toHaveLength(0);
  });

  it("failed search advances the urgency clock, keeps the clue hidden and offers alternatives", () => {
    const ctx = makeContext({ rng: constantRandom(1) });
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    const { ctx: next, out } = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] });
    expect(next.state.clues["pista-rastro"].discovered).toBe(false);
    expect(next.state.urgency).toBe(1);
    expect(out.suggestions.join(" ")).toMatch(/outra abordagem/);
    // Retry is allowed (with consequences).
    expect(resolveAction(next, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] }).ok).toBe(true);
  });

  it("rejects an approach that does not apply to the clue", () => {
    const ctx = makeContext();
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    expect(resolveAction(ctx, { type: "interact", objectId: clue.objectId, verb: "search", skillId: "luta", powers: [] })).toMatchObject({ ok: false });
  });

  it("urgency clock: reaching the maximum makes the threat hunt the player", () => {
    let ctx = makeContext({ rng: constantRandom(1) });
    ctx = { ...ctx, state: { ...ctx.state, urgency: 5, urgencyEffectsApplied: [3, 5] } };
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-rastro")!;
    const { ctx: next, out } = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] }, constantRandom(1));
    expect(next.state.flags["ameaca-cacando"]).toBe(true);
    expect(out.events.some((e) => e.type === "encounter_started")).toBe(true);
  });

  it("trained-only discovery methods are skipped for untrained characters", () => {
    // Combatente/Policial has no Ocultismo/Religião; the ritual clue falls back to Investigação DT 20.
    let ctx = enterInterior(makeContext());
    const ritual = ctx.blueprint.clues.find((c) => c.id === "pista-ritual")!;
    const reachable = resolveAction(ctx, { type: "interact", objectId: ritual.objectId, verb: "inspect", skillId: "ocultismo", powers: [] });
    expect(reachable.ok).toBe(false);
    void ctx;
  });
});

describe("NPC dialogue", () => {
  it("persuading the witness reveals their testimony", () => {
    let ctx = makeContext();
    ctx = step(ctx, { type: "talk", npcId: "testemunha", approach: "persuadir", powers: [] }).ctx;
    expect(ctx.state.clues["pista-testemunho"].discovered).toBe(true);
    expect(ctx.state.npcs.testemunha.talked).toBe(true);
    expect(ctx.state.quests["missao-vitima"].objectives.ouvir).toBe(true);
  });

  it("a hidden culprit deflects until exposed with Intuição", () => {
    const seed = findSeed((bp) => bp.npcs.find((n) => n.id === "morador")!.isCulprit);
    let ctx = enterInterior(makeContext({ seed }));
    const fail = step(ctx, { type: "talk", npcId: "morador", approach: "conversar", powers: [] });
    expect(fail.out.facts.join(" ")).toMatch(/não coopera/);
    ctx = step(fail.ctx, { type: "talk", npcId: "morador", approach: "intuir", powers: [] }).ctx;
    expect(ctx.state.flags["culpado-exposto"]).toBe(true);
    ctx = step(ctx, { type: "talk", npcId: "morador", approach: "intimidar", powers: [] }).ctx;
    expect(ctx.character.state.inventory.some((i) => i.itemId === "chave-quarto")).toBe(true);
  });
});

describe("locks and map transitions", () => {
  it("a locked entrance can be forced, making noise", () => {
    const seed = findSeed((bp) => bp.maps[0].objects.find((o) => o.kind === "exit")!.initialState === "locked");
    const ctx = makeContext({ seed });
    const exit = extObj(ctx, "exit");
    const opened = step(ctx, { type: "interact", objectId: exit.id, verb: "open", powers: [] });
    expect(opened.ctx.state.maps.exterior.objects[exit.id].state).toBe("locked");
    const forced = step(ctx, { type: "interact", objectId: exit.id, verb: "force", powers: [] });
    expect(forced.ctx.state.maps.exterior.objects[exit.id].state).toBe("broken");
    expect(forced.ctx.state.urgency).toBe(1);
  });

  it("the caretaker's key unlocks the entrance without a roll", () => {
    const seed = findSeed((bp) => bp.maps[0].objects.find((o) => o.kind === "exit")!.initialState === "locked");
    let ctx = makeContext({ seed });
    ctx = step(ctx, { type: "talk", npcId: "zelador", approach: "persuadir", powers: [] }).ctx;
    expect(ctx.character.state.inventory.some((i) => i.itemId === "chave-entrada")).toBe(true);
    const exit = extObj(ctx, "exit");
    const { out, ctx: next } = step(ctx, { type: "interact", objectId: exit.id, verb: "unlock", powers: [] });
    expect(out.rolls).toHaveLength(0);
    expect(next.state.maps.exterior.objects[exit.id].state).toBe("closed");
  });

  it("entering the exit transitions maps, marks visit and completes the objective", () => {
    const ctx = enterInterior(makeContext());
    expect(ctx.state.currentMapId).toBe("interior");
    expect(ctx.state.maps.interior.visited).toBe(true);
    expect(ctx.state.quests["missao-principal"].objectives.chegar).toBe(true);
  });

  it("the secret passage clue reveals the hidden door", () => {
    let ctx = enterInterior(makeContext());
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-passagem")!;
    const hidden = clue.reveals.objects[0];
    expect(ctx.state.maps.interior.objects[hidden].revealed).toBe(false);
    ctx = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] }).ctx;
    expect(ctx.state.maps.interior.objects[hidden].revealed).toBe(true);
  });
});

/** Max dice also make threats crit; give the agent a large PV buffer so combat tests focus on flow. */
function tough(ctx: EngineContext): EngineContext {
  return { ...ctx, character: { ...ctx.character, state: { ...ctx.character.state, pv: 500, san: 500 } } };
}

function toLair(ctx: EngineContext): EngineContext {
  ctx = tough(ctx);
  // Reveal the secret passage, open it and walk into the lair.
  const clue = ctx.blueprint.clues.find((c) => c.id === "pista-passagem")!;
  ctx = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] }).ctx;
  const door = clue.reveals.objects[0];
  ctx = step(ctx, { type: "interact", objectId: door, verb: "open", powers: [] }).ctx;
  const lair = intDef(ctx).areas.find((a) => a.id === "covil")!;
  return step(ctx, { type: "move", to: { x: lair.rect.x + 1, y: lair.rect.y + lair.rect.h - 1 } }).ctx;
}

describe("encounter turn and combat", () => {
  it("entering the lair starts combat with disturbing presence and initiative", () => {
    const ctx = toLair(enterInterior(makeContext()));
    expect(ctx.state.mode).toBe("combat");
    expect(ctx.state.encounter?.order).toHaveLength(2);
    expect(resolveAction(ctx, { type: "interact", objectId: extObj(ctx, "exit").id, verb: "open", powers: [] })).toMatchObject({ ok: false, ruleId: "op-core.combat.actions" });
  });

  it("disturbing presence: a failed Vontade test costs Sanity", () => {
    const base = enterInterior(makeContext());
    let ctx = base;
    const clue = ctx.blueprint.clues.find((c) => c.id === "pista-passagem")!;
    ctx = step(ctx, { type: "interact", objectId: clue.objectId, verb: "search", powers: [] }).ctx;
    ctx = step(ctx, { type: "interact", objectId: clue.reveals.objects[0], verb: "open", powers: [] }).ctx;
    const lair = intDef(ctx).areas.find((a) => a.id === "covil")!;
    const { ctx: inCombat } = step(ctx, { type: "move", to: { x: lair.rect.x + 1, y: lair.rect.y + lair.rect.h - 1 } }, constantRandom(1));
    expect(inCombat.character.state.san).toBeLessThan(ctx.character.state.san);
  });

  it("Ataque Especial spends PE and adds +5", () => {
    const ctx = toLair(enterInterior(makeContext()));
    const pe = ctx.character.state.pe;
    const { ctx: next, out } = step(ctx, { type: "attack", weaponId: "revolver", special: "dano" });
    expect(next.character.state.pe).toBe(pe - 2);
    expect(out.rolls.find((r) => r.kind === "damage")!.modifiers).toContainEqual({ source: "Ataque Especial", value: 5 });
  });

  it("victory unlocks the decision; the decision produces an ending with rewards granted once", () => {
    let ctx = toLair(enterInterior(makeContext()));
    let guard = 0;
    while (ctx.state.mode === "combat" && guard++ < 20) ctx = step(ctx, { type: "attack", weaponId: "revolver", special: "none" }).ctx;
    expect(ctx.state.encountersResolved.confronto).toBe("victory");
    expect(ctx.state.flags["vitima-salva"]).toBe(true);
    const threatObj = ctx.blueprint.encounters[0].objectId;
    expect(ctx.state.maps.interior.objects[threatObj].state).toBe("defeated");
    // Sealing requires knowing the weakness.
    expect(resolveAction(ctx, { type: "decide", optionId: "selar" })).toMatchObject({ ok: false });
    const { ctx: done, out } = step(ctx, { type: "decide", optionId: "destruir" });
    expect(done.state.mode).toBe("ended");
    expect(done.state.ending?.id).toBe("destruido-salvo");
    expect(done.state.rewardsGranted).toBe(true);
    expect(out.events.some((e) => e.type === "ending")).toBe(true);
    expect(done.state.quests["missao-principal"].status).toBe("completed");
    expect(resolveAction(done, { type: "decide", optionId: "levar" })).toMatchObject({ ok: false });
    expect(resolveAction(done, { type: "move", to: { x: 1, y: 1 } })).toMatchObject({ ok: false, ruleId: "campaign.ended" });
  });

  it("player dying leads to the defeat ending", () => {
    let ctx = toLair(enterInterior(makeContext()));
    ctx = { ...ctx, character: { ...ctx.character, state: { ...ctx.character.state, pv: 1 } } };
    // Player misses (1s), threat hits (max) — scripted per die size: d20 → 1 for player then 20 for threat.
    let call = 0;
    const rng = { die: (sides: number) => (sides === 20 ? (call++ < 2 ? 1 : 20) : sides) };
    const { ctx: done } = step(ctx, { type: "attack", weaponId: "revolver", special: "none" }, rng);
    expect(done.state.flags["personagem-caido"]).toBe(true);
    expect(done.state.ending?.id).toBe("derrota");
    expect(done.character.state.pv).toBe(0);
  });

  it("fleeing retreats, keeps the threat's PV and allows a later rematch", () => {
    let ctx = toLair(enterInterior(makeContext()));
    const weak = { die: (sides: number) => (sides === 20 ? 15 : 3) };
    ctx = step(ctx, { type: "attack", weaponId: "revolver", special: "none" }, weak).ctx;
    const pv = ctx.state.encounter!.threat.pv;
    expect(pv).toBeLessThan(ctx.blueprint.threats[0].pv);
    ctx = step(ctx, { type: "flee", skillId: "atletismo" }).ctx;
    expect(ctx.state.mode).toBe("exploration");
    expect(ctx.state.threatPv[ctx.blueprint.threats[0].id]).toBe(pv);
    expect(ctx.state.encountersResolved.confronto).toBeUndefined();
  });

  it("first aid heals with a kit once per scene", () => {
    let ctx = makeContext({ build: especialistaAcademico });
    ctx = { ...ctx, character: { ...ctx.character, state: { ...ctx.character.state, pv: 5 } } };
    const { ctx: healed } = step(ctx, { type: "first_aid" });
    expect(healed.character.state.pv).toBe(13);
    expect(resolveAction(healed, { type: "first_aid" })).toMatchObject({ ok: false });
  });
});

describe("improvised GM checks", () => {
  it("rejects a DT outside the official table", () => {
    const ctx = makeContext();
    expect(resolveAction(ctx, { type: "skill_check", skillId: "atletismo", dt: 13, reason: "pular o muro", powers: [] })).toMatchObject({ ok: false, ruleId: "op-core.test.difficulty-table" });
    const ok = resolveAction(ctx, { type: "skill_check", skillId: "atletismo", dt: 15, reason: "pular o muro", powers: [] });
    expect(ok.ok && ok.state.maps).toEqual(ctx.state.maps);
  });
});

describe("campaign generation", () => {
  it("different seeds produce structurally different adventures", () => {
    const fps = Array.from({ length: 12 }, (_, i) => generateAdventure(`seed-${i}`).fingerprint);
    expect(new Set(fps.map((f) => f.archetype)).size).toBeGreaterThan(2);
    expect(new Set(fps.map((f) => f.twist)).size).toBeGreaterThan(3);
  });

  it("is deterministic for the same seed", () => {
    expect(generateAdventure("x").blueprint).toEqual(generateAdventure("x").blueprint);
  });

  it("every archetype and map combination is completable to an ending", () => {
    const combos = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { blueprint, fingerprint } = generateAdventure(`full-${i}`);
      const key = `${fingerprint.archetype}|${fingerprint.maps.join()}`;
      if (combos.has(key)) continue;
      combos.add(key);
      let ctx = toLair(enterInterior(makeContext({ blueprint, build: combatentePolicial })));
      let guard = 0;
      while (ctx.state.mode === "combat" && guard++ < 20) ctx = step(ctx, { type: "attack", weaponId: "revolver", special: "none" }).ctx;
      ctx = step(ctx, { type: "decide", optionId: "destruir" }).ctx;
      expect(ctx.state.mode, key).toBe("ended");
    }
    expect(combos.size).toBeGreaterThanOrEqual(8);
  });
});
