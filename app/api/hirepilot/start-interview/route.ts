import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  HIREPILOT_SESSION_COOKIE,
  checkHirePilotAccess,
  getHirePilotBillingStatus,
} from "@/app/lib/hirepilot/checkHirePilotAccess";

export const runtime = "nodejs";

type StartInterviewBody = {
  jobTitle?: string | null;
  company?: string | null;
};

function normalizeText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const existingSessionId = cookieStore.get(HIREPILOT_SESSION_COOKIE)?.value ?? null;

  if (existingSessionId) {
    const existingUsage = await prisma.hirePilotUsage.findFirst({
      where: {
        id: existingSessionId,
        userId,
      },
      select: { id: true },
    });

    if (existingUsage) {
      const status = await getHirePilotBillingStatus(userId);

      return NextResponse.json({
        ok: true,
        started: true,
        hirePilotUnlimited: status.hirePilotUnlimited,
        hirePilotCredits: status.hirePilotCredits,
        usageId: existingUsage.id,
      });
    }
  }

  const body = (await req.json().catch(() => null)) as StartInterviewBody | null;
  const access = await checkHirePilotAccess(userId, { consumeCredit: true });

  if (!access.allowed) {
    return NextResponse.json(
      {
        message: "HirePilot access required",
        hirePilotUnlimited: false,
        hirePilotCredits: 0,
      },
      { status: 403 }
    );
  }

  const usage = await prisma.hirePilotUsage.create({
    data: {
      userId,
      jobTitle: normalizeText(body?.jobTitle),
      company: normalizeText(body?.company),
    },
    select: { id: true },
  });

  const response = NextResponse.json({
    ok: true,
    started: true,
    hirePilotUnlimited: access.unlimited,
    hirePilotCredits: access.credits,
    usageId: usage.id,
  });

  response.cookies.set(HIREPILOT_SESSION_COOKIE, usage.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 2,
  });

  return response;
}
