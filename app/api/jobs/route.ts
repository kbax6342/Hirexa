import { NextResponse } from "next/server";

import { auth } from "@/app/lib/auth";
import {
  buildAdzunaFallbackMessage,
  buildAdzunaSearchPlan,
  describeAdzunaSearchTier,
  type AdzunaSearchTier,
} from "@/app/lib/jobs/adzunaFeedPlan";
import { applyLocationMatchMetadata } from "@/app/lib/jobs/locationMatch";
import { getSmartMatchSearchConfigForUser } from "@/app/lib/jobs/smartMatchSearch";
import type { Job } from "@/app/lib/jobs/types";
import { fetchAdzunaJobs } from "@/app/lib/providers/adzuna";
import { normalizeLocationLabel } from "@/app/lib/locationOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cursor = {
  planIndex: number;
  adzunaPage: number;
  query: string;
  location: string;
  includeRemote: boolean;
  category: string;
};

type FeedMeta = {
  query: string;
  preferredLocation: string | null;
  profileQuery?: string | null;
  profilePreferredLocation?: string | null;
  includeRemote: boolean;
  requestedState?: string | null;
  resolvedState?: string | null;
  fallbackUsed?: boolean;
  attemptedStates?: string[];
  resolvedLocationMessage?: string | null;
  activeTierQuery?: string | null;
  activeTierLocation?: string | null;
  activeRoleTier?: string | null;
  activeLocationTier?: string | null;
};

