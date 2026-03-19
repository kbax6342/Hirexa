import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";

export const runtime = "nodejs";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const application = await prisma.jobApplication.findFirst({
      where: { id, userProfile: { userId } },
      select: { id: true, status: true },
    });

    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }

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
      console.warn("[applications/mark-submitted] status email failed", {
        applicationId: application.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return NextResponse.json({ ok: true, status: "SENT" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
