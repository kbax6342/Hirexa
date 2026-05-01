import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "../../../../lib/security/recaptcha";
import { validatePassword, hashPassword } from "../../../../lib/security/password";
import { cleanupExpiredPendingVerifications } from "@/app/lib/auth/cleanupPendingVerification";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  updateOnboardingDraftPayload,
} from "@/app/lib/onboarding/draft-session";
import { mergeOnboardingConfirmationState } from "@/app/lib/onboarding/confirmation";
import {
  clearVerificationCodesForDestinations,
  sendVerificationCode,
} from "@/app/lib/verification/service";
import {
  normalizeVerificationChannel,
  VERIFICATION_CHANNEL_SMS,
} from "@/app/lib/verification/types";
import { normalizePhoneForSms } from "@/app/lib/verification/phone";

const ACCOUNT_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS = 30 * 1000;

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();
  return name.length > 0 ? name : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const firstName = normalizeName(body.firstName);
    const lastName = normalizeName(body.lastName);
    const email = String(body.email ?? "").trim().toLowerCase();
    const phoneInput = String(body.phone ?? "").trim();
    const password = String(body.password ?? "");
    const verificationChannel = normalizeVerificationChannel(
      body.verificationChannel
    );
    const recaptchaToken = body.recaptchaToken ?? null;
    const normalizedPhone = phoneInput ? normalizePhoneForSms(phoneInput) : null;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    if (phoneInput && !normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid phone number." },
        { status: 400 }
      );
    }

    if (verificationChannel === VERIFICATION_CHANNEL_SMS && !normalizedPhone) {
      return NextResponse.json(
        { error: "Please enter a valid phone number." },
        { status: 400 }
      );
    }

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_init");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    const pw = validatePassword(password);
    if (!pw.ok) {
      return NextResponse.json({ error: "Password not strong enough" }, { status: 400 });
    }

    try {
      await cleanupExpiredPendingVerifications();
    } catch (cleanupError) {
      console.warn("pending verification cleanup failed before signup init:", cleanupError);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (existingUser?.emailVerifiedAt) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        name: `${firstName} ${lastName}`,
        email,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
      update: {
        name: `${firstName} ${lastName}`,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
      select: { id: true },
    });

    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, keyQuestions: true, phone: true },
    });
    const nextConfirmationState = mergeOnboardingConfirmationState(
      existingProfile?.keyQuestions,
      {
        emailVerified: false,
        emailVerifiedAt: null,
        preferredChannel: verificationChannel,
        phone: phoneInput || existingProfile?.phone || null,
        verifiedChannel: null,
      }
    );

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        firstName,
        lastName,
        email,
        subscriptionEmail: email,
        ...(phoneInput ? { phone: phoneInput } : {}),
        registrationStatus: "pending_verification",
        keyQuestions: nextConfirmationState,
      },
      update: {
        firstName,
        lastName,
        email,
        subscriptionEmail: email,
        ...(phoneInput ? { phone: phoneInput } : {}),
        registrationStatus: "pending_verification",
        keyQuestions: nextConfirmationState,
      },
      select: { id: true },
    });

    if (draft) {
      await updateOnboardingDraftPayload({
        draftToken: draft.draftToken,
        payloadPatch: {
          signup: {
            firstName,
            lastName,
            email,
            phone: phoneInput,
            verificationChannel,
          },
          profile: {
            firstName,
            lastName,
            email,
            phone: phoneInput,
          },
          onboardingEmail: {
            email,
          },
        },
        guestId: pickDraftGuestId({ cookieStore, draft }) ?? guestId,
      });
    } else if (guestId) {
      invalidateCachedProfile({ userId: null, guestId });
    }

    const verificationDestination =
      verificationChannel === VERIFICATION_CHANNEL_SMS ? normalizedPhone : email;

    await clearVerificationCodesForDestinations(
      [email, normalizedPhone].filter(
        (candidate): candidate is string =>
          Boolean(candidate) && candidate !== verificationDestination
      )
    );

    const sendResult = await sendVerificationCode({
      channel: verificationChannel,
      destination: verificationDestination,
      purpose: "account_setup",
      ttlMs: ACCOUNT_VERIFICATION_CODE_TTL_MS,
      resendCooldownMs: ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS,
    });

    if (!sendResult.ok) {
      const status =
        sendResult.code === "invalid_destination"
          ? 400
          : sendResult.code === "cooldown"
            ? 429
            : sendResult.code === "misconfigured"
              ? 503
              : 500;

      return NextResponse.json(
        {
          ok: false,
          error: sendResult.message,
          retryAfterSeconds: sendResult.retryAfterSeconds,
        },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      channel: verificationChannel,
      retryAfterSeconds: sendResult.retryAfterSeconds,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    console.error("[REGISTER_INIT_FAILED]", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { ok: false, error: "Unable to start account verification right now." },
      { status: 500 }
    );
  }
}
