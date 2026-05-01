import "server-only";

import { prisma } from "@/app/lib/prisma";
import { readOnboardingConfirmationState } from "@/app/lib/onboarding/confirmation";
import { normalizePhoneForSms } from "@/app/lib/verification/phone";

const PENDING_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingVerificationCleanupSummary = {
  expiredProfilesFound: number;
  deletedProfiles: number;
  deletedUsers: number;
  deletedOtps: number;
  skippedProfiles: number;
};

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  return email && email.length > 0 ? email : null;
}

function hasCleanupActivity(summary: PendingVerificationCleanupSummary) {
  return (
    summary.expiredProfilesFound > 0 ||
    summary.deletedProfiles > 0 ||
    summary.deletedUsers > 0 ||
    summary.deletedOtps > 0 ||
    summary.skippedProfiles > 0
  );
}

export async function cleanupExpiredPendingVerifications(
  now = new Date()
): Promise<PendingVerificationCleanupSummary> {
  const cutoff = new Date(now.getTime() - PENDING_VERIFICATION_TTL_MS);

  const expiredProfiles = await prisma.userProfile.findMany({
    where: {
      registrationStatus: "pending_verification",
      createdAt: { lte: cutoff },
    },
    select: {
      id: true,
      email: true,
      phone: true,
      keyQuestions: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  const summary: PendingVerificationCleanupSummary = {
    expiredProfilesFound: expiredProfiles.length,
    deletedProfiles: 0,
    deletedUsers: 0,
    deletedOtps: 0,
    skippedProfiles: 0,
  };

  for (const profile of expiredProfiles) {
    const email = normalizeEmail(profile.email) ?? normalizeEmail(profile.user?.email);
    const confirmationState = readOnboardingConfirmationState(profile.keyQuestions);
    const phone =
      normalizePhoneForSms(confirmationState.phone) ??
      normalizePhoneForSms(profile.phone) ??
      null;
    const destinations = [email, phone].filter(
      (value): value is string => Boolean(value)
    );
    const emailDestinations = email ? [email] : [];

    const result = await prisma.$transaction(async (tx) => {
      let deletedOtps = 0;

      if (destinations.length > 0) {
        const deletedEmailOtp = await tx.emailOtp.deleteMany({
          where: {
            email: {
              in: destinations,
            },
          },
        });
        const deletedLegacyOtp = await tx.emailVerificationCode.deleteMany({
          where: {
            email: {
              in: emailDestinations,
            },
          },
        });
        deletedOtps = deletedEmailOtp.count + deletedLegacyOtp.count;
      }

      if (profile.user?.emailVerifiedAt) {
        return {
          deletedOtps,
          deletedProfile: false,
          deletedUser: false,
          skippedProfile: true,
        };
      }

      let deletedUser = false;
      if (profile.userId) {
        const deletedPendingUsers = await tx.user.deleteMany({
          where: {
            id: profile.userId,
            emailVerifiedAt: null,
          },
        });
        deletedUser = deletedPendingUsers.count > 0;
      }

      if (deletedUser) {
        return {
          deletedOtps,
          deletedProfile: true,
          deletedUser: true,
          skippedProfile: false,
        };
      }

      const deletedProfiles = await tx.userProfile.deleteMany({
        where: {
          id: profile.id,
          registrationStatus: "pending_verification",
        },
      });

      return {
        deletedOtps,
        deletedProfile: deletedProfiles.count > 0,
        deletedUser: false,
        skippedProfile: false,
      };
    });

    summary.deletedOtps += result.deletedOtps;
    if (result.deletedProfile) {
      summary.deletedProfiles += 1;
    }
    if (result.deletedUser) {
      summary.deletedUsers += 1;
    }
    if (result.skippedProfile) {
      summary.skippedProfiles += 1;
    }
  }

  if (hasCleanupActivity(summary)) {
    console.info("[AUTH_CLEANUP] expired pending verification cleanup summary", {
      cutoffIso: cutoff.toISOString(),
      expiredProfilesFound: summary.expiredProfilesFound,
      deletedProfiles: summary.deletedProfiles,
      deletedUsers: summary.deletedUsers,
      deletedOtps: summary.deletedOtps,
      skippedProfiles: summary.skippedProfiles,
    });
  }

  return summary;
}
