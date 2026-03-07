import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { buildSuggestedShortBio, generateDefaultTemplate } from "@/app/lib/agents/linkedinSim";

type CampaignPayload = {
  targetCompanies: string[];
  targetRoles: string[];
  targetTitles: string[];
  location?: string;
  dailyLimit: number;
  autoFollowUp: boolean;
  followUpDays: number;
  tone?: string;
  shortBio?: string | null;
};

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

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
  const userId = await getUserId();
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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const payload = await req.json();
  if (!isValidPayload(payload)) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const existingCampaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    select: { id: true, shortBio: true },
  });

  const linkedInAccount = await prisma.linkedInAccount.findUnique({
    where: { userId },
    select: {
      importedName: true,
      importedHeadline: true,
      importedSkills: true,
      importedLocation: true,
    },
  });

  const suggestedShortBio = linkedInAccount
    ? buildSuggestedShortBio({
        importedName: linkedInAccount.importedName ?? null,
        importedHeadline: linkedInAccount.importedHeadline ?? null,
        importedSkills: linkedInAccount.importedSkills ?? [],
        location: linkedInAccount.importedLocation ?? null,
      })
    : "";

  const normalizedShortBio =
    typeof payload.shortBio === "string" ? payload.shortBio.trim() : null;

  const shortBioToSave =
    normalizedShortBio && normalizedShortBio.length > 0
      ? normalizedShortBio
      : existingCampaign?.shortBio?.trim() ||
        (existingCampaign ? null : suggestedShortBio || null);

  const tone =
    typeof payload.tone === "string" && payload.tone.trim().length > 0
      ? payload.tone.trim()
      : "professional";

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
      tone,
      shortBio: shortBioToSave,
    },
    update: {
      targetCompanies: payload.targetCompanies,
      targetRoles: payload.targetRoles,
      targetTitles: payload.targetTitles,
      location: payload.location?.trim() || null,
      dailyLimit: Math.max(1, Math.min(100, payload.dailyLimit)),
      autoFollowUp: payload.autoFollowUp,
      followUpDays: Math.max(1, Math.min(30, payload.followUpDays)),
      tone,
      shortBio: shortBioToSave,
    },
  });

  const existingTemplates = await prisma.outreachTemplate.count({ where: { campaignId: campaign.id } });
  if (existingTemplates === 0) {
    const focusCompany =
      campaign.targetCompanies?.[0] || payload.targetCompanies?.[0] || "your company";
    const focusTitle =
      campaign.targetTitles?.[0] ||
      payload.targetTitles?.[0] ||
      payload.targetRoles?.[0] ||
      "the role";

    const body = generateDefaultTemplate({
      company: focusCompany,
      jobTitle: focusTitle,
      importedName: linkedInAccount?.importedName ?? null,
      importedHeadline: linkedInAccount?.importedHeadline ?? null,
      importedSkills: linkedInAccount?.importedSkills ?? [],
      shortBio: shortBioToSave,
    });

    await prisma.outreachTemplate.create({
      data: {
        campaignId: campaign.id,
        name: "Default Intro",
        isDefault: true,
        body,
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
