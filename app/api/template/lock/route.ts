import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_ID = "default";

// editingBy が null か自分なら成功、他人なら 409 Conflict を返す。
// 行が無ければ作成しつつロックを取得（最初の編集者のため）。
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard instanceof NextResponse) return guard;
  const user = guard;

  const existing = await prisma.template.findUnique({ where: { id: TEMPLATE_ID } });

  if (existing && existing.editingBy && existing.editingBy !== user.id) {
    return NextResponse.json(
      {
        error: "他のユーザがテンプレ編集中です",
        editingBy: existing.editingBy,
        editingStartedAt: existing.editingStartedAt?.getTime() ?? null,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  await prisma.template.upsert({
    where: { id: TEMPLATE_ID },
    create: {
      id: TEMPLATE_ID,
      elements: "[]",
      editingBy: user.id,
      editingStartedAt: now,
    },
    update: {
      editingBy: user.id,
      editingStartedAt: existing?.editingStartedAt ?? now,
    },
  });

  return NextResponse.json({ ok: true, editingBy: user.id });
}
