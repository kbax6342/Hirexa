import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ ok: true, leads: [], total: 0 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? 50)));
  const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));

  const [leads, total] = await Promise.all([
    prisma.recruiterLead.findMany({
      where: { campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    }),
    prisma.recruiterLead.count({ where: { campaignId: campaign.id } }),
  ]);

  return NextResponse.json({ ok: true, leads, total, take, skip });
}
