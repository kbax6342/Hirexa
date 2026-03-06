import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionUserId } from "@/app/lib/session-user";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.linkedInAccount.upsert({
    where: { userId },
    create: { userId },
    update: { connectedAt: new Date() },
  });

  return NextResponse.json({ ok: true, account });
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.linkedInAccount.findUnique({ where: { userId } });
  return NextResponse.json({ ok: true, connected: Boolean(account), account });
}

export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await prisma.linkedInAccount.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
