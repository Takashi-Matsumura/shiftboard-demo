import { NextResponse, type NextRequest } from "next/server";
import {
  cookieHeader,
  destroySessionByCookie,
  parseCookie,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (raw) {
    await destroySessionByCookie(raw);
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set(
    "Set-Cookie",
    cookieHeader(SESSION_COOKIE, "", { clear: true }),
  );
  return res;
}
