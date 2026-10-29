import { describe, expect, it } from "vitest";
import { scriptedRandom, seededRandom } from "../../../core/random";
import { deriveSheet, initialState } from "../character";
import { planSkillCheck, rollTest, skillCheck } from "../tests";
import { combatentePolicial, especialistaAcademico } from "./fixtures";

describe("op-core basic test (rollTest)", () => {
  it("rolls d20s equal to the attribute and keeps the highest", () => {
    const r = rollTest({ label: "x", attribute: 3, modifiers: [{ source: "Treinado", value: 5 }], target: 15 }, scriptedRandom([4, 12, 9]));
    expect(r.dice.map((d) => d.value)).toEqual([4, 12, 9]);
    expect(r.dice.filter((d) => d.kept)).toEqual([{ sides: 20, value: 12, kept: true }]);
    expect(r.total).toBe(17);
    expect(r.outcome).toBe("success");
  });

  it("with attribute 0 rolls 2d20 and keeps the lowest", () => {
    const r = rollTest({ label: "x", attribute: 0, target: 10 }, scriptedRandom([18, 3]));
    expect(r.natural).toBe(3);
    expect(r.expression).toContain("2d20");
    expect(r.outcome).toBe("failure");
  });

  it("dice penalties below zero roll more dice keeping the lowest", () => {
    const r = rollTest({ label: "x", attribute: 1, diceModifier: -2 }, scriptedRandom([20, 15, 7]));
    expect(r.dice).toHaveLength(3);
    expect(r.natural).toBe(7);
  });

  it("marks exactly one die as kept even with duplicate faces", () => {
    const r = rollTest({ label: "x", attribute: 3 }, scriptedRandom([10, 10, 10]));
    expect(r.dice.filter((d) => d.kept)).toHaveLength(1);
  });

  it("equal to DT is a success", () => {
    expect(rollTest({ label: "x", attribute: 1, target: 15 }, scriptedRandom([10]) ).outcome).toBe("failure");
    expect(rollTest({ label: "x", attribute: 1, modifiers: [{ source: "b", value: 5 }], target: 15 }, scriptedRandom([10])).outcome).toBe("success");
  });

  it("is reproducible with a seeded source and stays within bounds", () => {
    const a = seededRandom("seed");
    const b = seededRandom("seed");
    for (let i = 0; i < 200; i++) {
      const ra = rollTest({ label: "x", attribute: 2 }, a);
      const rb = rollTest({ label: "x", attribute: 2 }, b);
      expect(ra.total).toBe(rb.total);
      expect(ra.natural).toBeGreaterThanOrEqual(1);
      expect(ra.natural).toBeLessThanOrEqual(20);
    }
  });
});

describe("op-core skill checks with powers and resources", () => {
  const acad = deriveSheet(especialistaAcademico);
  const acadState = initialState(especialistaAcademico, acad);
  const pol = deriveSheet(combatentePolicial);
  const polState = initialState(combatentePolicial, pol);

  it("adds training bonus to trained skills", () => {
    const r = skillCheck(acad, acadState, { skillId: "investigacao", dt: 15 }, scriptedRandom([2, 9, 6]));
    expect(r.ok && r.roll.total).toBe(9 + 5);
  });

  it("blocks trained-only skills when untrained", () => {
    const r = skillCheck(pol, polState, { skillId: "ocultismo", dt: 10 }, scriptedRandom([10]));
    expect(r).toMatchObject({ ok: false, ruleId: "op-core.skills.trained-only" });
  });

  it("Eclético allows a trained-only skill as trained for 2 PE", () => {
    const r = skillCheck(acad, acadState, { skillId: "crime", powers: ["eclético"], dt: 10 }, scriptedRandom([8]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.peCost).toBe(2);
      expect(r.roll.total).toBe(13);
    }
  });

  it("Saber é Poder only works on Intelecto skills and stacks with Perito", () => {
    const bad = planSkillCheck(acad, acadState, { skillId: "diplomacia", powers: ["saber-e-poder"] });
    expect(bad.ok).toBe(false);
    const r = skillCheck(acad, acadState, { skillId: "investigacao", powers: ["saber-e-poder", "perito"], dt: 20 }, scriptedRandom([1, 2, 11, 4]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.peCost).toBe(4);
      expect(r.roll.total).toBe(11 + 5 + 5 + 4);
      expect(r.roll.outcome).toBe("success");
    }
  });

  it("rejects powers the character does not have", () => {
    expect(planSkillCheck(pol, polState, { skillId: "investigacao", powers: ["saber-e-poder"] }).ok).toBe(false);
  });

  it("rejects when PE is insufficient", () => {
    const r = planSkillCheck(acad, { ...acadState, pe: 3 }, { skillId: "investigacao", powers: ["saber-e-poder", "perito"] });
    expect(r).toMatchObject({ ok: false, ruleId: "op-core.resources.pe" });
  });

  it("Faro para Pistas: requires clue search and is once per scene", () => {
    const inv = deriveSheet({ ...especialistaAcademico, originId: "investigador", freeSkills: ["intuicao", "medicina", "ocultismo", "atualidades", "diplomacia", "furtividade", "vontade", "tecnologia", "reflexos", "ciencias"] });
    const st = initialState(especialistaAcademico, inv);
    expect(planSkillCheck(inv, st, { skillId: "investigacao", powers: ["faro-para-pistas"] }).ok).toBe(false);
    const ok = planSkillCheck(inv, st, { skillId: "investigacao", powers: ["faro-para-pistas"], searchingClues: true });
    expect(ok).toMatchObject({ ok: true, peCost: 1, sceneUses: ["faro-para-pistas"] });
    expect(planSkillCheck(inv, { ...st, sceneUses: ["faro-para-pistas"] }, { skillId: "investigacao", powers: ["faro-para-pistas"], searchingClues: true }).ok).toBe(false);
  });
});
