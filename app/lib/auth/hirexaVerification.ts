import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { generateOtp6, hashOtp } from "@/app/lib/security/otp";

type VerificationGateRecord = {
  emailVerifiedAt?: Date | null;
  registrationStatus?: string | null;
};

export type HirexaVerificationGateStatus = {
  email: string | null;
  registrationStatus: string | null;
  requiresVerification: boolean;
  verifiedAt: Date | null;
};

export function normalizeAuthEmail(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function splitAuthDisplayName(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return { firstName: null, lastName: null, name: null };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
    name: normalized,
  };
}

export function isPendingVerificationStatus(value: string | null | undefined) {
  return value?.trim() === "pending_verification";
}

function hasVerifiedOnce(record: VerificationGateRecord | null | undefined) {
  if (!record) {
    return false;
  }

  if (record.emailVerifiedAt) {
    return true;
  }

  return Boolean(record.registrationStatus && !isPendingVerificationStatus(record.registrationStatus));
}

export function requiresHirexaVerification(record: VerificationGateRecord | null | undefined) {
  if (!record) {
    return false;
  }

  return !record.emailVerifiedAt || isPendingVerificationStatus(record.registrationStatus);
}

export async function issueHirexaVerificationCode(
  email: string,
  tx?: Prisma.TransactionClient
) {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) {
    throw new Error("A valid email address is required.");
  }

  const client = tx ?? prisma;
  const code = generateOtp6();

  await client.emailOtp.upsert({
    where: { email: normalizedEmail },
    create: {
      email: normalizedEmail,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
    update: {
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  });

  return code;
}

export async function getHirexaVerificationGateForUser(
  userId?: string | null
): Promise<HirexaVerificationGateStatus> {
  if (!userId) {
    return {
      email: null,
      registrationStatus: null,
      requiresVerification: false,
      verifiedAt: null,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailVerifiedAt: true,
      userProfile: {
        select: {
          email: true,
          emailVerifiedAt: true,
          registrationStatus: true,
        },
      },
    },
  });

  const email = normalizeAuthEmail(user?.email) ?? normalizeAuthEmail(user?.userProfile?.email);
  const verifiedAt = user?.emailVerifiedAt ?? user?.userProfile?.emailVerifiedAt ?? null;
  const registrationStatus = user?.userProfile?.registrationStatus?.trim() ?? null;

  return {
    email,
    registrationStatus,
    verifiedAt,
    requiresVerification: requiresHirexaVerification({
      emailVerifiedAt: verifiedAt,
      registrationStatus,
    }),
  };
}

export async function upsertLocalUserAndProfileForSocialAuth(params: {
  email: string;
  name?: string | null;
}) {
  const email = normalizeAuthEmail(params.email);
  if (!email) {
    return null;
  }

  const { firstName, lastName, name } = splitAuthDisplayName(params.name);

  return prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerifiedAt: true,
        name: true,
      },
    });

    const existingProfileByUserId = existingUser
      ? await tx.userProfile.findUnique({
          where: { userId: existingUser.id },
          select: {
            id: true,
            emailVerifiedAt: true,
            registrationStatus: true,
          },
        })
      : null;

    const existingProfileByEmail = existingProfileByUserId
      ? null
      : await tx.userProfile.findFirst({
          where: { email },
          select: {
            id: true,
            emailVerifiedAt: true,
            registrationStatus: true,
          },
        });

    const existingProfile = existingProfileByUserId ?? existingProfileByEmail;
    const wasExistingUser = Boolean(existingUser);
    const alreadyVerified =
      hasVerifiedOnce({
        emailVerifiedAt: existingUser?.emailVerifiedAt ?? existingProfile?.emailVerifiedAt ?? null,
        registrationStatus: existingProfile?.registrationStatus ?? null,
      }) || false;

    const nextVerifiedAt = alreadyVerified
      ? existingUser?.emailVerifiedAt ??
        existingProfile?.emailVerifiedAt ??
        new Date()
      : null;
    const nextRegistrationStatus = alreadyVerified
      ? existingProfile?.registrationStatus?.trim() &&
        !isPendingVerificationStatus(existingProfile.registrationStatus)
        ? existingProfile.registrationStatus.trim()
        : "registered"
      : "pending_verification";

    const localUser = await tx.user.upsert({
      where: { email },
      create: {
        email,
        name,
        isGuest: false,
        emailVerifiedAt: nextVerifiedAt,
      },
      update: {
        email,
        name: name ?? existingUser?.name ?? undefined,
        isGuest: false,
        emailVerifiedAt: nextVerifiedAt,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const profileUpdate = {
      userId: localUser.id,
      email,
      subscriptionEmail: email,
      emailVerifiedAt: nextVerifiedAt,
      registrationStatus: nextRegistrationStatus,
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
    };

    if (existingProfile?.id) {
      await tx.userProfile.update({
        where: { id: existingProfile.id },
        data: profileUpdate,
        select: { id: true },
      });
    } else {
      await tx.userProfile.create({
        data: profileUpdate,
        select: { id: true },
      });
    }

    return {
      alreadyVerified,
      localUser,
      wasExistingUser,
    };
  });
}
