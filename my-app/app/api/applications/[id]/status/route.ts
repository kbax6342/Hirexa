import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

    const audit = (application.auditJson as Record<string, unknown> | null) ?? null;
    const playwright = (audit?.playwright as Record<string, unknown> | undefined) ?? undefined;

    return NextResponse.json({
      ok: true,
      status: application.status,
      submittedAt: application.submittedAt,
      finalUrl: typeof playwright?.finalUrl === "string" ? playwright.finalUrl : undefined,
      debug: playwright ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
