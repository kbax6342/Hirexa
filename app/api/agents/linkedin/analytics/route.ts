import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId }, select: { id: true } });
  if (!campaign) {
    return NextResponse.json({
      ok: true,
      analytics: { leadsTotal: 0, leadsReady: 0, messagesSent: 0, leadsReplied: 0 },
    });
  }

  const [leadsTotal, leadsReady, messagesSent, leadsReplied] = await Promise.all([
    prisma.recruiterLead.count({ where: { campaignId: campaign.id } }),
    prisma.recruiterLead.count({ where: { campaignId: campaign.id, status: "READY" } }),
    prisma.outreachMessage.count({ where: { lead: { campaignId: campaign.id }, status: "SENT" } }),
    prisma.recruiterLead.count({ where: { campaignId: campaign.id, status: "REPLIED" } }),
  ]);

  return NextResponse.json({ ok: true, analytics: { leadsTotal, leadsReady, messagesSent, leadsReplied } });
}
