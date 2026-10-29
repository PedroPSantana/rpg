import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { TestRunReport } from "@/modules/knowledge/coverage";

/** Reads a JSON report produced by `pnpm test:report` / `pnpm evals`. Missing reports are not an error. */
export async function readReport<T>(name: string): Promise<{ data: T; mtime: Date } | null> {
  const file = path.join(process.cwd(), "reports", name);
  try {
    const [raw, info] = await Promise.all([readFile(file, "utf8"), stat(file)]);
    return { data: JSON.parse(raw) as T, mtime: info.mtime };
  } catch {
    return null;
  }
}

export const readTestReport = () => readReport<TestRunReport>("vitest.json");
