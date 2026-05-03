import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickRole(v: unknown): Role | null {
  return v === "admin" || v === "member" ? v : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const me = guard;

  const { id } = await params;

  let body: { role?: unknown };
  try {
    body = (await request.json()) as { role?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const nextRole = pickRole(body.role);
  if (!nextRole) {
    return NextResponse.json(
      { error: 'role は "admin" または "member" を指定してください' },
      { status: 400 },
    );
  }

  // 自己降格防止: 自分自身を member にする操作は拒否。
  if (id === me.id && nextRole !== "admin") {
    return NextResponse.json(
      { error: "自分自身を一般ユーザに変更することはできません" },
      { status: 400 },
    );
  }

  // 最後の admin 保護: 全 admin を消せないように、降格時は admin の残数を確認。
  if (nextRole === "member") {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "ユーザが見つかりません" }, { status: 404 });
    }
    if (target.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "最後の管理者を一般ユーザに変更することはできません" },
          { status: 400 },
        );
      }
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { role: nextRole },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    return NextResponse.json({ user });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "ユーザが見つかりません" }, { status: 404 });
    }
    throw err;
  }
}
