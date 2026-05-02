import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { cardBoundsToSlot, isCardElement, slotToDateTime } from "@/lib/grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 「最後にスナップした日 + 1」 から「昨日」までの範囲をまとめてスナップする。
// 各 (date, cardId) は @@unique を効かせた upsert で冪等。
// 二重実行時は update: {} で何も変えない (= 予定 frozen)。
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = addDays(today, -1);

  const lastRecord = await prisma.scheduleRecord.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const fromDate = lastRecord ? addDays(stripTime(lastRecord.date), 1) : yesterday;

  if (fromDate.getTime() > yesterday.getTime()) {
    return NextResponse.json({
      snapshotted: 0,
      datesProcessed: [],
      reason: "up-to-date",
    });
  }

  // Whiteboard は 1 行 (id=default)。要素 JSON をパースしてカードだけ抽出する。
  const wb = await prisma.whiteboard.findUnique({
    where: { id: "default" },
    select: { elements: true },
  });
  const elements = wb ? safeParseArray(wb.elements) : [];
  const cards = elements.filter((el): el is Record<string, unknown> =>
    isCardElement(el as { customData?: unknown }),
  );

  // entry を一括引いておく (cards.length 回の DB 往復を避ける)
  const cardIds = cards
    .map((c) => (c as { id?: unknown }).id)
    .filter((v): v is string => typeof v === "string");
  const entries = cardIds.length
    ? await prisma.scheduleEntry.findMany({
        where: { cardId: { in: cardIds } },
        select: {
          cardId: true,
          whoId: true,
          whatId: true,
          toWhomId: true,
          startAt: true,
          endAt: true,
          notes: true,
        },
      })
    : [];
  const entryByCardId = new Map(entries.map((e) => [e.cardId, e]));

  let snapshotted = 0;
  const datesProcessed: string[] = [];

  for (let d = new Date(fromDate); d.getTime() <= yesterday.getTime(); d = addDays(d, 1)) {
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    datesProcessed.push(formatDateOnly(d));

    for (const card of cards) {
      const c = card as {
        id?: unknown;
        x?: unknown;
        y?: unknown;
        width?: unknown;
        height?: unknown;
      };
      if (
        typeof c.id !== "string" ||
        typeof c.x !== "number" ||
        typeof c.y !== "number" ||
        typeof c.width !== "number" ||
        typeof c.height !== "number"
      ) {
        continue;
      }
      const entry = entryByCardId.get(c.id);
      if (!entry) continue;
      if (!entry.whoId && !entry.whatId && !entry.toWhomId) continue;

      const slot = cardBoundsToSlot({
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
      });
      if (!slot) continue;
      if (slot.dow !== dow) continue;

      // entry.startAt/endAt が入っていれば優先 (ただし日付部は対象日に置き換える)
      const plannedStartAt = entry.startAt
        ? overrideDate(d, entry.startAt)
        : slotToDateTime(d, slot.startMin30);
      const plannedEndAt = entry.endAt
        ? overrideDate(d, entry.endAt)
        : slotToDateTime(d, slot.endMin30);

      try {
        await prisma.scheduleRecord.upsert({
          where: { date_cardId: { date: d, cardId: c.id } },
          create: {
            date: d,
            cardId: c.id,
            whoId: entry.whoId,
            whatId: entry.whatId,
            toWhomId: entry.toWhomId,
            plannedStartAt,
            plannedEndAt,
            plannedNotes: entry.notes ?? "",
          },
          update: {},
        });
        snapshotted++;
      } catch {
        // 同時実行で他のリクエストが先に作っていた場合などは無視
      }
    }
  }

  return NextResponse.json({ snapshotted, datesProcessed });
}

function safeParseArray(s: string): unknown[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stripTime(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// 元の DateTime の時刻部だけ取り出して、対象日 (year/month/day) と組み合わせる。
function overrideDate(targetDate: Date, source: Date): Date {
  const out = new Date(targetDate);
  out.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return out;
}
