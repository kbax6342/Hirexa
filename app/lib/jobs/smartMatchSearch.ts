import { prisma } from "@/app/lib/prisma";

type ProfileSnapshot = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  workplaceLocations?: unknown;
  jobInterests?: Array<{ title?: string | null }>;
  resume?: {
    experiences?: Array<{
      title?: string | null;
    }>;
  } | null;
};

export type SmartMatchSearchConfig = {
  searchQuery: string;
  jobTitles: string[];
  preferredLocation: string | null;
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

function buildPreferredLocation(profile: ProfileSnapshot | null) {
  const workplaceLocation = readWorkplaceLocation(profile?.workplaceLocations);
  if (workplaceLocation) return workplaceLocation;

  const city = trimOrNull(profile?.city);
  const state = trimOrNull(profile?.state);
  const country = trimOrNull(profile?.country);

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  if (country) return country;

  return null;
}

function buildSearchTitles(profile: ProfileSnapshot | null) {
  const selectedTitles = dedupeValues(
    (profile?.jobInterests ?? [])
      .map((item) => trimOrNull(item?.title ?? null))
      .filter((value): value is string => Boolean(value))
  );

  if (selectedTitles.length > 0) {
    return selectedTitles;
  }

  const recentExperienceTitle = trimOrNull(profile?.resume?.experiences?.[0]?.title ?? null);
  if (recentExperienceTitle) {
    return [recentExperienceTitle];
  }

  return [];
}

export function buildSmartMatchSearchConfig(
  profile: ProfileSnapshot | null
): SmartMatchSearchConfig {
  const jobTitles = buildSearchTitles(profile);

  return {
    searchQuery: jobTitles.length > 0 ? jobTitles.join(" OR ") : "jobs",
    jobTitles,
    preferredLocation: buildPreferredLocation(profile),
  };
}

export async function getSmartMatchSearchConfigForUser(
  userId: string
): Promise<SmartMatchSearchConfig> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: {
      city: true,
      state: true,
      country: true,
      workplaceLocations: true,
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
            take: 1,
            select: {
              title: true,
            },
          },
        },
      },
    },
  });

  return buildSmartMatchSearchConfig(profile);
}
