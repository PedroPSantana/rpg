import { cancelPending } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string; actionId: string }> };

/** Backs out of an action whose dice have not been rolled yet. */
export async function POST(_request: Request, { params }: Ctx) {
  const { id, actionId } = await params;
  return withPlayer(async (playerId) => cancelPending(getDb(), playerId, id, actionId));
}
