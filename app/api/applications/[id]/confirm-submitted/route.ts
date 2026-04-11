import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import { getSession } from "@/app/lib/apply/applySessionStore";
import {
  isApplySessionSuccessStatus,
  isApplySessionTerminalStatus,
} from "@/app/lib/apply/sessionStatus";

export const runtime = "nodejs";

type ConfirmBody = {
  applySessionId?: string;
};

export async function POST(
  req: Request,
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
    const body = (await req.json()) as ConfirmBody;

    const application = await prisma.jobApplication.findFirst({
      where: { id, userProfile: { userId } },
      select: { id: true, status: true },
    });

    if (!application) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    if (!body.applySessionId) {
      return NextResponse.json(
        { ok: false, error: "Missing applySessionId" },
        { status: 400 },
      );
    }

    const applySession = getSession(body.applySessionId, {
      caller: "POST /api/applications/[id]/confirm-submitted",
      sourcePath: "app/api/applications/[id]/confirm-submitted/route.ts",
      phase: "confirm",
    });
    if (!applySession || applySession.applicationId !== application.id) {
      return NextResponse.json(
        { ok: false, error: "Apply session not found" },
        { status: 404 },
      );
    }

    if (isApplySessionSuccessStatus(applySession.status)) {
      if (application.status !== "SENT") {
        const updatedApplication = await prisma.jobApplication.update({
          where: { id: application.id },
          data: {
            status: "SENT",
            submittedAt: new Date(),
          },
          select: {
            id: true,
            status: true,
          },
        });

        await sendApplicationActivityEmailForStatusChange({
          applicationId: updatedApplication.id,
          previousStatus: application.status,
          nextStatus: updatedApplication.status,
        }).catch((error) => {
          console.warn("[applications/confirm-submitted] status email failed", {
            applicationId: application.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      return NextResponse.json({ ok: true, status: "SENT" });
    }

    if (isApplySessionTerminalStatus(applySession.status)) {
      return NextResponse.json(
        {
          ok: false,
          status: applySession.status,
          error:
            applySession.error ??
            applySession.message ??
            "Apply could not be completed",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        status: applySession.status,
        error: applySession.message ?? "Apply is still in progress",
      },
      { status: 409 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
