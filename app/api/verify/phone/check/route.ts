import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import {
  checkSmsVerification,
  isE164PhoneNumber,
} from "@/app/lib/twilio/verify";

export const runtime = "nodejs";

const PHONE_VERIFICATION_CHECK_WINDOW_MS = 10 * 60 * 1000;
const PHONE_VERIFICATION_CHECK_REGEX = /^[A-Za-z0-9]{4,10}$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { phoneNumber?: unknown; code?: unknown }
    | null;
  const phoneNumber =
    typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!isE164PhoneNumber(phoneNumber)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid phone number." },
      { status: 400 }
    );
  }

  if (!PHONE_VERIFICATION_CHECK_REGEX.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Enter the 6-digit verification code." },
      { status: 400 }
    );
  }

  // TODO: Replace the in-memory limiter with a shared store if this route is used across multiple instances.
  const rateLimit = consumeRateLimit({
    key: `twilio-verify:check:${phoneNumber}`,
    limit: 6,
    windowMs: PHONE_VERIFICATION_CHECK_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many attempts. Please wait before trying again.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const result = await checkSmsVerification(phoneNumber, code);

    if (result.approved) {
      return NextResponse.json({ ok: true, approved: true });
    }

    return NextResponse.json({
      ok: true,
      approved: false,
      status: result.status,
    });
  } catch (error) {
    const twilioError = error as {
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };

    console.error("[TWILIO_VERIFY_CHECK_FAILED]", {
      phoneHint: phoneNumber.slice(-4),
      code:
        typeof twilioError.code === "number" ||
        typeof twilioError.code === "string"
          ? twilioError.code
          : null,
      status:
        typeof twilioError.status === "number" ||
        typeof twilioError.status === "string"
          ? twilioError.status
          : null,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { ok: false, error: "Unable to verify code right now." },
      { status: 500 }
    );
  }
}
