import { prisma } from "@/app/lib/prisma";
import {
  deriveSafeLocationSearchFields,
  getSafePrivateProfileFields,
  readRawPrivateProfileFieldsByIds,
} from "@/app/lib/profile/privateProfileFields";

type ProfileSnapshot = {
  city?: string | null;
  citySearch?: string | null;
  state?: string | null;
  stateSearch?: string | null;
  postalCode?: string | null;
  postalCodeSearch?: string | null;
  country?: string | null;
  includeRemote?: boolean | null;
  workplaceLocations?: unknown;
  keyQuestions?: unknown;
  jobInterests?: Array<{ title?: string | null }>;
  skills?: string[];
  resumeSkills?: string[];
  resume?: {
    experiences?: Array<{
      title?: string | null;
    }>;
  } | null;
};

export type SmartMatchSearchConfig = {
  searchQuery: string;
  jobTitles: string[];
  skillTerms: string[];
  preferredLocation: string | null;
  locationOptions: string[];
  includeRemote: boolean;
};

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function dedupeValues(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function readWorkplaceLocation(value: unknown) {
  if (!Array.isArray(value)) return null;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = trimOrNull((item as { label?: string | null }).label ?? null);
    if (label) return label;
  }

  return null;
}

function readRoleFocus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return trimOrNull((value as { roleFocus?: string | null }).roleFocus ?? null);
}

function buildPreferredLocation(profile: ProfileSnapshot | null) {
  return buildLocationOptions(profile)[0] ?? null;
}

function buildSearchTitles(profile: ProfileSnapshot | null) {
  const roleFocus = readRoleFocus(profile?.keyQuestions);
  const selectedTitles = dedupeValues(
    (profile?.jobInterests ?? [])
      .map((item) => trimOrNull(item?.title ?? null))
      .filter((value): value is string => Boolean(value))
  );

  const experienceTitles = dedupeValues(
    (profile?.resume?.experiences ?? [])
      .map((item) => trimOrNull(item?.title ?? null))
      .filter((value): value is string => Boolean(value))
  );

  return dedupeValues([roleFocus ?? "", ...selectedTitles, ...experienceTitles]).slice(0, 5);
}

function buildSkillTerms(profile: ProfileSnapshot | null) {
  return dedupeValues([...(profile?.skills ?? []), ...(profile?.resumeSkills ?? [])]).slice(0, 8);
}

function buildLocationOptions(profile: ProfileSnapshot | null) {
  const workplaceLocation = readWorkplaceLocation(profile?.workplaceLocations);
  const safeLocation = deriveSafeLocationSearchFields({
    city: profile?.city,
    citySearch: profile?.citySearch,
    state: profile?.state,
    stateSearch: profile?.stateSearch,
    postalCode: profile?.postalCode,
    postalCodeSearch: profile?.postalCodeSearch,
  });
  const city = trimOrNull(safeLocation.citySearch);
  const state = trimOrNull(safeLocation.stateSearch);
  const country = trimOrNull(profile?.country);

  return dedupeValues(
    [
      workplaceLocation,
      city && state ? `${city}, ${state}` : null,
      city,
      state,
      country,
    ].filter((value): value is string => Boolean(value))
  );
}

export function buildSmartMatchSearchConfig(
  profile: ProfileSnapshot | null
): SmartMatchSearchConfig {
  const jobTitles = buildSearchTitles(profile);
  const skillTerms = buildSkillTerms(profile);
  const locationOptions = buildLocationOptions(profile);
  const preferredLocation = buildPreferredLocation(profile);

  return {
    searchQuery: jobTitles[0] ?? skillTerms[0] ?? "jobs",
    jobTitles,
    skillTerms,
    preferredLocation,
    locationOptions,
    includeRemote: profile?.includeRemote ?? true,
  };
}

export async function getSmartMatchSearchConfigForUser(
  userId: string
): Promise<SmartMatchSearchConfig> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        country: true,
        includeRemote: true,
        workplaceLocations: true,
        keyQuestions: true,
        skills: true,
        resumeSkills: true,
        jobInterests: {
          orderBy: { id: "asc" },
          take: 5,
          select: {
            title: true,
          },
        },
        resume: {
          select: {
            experiences: {
              orderBy: { order: "asc" },
              take: 3,
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      return buildSmartMatchSearchConfig(null);
    }

    const privateFieldsById = await readRawPrivateProfileFieldsByIds(prisma, [profile.id]);
    const rawPrivateFields = privateFieldsById.get(profile.id);
    const safePrivateFields = getSafePrivateProfileFields(rawPrivateFields ?? {});
    const safeLocationFields = deriveSafeLocationSearchFields({
      city: safePrivateFields.city,
      citySearch: rawPrivateFields?.citySearch,
      state: safePrivateFields.state,
      stateSearch: rawPrivateFields?.stateSearch,
      postalCode: safePrivateFields.postalCode,
      postalCodeSearch: rawPrivateFields?.postalCodeSearch,
    });

    return buildSmartMatchSearchConfig({
      ...profile,
      city: safePrivateFields.city,
      citySearch: safeLocationFields.citySearch,
      state: safePrivateFields.state,
      stateSearch: safeLocationFields.stateSearch,
      postalCode: safePrivateFields.postalCode,
      postalCodeSearch: safeLocationFields.postalCodeSearch,
    });
  } catch (error) {
    console.error("[SMART_MATCHES] failed to load safe profile search config", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return buildSmartMatchSearchConfig(null);
  }
}
