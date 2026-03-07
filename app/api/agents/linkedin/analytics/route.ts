import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

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
