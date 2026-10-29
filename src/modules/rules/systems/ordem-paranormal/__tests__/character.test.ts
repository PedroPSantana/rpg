import { describe, expect, it } from "vitest";
import { attributeTotals, deriveSheet, freeSkillAllowance, validateBuild } from "../character";
import { combatentePolicial, especialistaAcademico } from "./fixtures";

describe("op-core character validation", () => {
  it("accepts a valid Combatente/Policial build", () => {
    const r = validateBuild(combatentePolicial);
    expect(r.ok).toBe(true);
  });

  it("accepts a valid Especialista with one attribute reduced to 0", () => {
    const r = validateBuild(especialistaAcademico);
    expect(r).toMatchObject({ ok: true });
    expect(attributeTotals(especialistaAcademico.attributes)).toMatchObject({ zeros: 1, spent: 4, budget: 4, remaining: 0 });
  });

  it("rejects attributes above 3 at creation", () => {
    const r = validateBuild({ ...combatentePolicial, attributes: { AGI: 4, FOR: 1, INT: 1, PRE: 1, VIG: 2 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.field === "attributes.AGI")).toBe(true);
  });

  it("rejects reducing two attributes to 0", () => {
    const r = validateBuild({ ...combatentePolicial, attributes: { AGI: 3, FOR: 3, INT: 0, PRE: 0, VIG: 3 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.message).join(" ")).toContain("Apenas um atributo");
  });

  it("rejects unspent or overspent attribute points", () => {
    const under = validateBuild({ ...combatentePolicial, attributes: { AGI: 1, FOR: 1, INT: 1, PRE: 1, VIG: 1 } });
    const over = validateBuild({ ...combatentePolicial, attributes: { AGI: 3, FOR: 3, INT: 1, PRE: 1, VIG: 3 } });
    expect(under.ok || over.ok).toBe(false);
    if (!under.ok) expect(under.issues[0].message).toContain("restam 4");
    if (!over.ok) expect(over.issues[0].message).toContain("além do permitido");
  });

  it("requires exactly 1 + INT free skills for Combatente", () => {
    expect(freeSkillAllowance(combatentePolicial)).toBe(2);
    const r = validateBuild({ ...combatentePolicial, freeSkills: ["atletismo"] });
    expect(r.ok).toBe(false);
  });

  it("grants an extra free pick when an origin skill duplicates a class skill", () => {
    // Lutador grants Luta + Reflexos; Combatente picks Luta and Reflexos too → 2 overlaps.
    const build = { ...combatentePolicial, originId: "lutador" };
    expect(freeSkillAllowance(build)).toBe(4);
    expect(validateBuild({ ...build, freeSkills: ["atletismo", "intimidacao", "percepcao", "pontaria"] }).ok).toBe(true);
  });

  it("rejects picking an already trained skill as a free skill", () => {
    const r = validateBuild({ ...combatentePolicial, freeSkills: ["pontaria", "atletismo"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.ruleId === "op-core.character.skill-overlap")).toBe(true);
  });

  it("does not expose unimplemented classes or origins", () => {
    const occult = validateBuild({ ...combatentePolicial, classId: "ocultista" });
    const origin = validateBuild({ ...combatentePolicial, originId: "chef" });
    expect(occult.ok).toBe(false);
    expect(origin.ok).toBe(false);
    if (!occult.ok) expect(occult.issues.some((i) => i.message.includes("rituais"))).toBe(true);
  });

  it("rejects equipment without proficiency and above Recruta limits", () => {
    const noProf = validateBuild({ ...especialistaAcademico, equipment: ["espingarda"] });
    expect(noProf.ok).toBe(false);
    const tooMany = validateBuild({ ...combatentePolicial, equipment: ["revolver", "pistola", "protecao-leve"] });
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.issues.some((i) => i.ruleId === "op-core.progression.patente")).toBe(true);
  });

  it("validates Perito skill choices for Especialista", () => {
    const bad = validateBuild({ ...especialistaAcademico, peritoSkills: ["luta", "investigacao"] });
    expect(bad.ok).toBe(false);
    const untrained = validateBuild({ ...especialistaAcademico, peritoSkills: ["crime", "investigacao"] });
    expect(untrained.ok).toBe(false);
  });

  it("rejects unsupported NEX", () => {
    expect(validateBuild({ ...combatentePolicial, nex: 10 }).ok).toBe(false);
  });
});

describe("op-core derived statistics", () => {
  it("computes Combatente/Policial at NEX 5%", () => {
    const s = deriveSheet(combatentePolicial);
    expect(s.pvMax).toBe(20 + 3); // 20 + VIG
    expect(s.peMax).toBe(2 + 1); // 2 + PRE
    expect(s.sanMax).toBe(12);
    // 10 + AGI 2 + proteção leve 5 + Patrulha 2
    expect(s.defense).toBe(19);
    expect(s.load).toEqual({ capacity: 10, used: 1 + 2 + 1 + 1 });
    expect(s.skills.find((k) => k.id === "pontaria")).toMatchObject({ grade: "trained", bonus: 5 });
    expect(s.skills.find((k) => k.id === "crime")).toMatchObject({ grade: "untrained", bonus: 0 });
    const revolver = s.attacks.find((a) => a.weaponId === "revolver")!;
    expect(revolver).toMatchObject({ skill: "pontaria", damage: "2d6", damageBonus: 0, critThreshold: 19, critMultiplier: 3 });
    const faca = s.attacks.find((a) => a.weaponId === "faca")!;
    expect(faca.damageBonus).toBe(2); // FOR
  });

  it("computes Especialista/Acadêmico with FOR 0", () => {
    const s = deriveSheet(especialistaAcademico);
    expect(s.pvMax).toBe(16 + 3);
    expect(s.peMax).toBe(3 + 2);
    expect(s.sanMax).toBe(16);
    expect(s.defense).toBe(11);
    expect(s.load.capacity).toBe(2);
    expect(s.abilities.map((a) => a.id)).toEqual(["eclético", "perito", "saber-e-poder"]);
  });

  it("applies origin powers to derived values", () => {
    const base = { ...combatentePolicial, equipment: [] };
    expect(deriveSheet({ ...base, originId: "desgarrado", freeSkills: ["atletismo", "intimidacao", "percepcao"] }).pvMax).toBe(24); // overlap Fortitude? no: Reflexos chosen
    expect(deriveSheet({ ...base, originId: "universitario" }).peMax).toBe(4);
    expect(deriveSheet({ ...base, originId: "vitima" }).sanMax).toBe(13);
    expect(deriveSheet({ ...base, originId: "teorico-da-conspiracao" }).mentalResistance).toBe(1);
    const lutador = deriveSheet({ ...combatentePolicial, originId: "lutador" });
    expect(lutador.attacks.find((a) => a.weaponId === "faca")!.damageBonus).toBe(4);
    const militar = deriveSheet({ ...combatentePolicial, originId: "militar" });
    expect(militar.attacks.find((a) => a.weaponId === "revolver")!.damageBonus).toBe(2);
  });
});
