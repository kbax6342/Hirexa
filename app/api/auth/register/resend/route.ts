import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { resolveVerificationContext } from "@/app/lib/verification/context";
import {
  clearVerificationCodesForDestinations,
  sendVerificationCode,
} from "@/app/lib/verification/service";
import { VERIFICATION_CHANNEL_SMS } from "@/app/lib/verification/types";

const ACCOUNT_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS = 30 * 1000;

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const cookieStore = await cookies();
  const body = (await req.json().catch(() => null)) as
    | {
        email?: unknown;
        phone?: unknown;
        verificationChannel?: unknown;
        recaptchaToken?: unknown;
      }
    | null;

  const recaptchaToken =
    typeof body?.recaptchaToken === "string" ? body.recaptchaToken : null;
  const rc = await verifyRecaptchaV3(recaptchaToken, "signup_resend");
  if (!rc.ok) {
    return NextResponse.json({ ok: false, error: rc.error }, { status: 403 });
  }

  const context = await resolveVerificationContext({
    userId,
    sessionEmail: session?.user?.email ? String(session.user.email) : null,
    cookieStore,
    requestedChannel: body?.verificationChannel,
    requestedEmail: body?.email,
    requestedPhone: body?.phone,
  });

  if (
    context.preferredChannel === VERIFICATION_CHANNEL_SMS &&
    !context.normalizedPhone
  ) {
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
    purpose: "account_setup",
    ttlMs: ACCOUNT_VERIFICATION_CODE_TTL_MS,
    resendCooldownMs: ACCOUNT_VERIFICATION_RESEND_COOLDOWN_MS,
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

  return NextResponse.json({
    ok: true,
    channel: context.resolvedChannel,
    destinationLabel: context.destinationLabel,
    message: "Verification code sent.",
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
