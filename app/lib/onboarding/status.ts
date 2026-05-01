import "server-only";

import { prisma } from "@/app/lib/prisma";
import {
  HIRING_SIGNAL_ROUTE,
  JOB_GOAL_ROUTE,
  JOB_INTEREST_ROUTE,
  JOB_LOCATION_ROUTE,
  JOB_PRIORITIES_ROUTE,
  ONBOARDING_CONFIRMATION_ROUTE,
  RESUME_IMPORT_ROUTE,
  WORK_STORY_ROUTE,
} from "@/app/lib/onboarding-flow";
import { readOnboardingConfirmationState } from "@/app/lib/onboarding/confirmation";

export const onboardingStatusSelect = {
  keyQuestions: true,
  questionsCompleted: true,
  registrationStatus: true,
  emailVerifiedAt: true,
  city: true,
  state: true,
  postalCode: true,
  benefitSelections: {
    select: { id: true },
    take: 1,
  },
  resume: {
    select: { id: true },
  },
  jobInterests: {
    select: { title: true },
    take: 1,
    orderBy: { id: "asc" },
  },
} as const;

export type OnboardingStatusProfile = {
  keyQuestions?: unknown;
  questionsCompleted?: boolean | null;
  registrationStatus?: string | null;
  emailVerifiedAt?: Date | string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  benefitSelections?: Array<{ id: string }> | null;
  resume?: { id: string } | null;
  jobInterests?: Array<{ title?: string | null }> | null;
} | null;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function registrationStatus(profile: OnboardingStatusProfile) {
  return normalizeText(profile?.registrationStatus);
}

function readKeyQuestions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function getKeyQuestionValue(profile: OnboardingStatusProfile, key: string) {
  return readKeyQuestions(profile?.keyQuestions)[key];
}

function hasRoleFocus(profile: OnboardingStatusProfile) {
  const keyQuestionRoleFocus = normalizeText(getKeyQuestionValue(profile, "roleFocus"));
  if (keyQuestionRoleFocus) {
    return true;
  }

  return Boolean(profile?.jobInterests?.some((job) => normalizeText(job?.title)));
}

function hasJobGoal(profile: OnboardingStatusProfile) {
  return Boolean(normalizeText(getKeyQuestionValue(profile, "jobSearchGoal")));
}

function hasJobPriorities(profile: OnboardingStatusProfile) {
  return readStringArray(getKeyQuestionValue(profile, "jobPriorities")).length > 0;
}

function hasLocationData(profile: OnboardingStatusProfile) {
  return Boolean(
    normalizeText(profile?.city) &&
      normalizeText(profile?.state) &&
      normalizeText(profile?.postalCode)
  );
}

function hasHiringSignal(profile: OnboardingStatusProfile) {
  return readStringArray(getKeyQuestionValue(profile, "hiringSignalTraits")).length > 0;
}

function hasWorkStory(profile: OnboardingStatusProfile) {
  return readStringArray(getKeyQuestionValue(profile, "workStoryTags")).length > 0;
}

function hasCompletedLegacyQuestionsStep(profile: OnboardingStatusProfile) {
  const status = registrationStatus(profile);

  return Boolean(
    profile?.questionsCompleted ||
      profile?.keyQuestions ||
      status === "QUESTIONS_COMPLETE_PENDING_BENEFITS" ||
      status === "KEY_QUESTIONS_COMPLETE" ||
      status === "BENEFITS_COMPLETE"
  );
}

function hasCompletedLegacyBenefitsStep(profile: OnboardingStatusProfile) {
  const status = registrationStatus(profile);

  return Boolean(
    profile?.benefitSelections?.length ||
      status === "KEY_QUESTIONS_COMPLETE" ||
      status === "BENEFITS_COMPLETE"
  );
}

function hasCompletedLegacyOnboarding(profile: OnboardingStatusProfile) {
  return (
    hasCompletedLegacyQuestionsStep(profile) &&
    hasCompletedLegacyBenefitsStep(profile)
  );
}

