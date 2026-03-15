import type { Prisma } from "@prisma/client";
import type { prisma } from "@/app/lib/prisma";
import {
  getSafePrivateProfileFields,
  normalizeDobForStorage,
  readRawPrivateProfileFieldsByIds,
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";

type MergeGuestProfileArgs = {
  userId: string;
  guestId: string;
  email?: string | null;
};

type MergeGuestProfileResult = {
  merged: boolean;
  mode:
    | "no_guest_profile"
    | "cleared_guest_link"
    | "converted_guest_to_user"
    | "merged_into_existing";
  profileId: string | null;
};

type ResumeExperienceSnapshot = {
  title?: string;
  company?: string;
  location?: string | null;
  dateRange?: string | null;
  bullets?: string[];
};

const mergeableUserProfileSelect = {
  id: true,
  userId: true,
  guestId: true,
  skills: true,
  resumeSkills: true,
  minCompensation: true,
  compensationType: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  subscriptionEmail: true,
  country: true,
  countryCode: true,
  linkedinUrl: true,
  portfolioUrl: true,
  authorizedUS: true,
  sponsorship: true,
  felony: true,
  startDate: true,
  screening: true,
  relocate: true,
  gender: true,
  pronouns: true,
  ethnicity: true,
  disability: true,
  veteran: true,
  workplaceLocations: true,
  includeRemote: true,
  newsletterOptIn: true,
  newsletterSource: true,
  emailVerifiedAt: true,
  unsubscribedAt: true,
  registrationStatus: true,
  keyQuestions: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  lastPaymentReceivedAt: true,
  monthlyPlanStatus: true,
  monthlySubscriber: true,
  profileImage: true,
  profileImageFilename: true,
  profileImageMimeType: true,
  subscriptionCheckedAt: true,
  subscriptionPurchasedAt: true,
  trialPlanStatus: true,
  trialSubscriber: true,
  yearlyPlanStatus: true,
  yearlySubscriber: true,
  welcomeEmailSentAt: true,
} satisfies Prisma.UserProfileSelect;

function mergeStringArrays(primary: string[], secondary: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of [...primary, ...secondary]) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

function preferText(primary?: string | null, secondary?: string | null) {
  return primary ?? secondary ?? undefined;
}

function preferDate(primary?: Date | null, secondary?: Date | null) {
  if (primary && secondary) {
    return primary.getTime() >= secondary.getTime() ? primary : secondary;
  }

  return primary ?? secondary ?? undefined;
}

function dateFromDobString(value?: string | null) {
  const normalized = normalizeDobForStorage(value);
  return normalized ? new Date(`${normalized}T00:00:00.000Z`) : undefined;
}

function experienceKey(value: {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  dateRange?: string | null;
}) {
  return [
    String(value.title ?? "").trim().toLowerCase(),
    String(value.company ?? "").trim().toLowerCase(),
    String(value.location ?? "").trim().toLowerCase(),
    String(value.dateRange ?? "").trim().toLowerCase(),
  ].join("|");
}

function asResumeExperienceSnapshots(
  value: Prisma.JsonValue | null | undefined
): ResumeExperienceSnapshot[] {
  if (!Array.isArray(value)) return [];

  const snapshots: ResumeExperienceSnapshot[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const snapshot: ResumeExperienceSnapshot = {
      title: typeof record.title === "string" ? record.title : undefined,
      company: typeof record.company === "string" ? record.company : undefined,
      location: typeof record.location === "string" ? record.location : null,
      dateRange: typeof record.dateRange === "string" ? record.dateRange : null,
      bullets: Array.isArray(record.bullets)
        ? record.bullets.map((bullet) => String(bullet ?? "").trim()).filter(Boolean)
        : [],
    };

    if (snapshot.title || snapshot.company) {
      snapshots.push(snapshot);
    }
  }

  return snapshots;
}

function mergeResumeExperienceSnapshots(
  primary: ResumeExperienceSnapshot[],
  secondary: ResumeExperienceSnapshot[]
) {
  const merged: ResumeExperienceSnapshot[] = [];
  const seen = new Set<string>();

  for (const item of [...primary, ...secondary]) {
    const key = experienceKey(item);
    if (!key.replace(/\|/g, "")) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function fingerprintJobApplication(value: {
  sourceJobId?: string | null;
  jobUrl?: string | null;
  company?: string | null;
  jobTitle?: string | null;
}) {
  if (value.sourceJobId) {
    return `source:${value.sourceJobId}`;
  }

  return [
    String(value.jobUrl ?? "").trim().toLowerCase(),
    String(value.company ?? "").trim().toLowerCase(),
    String(value.jobTitle ?? "").trim().toLowerCase(),
  ].join("|");
}

export async function mergeGuestProfileIntoUserProfile(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  args: MergeGuestProfileArgs
): Promise<MergeGuestProfileResult> {
  const guestProfile = await tx.userProfile.findUnique({
    where: { guestId: args.guestId },
    select: mergeableUserProfileSelect,
  });

  if (!guestProfile) {
    return { merged: false, mode: "no_guest_profile", profileId: null };
  }

  if (guestProfile.userId === args.userId) {
    const cleared = await tx.userProfile.update({
      where: { id: guestProfile.id },
      data: {
        guestId: null,
        email: guestProfile.email ?? args.email ?? undefined,
        subscriptionEmail: guestProfile.subscriptionEmail ?? args.email ?? undefined,
      },
      select: { id: true },
    });

    return {
      merged: true,
      mode: "cleared_guest_link",
      profileId: cleared.id,
    };
  }

  const userProfile = await tx.userProfile.findUnique({
    where: { userId: args.userId },
    select: mergeableUserProfileSelect,
  });

  if (!userProfile) {
    const converted = await tx.userProfile.update({
      where: { id: guestProfile.id },
      data: {
        userId: args.userId,
        guestId: null,
        email: guestProfile.email ?? args.email ?? undefined,
        subscriptionEmail: guestProfile.subscriptionEmail ?? args.email ?? undefined,
      },
      select: { id: true },
    });

    return {
      merged: true,
      mode: "converted_guest_to_user",
      profileId: converted.id,
    };
  }

  const privateFieldsById = await readRawPrivateProfileFieldsByIds(tx, [
    guestProfile.id,
    userProfile.id,
  ]);
  const safeUserPrivateFields = getSafePrivateProfileFields({
    ...privateFieldsById.get(userProfile.id),
  });
  const safeGuestPrivateFields = getSafePrivateProfileFields({
    ...privateFieldsById.get(guestProfile.id),
  });
  const mergedAddress = preferText(
    safeUserPrivateFields.address,
    safeGuestPrivateFields.address
  );
  const mergedCity = preferText(safeUserPrivateFields.city, safeGuestPrivateFields.city);
  const mergedPostalCode = preferText(
    safeUserPrivateFields.postalCode,
    safeGuestPrivateFields.postalCode
  );
  const mergedState = preferText(safeUserPrivateFields.state, safeGuestPrivateFields.state);
  const mergedDob = preferText(safeUserPrivateFields.dob, safeGuestPrivateFields.dob);
  const mergedPrivateFields = sanitizePrivateProfileFields({
    address: mergedAddress,
    city: mergedCity,
    postalCode: mergedPostalCode,
    state: mergedState,
    dob: mergedDob,
  });

  const mergedProfileData: Prisma.UserProfileUpdateInput = {
    guestId: null,
    skills: mergeStringArrays(userProfile.skills, guestProfile.skills),
    resumeSkills: mergeStringArrays(userProfile.resumeSkills, guestProfile.resumeSkills),
    minCompensation: userProfile.minCompensation ?? guestProfile.minCompensation ?? undefined,
    compensationType: userProfile.compensationType ?? guestProfile.compensationType ?? undefined,
    firstName: preferText(userProfile.firstName, guestProfile.firstName),
    lastName: preferText(userProfile.lastName, guestProfile.lastName),
    phone: preferText(userProfile.phone, guestProfile.phone),
    email: preferText(userProfile.email, guestProfile.email ?? args.email ?? null),
    subscriptionEmail: preferText(
      userProfile.subscriptionEmail,
      guestProfile.subscriptionEmail ?? guestProfile.email ?? args.email ?? null
    ),
    address: null,
    addressEncrypted: mergedPrivateFields.addressEncrypted,
    city: null,
    cityEncrypted: mergedPrivateFields.cityEncrypted,
    citySearch: mergedPrivateFields.citySearch,
    postalCode: null,
    postalCodeEncrypted: mergedPrivateFields.postalCodeEncrypted,
    postalCodeSearch: mergedPrivateFields.postalCodeSearch,
    state: null,
    stateEncrypted: mergedPrivateFields.stateEncrypted,
    stateSearch: mergedPrivateFields.stateSearch,
    country: preferText(userProfile.country, guestProfile.country),
    countryCode: preferText(userProfile.countryCode, guestProfile.countryCode),
    linkedinUrl: preferText(userProfile.linkedinUrl, guestProfile.linkedinUrl),
    portfolioUrl: preferText(userProfile.portfolioUrl, guestProfile.portfolioUrl),
    authorizedUS: preferText(userProfile.authorizedUS, guestProfile.authorizedUS),
    sponsorship: preferText(userProfile.sponsorship, guestProfile.sponsorship),
    felony: preferText(userProfile.felony, guestProfile.felony),
    startDate: preferText(userProfile.startDate, guestProfile.startDate),
    screening: preferText(userProfile.screening, guestProfile.screening),
    relocate: preferText(userProfile.relocate, guestProfile.relocate),
    gender: preferText(userProfile.gender, guestProfile.gender),
    pronouns: preferText(userProfile.pronouns, guestProfile.pronouns),
    ethnicity: preferText(userProfile.ethnicity, guestProfile.ethnicity),
    disability: preferText(userProfile.disability, guestProfile.disability),
    veteran: preferText(userProfile.veteran, guestProfile.veteran),
    workplaceLocations: userProfile.workplaceLocations ?? guestProfile.workplaceLocations ?? undefined,
    includeRemote: guestProfile.includeRemote === false ? false : userProfile.includeRemote,
    newsletterOptIn: userProfile.newsletterOptIn || guestProfile.newsletterOptIn,
    newsletterSource: preferText(userProfile.newsletterSource, guestProfile.newsletterSource),
    emailVerifiedAt: preferDate(userProfile.emailVerifiedAt, guestProfile.emailVerifiedAt),
    unsubscribedAt: preferDate(userProfile.unsubscribedAt, guestProfile.unsubscribedAt),
    registrationStatus:
      userProfile.registrationStatus && userProfile.registrationStatus !== "pending_verification"
        ? userProfile.registrationStatus
        : guestProfile.registrationStatus ?? userProfile.registrationStatus ?? undefined,
    dob: dateFromDobString(mergedPrivateFields.dob) ?? null,
    keyQuestions: userProfile.keyQuestions ?? guestProfile.keyQuestions ?? undefined,
    stripeCustomerId: preferText(userProfile.stripeCustomerId, guestProfile.stripeCustomerId),
    stripeSubscriptionId: preferText(
      userProfile.stripeSubscriptionId,
      guestProfile.stripeSubscriptionId
    ),
    lastPaymentReceivedAt: preferDate(
      userProfile.lastPaymentReceivedAt,
      guestProfile.lastPaymentReceivedAt
    ),
    monthlyPlanStatus: preferText(userProfile.monthlyPlanStatus, guestProfile.monthlyPlanStatus),
    monthlySubscriber: userProfile.monthlySubscriber || guestProfile.monthlySubscriber,
    profileImage: userProfile.profileImage ?? guestProfile.profileImage ?? undefined,
    profileImageFilename:
      userProfile.profileImageFilename ?? guestProfile.profileImageFilename ?? undefined,
    profileImageMimeType:
      userProfile.profileImageMimeType ?? guestProfile.profileImageMimeType ?? undefined,
    subscriptionCheckedAt: preferDate(
      userProfile.subscriptionCheckedAt,
      guestProfile.subscriptionCheckedAt
    ),
    subscriptionPurchasedAt: preferDate(
      userProfile.subscriptionPurchasedAt,
      guestProfile.subscriptionPurchasedAt
    ),
    trialPlanStatus: preferText(userProfile.trialPlanStatus, guestProfile.trialPlanStatus),
    trialSubscriber: userProfile.trialSubscriber || guestProfile.trialSubscriber,
    yearlyPlanStatus: preferText(userProfile.yearlyPlanStatus, guestProfile.yearlyPlanStatus),
    yearlySubscriber: userProfile.yearlySubscriber || guestProfile.yearlySubscriber,
    welcomeEmailSentAt: preferDate(
      userProfile.welcomeEmailSentAt,
      guestProfile.welcomeEmailSentAt
    ),
  };

  await tx.userProfile.update({
    where: { id: userProfile.id },
    data: mergedProfileData,
    select: { id: true },
  });

  await tx.resumeFile.updateMany({
    where: { profileId: guestProfile.id },
    data: { profileId: userProfile.id },
  });

  await tx.stripePayment.updateMany({
    where: { userProfileId: guestProfile.id },
    data: { userProfileId: userProfile.id },
  });

  await tx.benefitSelection.updateMany({
    where: { userProfileId: guestProfile.id },
    data: { userProfileId: userProfile.id, guestId: null },
  });

  await tx.benefitSelection.updateMany({
    where: { guestId: args.guestId },
    data: { userProfileId: userProfile.id, guestId: null },
  });

  const guestJobInterests = await tx.jobInterest.findMany({
    where: { userProfileId: guestProfile.id },
    select: { uuid: true, title: true },
  });

  if (guestJobInterests.length > 0) {
    await tx.jobInterest.createMany({
      data: guestJobInterests.map((interest) => ({
        userProfileId: userProfile.id,
        uuid: interest.uuid,
        title: interest.title,
      })),
      skipDuplicates: true,
    });

    await tx.jobInterest.deleteMany({
      where: { userProfileId: guestProfile.id },
    });
  }

  const guestApplications = await tx.jobApplication.findMany({
    where: { userProfileId: guestProfile.id },
    select: {
      id: true,
      sourceJobId: true,
      jobUrl: true,
      company: true,
      jobTitle: true,
    },
  });

  const userApplications = await tx.jobApplication.findMany({
    where: { userProfileId: userProfile.id },
    select: {
      sourceJobId: true,
      jobUrl: true,
      company: true,
      jobTitle: true,
    },
  });

  const existingApplicationKeys = new Set(
    userApplications.map((application) => fingerprintJobApplication(application))
  );

  for (const application of guestApplications) {
    const key = fingerprintJobApplication(application);
    if (existingApplicationKeys.has(key)) continue;

    await tx.jobApplication.update({
      where: { id: application.id },
      data: { userProfileId: userProfile.id },
    });

    existingApplicationKeys.add(key);
  }

  const sourceResume = await tx.resume.findUnique({
    where: { userProfileId: guestProfile.id },
    include: {
      resumeExperiences: true,
      experiences: {
        orderBy: { order: "asc" },
        include: {
          bullets: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (sourceResume) {
    const targetResume = await tx.resume.findUnique({
      where: { userProfileId: userProfile.id },
      include: {
        resumeExperiences: true,
        experiences: {
          orderBy: { order: "asc" },
          include: {
            bullets: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!targetResume) {
      await tx.resume.update({
        where: { id: sourceResume.id },
        data: { userProfileId: userProfile.id },
      });
    } else {
      const existingKeys = new Set(
        targetResume.experiences.map((experience) => experienceKey(experience))
      );
      let nextOrder =
        targetResume.experiences.reduce((max, experience) => Math.max(max, experience.order), -1) + 1;

      for (const experience of sourceResume.experiences) {
        const key = experienceKey(experience);
        if (existingKeys.has(key)) continue;

        const createdExperience = await tx.experience.create({
          data: {
            resumeId: targetResume.id,
            order: nextOrder++,
            title: experience.title,
            company: experience.company,
            location: experience.location,
            dateRange: experience.dateRange,
          },
          select: { id: true },
        });

        if (experience.bullets.length > 0) {
          await tx.bullet.createMany({
            data: experience.bullets.map((bullet, index) => ({
              experienceId: createdExperience.id,
              order: index,
              text: bullet.text,
            })),
          });
        }

        existingKeys.add(key);
      }

      const mergedSnapshots = mergeResumeExperienceSnapshots(
        asResumeExperienceSnapshots(targetResume.resumeExperiences?.experiences ?? null),
        asResumeExperienceSnapshots(sourceResume.resumeExperiences?.experiences ?? null)
      );

      if (mergedSnapshots.length > 0) {
        if (targetResume.resumeExperiences) {
          await tx.resumeExperience.update({
            where: { resumeId: targetResume.id },
            data: { experiences: mergedSnapshots as Prisma.InputJsonValue },
          });
        } else {
          await tx.resumeExperience.create({
            data: {
              resumeId: targetResume.id,
              experiences: mergedSnapshots as Prisma.InputJsonValue,
            },
          });
        }
      }

      await tx.resume.delete({
        where: { id: sourceResume.id },
      });
    }
  }

  await tx.userProfile.deleteMany({
    where: { id: guestProfile.id },
  });

  return {
    merged: true,
    mode: "merged_into_existing",
    profileId: userProfile.id,
  };
}
