import { NextResponse } from "next/server";

import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import {
  isE164PhoneNumber,
  sendSmsVerification,
} from "@/app/lib/twilio/verify";

export const runtime = "nodejs";

const PHONE_VERIFICATION_START_WINDOW_MS = 30 * 1000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { phoneNumber?: unknown }
    | null;
  const phoneNumber =
    typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";

  if (!isE164PhoneNumber(phoneNumber)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid phone number." },
      { status: 400 }
    );
  }

  // TODO: Replace the in-memory limiter with a shared store if this route is used across multiple instances.
  const rateLimit = consumeRateLimit({
    key: `twilio-verify:start:${phoneNumber}`,
    limit: 1,
    windowMs: PHONE_VERIFICATION_START_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "Too many attempts. Please wait before requesting another code.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  try {
    const result = await sendSmsVerification(phoneNumber);
    return NextResponse.json({ ok: true, status: result.status });
  } catch (error) {
    const twilioError = error as {
      code?: unknown;
      status?: unknown;
      message?: unknown;
    };

    console.error("[TWILIO_VERIFY_START_FAILED]", {
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
      { ok: false, error: "Unable to send verification code right now." },
      { status: 500 }
    );
  }
}
