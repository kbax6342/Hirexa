import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionUserId } from "@/app/lib/session-user";
async function getCampaignId() {
  const userId = await getSessionUserId();
  if (!userId) return { unauthorized: true as const, campaign: null };
  const campaign = await prisma.outreachCampaign.findUnique({ where: { userId }, select: { id: true } });
  return { unauthorized: false as const, campaign };
}

export async function GET() {
  const { unauthorized, campaign } = await getCampaignId();
  if (unauthorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!campaign) return NextResponse.json({ ok: true, templates: [] });

  const templates = await prisma.outreachTemplate.findMany({
    where: { campaignId: campaign.id },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ ok: true, templates });
}

export async function POST(req: Request) {
  const { unauthorized, campaign } = await getCampaignId();
  if (unauthorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  if (typeof body?.name !== "string" || typeof body?.body !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const isDefault = Boolean(body?.isDefault);
  if (isDefault) {
    await prisma.outreachTemplate.updateMany({ where: { campaignId: campaign.id }, data: { isDefault: false } });
  }

  const template = await prisma.outreachTemplate.create({
    data: {
      campaignId: campaign.id,
      name: body.name.trim(),
      body: body.body,
      isDefault,
    },
  });
  return NextResponse.json({ ok: true, template });
}

export async function PUT(req: Request) {
  const { unauthorized, campaign } = await getCampaignId();
  if (unauthorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  if (typeof body?.id !== "string" || typeof body?.name !== "string" || typeof body?.body !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const found = await prisma.outreachTemplate.findFirst({ where: { id: body.id, campaignId: campaign.id } });
  if (!found) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

  const isDefault = Boolean(body?.isDefault);
  if (isDefault) {
    await prisma.outreachTemplate.updateMany({ where: { campaignId: campaign.id }, data: { isDefault: false } });
  }

  const template = await prisma.outreachTemplate.update({
    where: { id: body.id },
    data: { name: body.name.trim(), body: body.body, isDefault },
  });
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(req: Request) {
  const { unauthorized, campaign } = await getCampaignId();
  if (unauthorized) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  if (typeof body?.id !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const template = await prisma.outreachTemplate.findFirst({ where: { id: body.id, campaignId: campaign.id } });
  if (!template) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });

  await prisma.outreachTemplate.delete({ where: { id: template.id } });
  return NextResponse.json({ ok: true });
}
