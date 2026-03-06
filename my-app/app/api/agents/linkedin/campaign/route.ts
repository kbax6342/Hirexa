import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionUserId } from "@/app/lib/session-user";
type CampaignPayload = {
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
  location?: string;
  dailyLimit: number;
  autoFollowUp: boolean;
  followUpDays: number;
};

function isValidPayload(payload: unknown): payload is CampaignPayload {
  const candidate = payload as Partial<CampaignPayload> | null;
  return (
    Array.isArray(candidate?.targetCompanies) &&
    Array.isArray(candidate?.targetRoles) &&
    Array.isArray(candidate?.targetTitles) &&
    typeof candidate?.dailyLimit === "number" &&
    typeof candidate?.autoFollowUp === "boolean" &&
    typeof candidate?.followUpDays === "number"
  );
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    include: {
      templates: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      _count: { select: { leads: true, templates: true } },
    },
  });

  return NextResponse.json({ ok: true, campaign });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = await req.json();
  if (!isValidPayload(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const campaign = await prisma.outreachCampaign.upsert({
    where: { userId },
    create: {
      userId,
      targetCompanies: payload.targetCompanies,
      targetRoles: payload.targetRoles,
      targetTitles: payload.targetTitles,
      location: payload.location?.trim() || null,
      dailyLimit: Math.max(1, Math.min(100, payload.dailyLimit)),
      autoFollowUp: payload.autoFollowUp,
      followUpDays: Math.max(1, Math.min(30, payload.followUpDays)),
    },
    update: {
      targetCompanies: payload.targetCompanies,
      targetRoles: payload.targetRoles,
      targetTitles: payload.targetTitles,
      location: payload.location?.trim() || null,
      dailyLimit: Math.max(1, Math.min(100, payload.dailyLimit)),
      autoFollowUp: payload.autoFollowUp,
      followUpDays: Math.max(1, Math.min(30, payload.followUpDays)),
    },
  });

  const existingTemplates = await prisma.outreachTemplate.count({ where: { campaignId: campaign.id } });
  if (existingTemplates === 0) {
    await prisma.outreachTemplate.create({
      data: {
        campaignId: campaign.id,
        name: "Default Intro",
        isDefault: true,
        body: "Hi {first_name}, I came across your work at {company}. I'd love to connect about {job_title} opportunities.",
      },
    });
  }

  const hydrated = await prisma.outreachCampaign.findUnique({
    where: { id: campaign.id },
    include: {
      templates: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
      _count: { select: { leads: true, templates: true } },
    },
  });

  return NextResponse.json({ ok: true, campaign: hydrated });
}
