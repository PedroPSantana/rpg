import type { RuleRecord } from "./schema";
import { tokenize } from "./text";

export interface RuleSearchFilters {
  systemId?: string;
  editionId?: string;
  category?: RuleRecord["category"];
  implementedOnly?: boolean;
}

export interface RuleSearchHit {
  rule: RuleRecord;
  score: number;
  citation: string;
}

/** Minimum share of the query's (IDF-weighted) terms a rule must match. */
export const MIN_COVERAGE = 0.25;

export function citation(rule: RuleRecord, sourceTitle: (id: string) => string): string {
  return `${sourceTitle(rule.sourceId)} — ${rule.sourceLocator} [${rule.id}]`;
}

/**
 * In-process ranked retrieval over the structured catalog (TF-IDF style with
 * title boost). Edition-aware: rules from other editions are never returned
 * when an edition filter is given. The DB-backed full-text search over
 * ingested source chunks lives in repository.ts.
 */
export function searchRules(rules: RuleRecord[], query: string, filters: RuleSearchFilters = {}, sourceTitle: (id: string) => string = (id) => id, limit = 5): RuleSearchHit[] {
  const pool = rules.filter(
    (r) =>
      (!filters.systemId || r.systemId === filters.systemId) &&
      (!filters.editionId || r.editionId === filters.editionId) &&
      (!filters.category || r.category === filters.category) &&
      (!filters.implementedOnly || r.implementationStatus === "implemented" || r.implementationStatus === "partial"),
  );
  const q = tokenize(query);
  if (!q.length) return [];
  const docs = pool.map((r) => ({
    rule: r,
    title: tokenize(r.title),
    body: tokenize([r.summary, ...r.procedure, ...r.exceptions, r.id.replace(/[.-]/g, " ")].join(" ")),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.title, ...d.body])) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length || 1;
  const idf = (t: string) => Math.log(1 + n / (df.get(t) ?? 0.5));
  const queryWeight = q.reduce((sum, t) => sum + idf(t), 0);
  const hits = docs
    .map((d) => {
      let score = 0;
      let matched = 0;
      for (const t of q) {
        const tf = d.body.filter((x) => x === t).length + 3 * d.title.filter((x) => x === t).length;
        if (!tf) continue;
        score += (1 + Math.log(tf)) * idf(t);
        matched += idf(t);
      }
      return { rule: d.rule, score, coverage: matched / queryWeight, citation: citation(d.rule, sourceTitle) };
    })
    // A hit must explain a meaningful share of the question; otherwise the
    // catalog has no answer and callers must say so instead of guessing.
    .filter((h) => h.score > 0 && h.coverage >= MIN_COVERAGE)
    .map((h) => ({ rule: h.rule, score: h.score, citation: h.citation }))
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id));
  return hits.slice(0, limit);
}
