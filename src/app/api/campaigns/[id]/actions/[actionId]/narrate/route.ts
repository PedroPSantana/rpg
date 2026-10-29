import { createGm } from "@/modules/gm";
import { narrateAction } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string; actionId: string }> };

/** Retries narration of an already-resolved action. Never re-runs mechanics. */
export async function POST(_request: Request, { params }: Ctx) {
  const { id, actionId } = await params;
  return withPlayer(async (playerId) => ({ narration: await narrateAction(getDb(), createGm(), playerId, id, actionId) }));
}
