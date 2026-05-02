import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { isCardColorId } from "@/lib/grid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_MAX = 120;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { name?: unknown; color?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; color?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const data: { name?: string; color?: string } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name は必須です" }, { status: 400 });
    if (name.length > NAME_MAX) {
      return NextResponse.json({ error: `name は ${NAME_MAX} 文字以内` }, { status: 400 });
    }
    data.name = name;
  }
  if (body.color !== undefined) {
    if (!isCardColorId(body.color)) {
      return NextResponse.json({ error: "color が不正です" }, { status: 400 });
    }
    data.color = body.color;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data,
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json({ customer });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (code === "P2002") {
      return NextResponse.json({ error: "同じ名前が既に登録されています" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    throw err;
  }
}
