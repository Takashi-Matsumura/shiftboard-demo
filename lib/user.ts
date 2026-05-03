import { NextResponse } from "next/server";
import { SESSION_COOKIE, parseCookie, resolveSessionCookie, type SessionUser } from "./auth";

function cookieHeaderFrom(req: Request | undefined): string | null | undefined {
  if (!req) return undefined;
  return req.headers.get("cookie");
}

export async function getUser(req: Request | undefined): Promise<SessionUser | null> {
  const header = cookieHeaderFrom(req);
  const raw = parseCookie(header ?? "", SESSION_COOKIE);
  return resolveSessionCookie(raw);
}

// admin 限定エンドポイントの先頭で呼ぶ。
// 戻り値が NextResponse なら呼び出し側はそのまま return すること。
export async function requireAdmin(
  req: Request | undefined,
): Promise<SessionUser | NextResponse> {
  const u = await getUser(req);
  if (!u) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (u.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return u;
}
