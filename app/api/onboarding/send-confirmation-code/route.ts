import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { sendOnboardingConfirmationCodeEmail } from "@/app/lib/email/sendgrid";
import { generateOtp6, hashOtp } from "@/app/lib/security/otp";
import {
  ONBOARDING_CONFIRMATION_CODE_TTL_MS,
  ONBOARDING_CONFIRMATION_RESEND_COOLDOWN_MS,
  readOnboardingConfirmationState,
} from "@/app/lib/onboarding/confirmation";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = normalizeEmail(session?.user?.email);

  if (!userId || !email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  console.info("[ONBOARDING_CONFIRMATION] code send requested", {
    userId,
    emailDomain: email.split("@")[1] ?? null,
  });

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { id: true, keyQuestions: true },
  });

  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Finish onboarding before requesting a confirmation code." },
      { status: 400 }
    );
  }

  if (readOnboardingConfirmationState(profile.keyQuestions).emailVerified) {
    return NextResponse.json({ ok: true, message: "Onboarding is already confirmed." });
  }

  const existingOtp = await prisma.emailOtp.findUnique({
    where: { email },
    select: { resendAfter: true },
  });
  const now = Date.now();

  if (existingOtp?.resendAfter && existingOtp.resendAfter.getTime() > now) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existingOtp.resendAfter.getTime() - now) / 1000)
    );

    console.info("[ONBOARDING_CONFIRMATION] resend cooldown active", {
      userId,
      retryAfterSeconds,
    });

    return NextResponse.json(
      {
        ok: false,
        error: `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
        retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const code = generateOtp6();
  const expiresAt = new Date(now + ONBOARDING_CONFIRMATION_CODE_TTL_MS);
  const resendAfter = new Date(now + ONBOARDING_CONFIRMATION_RESEND_COOLDOWN_MS);

  await prisma.emailOtp.upsert({
    where: { email },
    create: {
      email,
      codeHash: hashOtp(code),
      expiresAt,
      resendAfter,
    },
    update: {
      codeHash: hashOtp(code),
      expiresAt,
      resendAfter,
      attempts: 0,
    },
  });

  await sendOnboardingConfirmationCodeEmail(email, code);

  console.info("[ONBOARDING_CONFIRMATION] code sent", {
    userId,
    emailDomain: email.split("@")[1] ?? null,
    expiresAt: expiresAt.toISOString(),
  });

  return NextResponse.json({ ok: true, message: "Confirmation code sent." });
}
