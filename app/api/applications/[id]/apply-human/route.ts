import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

export async function POST(
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
      select: { id: true },
    });

    if (!application) {
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        status: "AUTO_APPLY_UNAVAILABLE",
        error:
          "Human verification browser handoff is not exposed in the current in-app auto-apply flow.",
      },
      { status: 409 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
