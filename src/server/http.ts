import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ServiceError } from "./campaigns";
import { currentPlayer, UnauthorizedError } from "./player";

/** Runs a route handler for the current player and maps domain errors to JSON responses. */
export async function withPlayer(fn: (playerId: string) => Promise<unknown>) {
  try {
    const player = await currentPlayer();
    const body = await fn(player.id);
    return NextResponse.json(body ?? { ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
    if (e instanceof ZodError) return NextResponse.json({ error: "Requisição inválida.", details: e.issues }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("Corpo JSON inválido.", 400);
  }
}
