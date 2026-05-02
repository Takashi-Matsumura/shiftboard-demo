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
  notes?: unknown;
};

function pickOptionalId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNotes(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.length > NOTES_MAX ? v.slice(0, NOTES_MAX) : v;
}

const ENTRY_SELECT = {
  id: true,
  cardId: true,
  whoId: true,
  whatId: true,
  toWhomId: true,
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
