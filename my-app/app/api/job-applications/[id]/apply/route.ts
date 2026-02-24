import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { buildProfileFieldMap, computeMissingFromFields } from "@/app/lib/jobApplicationAudit";
import { runApplyMode } from "@/app/lib/playwright/applyRunner";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";

export const runtime = "nodejs";

type ApplyBody = {
  overrides?: Record<string, unknown>;
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json()) as ApplyBody;

  const application = await prisma.jobApplication.findFirst({
    where: { id, userProfile: { userId } },
    include: { userProfile: true },
  });

  if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
  if (!application.jobUrl) return NextResponse.json({ ok: false, error: "jobUrl missing" }, { status: 400 });

  const resume = await prisma.resumeFile.findFirst({
    where: { profileId: application.userProfileId },
    orderBy: { createdAt: "desc" },
  });

  const fields = buildProfileFieldMap(application.userProfile, resume);
  const priorAudit = (application.auditJson as Record<string, unknown> | null) ?? {};
  const priorOverrides = (priorAudit.overrides as Record<string, unknown> | undefined) ?? {};
  const overrides = { ...priorOverrides, ...(body.overrides ?? {}) };

  const computed = computeMissingFromFields(fields, overrides);

  if (computed.missing.length > 0) {
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: { status: "NEEDS_INFO", missingFields: computed.missing },
    });
    return NextResponse.json({ ok: false, status: "NEEDS_INFO", missingFields: computed.missing }, { status: 409 });
  }

  await prisma.jobApplication.update({ where: { id: application.id }, data: { status: "APPLYING" } });

  const tempResume = await writeResumeToTemp(application.userProfileId);
  const result = await runApplyMode({
    jobUrl: application.jobUrl,
    values: computed.merged,
    resumePath: tempResume?.path ?? null,
  });

  if (tempResume?.path) {
    await unlink(tempResume.path).catch(() => undefined);
  }

  if (result.ok) {
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "SUBMITTED",
        verificationRequired: false,
        failureReason: null,
        submissionProof: result.submissionProof,
      },
    });

    return NextResponse.json({ ok: true, status: "SUBMITTED", submissionProof: result.submissionProof });
  }

  if (result.verificationRequired) {
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: {
        status: "NEEDS_VERIFICATION",
        verificationRequired: true,
        failureReason: result.reason,
      },
    });

    return NextResponse.json({ ok: false, status: "NEEDS_VERIFICATION" }, { status: 409 });
  }

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      status: "FAILED",
      verificationRequired: false,
      failureReason: result.reason,
    },
  });

  return NextResponse.json({ ok: false, status: "FAILED", error: result.reason }, { status: 502 });
}
