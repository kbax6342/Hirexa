import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionUserId } from "@/app/lib/session-user";
export async function GET(req: Request) {
  const userId = await getSessionUserId();
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
