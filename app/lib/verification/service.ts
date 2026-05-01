import "server-only";

import { prisma } from "@/app/lib/prisma";
import { sendOnboardingConfirmationCodeEmail, sendVerificationCodeEmail } from "@/app/lib/email/sendgrid";
import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import { generateOtp6, hashOtp } from "@/app/lib/security/otp";
import {
  checkSmsVerification,
  sendSmsVerification,
  TwilioVerifyConfigurationError,
} from "@/app/lib/twilio/verify";
import { normalizePhoneForSms } from "@/app/lib/verification/phone";
import {
  normalizeEmailAddress,
  type VerificationChannel,
  VERIFICATION_CHANNEL_EMAIL,
  VERIFICATION_CHANNEL_SMS,
} from "@/app/lib/verification/types";

export type VerificationPurpose = "account_setup" | "onboarding_confirmation";

const SMS_VERIFICATION_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

export type VerificationSendResult =
  | {
      ok: true;
      channel: VerificationChannel;
      destination: string;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      channel: VerificationChannel;
      code:
        | "invalid_destination"
        | "cooldown"
        | "misconfigured"
        | "send_failed";
      message: string;
      retryAfterSeconds?: number;
    };

export type VerificationCheckResult =
  | { ok: true; channel: VerificationChannel; destination: string }
  | {
      ok: false;
      channel: VerificationChannel;
      code:
        | "invalid_destination"
        | "missing_code"
        | "expired_code"
        | "too_many_attempts"
        | "unavailable"
        | "invalid_code";
      message: string;
    };

