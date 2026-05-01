import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import { deriveLocationLabel } from "@/app/lib/locationOptions";
import {
  readDraftSection,
  readOnboardingDraftPayload,
  type DraftJobPayload,
  type DraftMinSalaryPayload,
  type DraftOnboardingEmailPayload,
  type DraftPreferencesPayload,
  type DraftProfilePayload,
  type DraftSignupPayload,
} from "@/app/lib/onboarding/draft-session";
import { mergeOnboardingConfirmationState } from "@/app/lib/onboarding/confirmation";
import {
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";
import {
  clampSalaryForType,
  parseSalaryInputToNumber,
  type CompensationType,
} from "@/app/lib/salary";
import { normalizeVerificationChannel } from "@/app/lib/verification/types";

type PrismaTransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$extends" | "$on" | "$transaction" | "$use"
>;

function normalizeText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value: unknown) {
  const email = normalizeText(value).toLowerCase();
  return email || null;
}

function normalizeTextArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const text = normalizeText(item);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);

    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

function readKeyQuestions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeJobs(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: Array<{ uuid: string; title: string }> = [];

  for (const item of value as DraftJobPayload[]) {
    const title = normalizeText(item?.title);
    if (!title) continue;

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      uuid: normalizeText(item?.uuid) || slugify(title),
      title,
    });

    if (normalized.length >= 1) break;
  }

  return normalized;
}

function normalizeCompensationType(value: unknown): CompensationType {
  return value === "hourly" ? "hourly" : "yearly";
}

function getDraftCompensation(params: {
  preferences: Partial<DraftPreferencesPayload>;
  minSalary: Partial<DraftMinSalaryPayload>;
}) {
  const compensationType = normalizeCompensationType(
    params.minSalary.compensationType ?? params.preferences.compensationType
  );
  const rawValue =
    params.minSalary.minCompensation ?? params.preferences.minCompensation;

  if (rawValue === null) {
    return { compensationType, minCompensation: null };
  }

  const parsed = parseSalaryInputToNumber(rawValue);
  if (parsed === null) {
    return { compensationType, minCompensation: undefined };
  }

  return {
    compensationType,
    minCompensation: clampSalaryForType(parsed, compensationType),
  };
}

