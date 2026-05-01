export const VERIFICATION_CHANNEL_EMAIL = "email";
export const VERIFICATION_CHANNEL_SMS = "sms";

export const VERIFICATION_CHANNELS = [
  VERIFICATION_CHANNEL_EMAIL,
  VERIFICATION_CHANNEL_SMS,
] as const;

export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];

export function normalizeVerificationChannel(
  value: unknown,
  fallback: VerificationChannel = VERIFICATION_CHANNEL_EMAIL
): VerificationChannel {
  return value === VERIFICATION_CHANNEL_SMS
    ? VERIFICATION_CHANNEL_SMS
    : fallback;
}

export function normalizeEmailAddress(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(email) ? email : null;
}
