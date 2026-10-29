import { describe, expect, it } from "vitest";
import { generateAdventure } from "@/modules/adventures/generator";
import { initialCampaignState } from "@/modules/campaign/state";
import { deriveSheet, initialState } from "@/modules/rules/systems/ordem-paranormal/character";
import { combatentePolicial } from "@/modules/rules/systems/ordem-paranormal/__tests__/fixtures";
import { dedupeSentences, guardNarration, stripEcho } from "../guard";
import type { Narration } from "../schema";

function input(history: { role: "GM" | "PLAYER" | "SYSTEM"; content: string }[] = []) {
  const { blueprint } = generateAdventure("guard-tests");
  const sheet = deriveSheet(combatentePolicial);
  return { blueprint, state: initialCampaignState(blueprint), sheet, character: { ...initialState(combatentePolicial, sheet), name: "Lia", concept: "" }, history };
}

const narration = (text: string, outcome: Narration["outcome"] = "none"): Narration => ({ narration: text, npcDialogue: [], outcome, effects: [], gmNotes: "" });

describe("narration guard", () => {
  it("removes a sentence repeated inside the same narration", () => {
    const { text, removed } = dedupeSentences("A porta range ao abrir. Lá dentro, o cheiro de mofo é forte. A porta range ao abrir.");
    expect(text).toBe("A porta range ao abrir. Lá dentro, o cheiro de mofo é forte.");
    expect(removed).toHaveLength(1);
  });

  it("removes sentences already narrated in recent turns, keeping what is new", () => {
    const recent = ["O corredor se estende de ponta a ponta, com a pintura verde descascando na altura da cintura. O relógio da parede parou."];
    const { text } = dedupeSentences("O corredor se estende de ponta a ponta, com a pintura verde descascando na altura da cintura. O relógio da parede parou. Há uma gaveta emperrada perto da janela.", recent);
    expect(text).toBe("Há uma gaveta emperrada perto da janela.");
  });

  it("does not shorten new prose that only shares a few words with earlier turns", () => {
    const recent = ["A garoa cai sobre a rua vazia."];
    const fresh = "A zeladora cruza os braços e olha para a rua, como se esperasse alguém.";
    expect(dedupeSentences(fresh, recent).text).toBe(fresh);
  });

  it("drops an opening sentence that just restates the player's action", () => {
    expect(stripEcho("Você examina a gaveta emperrada. A madeira inchou e não cede.", "Examino a gaveta emperrada")).toBe("A madeira inchou e não cede.");
    expect(stripEcho("A madeira inchou e não cede.", "Examino a gaveta")).toBe("A madeira inchou e não cede.");
  });

  it("rejects narration whose outcome contradicts the dice", () => {
    const r = guardNarration(narration("Você encontra exatamente o que procurava.", "success"), { input: input(), facts: [], verdict: "failure" });
    expect(r.ok).toBe(false);
  });

  it("rejects narration that reveals an undiscovered clue", () => {
    const i = input();
    const clue = i.blueprint.clues[0];
    const r = guardNarration(narration(`Você percebe algo: ${clue.description}`), { input: i, facts: [] });
    expect(r).toMatchObject({ ok: false, issues: [expect.stringContaining("pista oculta")] });
  });

  it("accepts the clue once the engine's facts say it was found", () => {
    const i = input();
    const clue = i.blueprint.clues[0];
    const r = guardNarration(narration(`Você percebe algo: ${clue.description}`, "success"), { input: i, facts: [`${clue.title}: ${clue.description}`], verdict: "success" });
    expect(r.ok).toBe(true);
  });

  it("fails when nothing new is left after removing repetition, so the caller can retry", () => {
    const said = "O almoxarifado não tem janelas e as prateleiras sobem até o teto.";
    const r = guardNarration(narration(said), { input: input([{ role: "GM", content: said }]), facts: [] });
    expect(r.ok).toBe(false);
  });
});
