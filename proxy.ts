import { NextResponse, type NextRequest } from "next/server";

// Cookie 名は lib/auth.ts と同期。Edge Runtime では node:crypto を使う lib/auth.ts を
// import できないので、ここに定数を持たせる。
const SESSION_COOKIE = "mw_session";

const AUTH_PAGES = new Set(["/login", "/register"]);

// UI ページのみガードする (API は各ルートで 401 を返すので二重ガード不要)。
// Cookie の「存在」だけで判定し、失効検証はリクエスト先 (route) に任せる。
export function proxy(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (AUTH_PAGES.has(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/register"],
};
