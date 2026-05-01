import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  getActiveOnboardingDraftForCookies,
  readDraftSection,
  readOnboardingDraftPayload,
  type DraftProfilePayload,
  type DraftSignupPayload,
} from "@/app/lib/onboarding/draft-session";
import {
  maskPhoneForDisplay,
  normalizePhoneForSms,
} from "@/app/lib/verification/phone";
import {
  normalizeEmailAddress,
  normalizeVerificationChannel,
  type VerificationChannel,
  VERIFICATION_CHANNEL_EMAIL,
  VERIFICATION_CHANNEL_SMS,
} from "@/app/lib/verification/types";
import { readOnboardingConfirmationState } from "@/app/lib/onboarding/confirmation";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type VerificationContext = {
  preferredChannel: VerificationChannel;
  email: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  destination: string | null;
  resolvedChannel: VerificationChannel;
  destinationLabel: string | null;
};

function maskEmail(value: string | null) {
  if (!value) return null;
  return value;
}

export async function resolveVerificationContext(params: {
  userId?: string | null;
  sessionEmail?: string | null;
  cookieStore?: CookieReader | null;
  requestedChannel?: unknown;
  requestedEmail?: unknown;
  requestedPhone?: unknown;
}) : Promise<VerificationContext> {
  let preferredChannel = normalizeVerificationChannel(params.requestedChannel);
  let email = normalizeEmailAddress(params.requestedEmail) ?? normalizeEmailAddress(params.sessionEmail);
  let phone = String(params.requestedPhone ?? "").trim() || null;

  if (params.userId) {
    const profile = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        email: true,
        userProfile: {
          select: {
            email: true,
            phone: true,
            keyQuestions: true,
          },
        },
      },
    });

    const confirmationState = readOnboardingConfirmationState(
      profile?.userProfile?.keyQuestions
    );

    preferredChannel = normalizeVerificationChannel(
      confirmationState.preferredChannel ?? preferredChannel
    );
    email =
      normalizeEmailAddress(profile?.email) ??
      normalizeEmailAddress(profile?.userProfile?.email) ??
      email;
    phone =
      String(confirmationState.phone ?? profile?.userProfile?.phone ?? phone ?? "").trim() ||
      null;
  } else if (params.cookieStore) {
    const draft = await getActiveOnboardingDraftForCookies(params.cookieStore);
    if (draft) {
      const payload = readOnboardingDraftPayload(draft.payload);
      const signup = readDraftSection<DraftSignupPayload>(payload.signup);
      const profile = readDraftSection<DraftProfilePayload>(payload.profile);

      preferredChannel = normalizeVerificationChannel(
        signup.verificationChannel ?? preferredChannel
      );
      email =
        normalizeEmailAddress(signup.email) ??
        normalizeEmailAddress(profile.email) ??
        email;
      phone =
        String(signup.phone ?? profile.phone ?? phone ?? "").trim() || null;
    }
  }

  const normalizedPhone = normalizePhoneForSms(phone);
  const resolvedChannel =
    preferredChannel === VERIFICATION_CHANNEL_SMS && normalizedPhone
      ? VERIFICATION_CHANNEL_SMS
      : VERIFICATION_CHANNEL_EMAIL;
  const destination =
    resolvedChannel === VERIFICATION_CHANNEL_SMS ? normalizedPhone : email;

  return {
    preferredChannel,
    email,
    phone,
    normalizedPhone,
    destination: destination ?? null,
    resolvedChannel,
    destinationLabel:
      resolvedChannel === VERIFICATION_CHANNEL_SMS
        ? maskPhoneForDisplay(normalizedPhone)
        : maskEmail(email),
  };
}
