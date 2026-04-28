import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { hashOtp } from "@/app/lib/security/otp";
import {
  ONBOARDING_CONFIRMATION_MAX_ATTEMPTS,
  mergeOnboardingConfirmationState,
  readOnboardingConfirmationState,
} from "@/app/lib/onboarding/confirmation";
import { isOnboardingFormComplete } from "@/app/lib/onboarding/status";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = normalizeEmail(session?.user?.email);

  if (!userId || !email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);

  console.info("[ONBOARDING_CONFIRMATION] verify requested", { userId });

  if (code.length !== 6) {
    return NextResponse.json(
      { ok: false, error: "Enter the 6-digit confirmation code." },
      { status: 400 }
    );
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      questionsCompleted: true,
      keyQuestions: true,
      registrationStatus: true,
      benefitSelections: { select: { id: true }, take: 1 },
      resume: { select: { id: true } },
    },
  });

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Finish onboarding before verifying this code." },
      { status: 400 }
    );
  }

  if (readOnboardingConfirmationState(profile.keyQuestions).emailVerified) {
    return NextResponse.json({ ok: true, nextUrl: "/dashboard" });
  }

  if (!isOnboardingFormComplete(profile)) {
    return NextResponse.json(
      { ok: false, error: "Finish the onboarding steps before verifying this code." },
      { status: 400 }
    );
  }

  const otp = await prisma.emailOtp.findUnique({
    where: { email },
    select: { codeHash: true, expiresAt: true, attempts: true },
  });

  if (!otp) {
    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: "missing_code",
    });
    return NextResponse.json(
      { ok: false, error: "The confirmation code has expired. Send a new code." },
      { status: 400 }
    );
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.deleteMany({ where: { email } });
    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: "expired_code",
    });
    return NextResponse.json(
      { ok: false, error: "The confirmation code has expired. Send a new code." },
      { status: 400 }
    );
  }

  if (otp.attempts >= ONBOARDING_CONFIRMATION_MAX_ATTEMPTS) {
    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: "too_many_attempts",
    });
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Send a new code and try again." },
      { status: 429 }
    );
  }

  if (hashOtp(code) !== otp.codeHash) {
    await prisma.emailOtp.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });

    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: "invalid_code",
    });

    return NextResponse.json(
      { ok: false, error: "That code is not correct. Check the email and try again." },
      { status: 400 }
    );
  }

  const verifiedAt = new Date();

  await prisma.$transaction([
    prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        keyQuestions: mergeOnboardingConfirmationState(profile.keyQuestions, {
          emailVerified: true,
          emailVerifiedAt: verifiedAt.toISOString(),
        }),
      },
      select: { id: true },
    }),
    prisma.emailOtp.deleteMany({ where: { email } }),
  ]);

  console.info("[ONBOARDING_CONFIRMATION] verify success", {
    userId,
    verifiedAt: verifiedAt.toISOString(),
  });

  return NextResponse.json({ ok: true, nextUrl: "/dashboard" });
}
