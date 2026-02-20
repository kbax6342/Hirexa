import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const items = await prisma.applyQueue.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as any)?.id ?? null;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const jobs = Array.isArray(body?.jobs) ? body.jobs : [];

  const created = await prisma.applyQueue.createMany({
    data: jobs
      .filter(j => typeof j?.jobUrl === "string" && j.jobUrl.startsWith("http"))
      .map(j => ({
        userId,
        jobUrl: j.jobUrl,
        jobTitle: j.jobTitle ?? null,
        company: j.company ?? null,
        status: "queued",
      })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, createdCount: created.count });
}