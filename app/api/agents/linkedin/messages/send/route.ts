import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  applyLeadTypeTemplate,
  buildSuggestedShortBio,
  interpolateTemplate,
} from "@/app/lib/agents/linkedinSim";

type SendPayload = { leadId: string; templateId?: string; body?: string };

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json()) as SendPayload;
  if (typeof payload?.leadId !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    select: { id: true, shortBio: true },
  });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const lead = (await prisma.recruiterLead.findFirst({
    where: { id: payload.leadId, campaignId: campaign.id },
    select: {
      id: true,
      name: true,
      company: true,
      title: true,
      leadType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      linkedinUrl: true,
      outreachJobTargetId: true,
      campaignId: true,
      connectionLevel: true,
      lastMessagedAt: true,
    },
  })) as any;
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

  let templateId: string | null = null;
  let resolvedBody = payload.body?.trim() || "";

  if (!resolvedBody && payload.templateId) {
    const template = await prisma.outreachTemplate.findFirst({
      where: { id: payload.templateId, campaignId: campaign.id },
      select: { id: true, body: true },
    });
    if (!template) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    templateId = template.id;
    resolvedBody = template.body;
  }

  if (!resolvedBody) {
    const defaultTemplate = await prisma.outreachTemplate.findFirst({
      where: { campaignId: campaign.id, isDefault: true },
      select: { id: true, body: true },
    });

    if (defaultTemplate) {
      templateId = defaultTemplate.id;
      resolvedBody = defaultTemplate.body;
    }
  }

  if (!resolvedBody) {
    return NextResponse.json({ ok: false, error: "No message body available" }, { status: 400 });
  }

  const linkedInAccount = await prisma.linkedInAccount.findUnique({
    where: { userId },
    select: {
      importedName: true,
      importedHeadline: true,
      importedSkills: true,
      importedLocation: true,
    },
  });

  const fallbackShortBio = linkedInAccount
    ? buildSuggestedShortBio({
        importedName: linkedInAccount.importedName ?? null,
        importedHeadline: linkedInAccount.importedHeadline ?? null,
        importedSkills: linkedInAccount.importedSkills ?? [],
        location: linkedInAccount.importedLocation ?? null,
      })
    : "";

  const leadAwareBody = applyLeadTypeTemplate(resolvedBody, lead.leadType ?? null);

  const finalBody = interpolateTemplate(
    leadAwareBody,
    {
      name: lead.name,
      company: lead.company,
      title: lead.title,
    },
    { shortBio: campaign.shortBio ?? fallbackShortBio ?? null },
    linkedInAccount
      ? {
          importedName: linkedInAccount.importedName ?? null,
          importedHeadline: linkedInAccount.importedHeadline ?? null,
        }
      : null
  );

  const sentAt = new Date();
  const operations: any[] = [
    prisma.outreachMessage.create({
      data: {
        leadId: lead.id,
        templateId,
        body: finalBody,
        status: "SENT",
        sentAt,
      },
    }),
    prisma.recruiterLead.update({
      where: { id: lead.id },
      data: { status: "SENT", lastMessagedAt: sentAt },
    }),
  ];

  if (lead.outreachJobTargetId) {
    operations.push(
      prisma.outreachJobTarget.update({
        where: { id: lead.outreachJobTargetId },
        data: { messagesSent: { increment: 1 } },
      })
    );
  }

  const [message, updatedLead] = (await prisma.$transaction(operations)) as [any, any];

  return NextResponse.json({ ok: true, preview: finalBody, lead: updatedLead, message });
}
