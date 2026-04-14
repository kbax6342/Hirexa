import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  try {
    const userId = await getUserId();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobs = await prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        title: true,
        company: true,
        location: true,
        url: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, jobs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