export function hasCompletedQuestionsStep(profile: OnboardingStatusProfile) {
  return (
    hasCompletedLegacyQuestionsStep(profile) ||
    (hasRoleFocus(profile) && hasJobGoal(profile) && hasJobPriorities(profile))
  );
}

export function hasCompletedBenefitsStep(profile: OnboardingStatusProfile) {
  return hasCompletedLegacyBenefitsStep(profile) || hasHiringSignal(profile);
}

export function isOnboardingFormComplete(profile: OnboardingStatusProfile) {
  if (hasCompletedLegacyOnboarding(profile)) {
    return true;
  }

  return (
    hasRoleFocus(profile) &&
    hasJobGoal(profile) &&
    hasJobPriorities(profile) &&
    hasCompletedResumeImportStep(profile) &&
    hasCompletedWorkStoryStep(profile) &&
    hasCompletedLocationStep(profile) &&
    hasHiringSignal(profile)
  );
}

export function hasCompletedOnboardingEmailConfirmation(
  profile: OnboardingStatusProfile
) {
  return Boolean(profile?.emailVerifiedAt) ||
    readOnboardingConfirmationState(profile?.keyQuestions).emailVerified;
}

export function isOnboardingComplete(profile: OnboardingStatusProfile) {
  return (
    isOnboardingFormComplete(profile) &&
    hasCompletedOnboardingEmailConfirmation(profile)
  );
}

export function hasUploadedResume(profile: OnboardingStatusProfile) {
  return Boolean(profile?.resume?.id);
}

export function hasCompletedProfileStep(profile: OnboardingStatusProfile) {
  return hasRoleFocus(profile);
}

export function hasCompletedResumeImportStep(profile: OnboardingStatusProfile) {
  return Boolean(
    hasUploadedResume(profile) || hasWorkStory(profile) || hasLocationData(profile) || hasHiringSignal(profile)
  );
}

export function hasCompletedWorkStoryStep(profile: OnboardingStatusProfile) {
  return Boolean(hasWorkStory(profile) || hasLocationData(profile) || hasHiringSignal(profile));
}

export function hasCompletedLocationStep(profile: OnboardingStatusProfile) {
  return Boolean(hasLocationData(profile) || hasHiringSignal(profile));
}

export function getNextOnboardingPath(profile: OnboardingStatusProfile) {
  if (isOnboardingComplete(profile)) {
    return null;
  }

  if (hasCompletedLegacyOnboarding(profile)) {
    return ONBOARDING_CONFIRMATION_ROUTE;
  }

  if (!hasRoleFocus(profile)) {
    return JOB_INTEREST_ROUTE;
  }

  if (!hasJobGoal(profile)) {
    return JOB_GOAL_ROUTE;
  }

  if (!hasJobPriorities(profile)) {
    return JOB_PRIORITIES_ROUTE;
  }

  if (!hasCompletedResumeImportStep(profile)) {
    return RESUME_IMPORT_ROUTE;
  }

  if (!hasCompletedWorkStoryStep(profile)) {
    return WORK_STORY_ROUTE;
  }

  if (!hasCompletedLocationStep(profile)) {
    return JOB_LOCATION_ROUTE;
  }

  if (!hasHiringSignal(profile)) {
    return HIRING_SIGNAL_ROUTE;
  }

  return ONBOARDING_CONFIRMATION_ROUTE;
}

export async function getOnboardingStatusForUser(userId?: string | null) {
  const fallback = {
    profile: null,
    completed: false,
    formCompleted: false,
    onboardingEmailVerified: false,
    hasResume: false,
    hasProfileDetails: false,
    nextPath: JOB_INTEREST_ROUTE,
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
      formCompleted: isOnboardingFormComplete(profile),
      onboardingEmailVerified: hasCompletedOnboardingEmailConfirmation(profile),
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
