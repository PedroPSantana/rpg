import { describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { initialCampaignState } from "@/modules/campaign/state";
import { deriveSheet, initialState } from "@/modules/rules/systems/ordem-paranormal/character";
import { combatentePolicial } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { interpretOffline, narrateOffline } from "../offline";
import { GmOrchestrator, toPlayerAction } from "../orchestrator";
import type { GmProvider } from "../provider";

function gmInput(mode: "exploration" | "combat" = "exploration") {
  const { blueprint } = generateAdventure("gm-tests");
  const sheet = deriveSheet(combatentePolicial);
  const state = initialCampaignState(blueprint);
  state.mode = mode;
  return { blueprint, state, sheet, character: { ...initialState(combatentePolicial, sheet), name: "Lia", concept: "" }, history: [] };
}

describe("offline interpreter", () => {
  it("reads 'whether someone is lying' as Intuição, not deception", () => {
    const input = gmInput();
    const npc = input.blueprint.npcs[0];
    const a = toPlayerAction(interpretOffline(input, `observo se ${npc.name.split(" ")[0]} está mentindo`), "x");
    expect(a).toMatchObject({ type: "talk", npcId: npc.id, approach: "intuir" });
  });

  it("maps 'entro no prédio' to entering the location", () => {
    const input = gmInput();
    const exit = input.blueprint.maps[0].objects.find((o) => o.kind === "exit")!;
    expect(toPlayerAction(interpretOffline(input, "entro no prédio"), "x")).toMatchObject({ type: "interact", objectId: exit.id, verb: "enter" });
  });

  it("understands 'fujo' during combat", () => {
    expect(toPlayerAction(interpretOffline(gmInput("combat"), "rolo para o lado e fujo"), "x")).toMatchObject({ type: "flee", skillId: "acrobacia" });
  });

  it("does not duplicate an NPC's deflection in narration and dialogue", () => {
    const input = gmInput();
    const npc = input.blueprint.npcs[0];
    const n = narrateOffline({ input, outcome: { facts: [`${npc.name} não coopera: "${npc.deflection}"`], rolls: [] } });
    expect(n.npcDialogue).toEqual([]);
    expect(n.narration).toContain(npc.deflection);
  });
});

describe("GM orchestrator", () => {
  it("answers out-of-catalog rules questions without inventing a rule", async () => {
    const input = gmInput();
    const asker: GmProvider = { id: "t", interpret: async () => ({ ...interpretOffline(input, "fico parado"), rulesQuery: "regras de veículos e perseguição de carro" }), narrate: async () => ({}) };
    const r = await new GmOrchestrator(asker).interpret(input, "?");
    expect(r).toMatchObject({ kind: "rules", answer: expect.stringContaining("Não encontrei") });
  });

  it("falls back to the offline GM when the provider returns malformed output", async () => {
    const input = gmInput();
    const junk: GmProvider = { id: "junk", interpret: async () => ({ intent: "teleport" }), narrate: async () => ({ narration: 1 }) };
    const orch = new GmOrchestrator(junk, { retries: 1, timeoutMs: 500 });
    expect((await orch.interpret(input, "examino o chão")).provider).toContain("fallback");
    expect(await orch.narrate({ input, outcome: { facts: ["Fato."], rolls: [] } })).toMatchObject({ degraded: true, provider: "offline" });
  });

  it("narrates routine movement without calling the AI provider", async () => {
    const input = gmInput();
    let calls = 0;
    const counting: GmProvider = { id: "count", interpret: async () => ({}), narrate: async () => (calls++, {}) };
    await new GmOrchestrator(counting).narrate({ input, outcome: { facts: [], rolls: [] }, routine: true });
    expect(calls).toBe(0);
  });
});
