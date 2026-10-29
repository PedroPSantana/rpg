import { saveCharacter } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { readJson, withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  return withPlayer(async (playerId) => saveCharacter(getDb(), playerId, id, await readJson(request)));
}
