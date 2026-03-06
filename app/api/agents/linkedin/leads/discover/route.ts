import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { generateDummyLeads } from "@/app/lib/agents/linkedinSim";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId } });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const candidates = generateDummyLeads(campaign);
  let created = 0;

  for (const lead of candidates) {
    const result = await prisma.recruiterLead.upsert({
      where: {
        campaignId_linkedinUrl: {
          campaignId: campaign.id,
          linkedinUrl: lead.linkedinUrl,
        },
      },
      create: {
        campaignId: campaign.id,
        name: lead.name,
        company: lead.company,
        title: lead.title,
        linkedinUrl: lead.linkedinUrl,
        connectionLevel: lead.connectionLevel,
      },
      update: {
        name: lead.name,
        company: lead.company,
        title: lead.title,
        connectionLevel: lead.connectionLevel,
      },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created += 1;
    }
  }

  return NextResponse.json({ ok: true, created });
}
