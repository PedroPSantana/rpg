import { z } from "zod";
import { createGm } from "@/modules/gm";
import { rollPending } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { readJson, withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string; actionId: string }> };

/** The player's click on the dice: rolls exactly the pending roll, on the server. */
export async function POST(request: Request, { params }: Ctx) {
  const { id, actionId } = await params;
  return withPlayer(async (playerId) => {
    const { index } = z.object({ index: z.number().int().min(0) }).parse(await readJson(request));
    return rollPending(getDb(), createGm(), playerId, id, { actionId, index });
  });
}