function uniqueDestinations(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

export function normalizeVerificationDestination(params: {
  channel: VerificationChannel;
  destination: unknown;
}) {
  if (params.channel === VERIFICATION_CHANNEL_SMS) {
    return normalizePhoneForSms(params.destination);
  }

  return normalizeEmailAddress(params.destination);
}

export async function clearVerificationCodesForDestinations(
  destinations: Array<string | null | undefined>
) {
  const normalizedDestinations = uniqueDestinations(destinations);
  if (normalizedDestinations.length === 0) {
    return;
  }

  await prisma.emailOtp.deleteMany({
    where: {
      email: {
        in: normalizedDestinations,
      },
    },
  });

  const emailDestinations = normalizedDestinations.filter((value) =>
    Boolean(normalizeEmailAddress(value))
  );

  if (emailDestinations.length > 0) {
    await prisma.emailVerificationCode.deleteMany({
      where: {
        email: {
          in: emailDestinations,
        },
      },
    });
  }
}

async function deliverEmailVerificationCode(params: {
  destination: string;
  code: string;
  purpose: VerificationPurpose;
}) {
  if (params.purpose === "onboarding_confirmation") {
    await sendOnboardingConfirmationCodeEmail(params.destination, params.code);
    return;
  }

  await sendVerificationCodeEmail(params.destination, params.code);
}

function getDestinationValidationMessage(channel: VerificationChannel) {
  return channel === VERIFICATION_CHANNEL_SMS
    ? "Please enter a valid phone number."
    : "Please enter a valid email address.";
}

function getDestinationHint(channel: VerificationChannel, destination: string) {
  return channel === VERIFICATION_CHANNEL_SMS
    ? destination.slice(-4)
    : destination.split("@")[1] ?? null;
}

function consumeSmsSendCooldown(destination: string, resendCooldownMs: number) {
  // TODO: Move this limiter to a shared store if verification traffic needs to be enforced across multiple instances.
  return consumeRateLimit({
    key: `verification:sms:send:${destination}`,
    limit: 1,
    windowMs: resendCooldownMs,
  });
}

function consumeSmsVerifyAttempts(destination: string, maxAttempts: number) {
  // TODO: Move this limiter to a shared store if verification traffic needs to be enforced across multiple instances.
  return consumeRateLimit({
    key: `verification:sms:check:${destination}`,
    limit: maxAttempts,
    windowMs: SMS_VERIFICATION_ATTEMPT_WINDOW_MS,
  });
}

function mapTwilioVerifyFailure(status: string) {
  switch (status) {
    case "canceled":
    case "deleted":
    case "expired":
      return {
        code: "expired_code" as const,
        message: "The verification code has expired. Send a new code.",
      };
    case "max_attempts_reached":
      return {
        code: "too_many_attempts" as const,
        message: "Too many attempts. Please wait before requesting another code.",
      };
    default:
      return {
        code: "invalid_code" as const,
        message: "That code is not correct. Check it and try again.",
      };
  }
}

export async function sendVerificationCode(params: {
  channel: VerificationChannel;
  destination: unknown;
  purpose: VerificationPurpose;
  ttlMs: number;
  resendCooldownMs: number;
  skipCooldown?: boolean;
}) : Promise<VerificationSendResult> {
  const normalizedDestination = normalizeVerificationDestination({
    channel: params.channel,
    destination: params.destination,
  });

  if (!normalizedDestination) {
    return {
      ok: false,
      channel: params.channel,
      code: "invalid_destination",
      message: getDestinationValidationMessage(params.channel),
    };
  }

  if (params.channel === VERIFICATION_CHANNEL_SMS) {
    const smsCooldown =
      params.skipCooldown
        ? { allowed: true, retryAfterSeconds: 0 }
        : consumeSmsSendCooldown(normalizedDestination, params.resendCooldownMs);

    if (!smsCooldown.allowed) {
      return {
        ok: false,
        channel: params.channel,
        code: "cooldown",
        message: "Too many attempts. Please wait before requesting another code.",
        retryAfterSeconds: smsCooldown.retryAfterSeconds,
      };
    }

    try {
      await sendSmsVerification(normalizedDestination);
    } catch (error) {
      if (error instanceof TwilioVerifyConfigurationError) {
        return {
          ok: false,
          channel: params.channel,
          code: "misconfigured",
          message: "SMS verification is not configured right now. Please choose email instead.",
        };
      }

      const twilioError = error as {
        code?: unknown;
        status?: unknown;
      };
      console.error("[VERIFICATION_SEND_FAILED]", {
        channel: params.channel,
        purpose: params.purpose,
        destinationHint: getDestinationHint(params.channel, normalizedDestination),
        code:
          typeof twilioError.code === "number" || typeof twilioError.code === "string"
            ? twilioError.code
            : null,
        status:
          typeof twilioError.status === "number" || typeof twilioError.status === "string"
            ? twilioError.status
            : null,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        ok: false,
        channel: params.channel,
        code: "send_failed",
        message: "We couldn't send the code. Please try again.",
      };
    }

    return {
      ok: true,
      channel: params.channel,
      destination: normalizedDestination,
      retryAfterSeconds: Math.max(1, Math.ceil(params.resendCooldownMs / 1000)),
    };
  }

  const now = Date.now();
  const existingOtp = await prisma.emailOtp.findUnique({
    where: { email: normalizedDestination },
    select: { resendAfter: true },
  });

  if (
    !params.skipCooldown &&
    existingOtp?.resendAfter &&
    existingOtp.resendAfter.getTime() > now
  ) {
    return {
      ok: false,
      channel: params.channel,
      code: "cooldown",
      message: "Too many attempts. Please wait before requesting another code.",
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existingOtp.resendAfter.getTime() - now) / 1000)
      ),
    };
  }

  const code = generateOtp6();
  const expiresAt = new Date(now + params.ttlMs);
  const resendAfter = new Date(now + params.resendCooldownMs);

  await prisma.emailOtp.upsert({
    where: { email: normalizedDestination },
    create: {
      email: normalizedDestination,
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

  try {
    await deliverEmailVerificationCode({
      destination: normalizedDestination,
      code,
      purpose: params.purpose,
    });
  } catch (error) {
    console.error("[VERIFICATION_SEND_FAILED]", {
      channel: params.channel,
      purpose: params.purpose,
      destinationHint: getDestinationHint(params.channel, normalizedDestination),
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      ok: false,
      channel: params.channel,
      code: "send_failed",
      message: "We couldn't send the code. Please try again.",
    };
  }

  return {
    ok: true,
    channel: params.channel,
    destination: normalizedDestination,
    retryAfterSeconds: Math.max(1, Math.ceil(params.resendCooldownMs / 1000)),
  };
}

export async function verifyVerificationCode(params: {
  channel: VerificationChannel;
  destination: unknown;
  code: string;
  maxAttempts: number;
}): Promise<VerificationCheckResult> {
  const normalizedDestination = normalizeVerificationDestination({
    channel: params.channel,
    destination: params.destination,
  });
  const normalizedCode = String(params.code ?? "").replace(/\D/g, "").slice(0, 6);

  if (!normalizedDestination) {
    return {
      ok: false,
      channel: params.channel,
      code: "invalid_destination",
      message: getDestinationValidationMessage(params.channel),
    };
  }

  if (normalizedCode.length !== 6) {
    return {
      ok: false,
      channel: params.channel,
      code: "invalid_code",
      message: "Enter the 6-digit verification code.",
    };
  }

  if (params.channel === VERIFICATION_CHANNEL_SMS) {
    const smsAttemptLimit = consumeSmsVerifyAttempts(
      normalizedDestination,
      params.maxAttempts
    );

    if (!smsAttemptLimit.allowed) {
      return {
        ok: false,
        channel: params.channel,
        code: "too_many_attempts",
        message: "Too many attempts. Please wait before requesting another code.",
      };
    }

    try {
      const result = await checkSmsVerification(normalizedDestination, normalizedCode);

      if (result.approved) {
        return {
          ok: true,
          channel: params.channel,
          destination: normalizedDestination,
        };
      }

      return {
        ok: false,
        channel: params.channel,
        ...mapTwilioVerifyFailure(result.status),
      };
    } catch (error) {
      if (error instanceof TwilioVerifyConfigurationError) {
        return {
          ok: false,
          channel: params.channel,
          code: "unavailable",
          message: "SMS verification is not configured right now. Please choose email instead.",
        };
      }

      const twilioError = error as {
        code?: unknown;
        status?: unknown;
      };
      console.error("[VERIFICATION_CHECK_FAILED]", {
        channel: params.channel,
        destinationHint: getDestinationHint(params.channel, normalizedDestination),
        code:
          typeof twilioError.code === "number" || typeof twilioError.code === "string"
            ? twilioError.code
            : null,
        status:
          typeof twilioError.status === "number" || typeof twilioError.status === "string"
            ? twilioError.status
            : null,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        ok: false,
        channel: params.channel,
        code: "unavailable",
        message: "Unable to verify code right now.",
      };
    }
  }

  const otp = await prisma.emailOtp.findUnique({
    where: { email: normalizedDestination },
    select: { codeHash: true, expiresAt: true, attempts: true },
  });

  if (!otp) {
    return {
      ok: false,
      channel: params.channel,
      code: "missing_code",
      message: "The verification code has expired. Send a new code.",
    };
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    await clearVerificationCodesForDestinations([normalizedDestination]);
    return {
      ok: false,
      channel: params.channel,
      code: "expired_code",
      message: "The verification code has expired. Send a new code.",
    };
  }

  if (otp.attempts >= params.maxAttempts) {
    return {
      ok: false,
      channel: params.channel,
      code: "too_many_attempts",
      message: "Too many attempts. Please wait before requesting another code.",
    };
  }

  if (hashOtp(normalizedCode) !== otp.codeHash) {
    await prisma.emailOtp.update({
      where: { email: normalizedDestination },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      channel: params.channel,
      code: "invalid_code",
      message: "That code is not correct. Check it and try again.",
    };
  }

  return {
    ok: true,
    channel: params.channel,
    destination: normalizedDestination,
  };
}
