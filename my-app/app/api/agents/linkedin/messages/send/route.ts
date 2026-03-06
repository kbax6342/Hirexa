import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionUserId } from "@/app/lib/session-user";
import { interpolateTemplate } from "@/app/lib/agents/linkedinSim";

type SendPayload = { leadId: string; templateId?: string; body?: string };

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json()) as SendPayload;
  if (typeof payload?.leadId !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const lead = await prisma.recruiterLead.findFirst({ where: { id: payload.leadId, campaignId: campaign.id } });
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

  const finalBody = interpolateTemplate(resolvedBody, {
    name: lead.name,
    company: lead.company,
    title: lead.title,
  });

  const sentAt = new Date();
  const [message, updatedLead] = await prisma.$transaction([
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
  ]);

  return NextResponse.json({ ok: true, lead: updatedLead, message });
}
