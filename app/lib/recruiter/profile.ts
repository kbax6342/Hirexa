import "server-only";

import type { RecruiterAgency } from "@prisma/client";

import type { RecruiterProfileRecord } from "@/app/components/recruiter/types";
import { prisma } from "@/app/lib/prisma";
import { parseStringListInput, toNullableString } from "@/app/lib/recruiter/server";

const recruiterProfileSelect = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  workEmail: true,
  phone: true,
  linkedinUrl: true,
  agencyName: true,
  agencyWebsite: true,
  city: true,
  state: true,
  companyDescription: true,
  hiringIndustries: true,
  recruitingSpecialties: true,
  hiringRoles: true,
  seniorityLevels: true,
  employmentTypes: true,
  workModes: true,
  hiringLocations: true,
  calendarUrl: true,
  intakeEmail: true,
  resumeSubmissionEmail: true,
  outreachTone: true,
  autoFollowUp: true,
  createdAt: true,
  updatedAt: true,
} as const;

const completionFieldChecks = [
  {
    label: "First name",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.firstName),
  },
  {
    label: "Last name",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.lastName),
  },
  {
    label: "Job title",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.jobTitle),
  },
  {
    label: "Work email",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.workEmail),
  },
  {
    label: "Agency name",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.agencyName),
  },
  {
    label: "Agency website",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.agencyWebsite),
  },
  {
    label: "Recruiting specialties",
    isComplete: (profile: RecruiterProfileRecord) =>
      profile.recruitingSpecialties.length > 0,
  },
  {
    label: "Hiring roles",
    isComplete: (profile: RecruiterProfileRecord) => profile.hiringRoles.length > 0,
  },
  {
    label: "Hiring locations",
    isComplete: (profile: RecruiterProfileRecord) =>
      profile.hiringLocations.length > 0,
  },
  {
    label: "LinkedIn URL",
    isComplete: (profile: RecruiterProfileRecord) => Boolean(profile.linkedinUrl),
  },
] as const;

function getRecruiterProfileDelegate() {
  const delegate = (
    prisma as typeof prisma & {
      recruiterProfile?: typeof prisma.recruiterProfile;
    }
  ).recruiterProfile;

  if (!delegate) {
    throw new Error(
      'Prisma client is stale: `prisma.recruiterProfile` is undefined even though `RecruiterProfile` exists in `prisma/schema.prisma`. Run `npx prisma generate` and restart the app server.'
    );
  }

  return delegate;
}

function splitName(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function parseBooleanInput(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function buildProfileRecord(
  profile: {
    id: string;
    userId: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
    workEmail: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    agencyName: string | null;
    agencyWebsite: string | null;
    city: string | null;
    state: string | null;
    companyDescription: string | null;
    hiringIndustries: string[];
    recruitingSpecialties: string[];
    hiringRoles: string[];
    seniorityLevels: string[];
    employmentTypes: string[];
    workModes: string[];
    hiringLocations: string[];
    calendarUrl: string | null;
    intakeEmail: string | null;
    resumeSubmissionEmail: string | null;
    outreachTone: string | null;
    autoFollowUp: boolean;
    createdAt: Date;
    updatedAt: Date;
  }
): RecruiterProfileRecord {
  return {
    ...profile,
    hiringIndustries: profile.hiringIndustries ?? [],
    recruitingSpecialties: profile.recruitingSpecialties ?? [],
    hiringRoles: profile.hiringRoles ?? [],
    seniorityLevels: profile.seniorityLevels ?? [],
    employmentTypes: profile.employmentTypes ?? [],
    workModes: profile.workModes ?? [],
    hiringLocations: profile.hiringLocations ?? [],
  };
}

export function computeRecruiterProfileCompletion(profile: RecruiterProfileRecord) {
  const completed = completionFieldChecks.filter((field) => field.isComplete(profile)).length;
  return Math.round((completed / completionFieldChecks.length) * 100);
}

export function buildRecruiterProfileChecklist(profile: RecruiterProfileRecord) {
  return completionFieldChecks
    .filter((field) => !field.isComplete(profile))
    .map((field) => field.label);
}

export async function getOrCreateRecruiterProfile(args: {
  userId: string;
  agency: RecruiterAgency;
}) {
  const recruiterProfile = getRecruiterProfileDelegate();
  let profile = await recruiterProfile.findUnique({
    where: { userId: args.userId },
    select: recruiterProfileSelect,
  });

  if (!profile) {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        name: true,
        email: true,
      },
    });
    const names = splitName(user?.name);

    profile = await recruiterProfile.create({
      data: {
        userId: args.userId,
        firstName: names.firstName,
        lastName: names.lastName,
        workEmail: toNullableString(user?.email),
        agencyName: toNullableString(args.agency.name) ?? args.agency.name,
        outreachTone: "professional",
        autoFollowUp: true,
      },
      select: recruiterProfileSelect,
    });
  }

  const record = buildProfileRecord(profile);

  return {
    profile: record,
    completion: computeRecruiterProfileCompletion(record),
    checklist: buildRecruiterProfileChecklist(record),
  };
}

export function sanitizeRecruiterProfileInput(
  input: Record<string, unknown>,
  agencyNameFallback: string
) {
  const agencyName = toNullableString(input.agencyName) ?? agencyNameFallback;

  return {
    firstName: toNullableString(input.firstName),
    lastName: toNullableString(input.lastName),
    jobTitle: toNullableString(input.jobTitle),
    workEmail: toNullableString(input.workEmail),
    phone: toNullableString(input.phone),
    linkedinUrl: toNullableString(input.linkedinUrl),
    agencyName,
    agencyWebsite: toNullableString(input.agencyWebsite),
    city: toNullableString(input.city),
    state: toNullableString(input.state),
    companyDescription: toNullableString(input.companyDescription),
    hiringIndustries: parseStringListInput(input.hiringIndustries),
    recruitingSpecialties: parseStringListInput(input.recruitingSpecialties),
    hiringRoles: parseStringListInput(input.hiringRoles),
    seniorityLevels: parseStringListInput(input.seniorityLevels),
    employmentTypes: parseStringListInput(input.employmentTypes),
    workModes: parseStringListInput(input.workModes),
    hiringLocations: parseStringListInput(input.hiringLocations),
    calendarUrl: toNullableString(input.calendarUrl),
    intakeEmail: toNullableString(input.intakeEmail),
    resumeSubmissionEmail: toNullableString(input.resumeSubmissionEmail),
    outreachTone: toNullableString(input.outreachTone) ?? "professional",
    autoFollowUp: parseBooleanInput(input.autoFollowUp, true),
  };
}

export async function saveRecruiterProfile(args: {
  userId: string;
  agency: RecruiterAgency;
  input: Record<string, unknown>;
}) {
  const recruiterProfile = getRecruiterProfileDelegate();
  const data = sanitizeRecruiterProfileInput(args.input, args.agency.name);

  await recruiterProfile.upsert({
    where: { userId: args.userId },
    update: data,
    create: {
      userId: args.userId,
      ...data,
    },
    select: { id: true },
  });

  if (data.agencyName && data.agencyName !== args.agency.name) {
    await prisma.recruiterAgency.update({
      where: { id: args.agency.id },
      data: { name: data.agencyName },
    });
  }

  return getOrCreateRecruiterProfile({
    userId: args.userId,
    agency: {
      ...args.agency,
      name: data.agencyName ?? args.agency.name,
    },
  });
}
