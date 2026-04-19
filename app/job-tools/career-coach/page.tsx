import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { getHirexaAccessForUser } from "@/app/lib/billing/getHirexaAccess";

import CareerCoachClient, {
  type CareerCoachFormState,
  type CareerCoachProfileSummary,
} from "./CareerCoachClient";

const careerCoachProfileSelect = {
  firstName: true,
  lastName: true,
  city: true,
  state: true,
  country: true,
  workplaceLocations: true,
  keyQuestions: true,
  skills: true,
  resumeSkills: true,
  linkedinUrl: true,
  portfolioUrl: true,
  jobInterests: {
    orderBy: { id: "asc" },
    take: 5,
    select: {
      title: true,
    },
  },
  resume: {
    select: {
      filename: true,
      updatedAt: true,
      experiences: {
        orderBy: { order: "asc" },
        take: 6,
        select: {
          title: true,
          company: true,
          dateRange: true,
        },
      },
    },
  },
} satisfies Prisma.UserProfileSelect;

type CareerCoachProfile = Prisma.UserProfileGetPayload<{
  select: typeof careerCoachProfileSelect;
}>;

function trimText(value: unknown) {
  return String(value ?? "").trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = trimText(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function readRoleFocus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const roleFocus = (value as { roleFocus?: string | null }).roleFocus;
  const normalized = trimText(roleFocus);
  return normalized || null;
}

function readWorkplaceLocation(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = trimText((item as { label?: string | null }).label ?? null);
    if (label) return label;
  }

  return null;
}

function buildLocation(profile: CareerCoachProfile | null) {
  if (!profile) return null;

  const workplaceLocation = readWorkplaceLocation(profile.workplaceLocations);
  const city = trimText(profile.city);
  const state = trimText(profile.state);
  const country = trimText(profile.country);

  return (
    workplaceLocation ||
    dedupeStrings([city && state ? `${city}, ${state}` : "", city, state, country])[0] ||
    null
  );
}

function buildProfileSummary(profile: CareerCoachProfile | null): CareerCoachProfileSummary | null {
  if (!profile) {
    return null;
  }

  const skills = dedupeStrings([...(profile.skills ?? []), ...(profile.resumeSkills ?? [])]).slice(
    0,
    10
  );
  const resumeExperiences = (profile.resume?.experiences ?? []).map((experience) => ({
    title: trimText(experience.title) || "Role",
    company: trimText(experience.company) || "Company",
    dateRange: trimText(experience.dateRange) || null,
  }));
  const profileSignals = [
    trimText(profile.firstName),
    trimText(profile.lastName),
    buildLocation(profile),
    readRoleFocus(profile.keyQuestions),
    trimText(profile.linkedinUrl),
    trimText(profile.portfolioUrl),
  ].filter(Boolean).length;

  return {
    firstName: trimText(profile.firstName) || null,
    fullName: dedupeStrings([trimText(profile.firstName), trimText(profile.lastName)]).join(" ") || null,
    roleFocus: readRoleFocus(profile.keyQuestions),
    preferredLocation: buildLocation(profile),
    skills,
    experienceCount: resumeExperiences.length,
    experiences: resumeExperiences.slice(0, 3),
    resumeAvailable: Boolean(profile.resume),
    resumeFileName: trimText(profile.resume?.filename) || null,
    resumeUpdatedAt: profile.resume?.updatedAt?.toISOString() ?? null,
    profileSignals,
  };
}

function buildInitialForm(profile: CareerCoachProfile | null): CareerCoachFormState {
  const roleFocus = readRoleFocus(profile?.keyQuestions);
  const targetRoles = dedupeStrings([
    roleFocus ?? "",
    ...((profile?.jobInterests ?? []).map((item) => trimText(item.title)) ?? []),
  ])
    .slice(0, 3)
    .join(", ");

  return {
    targetRoles,
    targetIndustry: "",
    preferredLocation: buildLocation(profile) ?? "",
    experienceLevel: "",
    biggestChallenge: "",
    priority: "",
    additionalContext: "",
  };
}

export default async function CareerCoachPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const callbackUrl = "/job-tools/career-coach";

  const [profile, access] = await Promise.all([
    userId
      ? prisma.userProfile.findUnique({
          where: { userId },
          select: careerCoachProfileSelect,
        })
      : Promise.resolve(null),
    userId
      ? getHirexaAccessForUser({
          userId,
          sessionEmail: session?.user?.email ?? null,
        })
      : Promise.resolve(null),
  ]);

  return (
    <CareerCoachClient
      isAuthenticated={Boolean(userId)}
      hasPaidAccess={Boolean(access?.active || access?.pending)}
      loginHref={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
      checkoutHref="/plans/payment"
      uploadHref="/resume"
      jobMatchesHref={userId ? "/dashboard" : "/jobs"}
      aiApplyHref="/job-tools/generate"
      hirePilotHref="/hirepilot"
      initialForm={buildInitialForm(profile)}
      profileSummary={buildProfileSummary(profile)}
    />
  );
}
