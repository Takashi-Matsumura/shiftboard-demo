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