export async function commitOnboardingDraftToUserProfile(params: {
  tx: PrismaTransactionClient;
  userId: string;
  draftPayload: unknown;
  guestId?: string | null;
}) {
  const payload = readOnboardingDraftPayload(params.draftPayload);
  const draftProfile = readDraftSection<DraftProfilePayload>(payload.profile);
  const draftJobInterests = readDraftSection(payload.jobInterests);
  const draftPreferences = readDraftSection<DraftPreferencesPayload>(
    payload.preferences
  );
  const draftOnboardingEmail = readDraftSection<DraftOnboardingEmailPayload>(
    payload.onboardingEmail
  );
  const draftMinSalary = readDraftSection<DraftMinSalaryPayload>(payload.minSalary);
  const draftSignup = readDraftSection<DraftSignupPayload>(payload.signup);

  const existingProfile = await params.tx.userProfile.findUnique({
    where: { userId: params.userId },
    select: {
      id: true,
      keyQuestions: true,
    },
  });

  const existingKeyQuestions = readKeyQuestions(existingProfile?.keyQuestions);
  const locationCity =
    normalizeText(draftPreferences.city ?? draftProfile.city) || null;
  const locationState =
    normalizeText(draftPreferences.state ?? draftProfile.state) || null;
  const locationPostalCode =
    normalizeText(draftPreferences.postalCode ?? draftProfile.postalCode) || null;
  const privateFields =
    locationCity || locationState || locationPostalCode || draftProfile.address || draftProfile.dob
      ? sanitizePrivateProfileFields({
          dob: draftProfile.dob,
          address: draftProfile.address,
          city: locationCity,
          state: locationState,
          postalCode: locationPostalCode,
        })
      : null;
  const explicitWorkplaceLocations = Array.isArray(draftPreferences.workplaceLocations)
    ? draftPreferences.workplaceLocations
        .map((item) => {
          const label = normalizeText((item as { label?: unknown })?.label);
          return label ? { label } : null;
        })
        .filter((item): item is { label: string } => Boolean(item))
        .slice(0, 1)
    : undefined;
  const derivedWorkplaceLocation =
    !explicitWorkplaceLocations?.length && privateFields
      ? deriveLocationLabel(privateFields.city, privateFields.state)
      : null;
  const workplaceLocations =
    explicitWorkplaceLocations ??
    (derivedWorkplaceLocation ? [{ label: derivedWorkplaceLocation }] : undefined);
  const normalizedEmail =
    normalizeEmail(draftSignup.email) ??
    normalizeEmail(draftOnboardingEmail.email) ??
    normalizeEmail(draftProfile.email);
  const verificationChannel = normalizeVerificationChannel(
    draftSignup.verificationChannel
  );
  const draftPhone =
    normalizeText(draftSignup.phone) || normalizeText(draftProfile.phone) || null;
  const hasCompensationDraft =
    draftMinSalary.minCompensation !== undefined ||
    draftPreferences.minCompensation !== undefined ||
    draftMinSalary.compensationType !== undefined ||
    draftPreferences.compensationType !== undefined;
  const { compensationType, minCompensation } = getDraftCompensation({
    preferences: draftPreferences,
    minSalary: draftMinSalary,
  });
  const roleFocus =
    normalizeText(draftPreferences.roleFocus ?? draftJobInterests.roleFocus) || null;
  const jobSearchGoal = normalizeText(draftJobInterests.jobSearchGoal) || null;
  const jobPriorities = normalizeTextArray(draftJobInterests.jobPriorities, 12);
  const workStoryTags = normalizeTextArray(draftJobInterests.workStoryTags, 20);
  const workStoryHighlight =
    normalizeText(draftJobInterests.workStoryHighlight) || null;
  const hirexaSupportLevel =
    normalizeText(draftPreferences.hirexaSupportLevel) || null;
  const hirexaSupportExtras = normalizeTextArray(
    draftPreferences.hirexaSupportExtras,
    8
  );
  const schedulePreferences = normalizeTextArray(
    draftPreferences.schedulePreferences,
    8
  );
  const hiringSignalTraits = normalizeTextArray(
    draftPreferences.hiringSignalTraits,
    8
  );
  const hiringSignalEmphasis =
    normalizeText(draftPreferences.hiringSignalEmphasis) || null;
  const skills = normalizeTextArray(draftJobInterests.skills, 20);
  const highlightSkillsConfidence =
    normalizeText(draftJobInterests.highlightSkillsConfidence) || null;
  const selectedJobs = normalizeJobs(draftJobInterests.jobs);
  const selectedPlan = normalizeText(draftPreferences.selectedPlan) || null;
  const benefits = normalizeTextArray(draftPreferences.benefits, 12);
  const firstName =
    normalizeText(draftSignup.firstName) || normalizeText(draftProfile.firstName) || null;
  const lastName =
    normalizeText(draftSignup.lastName) || normalizeText(draftProfile.lastName) || null;

  const nextKeyQuestions = {
    ...existingKeyQuestions,
    ...(roleFocus ? { roleFocus } : {}),
    ...(jobSearchGoal ? { jobSearchGoal } : {}),
    ...(jobPriorities.length ? { jobPriorities } : {}),
    ...(workStoryTags.length ? { workStoryTags } : {}),
    ...(workStoryHighlight !== null ? { workStoryHighlight } : {}),
    ...(normalizeText(draftPreferences.availability)
      ? { availability: normalizeText(draftPreferences.availability) }
      : {}),
    ...(normalizeText(draftPreferences.employmentType)
      ? { employmentType: normalizeText(draftPreferences.employmentType) }
      : {}),
    ...(normalizeText(draftPreferences.seniorityLevel)
      ? { seniorityLevel: normalizeText(draftPreferences.seniorityLevel) }
      : {}),
    ...(normalizeText(draftPreferences.workSetup)
      ? { workSetup: normalizeText(draftPreferences.workSetup) }
      : {}),
    ...(normalizeText(draftPreferences.commutePreference)
      ? { commutePreference: normalizeText(draftPreferences.commutePreference) }
      : {}),
    ...(schedulePreferences.length ? { schedulePreferences } : {}),
    ...(normalizeText(draftPreferences.jobFilterPaySelection)
      ? { jobFilterPaySelection: normalizeText(draftPreferences.jobFilterPaySelection) }
      : {}),
    ...(hirexaSupportLevel ? { hirexaSupportLevel } : {}),
    ...(hirexaSupportExtras.length ? { hirexaSupportExtras } : {}),
    ...(hiringSignalTraits.length ? { hiringSignalTraits } : {}),
    ...(hiringSignalEmphasis !== null ? { hiringSignalEmphasis } : {}),
    ...(highlightSkillsConfidence ? { highlightSkillsConfidence } : {}),
  };
  const nextConfirmationState = mergeOnboardingConfirmationState(nextKeyQuestions, {
    preferredChannel: verificationChannel,
    phone: draftPhone,
  });

  const profile = await params.tx.userProfile.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      ...(params.guestId ? { guestId: params.guestId } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(normalizedEmail
        ? { email: normalizedEmail, subscriptionEmail: normalizedEmail }
        : {}),
      ...(draftPhone
        ? { phone: draftPhone }
        : {}),
      ...(normalizeText(draftProfile.linkedinUrl)
        ? { linkedinUrl: normalizeText(draftProfile.linkedinUrl) }
        : {}),
      ...(normalizeText(draftProfile.portfolioUrl)
        ? { portfolioUrl: normalizeText(draftProfile.portfolioUrl) }
        : {}),
      ...(minCompensation !== undefined ? { minCompensation } : {}),
      ...(hasCompensationDraft ? { compensationType } : {}),
      includeRemote:
        typeof draftPreferences.includeRemote === "boolean"
          ? draftPreferences.includeRemote
          : true,
      keyQuestions: nextConfirmationState,
      registrationStatus: "registered",
      ...(skills.length ? { skills } : {}),
      ...(workplaceLocations
        ? { workplaceLocations: workplaceLocations as Prisma.InputJsonValue }
        : {}),
      ...(draftOnboardingEmail.newsletterOptIn
        ? {
            newsletterOptIn: true,
            newsletterSource:
              normalizeText(draftOnboardingEmail.newsletterSource) ||
              "onboarding/job-alerts",
            unsubscribedAt: null,
          }
        : {}),
      ...(privateFields
        ? {
            dob: privateFields.dob ? new Date(`${privateFields.dob}T00:00:00.000Z`) : null,
            address: null,
            addressEncrypted: privateFields.addressEncrypted,
            city: null,
            cityEncrypted: privateFields.cityEncrypted,
            citySearch: privateFields.citySearch,
            state: null,
            stateEncrypted: privateFields.stateEncrypted,
            stateSearch: privateFields.stateSearch,
            postalCode: null,
            postalCodeEncrypted: privateFields.postalCodeEncrypted,
            postalCodeSearch: privateFields.postalCodeSearch,
          }
        : {}),
    },
    update: {
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(normalizedEmail
        ? { email: normalizedEmail, subscriptionEmail: normalizedEmail }
        : {}),
      ...(draftPhone
        ? { phone: draftPhone }
        : {}),
      ...(normalizeText(draftProfile.linkedinUrl)
        ? { linkedinUrl: normalizeText(draftProfile.linkedinUrl) }
        : {}),
      ...(normalizeText(draftProfile.portfolioUrl)
        ? { portfolioUrl: normalizeText(draftProfile.portfolioUrl) }
        : {}),
      ...(minCompensation !== undefined ? { minCompensation } : {}),
      ...(hasCompensationDraft ? { compensationType } : {}),
      ...(typeof draftPreferences.includeRemote === "boolean"
        ? { includeRemote: draftPreferences.includeRemote }
        : {}),
      keyQuestions: nextConfirmationState,
      registrationStatus: "registered",
      ...(skills.length ? { skills } : {}),
      ...(workplaceLocations
        ? { workplaceLocations: workplaceLocations as Prisma.InputJsonValue }
        : {}),
      ...(draftOnboardingEmail.newsletterOptIn
        ? {
            newsletterOptIn: true,
            newsletterSource:
              normalizeText(draftOnboardingEmail.newsletterSource) ||
              "onboarding/job-alerts",
            unsubscribedAt: null,
          }
        : {}),
      ...(privateFields
        ? {
            dob: privateFields.dob ? new Date(`${privateFields.dob}T00:00:00.000Z`) : null,
            address: null,
            addressEncrypted: privateFields.addressEncrypted,
            city: null,
            cityEncrypted: privateFields.cityEncrypted,
            citySearch: privateFields.citySearch,
            state: null,
            stateEncrypted: privateFields.stateEncrypted,
            stateSearch: privateFields.stateSearch,
            postalCode: null,
            postalCodeEncrypted: privateFields.postalCodeEncrypted,
            postalCodeSearch: privateFields.postalCodeSearch,
          }
        : {}),
    },
    select: { id: true },
  });

  if (selectedJobs.length) {
    await params.tx.jobInterest.deleteMany({
      where: { userProfileId: profile.id },
    });

    await params.tx.jobInterest.createMany({
      data: selectedJobs.map((job) => ({
        userProfileId: profile.id,
        uuid: job.uuid,
        title: job.title,
      })),
      skipDuplicates: true,
    });
  }

  if (selectedPlan || benefits.length) {
    const existingBenefit = await params.tx.benefitSelection.findFirst({
      where: { userProfileId: profile.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingBenefit) {
      await params.tx.benefitSelection.update({
        where: { id: existingBenefit.id },
        data: {
          ...(selectedPlan ? { selectedPlan } : {}),
          benefits,
        },
      });
    } else {
      await params.tx.benefitSelection.create({
        data: {
          userProfileId: profile.id,
          guestId: params.guestId ?? undefined,
          selectedPlan: selectedPlan || "trial",
          benefits,
        },
      });
    }
  }

  return profile.id;
}
