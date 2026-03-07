import { prisma } from "@/app/lib/prisma";
import { buildSuggestedShortBio } from "@/app/lib/agents/linkedinSim";

type ProfileSnapshot = {
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  skills?: string[];
  resumeSkills?: string[];
  keyQuestions?: unknown;
  workplaceLocations?: unknown;
  jobInterests?: { title?: string | null }[];
  resume?: {
    experiences?: {
      title?: string | null;
      company?: string | null;
      location?: string | null;
      dateRange?: string | null;
    }[];
  } | null;
};

export type LinkedInImportSnapshot = {
  importedName: string;
  importedHeadline: string;
  importedLocation: string;
  importedSkills: string[];
  suggestedShortBio: string;
};

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function dedupePreserveCase(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function getRoleFocus(profile: ProfileSnapshot | null) {
  if (!profile?.keyQuestions || typeof profile.keyQuestions !== "object" || Array.isArray(profile.keyQuestions)) {
    return null;
  }

  const roleFocus = (profile.keyQuestions as Record<string, unknown>)?.roleFocus;
  return trimOrNull(typeof roleFocus === "string" ? roleFocus : null);
}

function getExpertise(profile: ProfileSnapshot | null) {
  if (!profile?.keyQuestions || typeof profile.keyQuestions !== "object" || Array.isArray(profile.keyQuestions)) {
    return [] as string[];
  }

  const expertise = (profile.keyQuestions as Record<string, unknown>)?.expertise;
  if (!Array.isArray(expertise)) return [];

  return expertise.map((item) => String(item).trim()).filter(Boolean);
}

function getWorkplaceLocation(profile: ProfileSnapshot | null) {
  const raw = profile?.workplaceLocations;
  if (!Array.isArray(raw)) return null;

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const label = trimOrNull((item as { label?: unknown }).label as string | null);
    if (label) return label;
  }

  return null;
}

function getRecentExperience(profile: ProfileSnapshot | null) {
  const experiences = profile?.resume?.experiences ?? [];
  if (!experiences.length) return null;

  const first = experiences[0];
  const title = trimOrNull(first?.title ?? null);
  const company = trimOrNull(first?.company ?? null);
  const location = trimOrNull(first?.location ?? null);

  if (!title && !company) return null;
  return { title, company, location };
}

function getJobInterestTitle(profile: ProfileSnapshot | null) {
  const interest = profile?.jobInterests?.find((item) => trimOrNull(item?.title ?? null));
  return interest ? trimOrNull(interest.title ?? null) : null;
}

function buildImportedName(profile: ProfileSnapshot | null, userName?: string | null) {
  const fullName = [profile?.firstName, profile?.lastName]
    .map((part) => trimOrNull(part))
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) return fullName;
  if (trimOrNull(userName)) return trimOrNull(userName) as string;
  return "Hirexa Candidate";
}

function buildImportedLocation(profile: ProfileSnapshot | null) {
  const city = trimOrNull(profile?.city);
  const state = trimOrNull(profile?.state);
  const country = trimOrNull(profile?.country);
  const workplace = getWorkplaceLocation(profile);
  const recentLocation = trimOrNull(getRecentExperience(profile)?.location ?? null);

  const parts = [city, state].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (workplace) return workplace;
  if (recentLocation) return recentLocation;
  if (country) return country;
  return "United States";
}

function buildImportedSkills(profile: ProfileSnapshot | null) {
  const skillPool = [
    ...(profile?.skills ?? []),
    ...(profile?.resumeSkills ?? []),
    ...getExpertise(profile),
  ]
    .map((skill) => skill.trim())
    .filter(Boolean);

  const deduped = dedupePreserveCase(skillPool);
  if (deduped.length > 0) return deduped;

  return ["Communication", "Problem Solving"];
}

function buildImportedHeadline(
  profile: ProfileSnapshot | null,
  skills: string[],
  recent: { title: string | null; company: string | null } | null,
  roleFocus: string | null,
  jobInterestTitle: string | null
) {
  if (recent?.title && recent?.company) {
    return `${recent.title} at ${recent.company}`;
  }
  if (recent?.title) {
    return `${recent.title} Professional`;
  }
  if (roleFocus) {
    return `${roleFocus} Professional`;
  }
  if (jobInterestTitle) {
    return `${jobInterestTitle} Candidate`;
  }
  if (skills.length > 0) {
    return `${skills.slice(0, 2).join(" • ")} Professional`;
  }
  return "Job Seeker";
}

export async function buildLinkedInImportSnapshot(userId: string): Promise<LinkedInImportSnapshot> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      userProfile: {
        select: {
          firstName: true,
          lastName: true,
          city: true,
          state: true,
          country: true,
          skills: true,
          resumeSkills: true,
          keyQuestions: true,
          workplaceLocations: true,
          jobInterests: {
            select: { title: true },
          },
          resume: {
            select: {
              experiences: {
                orderBy: { order: "asc" },
                select: {
                  title: true,
                  company: true,
                  location: true,
                  dateRange: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const profile = user?.userProfile ?? null;
  const recentExperience = getRecentExperience(profile);
  const roleFocus = getRoleFocus(profile);
  const interestTitle = getJobInterestTitle(profile);
  const importedSkills = buildImportedSkills(profile);
  const importedName = buildImportedName(profile, user?.name ?? null);
  const importedLocation = buildImportedLocation(profile);
  const importedHeadline = buildImportedHeadline(
    profile,
    importedSkills,
    recentExperience,
    roleFocus,
    interestTitle
  );

  const suggestedShortBio = buildSuggestedShortBio({
    importedName,
    importedHeadline,
    importedSkills,
    recentTitle: recentExperience?.title ?? null,
    recentCompany: recentExperience?.company ?? null,
    location: importedLocation,
    roleFocus,
  });

  return {
    importedName,
    importedHeadline,
    importedLocation,
    importedSkills,
    suggestedShortBio,
  };
}
