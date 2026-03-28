import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  BENEFITS_ROUTE,
  ONBOARDING_PROFILE_ROUTE,
  QUESTIONS_CLIENTS_ROUTE,
} from "@/app/lib/onboarding-flow";

export const onboardingStatusSelect = {
  questionsCompleted: true,
  keyQuestions: true,
  registrationStatus: true,
  firstName: true,
  lastName: true,
  email: true,
  benefitSelections: {
    select: { id: true },
    take: 1,
  },
  resume: {
    select: { id: true },
  },
} as const;

export type OnboardingStatusProfile = {
  questionsCompleted?: boolean | null;
  keyQuestions?: unknown;
  registrationStatus?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  benefitSelections?: Array<{ id: string }> | null;
  resume?: { id: string } | null;
} | null;

function registrationStatus(profile: OnboardingStatusProfile) {
  return profile?.registrationStatus?.trim() ?? null;
}

export function hasCompletedQuestionsStep(profile: OnboardingStatusProfile) {
  const status = registrationStatus(profile);

  return Boolean(
    profile?.questionsCompleted ||
      profile?.keyQuestions ||
      status === "QUESTIONS_COMPLETE_PENDING_BENEFITS" ||
      status === "KEY_QUESTIONS_COMPLETE" ||
      status === "BENEFITS_COMPLETE"
  );
}

export function hasCompletedBenefitsStep(profile: OnboardingStatusProfile) {
  const status = registrationStatus(profile);

  return Boolean(
    profile?.benefitSelections?.length ||
      status === "KEY_QUESTIONS_COMPLETE" ||
      status === "BENEFITS_COMPLETE"
  );
}

export function isOnboardingComplete(profile: OnboardingStatusProfile) {
  return hasCompletedQuestionsStep(profile) && hasCompletedBenefitsStep(profile);
}

export function hasUploadedResume(profile: OnboardingStatusProfile) {
  return Boolean(profile?.resume?.id);
}

export function hasCompletedProfileStep(profile: OnboardingStatusProfile) {
  const status = registrationStatus(profile);

  return Boolean(
    status === "PROFILE_COMPLETE" ||
      status === "QUESTIONS_COMPLETE_PENDING_BENEFITS" ||
      status === "KEY_QUESTIONS_COMPLETE" ||
      status === "BENEFITS_COMPLETE"
  );
}

export function getNextOnboardingPath(profile: OnboardingStatusProfile) {
  if (isOnboardingComplete(profile)) {
    return null;
  }

  if (!hasCompletedProfileStep(profile)) {
    return ONBOARDING_PROFILE_ROUTE;
  }

  if (!hasCompletedQuestionsStep(profile)) {
    return QUESTIONS_CLIENTS_ROUTE;
  }

  if (!hasCompletedBenefitsStep(profile)) {
    return BENEFITS_ROUTE;
  }

  return QUESTIONS_CLIENTS_ROUTE;
}

export async function getOnboardingStatusForUser(userId?: string | null) {
  const fallback = {
    profile: null,
    completed: false,
    hasResume: false,
    hasProfileDetails: false,
    nextPath: QUESTIONS_CLIENTS_ROUTE,
  };

  if (!userId) {
    return fallback;
  }

  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: onboardingStatusSelect,
    });

    return {
      profile,
      completed: isOnboardingComplete(profile),
      hasResume: hasUploadedResume(profile),
      hasProfileDetails: hasCompletedProfileStep(profile),
      nextPath: getNextOnboardingPath(profile),
    };
  } catch (error) {
    console.error("[onboarding] failed to read onboarding status", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return fallback;
  }
}
