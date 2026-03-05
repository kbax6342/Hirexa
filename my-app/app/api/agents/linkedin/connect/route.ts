import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST() {
  const userId = await getUserId();
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
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.linkedInAccount.findUnique({ where: { userId } });
  return NextResponse.json({ ok: true, connected: Boolean(account), account });
}

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await prisma.linkedInAccount.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
