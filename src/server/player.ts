import "server-only";
import { cookies } from "next/headers";
import { getDb } from "./db";

const PLAYER_COOKIE = "rpg_player";

export class UnauthorizedError extends Error {}

/** Resolves the current anonymous player (created lazily). */
export async function currentPlayer() {
  const id = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!id || !/^p_[a-f0-9]{32}$/.test(id)) throw new UnauthorizedError("Identidade de jogador ausente.");
  const db = getDb();
  return db.player.upsert({ where: { id }, create: { id }, update: {} });
}
