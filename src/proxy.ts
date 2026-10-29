import { NextResponse, type NextRequest } from "next/server";

export const PLAYER_COOKIE = "rpg_player";

/**
 * Assigns an anonymous local player identity. Every campaign is scoped to it,
 * which keeps campaigns isolated between browsers. Not an authentication
 * system — see docs/architecture.md (Access control).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(PLAYER_COOKIE)?.value) return NextResponse.next();
  const id = `p_${crypto.randomUUID().replace(/-/g, "")}`;
  request.cookies.set(PLAYER_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(PLAYER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 * 5 });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
