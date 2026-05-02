import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTES_MAX = 1000;
const CARD_ID_RE = /^card:[a-z0-9:]+$/i;

type EntryBody = {
  whoId?: unknown;
  whatId?: unknown;
  toWhomId?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  notes?: unknown;
};

function pickOptionalId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNotes(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.length > NOTES_MAX ? v.slice(0, NOTES_MAX) : v;
}

function pickDate(v: unknown): Date | null {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ENTRY_SELECT = {
  id: true,
  cardId: true,
  whoId: true,
  whatId: true,
  toWhomId: true,
  startAt: true,
  endAt: true,
  notes: true,
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cardId } = await params;
  if (!CARD_ID_RE.test(cardId)) {
    return NextResponse.json({ error: "invalid cardId" }, { status: 400 });
  }

  const entry = await prisma.scheduleEntry.findUnique({
    where: { cardId },
    select: ENTRY_SELECT,
  });
  return NextResponse.json({ entry });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cardId } = await params;
  if (!CARD_ID_RE.test(cardId)) {
    return NextResponse.json({ error: "invalid cardId" }, { status: 400 });
  }

  let body: EntryBody;
  try {
    body = (await request.json()) as EntryBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const data = {
    whoId: pickOptionalId(body.whoId),
    whatId: pickOptionalId(body.whatId),
    toWhomId: pickOptionalId(body.toWhomId),
    startAt: pickDate(body.startAt),
    endAt: pickDate(body.endAt),
    notes: pickNotes(body.notes),
  };

  const entry = await prisma.scheduleEntry.upsert({
    where: { cardId },
    update: data,
    create: { cardId, ...data },
    select: ENTRY_SELECT,
  });

  return NextResponse.json({ entry });
}

// カードを破棄するときの後始末。ScheduleEntry を削除し、
// 過去日のスナップショット (ScheduleRecord) は履歴として残す。
// 該当エントリが存在しない場合 (P2025) も冪等に 200 を返す。
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cardId } = await params;
  if (!CARD_ID_RE.test(cardId)) {
    return NextResponse.json({ error: "invalid cardId" }, { status: 400 });
  }

  try {
    await prisma.scheduleEntry.delete({ where: { cardId } });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "P2025") throw err;
  }

  return NextResponse.json({ ok: true });
}

// カードの座標から導出した startAt / endAt のみを書き戻す部分更新。
// 他フィールド (whoId / whatId / toWhomId / notes) は保持する。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cardId } = await params;
  if (!CARD_ID_RE.test(cardId)) {
    return NextResponse.json({ error: "invalid cardId" }, { status: 400 });
  }

  let body: EntryBody;
  try {
    body = (await request.json()) as EntryBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const startAt = pickDate(body.startAt);
  const endAt = pickDate(body.endAt);

  const entry = await prisma.scheduleEntry.upsert({
    where: { cardId },
    update: { startAt, endAt },
    create: { cardId, startAt, endAt },
    select: ENTRY_SELECT,
  });

  return NextResponse.json({ entry });
}
