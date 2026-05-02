import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTES_MAX = 1000;

type PatchBody = {
  actualStartAt?: unknown;
  actualEndAt?: unknown;
  actualNotes?: unknown;
};

function pickDate(v: unknown): Date | null {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pickNotes(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.length > NOTES_MAX ? v.slice(0, NOTES_MAX) : v;
}

// 実績 (actual*) フィールドだけを書き換える PATCH。予定 (planned*) は frozen。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // body に含まれているキーだけ更新する (= undefined キーは触らない)
  const data: {
    actualStartAt?: Date | null;
    actualEndAt?: Date | null;
    actualNotes?: string;
  } = {};
  if (Object.prototype.hasOwnProperty.call(body, "actualStartAt")) {
    data.actualStartAt = pickDate(body.actualStartAt);
  }
  if (Object.prototype.hasOwnProperty.call(body, "actualEndAt")) {
    data.actualEndAt = pickDate(body.actualEndAt);
  }
  if (Object.prototype.hasOwnProperty.call(body, "actualNotes")) {
    data.actualNotes = pickNotes(body.actualNotes);
  }

  try {
    const record = await prisma.scheduleRecord.update({
      where: { id },
      data,
      include: {
        who: { select: { id: true, name: true, color: true } },
        what: { select: { id: true, name: true, color: true } },
        toWhom: { select: { id: true, name: true, color: true } },
      },
    });
    return NextResponse.json({ record });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "record not found" }, { status: 404 });
    }
    throw err;
  }
}
