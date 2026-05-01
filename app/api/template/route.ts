import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { isGridFrameElement } from "@/lib/grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_ID = "default";
const MAX_BYTES = 4 * 1024 * 1024;

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// 現テンプレを取得。クライアントは elements が空なら lib/grid.ts のデフォルトを使う。
// editingBy も返して、他者編集中なら UI で無効化できるようにする。
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.template.findUnique({ where: { id: TEMPLATE_ID } });
  if (!row) {
    return NextResponse.json({
      elements: [],
      editingBy: null,
      isMine: false,
      updatedAt: null,
    });
  }
  return NextResponse.json({
    elements: safeParseJson<unknown[]>(row.elements, []),
    editingBy: row.editingBy,
    isMine: row.editingBy === user.id,
    editingStartedAt: row.editingStartedAt?.getTime() ?? null,
    updatedAt: row.updatedAt.getTime(),
  });
}

// 編集中ユーザのみ保存可能。editingBy === user.id でなければ 423。
export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `payload too large (> ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as { elements?: unknown };
  const elementsRaw = Array.isArray(b.elements) ? b.elements : [];
  // 多層防御: テンプレ枠 (frame) のみ保存。動的メタ (meta) や非 grid 要素は除外。
  const elements = elementsRaw.filter((el: unknown) =>
    isGridFrameElement(el as { customData?: unknown }),
  );
  const elementsStr = JSON.stringify(elements);

  // ロック保有者のみ保存可。upsert で空行が無い場合も処理。
  const existing = await prisma.template.findUnique({ where: { id: TEMPLATE_ID } });
  if (existing && existing.editingBy && existing.editingBy !== user.id) {
    return NextResponse.json(
      { error: "編集ロックが他のユーザに取得されています" },
      { status: 423 },
    );
  }

  await prisma.template.upsert({
    where: { id: TEMPLATE_ID },
    create: { id: TEMPLATE_ID, elements: elementsStr },
    update: { elements: elementsStr },
  });

  return NextResponse.json({ ok: true });
}
