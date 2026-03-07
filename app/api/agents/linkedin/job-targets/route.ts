import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getAuthedUserId, unauthorizedJson } from "@/app/lib/agents/getAuthedUser";
import {
  buildCampaignFromJob,
  buildSuggestedShortBio,
  generateDefaultTemplate,
} from "@/app/lib/agents/linkedinSim";
import { fetchSmartMatchJobById } from "@/app/lib/jobs/smartMatches";

function parsePositiveInt(value: string | null, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export async function GET(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

  const campaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!campaign) {
    return NextResponse.json({ ok: true, jobTargets: [], total: 0, take: 0, skip: 0 });
  }

  const { searchParams } = new URL(req.url);
  const take = Math.min(100, Math.max(1, parsePositiveInt(searchParams.get("take"), 25)));
  const skip = parsePositiveInt(searchParams.get("skip"), 0);

  const [jobTargets, total] = await Promise.all([
    prisma.outreachJobTarget.findMany({
      where: { campaignId: campaign.id },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    }),
    prisma.outreachJobTarget.count({ where: { campaignId: campaign.id } }),
  ]);

  return NextResponse.json({ ok: true, jobTargets, total, take, skip });
}

export async function POST(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return unauthorizedJson();

  const payload = (await req.json()) as { jobId?: string } | null;
  const jobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const job = await fetchSmartMatchJobById({ userId, jobId, origin });
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const existingCampaign = await prisma.outreachCampaign.findUnique({
    where: { userId },
    select: {
      id: true,
      targetCompanies: true,
      targetRoles: true,
      targetTitles: true,
      location: true,
      shortBio: true,
    },
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

  const defaults = buildCampaignFromJob({
    company: job.company,
    title: job.title,
    location: job.location,
  });

  const campaign = await prisma.outreachCampaign.upsert({
    where: { userId },
    create: {
      userId,
      targetCompanies: defaults.targetCompanies,
      targetRoles: defaults.targetRoles,
      targetTitles: defaults.targetTitles,
      location: defaults.location ?? null,
      shortBio: suggestedShortBio || null,
    },
    update: {
      targetCompanies: Array.from(new Set([...(existingCampaign?.targetCompanies ?? []), ...defaults.targetCompanies])),
      targetRoles: Array.from(new Set([...(existingCampaign?.targetRoles ?? []), ...defaults.targetRoles])),
      targetTitles: Array.from(new Set([...(existingCampaign?.targetTitles ?? []), ...defaults.targetTitles])),
      location: (existingCampaign?.location ?? "").trim() || defaults.location || null,
    },
  });

  const jobTarget = await prisma.outreachJobTarget.upsert({
    where: { userId_jobId: { userId, jobId: job.id } },
    create: {
      userId,
      campaignId: campaign.id,
      jobId: job.id,
      company: job.company,
      title: job.title,
      location: job.location ?? null,
      source: job.source,
      status: "ACTIVE",
    },
    update: {
      campaignId: campaign.id,
      company: job.company,
      title: job.title,
      location: job.location ?? null,
      source: job.source,
    },
  });

  const templateCount = await prisma.outreachTemplate.count({
    where: { campaignId: campaign.id },
  });

  if (templateCount === 0) {
    const fallbackShortBio = suggestedShortBio;

    const body = generateDefaultTemplate({
      company: job.company,
      jobTitle: job.title,
      importedName: linkedInAccount?.importedName ?? null,
      importedHeadline: linkedInAccount?.importedHeadline ?? null,
      importedSkills: linkedInAccount?.importedSkills ?? [],
      shortBio: campaign.shortBio ?? fallbackShortBio ?? null,
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

  const hydratedCampaign = await prisma.outreachCampaign.findUnique({
    where: { id: campaign.id },
    include: { templates: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] } },
  });

  return NextResponse.json({ ok: true, campaign: hydratedCampaign, jobTarget });
}
