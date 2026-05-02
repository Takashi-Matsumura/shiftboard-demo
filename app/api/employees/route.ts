import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { isCardColorId } from "@/lib/grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 80;

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json({ employees });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: unknown; color?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; color?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name は必須です" }, { status: 400 });
  }
  if (name.length > NAME_MAX) {
    return NextResponse.json({ error: `name は ${NAME_MAX} 文字以内` }, { status: 400 });
  }

  if (body.color !== undefined && !isCardColorId(body.color)) {
    return NextResponse.json({ error: "color が不正です" }, { status: 400 });
  }
  const color = isCardColorId(body.color) ? body.color : undefined;

  try {
    const employee = await prisma.employee.create({
      data: color ? { name, color } : { name },
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json({ employee });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json({ error: "同じ名前が既に登録されています" }, { status: 409 });
    }
    throw err;
  }
}
