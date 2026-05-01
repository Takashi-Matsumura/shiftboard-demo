import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookieHeader, createSession, SESSION_COOKIE, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "ユーザ名とパスワードを入力してください" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return NextResponse.json(
      { error: "ユーザ名またはパスワードが違います" },
      { status: 401 },
    );
  }

  const { cookieValue, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, username: user.username } });
  res.headers.set(
    "Set-Cookie",
    cookieHeader(SESSION_COOKIE, cookieValue, { expiresAt }),
  );
  return res;
}
