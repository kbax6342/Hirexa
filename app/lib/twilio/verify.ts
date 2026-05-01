import "server-only";

import twilio from "twilio";

export const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export class TwilioVerifyConfigurationError extends Error {
  constructor(
    message =
      "Twilio Verify is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID."
  ) {
    super(message);
    this.name = "TwilioVerifyConfigurationError";
  }
}

let cachedConfig:
  | {
      accountSid: string;
      authToken: string;
      serviceSid: string;
    }
  | null = null;
let cachedClient: ReturnType<typeof twilio> | null = null;

function readTwilioVerifyConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();

  if (!accountSid || !authToken || !serviceSid) {
    throw new TwilioVerifyConfigurationError();
  }

  cachedConfig = {
    accountSid,
    authToken,
    serviceSid,
  };

  return cachedConfig;
}

function getTwilioVerifyClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const { accountSid, authToken } = readTwilioVerifyConfig();
  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}

export function isE164PhoneNumber(value: unknown): value is string {
  return E164_PHONE_REGEX.test(String(value ?? "").trim());
}

function requireE164PhoneNumber(phoneNumber: string) {
  const normalizedPhoneNumber = String(phoneNumber ?? "").trim();
  if (!isE164PhoneNumber(normalizedPhoneNumber)) {
    throw new Error("Phone number must be in E.164 format.");
  }

  return normalizedPhoneNumber;
}

export async function sendSmsVerification(phoneNumber: string) {
  const to = requireE164PhoneNumber(phoneNumber);
  const client = getTwilioVerifyClient();
  const { serviceSid } = readTwilioVerifyConfig();

  const verification = await client.verify.v2
    .services(serviceSid)
    .verifications.create({
      to,
      channel: "sms",
    });

  return {
    status: String(verification.status ?? ""),
    sid: verification.sid ?? null,
  };
}

export async function checkSmsVerification(phoneNumber: string, code: string) {
  const to = requireE164PhoneNumber(phoneNumber);
  const normalizedCode = String(code ?? "").trim();
  const client = getTwilioVerifyClient();
  const { serviceSid } = readTwilioVerifyConfig();

  const verificationCheck = await client.verify.v2
    .services(serviceSid)
    .verificationChecks.create({
      to,
      code: normalizedCode,
    });

  const status = String(verificationCheck.status ?? "pending");

  return {
    status,
    sid: verificationCheck.sid ?? null,
    approved: status === "approved" || verificationCheck.valid === true,
  };
}
