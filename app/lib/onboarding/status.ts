import "server-only";

import { prisma } from "@/app/lib/prisma";

export const onboardingStatusSelect = {
  questionsCompleted: true,
  keyQuestions: true,
  registrationStatus: true,
  firstName: true,
  lastName: true,
  email: true,
  resume: {
    select: { id: true },
  },
  resumeFiles: {
    take: 1,
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
  resume?: { id: string } | null;
  resumeFiles?: Array<{ id: string }> | null;
} | null;

export function isOnboardingComplete(profile: OnboardingStatusProfile) {
  return Boolean(
    profile?.questionsCompleted ||
      profile?.keyQuestions ||
      profile?.registrationStatus === "KEY_QUESTIONS_COMPLETE"
  );
}

export function hasUploadedResume(profile: OnboardingStatusProfile) {
  return Boolean(profile?.resume?.id || (profile?.resumeFiles?.length ?? 0) > 0);
}

export function hasRequiredProfileDetails(profile: OnboardingStatusProfile) {
  return Boolean(
    profile?.firstName?.trim() &&
      profile?.lastName?.trim() &&
      profile?.email?.trim()
  );
}

export function getNextOnboardingPath(profile: OnboardingStatusProfile) {
  if (isOnboardingComplete(profile)) {
    return null;
  }

  if (!hasUploadedResume(profile)) {
    return "/resume";
  }

  if (!hasRequiredProfileDetails(profile)) {
    return "/onboarding/profile";
  }

  return "/questions";
}

export async function getOnboardingStatusForUser(userId?: string | null) {
  if (!userId) {
    return {
      profile: null,
      completed: false,
      hasResume: false,
      hasProfileDetails: false,
      nextPath: "/resume",
    };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: onboardingStatusSelect,
  });

  return {
    profile,
    completed: isOnboardingComplete(profile),
    hasResume: hasUploadedResume(profile),
    hasProfileDetails: hasRequiredProfileDetails(profile),
    nextPath: getNextOnboardingPath(profile),
  };
}
