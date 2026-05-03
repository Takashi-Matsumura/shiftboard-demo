import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_ID = "default";

// 自分が保有しているロックのみ解放できる (他人のロックは触らない)。
// 行がそもそも無い / editingBy が null なら冪等に 200。
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const existing = await prisma.template.findUnique({ where: { id: TEMPLATE_ID } });
  if (!existing || !existing.editingBy) {
    return NextResponse.json({ ok: true, released: false });
  }

  if (existing.editingBy !== user.id) {
    return NextResponse.json(
      { error: "他のユーザのロックは解放できません" },
      { status: 403 },
    );
  }

  await prisma.template.update({
    where: { id: TEMPLATE_ID },
    data: { editingBy: null, editingStartedAt: null },
  });

  return NextResponse.json({ ok: true, released: true });
}
