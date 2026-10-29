import { NextResponse } from "next/server";
import { gmStatus } from "@/modules/gm";

/** Reports provider status only — never the key itself. */
export function GET() {
  const s = gmStatus();
  return NextResponse.json({ wanted: s.wanted, active: s.active, model: s.model, keyConfigured: s.hasKey });
}
