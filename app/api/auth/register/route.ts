import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookieHeader, createSession, hashPassword, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "ユーザ名は 3〜32 文字の英数字 / _ . - のみ使用できます" },
      { status: 400 },
    );
  }
  if (password.length < 4 || password.length > 12) {
    return NextResponse.json(
      { error: "パスワードは 4〜12 文字で指定してください" },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { error: "このユーザ名は既に使用されています" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { username, passwordHash } });
  const { cookieValue, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ user: { id: user.id, username: user.username } });
  res.headers.set(
    "Set-Cookie",
    cookieHeader(SESSION_COOKIE, cookieValue, { expiresAt }),
  );
  return res;
}
