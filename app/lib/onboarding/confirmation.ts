import "server-only";

import { Prisma } from "@prisma/client";

export const ONBOARDING_CONFIRMATION_KEY = "onboardingConfirmation";
export const ONBOARDING_CONFIRMATION_CODE_TTL_MS = 10 * 60 * 1000;
export const ONBOARDING_CONFIRMATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const ONBOARDING_CONFIRMATION_MAX_ATTEMPTS = 5;

export type OnboardingConfirmationState = {
  emailVerified: boolean;
  emailVerifiedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeIsoDate(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function readOnboardingConfirmationState(
  keyQuestions: unknown
): OnboardingConfirmationState {
  const raw = asRecord(asRecord(keyQuestions)[ONBOARDING_CONFIRMATION_KEY]);

  return {
    emailVerified: raw.emailVerified === true,
    emailVerifiedAt: normalizeIsoDate(raw.emailVerifiedAt),
  };
}

export function mergeOnboardingConfirmationState(
  keyQuestions: unknown,
  state: Partial<OnboardingConfirmationState>
): Prisma.InputJsonValue {
  const existing = asRecord(keyQuestions);
  const current = asRecord(existing[ONBOARDING_CONFIRMATION_KEY]);

  return {
    ...existing,
    [ONBOARDING_CONFIRMATION_KEY]: {
      ...current,
      ...state,
    },
  } as Prisma.InputJsonValue;
}
