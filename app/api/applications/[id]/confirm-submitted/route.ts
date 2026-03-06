import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  getSession,
  getSessionRuntime,
  updateSession,
} from "@/app/lib/apply/applySessionStore";

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
      select: { id: true },
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

    const applySession = getSession(body.applySessionId);
    if (!applySession || applySession.applicationId !== application.id) {
      return NextResponse.json(
        { ok: false, error: "Apply session not found" },
        { status: 404 },
      );
    }

    if (applySession.status === "DONE") {
      return NextResponse.json({ ok: true, status: "SENT" });
    }

    if (applySession.status === "FAILED") {
      return NextResponse.json(
        {
          ok: false,
          status: "FAILED",
          error: applySession.error ?? "Apply failed",
        },
        { status: 409 },
      );
    }

    if (
      applySession.status === "WAITING_HUMAN" ||
      applySession.status === "RUNNING"
    ) {
      const runtime = getSessionRuntime(applySession.id);
      const page = runtime?.page;
      const currentUrl = page?.url() ?? applySession.lastUrl ?? "";
      const html = page ? await page.content().catch(() => "") : "";
      const text = page ? await page.innerText("body").catch(() => "") : "";
      const isConfirmed =
        currentUrl.toLowerCase().includes("/confirmation") ||
        /thank you|application submitted/i.test(html) ||
        /thank you|application submitted/i.test(text);

      updateSession(applySession.id, {
        lastUrl: currentUrl,
        status: isConfirmed ? "DONE" : applySession.status,
      });

      if (!isConfirmed) {
        return NextResponse.json(
          { ok: false, status: "NOT_CONFIRMED_YET" },
          { status: 409 },
        );
      }

      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: "SENT",
          submittedAt: new Date(),
        },
      });

      return NextResponse.json({ ok: true, status: "SENT" });
    }

    return NextResponse.json(
      { ok: false, status: applySession.status },
      { status: 409 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
