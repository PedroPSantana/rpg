import { z } from "zod";
import { createGm } from "@/modules/gm";
import { submitAction } from "@/server/campaigns";
import { getDb } from "@/server/db";
import { readJson, withPlayer } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const SubmitSchema = z.union([
  z.object({ idempotencyKey: z.string(), expectedVersion: z.number().int().optional(), text: z.string().max(2000) }),
  // The action payload itself is validated by the campaign service.
  z.object({ idempotencyKey: z.string(), expectedVersion: z.number().int().optional(), action: z.record(z.string(), z.unknown()) }),
]);

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  return withPlayer(async (playerId) => {
    const input = SubmitSchema.parse(await readJson(request));
    return submitAction(getDb(), createGm(), playerId, id, input as Parameters<typeof submitAction>[4]);
  });
}
