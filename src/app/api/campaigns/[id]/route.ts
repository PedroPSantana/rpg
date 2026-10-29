import { z } from "zod";
import { deleteCampaign, getCampaignView, toClientView, updateCampaign } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { readJson, withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ name: z.string().max(80).optional(), archived: z.boolean().optional() });

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return withPlayer(async (playerId) => toClientView(await getCampaignView(getDb(), playerId, id)));
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  return withPlayer(async (playerId) => updateCampaign(getDb(), playerId, id, PatchSchema.parse(await readJson(request))));
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return withPlayer((playerId) => deleteCampaign(getDb(), playerId, id));
}
