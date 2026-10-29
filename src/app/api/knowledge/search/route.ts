import { NextResponse, type NextRequest } from "next/server";
import { findRules } from "@/modules/knowledge";

export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  if (!q.trim()) return NextResponse.json({ hits: [] });
  const hits = findRules(q, { editionId: "op-core" }, 8).map((h) => ({ id: h.rule.id, title: h.rule.title, summary: h.rule.summary, citation: h.citation, score: h.score, verificationStatus: h.rule.verificationStatus, implementationStatus: h.rule.implementationStatus }));
  return NextResponse.json({ hits });
}
