import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  ONBOARDING_CONFIRMATION_CODE_TTL_MS,
  ONBOARDING_CONFIRMATION_RESEND_COOLDOWN_MS,
  readOnboardingConfirmationState,
} from "@/app/lib/onboarding/confirmation";
import { resolveVerificationContext } from "@/app/lib/verification/context";
import {
  clearVerificationCodesForDestinations,
  sendVerificationCode,
} from "@/app/lib/verification/service";
import { VERIFICATION_CHANNEL_SMS } from "@/app/lib/verification/types";

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
    select: { id: true, keyQuestions: true, phone: true },
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

  const context = await resolveVerificationContext({
    userId,
    sessionEmail: email,
  });

  if (context.preferredChannel === VERIFICATION_CHANNEL_SMS && !context.normalizedPhone) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid phone number." },
      { status: 400 }
    );
  }

  if (!context.destination) {
    return NextResponse.json(
      { ok: false, error: "We couldn't send the code. Please try again." },
      { status: 400 }
    );
  }

  await clearVerificationCodesForDestinations(
    [context.email, context.normalizedPhone].filter(
      (candidate): candidate is string =>
        Boolean(candidate) && candidate !== context.destination
    )
  );

  const result = await sendVerificationCode({
    channel: context.resolvedChannel,
    destination: context.destination,
    purpose: "onboarding_confirmation",
    ttlMs: ONBOARDING_CONFIRMATION_CODE_TTL_MS,
    resendCooldownMs: ONBOARDING_CONFIRMATION_RESEND_COOLDOWN_MS,
  });

  if (!result.ok) {
    const status =
      result.code === "invalid_destination"
        ? 400
        : result.code === "cooldown"
          ? 429
          : result.code === "misconfigured"
            ? 503
            : 500;

    return NextResponse.json(
      {
        ok: false,
        error: result.message,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { status }
    );
  }

  console.info("[ONBOARDING_CONFIRMATION] code sent", {
    userId,
    channel: context.resolvedChannel,
    destinationHint:
      context.resolvedChannel === "sms"
        ? context.destination.slice(-4)
        : email.split("@")[1] ?? null,
  });

  return NextResponse.json({
    ok: true,
    channel: context.resolvedChannel,
    destinationLabel: context.destinationLabel,
    retryAfterSeconds: result.retryAfterSeconds,
    message: "Verification code sent.",
  });
}
