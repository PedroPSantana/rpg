import { OP_CORE_RULES } from "./catalog/op-core";
import { SOURCES } from "./catalog/sources";
import { searchRules, type RuleSearchFilters } from "./search";

export * from "./schema";
export { OP_CORE_RULES, SOURCES };

export const ALL_RULES = [...OP_CORE_RULES];

export function sourceTitle(id: string) {
  return SOURCES.find((s) => s.id === id)?.title ?? id;
}

export function findRules(query: string, filters: RuleSearchFilters = {}, limit = 5) {
  return searchRules(ALL_RULES, query, filters, sourceTitle, limit);
}

export function getRule(id: string) {
  return ALL_RULES.find((r) => r.id === id);
}
