import "server-only";

import { Buffer } from "node:buffer";

type SendSmsParams = {
  to: string;
  body: string;
};

export class SmsConfigurationError extends Error {
  constructor(message = "SMS verification is not configured right now.") {
    super(message);
    this.name = "SmsConfigurationError";
  }
}

function readTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    throw new SmsConfigurationError();
  }

  return { accountSid, authToken, fromNumber };
}

export async function sendSms(params: SendSmsParams) {
  const { accountSid, authToken, fromNumber } = readTwilioConfig();
  const body = new URLSearchParams({
    To: params.to,
    From: fromNumber,
    Body: params.body,
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message ?? "SMS delivery failed.");
  }
}

export async function sendVerificationCodeSms(params: {
  to: string;
  code: string;
  purpose: "account_setup" | "onboarding_confirmation";
}) {
  const copy =
    params.purpose === "onboarding_confirmation"
      ? `Your Hirexa AI verification code is ${params.code}. Enter it in Hirexa AI to finish onboarding. This code expires in 10 minutes.`
      : `Your Hirexa AI verification code is ${params.code}. This code expires in 10 minutes. Never share it with anyone.`;

  await sendSms({
    to: params.to,
    body: copy,
  });
}
