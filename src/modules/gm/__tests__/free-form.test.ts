import { describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { initialCampaignState } from "@/modules/campaign/state";
import { deriveSheet, initialState } from "@/modules/rules/systems/ordem-paranormal/character";
import { combatentePolicial } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { interpretOffline } from "../offline";
import { toPlayerAction } from "../orchestrator";

function gmInput(inside = false) {
  const { blueprint } = generateAdventure("free-form");
  const sheet = deriveSheet(combatentePolicial);
  const state = initialCampaignState(blueprint);
  if (inside) {
    state.currentMapId = blueprint.maps[1].id;
    const corridor = blueprint.maps[1].areas.find((a) => a.id === "corredor")!;
    state.maps[blueprint.maps[1].id].player = { x: corridor.rect.x + 1, y: corridor.rect.y + 1 };
  }
  return { blueprint, state, sheet, character: { ...initialState(combatentePolicial, sheet), name: "Lia", concept: "" }, history: [] };
}

const read = (input: ReturnType<typeof gmInput>, text: string, targetId?: string) => {
  const i = interpretOffline({ ...input, targetId }, text);
  return { i, action: toPlayerAction(i, text) };
};

describe("free-form input (offline interpreter)", () => {
  it("a question to someone is conversation, not a test", () => {
    const input = gmInput();
    const npc = input.blueprint.npcs.find((n) => n.mapId === input.state.currentMapId)!;
    const { i, action } = read(input, `Pergunto a ${npc.name.split(" ")[0]} se viu alguém entrar depois da meia-noite.`);
    expect(i.category).toBe("question");
    expect(action).toMatchObject({ type: "talk", npcId: npc.id, approach: "conversar" });
  });

  it("talking to a clicked person needs no name", () => {
    const input = gmInput();
    const npc = input.blueprint.npcs.find((n) => n.mapId === input.state.currentMapId)!;
    expect(read(input, "Boa noite. Você mora por aqui?", npc.objectId).action).toMatchObject({ type: "talk", npcId: npc.id });
    // A question that mentions going in is still said to the person, not an attempt to enter.
    expect(read(input, "O senhor viu alguém entrar aí hoje?", npc.objectId).action).toMatchObject({ type: "talk", npcId: npc.id });
  });

  it("persuasion and intimidation are social approaches", () => {
    const input = gmInput();
    const npc = input.blueprint.npcs.find((n) => n.mapId === input.state.currentMapId)!;
    const first = npc.name.split(" ")[0];
    expect(read(input, `Tento convencer ${first} de que estou aqui para ajudar.`).action).toMatchObject({ type: "talk", approach: "persuadir" });
    expect(read(input, `Ameaço ${first} para ele contar o que sabe.`).action).toMatchObject({ type: "talk", approach: "intimidar" });
  });

  it("looking around is observation (free), careful examination is investigation", () => {
    const input = gmInput();
    expect(read(input, "Olho ao redor.").action).toMatchObject({ type: "observe" });
    const clue = input.blueprint.clues.find((c) => c.mapId === input.state.currentMapId)!;
    const obj = input.blueprint.maps[0].objects.find((o) => o.id === clue.objectId)!;
    expect(read(input, `Examino ${obj.name.toLowerCase()} com cuidado.`).action).toMatchObject({ type: "interact", objectId: obj.id, verb: "search" });
  });

  it("moving to a named room is movement; an unknown room gets a question back", () => {
    const input = gmInput(true);
    expect(read(input, "Vou para a biblioteca.").action).toMatchObject({ type: "go", areaId: "biblioteca" });
    const unknown = read(input, "Vou para o porão.");
    expect(unknown.i.intent).toBe("clarify");
    expect(unknown.action).toBeNull();
  });

  it("does not confuse rooms that share a word", () => {
    const input = gmInput(true);
    const names = input.blueprint.maps[1].areas.map((a) => a.name.toLowerCase());
    const phrase = names.some((n) => n.startsWith("sala de estar")) ? "Vou para a sala de aula." : "Vou para a sala de estar.";
    expect(read(input, phrase).i.intent).toBe("clarify");
  });

  it("asks who the player means when the person is not in the scene", () => {
    const input = gmInput();
    expect(read(input, "Pergunto ao padre o que aconteceu.").i.intent).toBe("clarify");
  });

  it("an improvised test needs an explicit attempt and always carries stakes", () => {
    const input = gmInput();
    const { action } = read(input, "Tento escalar o muro usando Atletismo.");
    if (action?.type === "skill_check") expect(action.stakes?.length ?? 0).toBeGreaterThan(5);
    else expect(action?.type).not.toBe("skill_check");
  });
});
