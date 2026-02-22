import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { mapProfileToForm } from "@/app/lib/greenhouse/mapProfileToForm";
import { parseGreenhouseForm } from "@/app/lib/greenhouse/parseGreenhouseForm";
import { buildApplyPayload } from "@/app/lib/applications/buildApplyPayload";

export const runtime = "nodejs";

type AuditBody = {
  answers?: Record<string, string>;
};

async function buildAuditResponse(applicationId: string, userId: string, answersOverride?: Record<string, string>) {
  const application = await prisma.jobApplication.findFirst({
    where: {
      id: applicationId,
      userProfile: {
        userId,
      },
    },
    include: {
      userProfile: true,
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  if (!application.jobUrl) {
    return NextResponse.json({ error: "Application missing jobUrl" }, { status: 400 });
  }

  const answers = answersOverride ?? ((application.answersJson as Record<string, string> | null) ?? {});

  const form = await parseGreenhouseForm(application.jobUrl);
  const { prefillValues, auditItems } = mapProfileToForm(form.fields, application.userProfile);

  const resume = await prisma.resumeFile.findFirst({
    where: {
      profileId: application.userProfileId,
      mimeType: "application/pdf",
    },
    orderBy: { createdAt: "desc" },
  });

  const resumeBytes = resume?.blob
    ? resume.blob instanceof Uint8Array
      ? resume.blob
      : new Uint8Array(resume.blob as ArrayBuffer)
    : undefined;

  const { payload, meta } = buildApplyPayload({
    answers,
    form,
    prefillValues,
    auditItems,
    resume: resumeBytes
      ? {
          fileName: resume?.fileName ?? null,
          mimeType: "application/pdf",
          bytes: resumeBytes,
        }
      : null,
  });

  const status = meta.missing.length > 0 ? "IN_PREPARATION" : "READY_TO_SEND";

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      status,
      answersJson: answers,
      auditJson: {
        form,
        prefill: prefillValues,
        auditItems,
        payload,
        meta,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    jobTitle: application.jobTitle, // ✅ ADD THIS
    status,
    payload,
    meta,
    auditItems,
  });
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    return buildAuditResponse(id, userId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as AuditBody;
    const { id } = await context.params;

    return buildAuditResponse(id, userId, body.answers ?? {});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
