import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ScheduleRecord 一覧を返す。`?from=YYYY-MM-DD&to=YYYY-MM-DD` で範囲指定。
// 省略時は「直近 30 日」(today から 29 日前まで) を新しい順で返す。
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const to = parseDateOnly(toParam) ?? today;
  const from = parseDateOnly(fromParam) ?? addDays(to, -29);

  const records = await prisma.scheduleRecord.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: "desc" }, { plannedStartAt: "asc" }, { createdAt: "asc" }],
    include: {
      who: { select: { id: true, name: true, color: true } },
      what: { select: { id: true, name: true, color: true } },
      toWhom: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json({ records });
}

function parseDateOnly(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
