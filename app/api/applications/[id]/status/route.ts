import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { readAutomationAudit } from "@/app/lib/apply/automationAudit";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;

    const application = await prisma.jobApplication.findFirst({
      where: { id, userProfile: { userId } },
      select: {
        status: true,
        submittedAt: true,
        auditJson: true,
      },
    });

    if (!application) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    const automation = readAutomationAudit(application.auditJson).state;

    return NextResponse.json({
      ok: true,
      status: application.status,
      submittedAt: application.submittedAt,
      finalUrl: automation.finalUrl ?? undefined,
      debug: automation.debug ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
