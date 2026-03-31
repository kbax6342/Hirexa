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
      select: { id: true, status: true },
    });

    if (existingUsage?.status === "listening") {
      const status = await getHirePilotBillingStatus(userId);

      return NextResponse.json({
        ok: true,
        started: true,
        hasHirePilotAccess: status.hasHirePilotAccess,
        hirePilotUnlimited: status.hirePilotUnlimited,
        hirePilotCredits: status.hirePilotCredits,
        monthlyCredits: status.monthlyCredits + status.rolloverCredits,
        starterCredits: status.starterCredits,
        starterCreditsGranted: status.starterCreditsGranted,
        purchasedCredits: status.purchasedCredits,
        productKey: status.productKey,
        status: status.status,
        currentPeriodEnd: status.currentPeriodEnd,
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
        hasHirePilotAccess: false,
        hirePilotUnlimited: false,
        hirePilotCredits: 0,
        monthlyCredits: 0,
        starterCredits: 0,
        starterCreditsGranted: false,
        purchasedCredits: 0,
        productKey: null,
        status: null,
        currentPeriodEnd: null,
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
    hasHirePilotAccess: access.allowed,
    hirePilotUnlimited: access.unlimited,
    hirePilotCredits: access.credits,
    monthlyCredits: access.monthlyCredits ?? 0,
    starterCredits: access.starterCredits ?? 0,
    starterCreditsGranted: access.starterCreditsGranted ?? false,
    purchasedCredits: access.purchasedCredits ?? 0,
    productKey: access.unlimited
      ? "hirepilot_monthly"
      : (access.monthlyCredits ?? 0) > 0
        ? "hirepilot_monthly"
        : (access.starterCredits ?? 0) > 0
          ? "hirepilot_credit"
        : (access.purchasedCredits ?? 0) > 0
          ? "hirepilot_credit"
          : null,
    status: access.allowed ? "active" : null,
    currentPeriodEnd: null,
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
