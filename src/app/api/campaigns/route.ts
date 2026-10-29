import { z } from "zod";
import { createCampaign, listCampaigns } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { readJson, withPlayer } from "@/server/http";

const CreateSchema = z.object({
  name: z.string().max(80).default(""),
  systemId: z.string(),
  editionId: z.string(),
  seed: z.string().max(120).optional(),
});

export async function GET() {
  return withPlayer((playerId) => listCampaigns(getDb(), playerId));
}

export async function POST(request: Request) {
  return withPlayer(async (playerId) => {
    const input = CreateSchema.parse(await readJson(request));
    return { id: await createCampaign(getDb(), playerId, input) };
  });
}
