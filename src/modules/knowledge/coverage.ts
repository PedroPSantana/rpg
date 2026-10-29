import { IMPLEMENTATION_STATUSES, VERIFICATION_STATUSES, type RuleRecord } from "./schema";

/** Shape written by `pnpm test:report` (vitest JSON reporter). */
export interface TestRunReport {
  startTime?: number;
  testResults: { assertionResults: { fullName: string; status: "passed" | "failed" | "pending" | "skipped" | "todo" }[] }[];
}

export type TestCoverageStatus = "passing" | "failing" | "no_tests" | "not_run" | "missing_ref";

export interface RuleCoverage {
  rule: RuleRecord;
  testStatus: TestCoverageStatus;
  matchedTests: { name: string; status: string }[];
  unmatchedRefs: string[];
}

export function ruleCoverage(rules: RuleRecord[], report: TestRunReport | null): RuleCoverage[] {
  const tests = report?.testResults.flatMap((f) => f.assertionResults) ?? [];
  return rules.map((rule) => {
    if (!rule.testRefs.length) return { rule, testStatus: "no_tests", matchedTests: [], unmatchedRefs: [] };
    if (!report) return { rule, testStatus: "not_run", matchedTests: [], unmatchedRefs: [] };
    const matchedTests: RuleCoverage["matchedTests"] = [];
    const unmatchedRefs: string[] = [];
    for (const ref of rule.testRefs) {
      const found = tests.filter((t) => t.fullName.includes(ref));
      if (!found.length) unmatchedRefs.push(ref);
      for (const t of found) matchedTests.push({ name: t.fullName, status: t.status });
    }
    const failing = matchedTests.some((t) => t.status === "failed");
    const testStatus: TestCoverageStatus = failing ? "failing" : unmatchedRefs.length ? "missing_ref" : "passing";
    return { rule, testStatus, matchedTests, unmatchedRefs };
  });
}

export function coverageSummary(coverage: RuleCoverage[]) {
  const count = <T extends string>(values: readonly T[], pick: (c: RuleCoverage) => string) =>
    Object.fromEntries(values.map((v) => [v, coverage.filter((c) => pick(c) === v).length])) as Record<T, number>;
  return {
    total: coverage.length,
    verification: count(VERIFICATION_STATUSES, (c) => c.rule.verificationStatus),
    implementation: count(IMPLEMENTATION_STATUSES, (c) => c.rule.implementationStatus),
    tests: count(["passing", "failing", "no_tests", "not_run", "missing_ref"] as const, (c) => c.testStatus),
    /** Implemented AND passing tests AND verified — the only bucket that counts as "confirmed". */
    confirmed: coverage.filter(
      (c) => c.rule.implementationStatus === "implemented" && c.testStatus === "passing" && (c.rule.verificationStatus === "owner_verified" || c.rule.verificationStatus === "source_verified"),
    ).length,
  };
}
