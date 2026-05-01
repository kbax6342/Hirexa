import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  ONBOARDING_CONFIRMATION_MAX_ATTEMPTS,
  mergeOnboardingConfirmationState,
  readOnboardingConfirmationState,
} from "@/app/lib/onboarding/confirmation";
import { isOnboardingFormComplete } from "@/app/lib/onboarding/status";
import { resolveVerificationContext } from "@/app/lib/verification/context";
import { verifyVerificationCode } from "@/app/lib/verification/service";
import { VERIFICATION_CHANNEL_SMS } from "@/app/lib/verification/types";

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
      email: true,
      phone: true,
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
    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: "missing_destination",
    });
    return NextResponse.json(
      { ok: false, error: "The verification code has expired. Send a new code." },
      { status: 400 }
    );
  }

  const verification = await verifyVerificationCode({
    channel: context.resolvedChannel,
    destination: context.destination,
    code,
    maxAttempts: ONBOARDING_CONFIRMATION_MAX_ATTEMPTS,
  });

  if (!verification.ok) {
    console.info("[ONBOARDING_CONFIRMATION] verify failed", {
      userId,
      reason: verification.code,
    });
    return NextResponse.json(
      { ok: false, error: verification.message },
      {
        status:
          verification.code === "too_many_attempts"
            ? 429
            : verification.code === "unavailable"
              ? 503
              : 400,
      }
    );
  }

  const verifiedAt = new Date();
  const destinationsToDelete = Array.from(
    new Set(
      [context.email, context.normalizedPhone].filter(
        (value): value is string => Boolean(value)
      )
    )
  );
  const emailDestinations = destinationsToDelete.filter((value) => value.includes("@"));

  await prisma.$transaction([
    prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        keyQuestions: mergeOnboardingConfirmationState(profile.keyQuestions, {
          emailVerified: true,
          emailVerifiedAt: verifiedAt.toISOString(),
          preferredChannel: context.preferredChannel,
          phone: context.phone,
          verifiedChannel: context.resolvedChannel,
        }),
      },
      select: { id: true },
    }),
    prisma.emailOtp.deleteMany({
      where: {
        email: {
          in: destinationsToDelete,
        },
      },
    }),
    prisma.emailVerificationCode.deleteMany({
      where: {
        email: {
          in: emailDestinations,
        },
      },
    }),
  ]);

  console.info("[ONBOARDING_CONFIRMATION] verify success", {
    userId,
    verifiedAt: verifiedAt.toISOString(),
  });

  return NextResponse.json({ ok: true, nextUrl: "/dashboard" });
}