function decodeCursor(raw: string | null) {
  if (!raw) return null;

  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<Cursor>;

    return {
      planIndex:
        typeof parsed.planIndex === "number" && parsed.planIndex >= 0
          ? parsed.planIndex
          : 0,
      adzunaPage:
        typeof parsed.adzunaPage === "number" && parsed.adzunaPage > 0
          ? parsed.adzunaPage
          : 1,
      query: typeof parsed.query === "string" ? parsed.query : "",
      location: typeof parsed.location === "string" ? parsed.location : "",
      includeRemote:
        typeof parsed.includeRemote === "boolean" ? parsed.includeRemote : true,
      category: typeof parsed.category === "string" ? parsed.category : "",
    } satisfies Cursor;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isHiringEventJob(job: Job) {
  const title = (job.title ?? "").toLowerCase();
  const description = (job.description ?? "").toLowerCase();

  return title.includes("hiring event") || description.includes("hiring event");
}

function normalizeJobUrl(url: string | undefined) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function dedupeJobs(jobs: Job[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const fallbackTextKey = [job.title, job.company, job.location]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean)
      .join("|");
    const sourceIdKey = String(job.id ?? "").trim().toLowerCase();
    const dedupeKey =
      normalizeJobUrl(job.jobUrl) ||
      (sourceIdKey ? `${job.source}:${sourceIdKey}` : "") ||
      (fallbackTextKey ? `${job.source}:${fallbackTextKey}` : "");

    if (!dedupeKey || seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

function getMatchTierWeight(job: Job) {
  switch (job.matchTier) {
    case "exact":
      return 5;
    case "nearby":
      return 4;
    case "same_state":
      return 3;
    case "remote":
      return 2;
    case "broader":
      return 1;
    default:
      return 0;
  }
}

function rankJobs(jobs: Job[]) {
  return [...jobs].sort(
    (left, right) => getMatchTierWeight(right) - getMatchTierWeight(left)
  );
}

function mapCategoryToQuery(category: string) {
  if (!category) return "";

  const normalized = category.replace(/[-_]+/g, " ").trim().toLowerCase();

  const queryByCategory: Record<string, string> = {
    healthcare: "healthcare",
    technology: "technology",
    tech: "technology",
    "skilled trades": "electrician",
    "skill trades": "electrician",
    finance: "finance",
  };

  return queryByCategory[normalized] ?? normalized;
}

function getResolvedState(location: string) {
  const normalized = normalizeLocationLabel(location);
  if (!normalized.includes(",")) {
    return normalized || null;
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.at(-1) ?? null;
}

function buildEmptyResponse(args: {
  query: string;
  preferredLocation: string;
  includeRemote: boolean;
  profileQuery: string;
  profilePreferredLocation: string;
  meta?: Partial<FeedMeta>;
}) {
  return NextResponse.json({
    ok: true,
    query: args.query,
    jobs: [],
    items: [],
    bySource: {
      adzuna: [],
    },
    count: 0,
    providerErrors: [],
    nextCursor: "",
    meta: {
      query: args.query,
      preferredLocation: args.preferredLocation || null,
      profileQuery: args.profileQuery || null,
      profilePreferredLocation: args.profilePreferredLocation || null,
      includeRemote: args.includeRemote,
      ...args.meta,
    } satisfies FeedMeta,
  });
}

function shouldReuseCursor(
  cursor: Cursor | null,
  args: {
    query: string;
    location: string;
    includeRemote: boolean;
    category: string;
  }
) {
  if (!cursor) return false;

  return (
    normalizeText(cursor.query) === normalizeText(args.query) &&
    normalizeText(cursor.location) === normalizeText(args.location) &&
    cursor.includeRemote === args.includeRemote &&
    normalizeText(cursor.category) === normalizeText(args.category)
  );
}

async function fetchTierPage(args: {
  tier: AdzunaSearchTier;
  page: number;
  limit: number;
  preferredLocation: string;
  includeRemote: boolean;
}) {
  const rawJobs = await fetchAdzunaJobs({
    query: args.tier.query,
    page: args.page,
    limit: args.limit,
    location: args.tier.location || undefined,
  });

  const cleanedJobs = dedupeJobs(rawJobs).filter((job) => !isHiringEventJob(job));
  const rankedJobs = rankJobs(
    applyLocationMatchMetadata(
      cleanedJobs,
      args.preferredLocation || args.tier.location || null,
      args.includeRemote
    )
  );

  return {
    rawJobs,
    rankedJobs,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const { searchParams } = new URL(req.url);

  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 20), 50));
  const rawCategory = (searchParams.get("category") ?? "").trim();
  const requestedQuery = (searchParams.get("q") ?? "").trim();
  const requestedLocation = (searchParams.get("location") ?? "").trim();
  const requestedState = (searchParams.get("state") ?? "").trim();
  const includeRemoteParam = searchParams.get("includeRemote");
  const savedSearchConfig = userId
    ? await getSmartMatchSearchConfigForUser(userId).catch(() => null)
    : null;
  const profileQuery = savedSearchConfig?.jobTitles[0]?.trim() ?? "";
  const profilePreferredLocation = savedSearchConfig?.preferredLocation?.trim() ?? "";
  const includeRemote =
    includeRemoteParam === null
      ? savedSearchConfig?.includeRemote ?? true
      : includeRemoteParam !== "false" && includeRemoteParam !== "0";
  const resolvedQuery =
    requestedQuery || profileQuery || mapCategoryToQuery(rawCategory);
  const resolvedPreferredLocation = normalizeLocationLabel(
    requestedLocation || requestedState || profilePreferredLocation
  );

  if (!resolvedQuery) {
    return buildEmptyResponse({
      query: "",
      preferredLocation: resolvedPreferredLocation,
      includeRemote,
      profileQuery,
      profilePreferredLocation,
      meta: {
        requestedState: requestedState || null,
        resolvedState: resolvedPreferredLocation
          ? getResolvedState(resolvedPreferredLocation)
          : null,
        fallbackUsed: false,
        attemptedStates: [],
        resolvedLocationMessage: null,
      },
    });
  }

  const plan = buildAdzunaSearchPlan({
    targetRole: resolvedQuery,
    location: resolvedPreferredLocation,
    category: rawCategory,
  });

  if (plan.length === 0) {
    return buildEmptyResponse({
      query: resolvedQuery,
      preferredLocation: resolvedPreferredLocation,
      includeRemote,
      profileQuery,
      profilePreferredLocation,
      meta: {
        requestedState: requestedState || null,
        resolvedState: resolvedPreferredLocation
          ? getResolvedState(resolvedPreferredLocation)
          : null,
        fallbackUsed: false,
        attemptedStates: [],
        resolvedLocationMessage: null,
      },
    });
  }

  const decodedCursor = decodeCursor(searchParams.get("cursor"));
  const cursor = shouldReuseCursor(decodedCursor, {
    query: resolvedQuery,
    location: resolvedPreferredLocation,
    includeRemote,
    category: rawCategory,
  })
    ? decodedCursor
    : null;
  let planIndex = cursor?.planIndex ?? 0;
  let adzunaPage = cursor?.adzunaPage ?? 1;
  let activeTier: AdzunaSearchTier | null = null;
  let activeJobs: Job[] = [];
  let activeRawJobs: Job[] = [];
  const attemptedStates: string[] = [];
  const providerErrors: Array<{ source: string; reason: string }> = [];

  while (planIndex < plan.length) {
    const tier = plan[planIndex];
    attemptedStates.push(describeAdzunaSearchTier(tier));

    try {
      const result = await fetchTierPage({
        tier,
        page: adzunaPage,
        limit,
        preferredLocation: resolvedPreferredLocation,
        includeRemote,
      });

      if (result.rankedJobs.length > 0) {
        activeTier = tier;
        activeJobs = result.rankedJobs;
        activeRawJobs = result.rawJobs;
        break;
      }
    } catch (error) {
      providerErrors.push({
        source: "adzuna",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    planIndex += 1;
    adzunaPage = 1;
  }

  if (!activeTier) {
    return NextResponse.json({
      ok: true,
      query: resolvedQuery,
      jobs: [],
      items: [],
      bySource: {
        adzuna: [],
      },
      count: 0,
      providerErrors,
      nextCursor: "",
      meta: {
        query: resolvedQuery,
        preferredLocation: resolvedPreferredLocation || null,
        profileQuery: profileQuery || null,
        profilePreferredLocation: profilePreferredLocation || null,
        includeRemote,
        requestedState: requestedState || null,
        resolvedState: resolvedPreferredLocation
          ? getResolvedState(resolvedPreferredLocation)
          : null,
        fallbackUsed: plan.length > 1,
        attemptedStates,
        resolvedLocationMessage: null,
        activeTierQuery: null,
        activeTierLocation: null,
        activeRoleTier: null,
        activeLocationTier: null,
      } satisfies FeedMeta,
    });
  }

  const nextCursor = encodeCursor({
    planIndex,
    adzunaPage: adzunaPage + 1,
    query: resolvedQuery,
    location: resolvedPreferredLocation,
    includeRemote,
    category: rawCategory,
  });
  const fallbackUsed = planIndex > 0;
  const resolvedLocationMessage = fallbackUsed
    ? buildAdzunaFallbackMessage({
        requestedRole: resolvedQuery,
        requestedLocation: resolvedPreferredLocation,
        activeTier,
      })
    : null;

  return NextResponse.json({
    ok: true,
    query: resolvedQuery,
    jobs: activeJobs,
    items: activeJobs,
    bySource: {
      adzuna: activeRawJobs,
    },
    count: activeJobs.length,
    providerErrors,
    nextCursor,
    meta: {
      query: resolvedQuery,
      preferredLocation: resolvedPreferredLocation || null,
      profileQuery: profileQuery || null,
      profilePreferredLocation: profilePreferredLocation || null,
      includeRemote,
      requestedState: requestedState || null,
      resolvedState: activeTier.location
        ? getResolvedState(activeTier.location)
        : resolvedPreferredLocation
          ? getResolvedState(resolvedPreferredLocation)
          : null,
      fallbackUsed,
      attemptedStates,
      resolvedLocationMessage,
      activeTierQuery: activeTier.query,
      activeTierLocation: activeTier.location || null,
      activeRoleTier: activeTier.roleTier,
      activeLocationTier: activeTier.locationTier,
    } satisfies FeedMeta,
  });
}
