import { describe, expect, it } from "vitest";
import { ALL_RULES, SOURCES, findRules } from "..";
import { chunkJson, chunkText } from "../ingest";
import { coverageSummary, ruleCoverage } from "../coverage";
import { RuleRecordSchema } from "../schema";

describe("knowledge catalog integrity", () => {
  it("every rule has a unique stable id and a known source", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ALL_RULES) {
      expect(() => RuleRecordSchema.parse(r)).not.toThrow();
      expect(SOURCES.some((s) => s.id === r.sourceId)).toBe(true);
    }
  });

  it("dependencies point to existing rules", () => {
    const ids = new Set(ALL_RULES.map((r) => r.id));
    for (const r of ALL_RULES) for (const d of r.dependencies) expect(ids.has(d), `${r.id} -> ${d}`).toBe(true);
  });

  it("implemented rules name their implementation and tests", () => {
    for (const r of ALL_RULES.filter((x) => x.implementationStatus === "implemented")) {
      expect(r.implementedIn.length, r.id).toBeGreaterThan(0);
      expect(r.testRefs.length, r.id).toBeGreaterThan(0);
    }
  });

  it("does not claim verification for book rules the project cannot access", () => {
    const book = ALL_RULES.filter((r) => r.sourceId === "op-core-rulebook");
    expect(book.every((r) => r.verificationStatus !== "source_verified" && r.verificationStatus !== "owner_verified")).toBe(true);
  });

  it("conflicting rules document their resolution", () => {
    for (const r of ALL_RULES.filter((x) => x.verificationStatus === "conflict")) expect(r.conflictNotes).toBeTruthy();
  });
});

describe("rule retrieval", () => {
  it.each([
    ["como funciona o acerto crítico", "op-core.combat.critical"],
    ["quantos pontos de atributo eu distribuo", "op-core.character.attributes"],
    ["Defesa agilidade", "op-core.derived.defense"],
    ["o que acontece com 0 PV morrendo", "op-core.conditions.morrendo"],
    ["perícia somente treinada ocultismo", "op-core.skills.trained-only"],
    ["iniciativa ordem dos turnos", "op-core.combat.initiative"],
    ["sanidade dano mental", "op-core.sanity.damage"],
  ])("finds the right rule for %s", (query, expected) => {
    const hits = findRules(query, { editionId: "op-core" }, 3);
    expect(hits.map((h) => h.rule.id)).toContain(expected);
    expect(hits[0].citation).toContain("[");
  });

  it("is edition-aware", () => {
    expect(findRules("crítico", { editionId: "outra-edicao" })).toEqual([]);
  });
});

describe("source ingestion", () => {
  it("keeps headings and page markers as provenance", () => {
    const md = "<!-- page: 10 -->\n# Capítulo 1\n## Testes\nRole dados.\n\n<!-- page: 11 -->\n## Combate\nTexto de combate.";
    const chunks = chunkText("src", md);
    expect(chunks.map((c) => [c.headingPath.join(" > "), c.page])).toEqual([
      ["Capítulo 1 > Testes", 10],
      ["Capítulo 1 > Combate", 11],
    ]);
  });

  it("flags broken tables, formulas and ambiguous references", () => {
    const [c] = chunkText("src", "# T\nDano | 1d6\nO dano é 2d6 +\nVeja a página ??");
    expect(c.flags).toEqual(expect.arrayContaining(["possible_broken_table", "possible_broken_formula", "ambiguous_reference"]));
  });

  it("splits very long sections and parses JSON sources", () => {
    const long = "# L\n" + Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} `.repeat(20)).join("\n\n");
    expect(chunkText("src", long, { maxChars: 1000 }).length).toBeGreaterThan(1);
    expect(chunkJson("src", [{ heading: ["A", "B"], page: 3, text: "x" }])[0]).toMatchObject({ headingPath: ["A", "B"], page: 3 });
    expect(() => chunkJson("src", [{ text: 1 }])).toThrow();
  });
});

describe("coverage report", () => {
  it("distinguishes passing, failing, missing and absent tests", () => {
    const rules = ALL_RULES.slice(0, 3).map((r, i) => ({ ...r, testRefs: i === 2 ? [] : [`ref${i}`] }));
    const report = { testResults: [{ assertionResults: [{ fullName: "x ref0", status: "passed" as const }, { fullName: "x ref1", status: "failed" as const }] }] };
    const cov = ruleCoverage(rules, report);
    expect(cov.map((c) => c.testStatus)).toEqual(["passing", "failing", "no_tests"]);
    expect(ruleCoverage(rules, null)[0].testStatus).toBe("not_run");
    expect(coverageSummary(cov).confirmed).toBe(0);
  });
});

describe("retrieval coverage threshold", () => {
  it("returns nothing for questions the catalog cannot answer", () => {
    expect(findRules("regras de veículos e perseguição de carro")).toEqual([]);
    expect(findRules("como conjurar um ritual de terceiro círculo")).toEqual([]);
    expect(findRules("o que acontece quando chego a zero pontos de vida", {}, 3).map((h) => h.rule.id)).toContain("op-core.conditions.morrendo");
  });
});
