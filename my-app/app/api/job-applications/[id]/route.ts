import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { buildProfileFieldMap, computeMissingFromFields } from "@/app/lib/jobApplicationAudit";

export const runtime = "nodejs";

type PatchBody = {
  auditOverrides?: Record<string, unknown>;
};

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const body = (await req.json()) as PatchBody;

  const application = await prisma.jobApplication.findFirst({
    where: { id, userProfile: { userId } },
    include: { userProfile: true },
  });

  if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });

  const resume = await prisma.resumeFile.findFirst({
    where: { profileId: application.userProfileId },
    orderBy: { createdAt: "desc" },
  });

  const fields = buildProfileFieldMap(application.userProfile, resume);

  const previousAudit = (application.auditJson as Record<string, unknown> | null) ?? {};
  const previousOverrides = (previousAudit.overrides as Record<string, unknown> | undefined) ?? {};
  const overrides = { ...previousOverrides, ...(body.auditOverrides ?? {}) };

  const computed = computeMissingFromFields(fields, overrides);

  const keepStatus = ["SUBMITTED", "NEEDS_VERIFICATION"].includes(application.status);
  const nextStatus = keepStatus
    ? application.status
    : computed.missing.length > 0
      ? "NEEDS_INFO"
      : "READY_TO_APPLY";

  const updated = await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      status: nextStatus,
      missingFields: computed.missing,
      auditJson: {
        ...previousAudit,
        overrides,
        fields,
        fieldStates: computed.fieldStates,
      },
    },
  });

  return NextResponse.json({ ok: true, status: updated.status, missingFields: updated.missingFields });
}
