import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  normalizeSmartMatchesKey,
  readSmartMatchesResponseCache,
  writeSmartMatchesResponseCache,
} from "@/app/lib/jobs/cache";
import {
  ensureSharedProviderRefreshStarted,
  getCachedQueryProviderJobs,
  getSharedProviderSnapshot,
  type QueryProviderCacheResult,
  type SharedProviderCacheResult,
} from "@/app/lib/jobs/collectJobs";
import {
  getSmartMatchSearchConfigForUser,
  type SmartMatchSearchConfig,
} from "@/app/lib/jobs/smartMatchSearch";
import type { Job } from "@/app/lib/jobs/types";
import {
  applyJobMatchStages,
  dedupeJobs,
  shuffleArray,
} from "@/app/lib/jobs/sources/common";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 20;
const TITLE_NOISE_WORDS = new Set([
  "sr",
  "senior",
  "jr",
  "junior",
  "lead",
  "principal",
  "staff",
  "ii",
  "iii",
  "iv",
  "contract",
  "temporary",
]);

type Cursor = {
  variantIndex: number;
  page: number;
};

type SearchVariant = {
  query: string;
  location: string;
  strategy:
    | "title"
    | "title-keywords"
    | "skills"
    | "remote"
    | "fallback-location"
    | "fallback-broad";
};

type ProviderCounts = {
  greenhouse: number;
  lever: number;
  ashby: number;
  workable: number;
  adzuna: number;
  usajobs: number;
  remotive: number;
  remoteok: number;
};

type RequestScopedProviderCache = {
  shared: Map<string, Promise<SharedProviderCacheResult>>;
  queryProviders: Map<string, Promise<QueryProviderCacheResult>>;
};

type BatchCacheMeta = {
  shared: SharedProviderCacheResult["cache"];
  providers: {
    adzuna: QueryProviderCacheResult["cache"];
    usajobs: QueryProviderCacheResult["cache"];
  };
};

type SmartMatchesApiResponse = {
  jobs: Job[];
  nextCursor: string;
  meta: {
    query: string;
    preferredLocation: string | null;
    includeRemote: boolean;
    expanded: boolean;
    usedVariants: Array<{
      query: string;
      location: string | null;
      page: number;
      strategy: SearchVariant["strategy"];
      results: number;
      uniqueResults: number;
    }>;
  };
};

function decodeCursor(raw: string | null): Cursor {
  if (!raw) return { variantIndex: 0, page: 1 };

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<Cursor>;

    return {
      variantIndex:
        typeof parsed.variantIndex === "number" && parsed.variantIndex >= 0
          ? parsed.variantIndex
          : 0,
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
    };
  } catch {
    return { variantIndex: 0, page: 1 };
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of values) {
    const value = rawValue?.trim();
    if (!value) continue;

    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyTitle(title: string) {
  const tokens = normalizeText(title)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !TITLE_NOISE_WORDS.has(token));

  if (tokens.length === 0) return "";

  return (
    dedupeStrings([tokens.slice(0, 4).join(" "), tokens.slice(-3).join(" ")])[0] ??
    ""
  );
}

function buildSearchVariants(config: SmartMatchSearchConfig): SearchVariant[] {
  const exactTitles = dedupeStrings(config.jobTitles).slice(0, 4);
  const titleKeywords = dedupeStrings(
    exactTitles.map((title) => simplifyTitle(title))
  ).slice(0, 3);
  const skillQueries = dedupeStrings(config.skillTerms).slice(0, 4);

  const primaryLocations = dedupeStrings([
    config.preferredLocation,
    ...config.locationOptions,
  ]).slice(0, 2);

  const focusedLocations = primaryLocations.length > 0 ? primaryLocations : [""];
  const remoteAwareLocations = dedupeStrings([
    focusedLocations[0],
    config.includeRemote ? "remote" : null,
    "",
  ]);

  const variants: SearchVariant[] = [];
  const seen = new Set<string>();

  const pushVariant = (variant: SearchVariant) => {
    const query = variant.query.trim() || "jobs";
    const location = variant.location.trim();
    const key = `${query.toLowerCase()}|${location.toLowerCase()}|${variant.strategy}`;
    if (seen.has(key)) return;

    seen.add(key);
    variants.push({ ...variant, query, location });
  };

  for (const title of exactTitles) {
    for (const location of focusedLocations) {
      pushVariant({ query: title, location, strategy: "title" });
    }
  }

  for (const query of titleKeywords) {
    pushVariant({
      query,
      location: focusedLocations[0] ?? "",
      strategy: "title-keywords",
    });
  }

  for (const query of skillQueries) {
    for (const location of remoteAwareLocations.slice(0, 2)) {
      pushVariant({ query, location, strategy: "skills" });
    }
  }

  if (config.includeRemote) {
    pushVariant({
      query: exactTitles[0] ?? titleKeywords[0] ?? skillQueries[0] ?? "jobs",
      location: "remote",
      strategy: "remote",
    });
  }

  pushVariant({
    query: exactTitles[0] ?? skillQueries[0] ?? "jobs",
    location: focusedLocations[0] ?? "",
    strategy: "fallback-location",
  });

  if (config.includeRemote) {
    pushVariant({
      query: "jobs",
      location: "remote",
      strategy: "fallback-broad",
    });
  }

  pushVariant({
    query: "jobs",
    location: "",
    strategy: "fallback-broad",
  });

  return variants.length > 0
    ? variants
    : [{ query: "jobs", location: "", strategy: "fallback-broad" }];
}

function buildProviderFallbackVariants(variant: SearchVariant): SearchVariant[] {
  const simplifiedQuery = simplifyTitle(variant.query);
  const candidates: SearchVariant[] = [
    variant,
    variant.location ? { ...variant, location: "" } : null,
    simplifiedQuery && simplifiedQuery !== variant.query
      ? { ...variant, query: simplifiedQuery }
      : null,
    simplifiedQuery && simplifiedQuery !== variant.query
      ? { ...variant, query: simplifiedQuery, location: "" }
      : null,
    variant.query.toLowerCase() !== "jobs"
      ? {
          query: "jobs",
          location: variant.location.toLowerCase() === "remote" ? "remote" : "",
          strategy: "fallback-broad",
        }
      : null,
    {
      query: "jobs",
      location: "",
      strategy: "fallback-broad",
    },
  ].filter((value): value is SearchVariant => Boolean(value));

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.query.toLowerCase()}|${candidate.location.toLowerCase()}|${candidate.strategy}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyProviderCounts(): ProviderCounts {
  return {
    greenhouse: 0,
    lever: 0,
    ashby: 0,
    workable: 0,
    adzuna: 0,
    usajobs: 0,
    remotive: 0,
    remoteok: 0,
  };
}

function buildRequestScopedSharedKey(query: string) {
  return JSON.stringify({
    query: query.trim().toLowerCase() || "jobs",
  });
}

function buildRequestScopedQueryProviderKey(
  provider: "adzuna" | "usajobs",
  query: string,
  location: string,
  page: number,
  limit: number,
  includeRemote: boolean
) {
  return JSON.stringify({
    provider,
    query: query.trim().toLowerCase() || "jobs",
    location: location.trim().toLowerCase(),
    page,
    limit,
    includeRemote,
  });
}

async function fetchCachedSharedProviderSnapshot(
  query: string,
  cache: RequestScopedProviderCache
) {
  const cacheKey = buildRequestScopedSharedKey(query);
  const existing = cache.shared.get(cacheKey);
  if (existing) {
    console.log("[SMART_MATCHES] reusing request-scope shared providers", {
      query,
      sharedAcrossPages: true,
    });
    return existing;
  }

  const request = getSharedProviderSnapshot(query);
  cache.shared.set(cacheKey, request);
  return request;
}

async function fetchCachedQueryProviderJobs(
  provider: "adzuna" | "usajobs",
  query: string,
  location: string,
  page: number,
  limit: number,
  includeRemote: boolean,
  cache: RequestScopedProviderCache
) {
  const cacheKey = buildRequestScopedQueryProviderKey(
    provider,
    query,
    location,
    page,
    limit,
    includeRemote
  );
  const existing = cache.queryProviders.get(cacheKey);
  if (existing) {
    console.log("[SMART_MATCHES] reusing request-scope query provider", {
      provider,
      query,
      location: location || null,
      page,
      limit,
      includeRemote,
    });
    return existing;
  }

  const request = getCachedQueryProviderJobs(provider, {
    query,
    location,
    page,
    limit,
    includeRemote,
  });
  cache.queryProviders.set(cacheKey, request);
  return request;
}

function summarizeProviderMatchStages(
  provider: keyof ProviderCounts,
  jobs: Job[],
  variant: SearchVariant,
  page: number,
  limit: number,
  includeRemote: boolean
) {
  const stages = applyJobMatchStages(jobs, {
    query: variant.query,
    location: variant.location,
    page,
    limit,
    includeRemote,
  });

  console.log(
    `[SMART_MATCHES] provider=${provider} raw=${stages.counts.raw} matched=${stages.counts.matched} postLocation=${stages.counts.postLocation} postDedupe=${stages.counts.postDedupe} final=${stages.counts.final}`
  );

  return stages;
}

async function fetchProviderBatch(
  variant: SearchVariant,
  page: number,
  limit: number,
  includeRemote: boolean,
  cache: RequestScopedProviderCache,
  requestKey: string
): Promise<{ jobs: Job[]; counts: ProviderCounts; cacheMeta: BatchCacheMeta }> {
  ensureSharedProviderRefreshStarted();

  console.log("[SMART_MATCHES] request", {
    query: variant.query,
    location: variant.location || null,
    includeRemote,
    limit,
    page,
  });

  const [
    sharedProviders,
    adzunaResult,
    usajobsResult,
  ] = await Promise.all([
    fetchCachedSharedProviderSnapshot(variant.query, cache),
    fetchCachedQueryProviderJobs(
      "adzuna",
      variant.query,
      variant.location,
      page,
      limit,
      includeRemote,
      cache
    ),
    fetchCachedQueryProviderJobs(
      "usajobs",
      variant.query,
      variant.location,
      page,
      limit,
      includeRemote,
      cache
    ),
  ]);

  console.log("[SMART_MATCHES] cache status", {
    responseCacheHit: false,
    sharedProviderCacheFresh: sharedProviders.cache.fresh,
    adzunaCacheHit: adzunaResult.cache.hit,
    sharedAgeMs: sharedProviders.cache.ageMs,
    requestKey,
  });

  const greenhouseStages = summarizeProviderMatchStages(
    "greenhouse",
    sharedProviders.snapshot.greenhouseJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const leverStages = summarizeProviderMatchStages(
    "lever",
    sharedProviders.snapshot.leverJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const ashbyStages = summarizeProviderMatchStages(
    "ashby",
    sharedProviders.snapshot.ashbyJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const workableStages = summarizeProviderMatchStages(
    "workable",
    sharedProviders.snapshot.workableJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const remotiveStages = summarizeProviderMatchStages(
    "remotive",
    sharedProviders.snapshot.remotiveJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const remoteokStages = summarizeProviderMatchStages(
    "remoteok",
    sharedProviders.snapshot.remoteokJobs,
    variant,
    page,
    limit,
    includeRemote
  );
  const greenhouseJobs = greenhouseStages.finalJobs;
  const leverJobs = leverStages.finalJobs;
  const ashbyJobs = ashbyStages.finalJobs;
  const workableJobs = workableStages.finalJobs;
  const remotiveJobs = remotiveStages.finalJobs;
  const remoteokJobs = remoteokStages.finalJobs;

  console.log("[SMART_MATCHES] greenhouse jobs:", greenhouseJobs.length);
  console.log("[SMART_MATCHES] lever jobs:", leverJobs.length);
  console.log("[SMART_MATCHES] ashby jobs:", ashbyJobs.length);
  console.log("[SMART_MATCHES] workable jobs:", workableJobs.length);

  const counts: ProviderCounts = {
    greenhouse: greenhouseJobs.length,
    lever: leverJobs.length,
    ashby: ashbyJobs.length,
    workable: workableJobs.length,
    adzuna: adzunaResult.jobs.length,
    usajobs: usajobsResult.jobs.length,
    remotive: remotiveJobs.length,
    remoteok: remoteokJobs.length,
  };

  console.log("[SMART_MATCHES] providers loaded", counts);

  const allJobs = [
    ...greenhouseJobs,
    ...leverJobs,
    ...ashbyJobs,
    ...workableJobs,
    ...adzunaResult.jobs,
    ...usajobsResult.jobs,
    ...remotiveJobs,
    ...remoteokJobs,
  ];

  console.log("[SMART_MATCHES] total jobs before shuffle", allJobs.length);

  const dedupedJobs = dedupeJobs(allJobs);
  console.log("[SMART_MATCHES] total jobs after cross-provider dedupe", dedupedJobs.length);

  const shuffledJobs = shuffleArray(dedupedJobs);
  const results = shuffledJobs.slice(0, limit);

  console.log("[SMART_MATCHES] returning jobs", {
    returned: results.length,
    page,
  });

  return {
    jobs: results,
    counts,
    cacheMeta: {
      shared: sharedProviders.cache,
      providers: {
        adzuna: adzunaResult.cache,
        usajobs: usajobsResult.cache,
      },
    },
  };
}

async function fetchVariantJobs(
  variant: SearchVariant,
  page: number,
  limit: number,
  includeRemote: boolean,
  cache: RequestScopedProviderCache,
  requestKey: string
): Promise<{ jobs: Job[]; counts: ProviderCounts; cacheMeta: BatchCacheMeta }> {
  const providerVariants = buildProviderFallbackVariants(variant);
  let aggregatedJobs: Job[] = [];
  let latestCounts = emptyProviderCounts();
  let latestCacheMeta: BatchCacheMeta = {
    shared: {
      key: "",
      hit: false,
      fresh: false,
      stale: false,
      ageMs: null,
    },
    providers: {
      adzuna: {
        provider: "adzuna",
        key: "",
        hit: false,
        fresh: false,
        stale: false,
        ageMs: null,
      },
      usajobs: {
        provider: "usajobs",
        key: "",
        hit: false,
        fresh: false,
        stale: false,
        ageMs: null,
      },
    },
  };

  for (const providerVariant of providerVariants) {
    const result = await fetchProviderBatch(
      providerVariant,
      page,
      limit,
      includeRemote,
      cache,
      requestKey
    );
    latestCounts = result.counts;
    latestCacheMeta = result.cacheMeta;

    if (result.jobs.length > 0) {
      aggregatedJobs = dedupeJobs([...aggregatedJobs, ...result.jobs]);
    }

    if (aggregatedJobs.length >= limit) {
      return {
        jobs: aggregatedJobs.slice(0, limit),
        counts: latestCounts,
        cacheMeta: latestCacheMeta,
      };
    }

    if (result.jobs.length === 0) {
      continue;
    }

    if (
      providerVariant.query !== variant.query ||
      providerVariant.location !== variant.location
    ) {
      console.log("[SMART_MATCHES] provider fallback", {
        fromQuery: variant.query,
        fromLocation: variant.location || null,
        toQuery: providerVariant.query,
        toLocation: providerVariant.location || null,
        page,
        returned: aggregatedJobs.length,
        provider: "adzuna",
        cacheHit: result.cacheMeta.providers.adzuna.hit,
      });
    }
  }

  return {
    jobs: aggregatedJobs.slice(0, limit),
    counts: latestCounts,
    cacheMeta: latestCacheMeta,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  ensureSharedProviderRefreshStarted();
  const baseSearchConfig = userId
    ? await getSmartMatchSearchConfigForUser(userId)
    : {
        searchQuery: "jobs",
        jobTitles: [],
        skillTerms: [],
        preferredLocation: null,
        locationOptions: [],
        includeRemote: true,
      };

  const url = new URL(request.url);
  const requestedQuery =
    url.searchParams.get("q")?.trim() ||
    url.searchParams.get("query")?.trim() ||
    "";
  const requestedLocation = url.searchParams.get("location")?.trim() || "";
  const includeRemoteParam = url.searchParams.get("includeRemote")?.trim();
  const requestedPageValue = Number(url.searchParams.get("page") ?? "");
  const requestedPage =
    Number.isFinite(requestedPageValue) && requestedPageValue > 0
      ? requestedPageValue
      : 1;
  const limit = Math.max(
    10,
    Math.min(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 30)
  );

  const searchConfig: SmartMatchSearchConfig = {
    ...baseSearchConfig,
    searchQuery: requestedQuery || baseSearchConfig.searchQuery,
    jobTitles: requestedQuery
      ? dedupeStrings([requestedQuery, ...baseSearchConfig.jobTitles])
      : baseSearchConfig.jobTitles,
    preferredLocation: requestedLocation || baseSearchConfig.preferredLocation,
    locationOptions: requestedLocation
      ? dedupeStrings([requestedLocation, ...baseSearchConfig.locationOptions])
      : baseSearchConfig.locationOptions,
    includeRemote:
      includeRemoteParam === null
        ? baseSearchConfig.includeRemote
        : includeRemoteParam !== "false" && includeRemoteParam !== "0",
  };

  console.log("[SMART_MATCHES] remote filter", {
    includeRemote: searchConfig.includeRemote,
  });

  const variants = buildSearchVariants(searchConfig);
  const rawCursor = url.searchParams.get("cursor")?.trim() || "";
  const initialCursor = decodeCursor(rawCursor);
  const searchFingerprint = JSON.stringify({
    searchQuery: searchConfig.searchQuery,
    preferredLocation: searchConfig.preferredLocation,
    includeRemote: searchConfig.includeRemote,
    jobTitles: searchConfig.jobTitles.slice(0, 4),
    skillTerms: searchConfig.skillTerms.slice(0, 4),
  });
  const requestKey = normalizeSmartMatchesKey({
    userId: userId ?? "anon",
    query: requestedQuery || searchConfig.searchQuery,
    location: requestedLocation || searchConfig.preferredLocation || "",
    page: rawCursor ? 0 : requestedPage,
    limit,
    cursor: rawCursor,
    searchFingerprint,
  });
  const cachedResponse = readSmartMatchesResponseCache<SmartMatchesApiResponse>(
    requestKey
  );
  if (cachedResponse.hit && cachedResponse.payload) {
    console.log("[SMART_MATCHES] cache status", {
      responseCacheHit: true,
      sharedProviderCacheFresh: null,
      adzunaCacheHit: null,
      sharedAgeMs: null,
      requestKey,
    });

    return NextResponse.json(cachedResponse.payload);
  }

  const providerCache: RequestScopedProviderCache = {
    shared: new Map(),
    queryProviders: new Map(),
  };

  let variantIndex = Math.min(initialCursor.variantIndex, variants.length - 1);
  let page = url.searchParams.get("cursor")
    ? Math.max(initialCursor.page, 1)
    : requestedPage;
  let jobs: Job[] = [];
  const seen = new Set<string>();
  const usedVariants: SmartMatchesApiResponse["meta"]["usedVariants"] = [];
  const maxAttempts = Math.max(variants.length, 4);

  for (let attempt = 0; attempt < maxAttempts && jobs.length < limit; attempt += 1) {
    const currentVariant = variants[Math.min(variantIndex, variants.length - 1)];
    const batch = await fetchVariantJobs(
      currentVariant,
      page,
      limit,
      searchConfig.includeRemote,
      providerCache,
      requestKey
    );
    const uniqueBatch = batch.jobs.filter((job) => {
      if (!job?.id || seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    jobs = [...jobs, ...uniqueBatch].slice(0, limit);
    usedVariants.push({
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      strategy: currentVariant.strategy,
      results: batch.jobs.length,
      uniqueResults: uniqueBatch.length,
    });

    const isLastVariant = variantIndex >= variants.length - 1;

    if (jobs.length >= limit) {
      page += 1;
      break;
    }

    if (isLastVariant) {
      page += 1;
      break;
    }

    console.log("[SMART_MATCHES] fallback below limit", {
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      includeRemote: searchConfig.includeRemote,
      requestedLimit: limit,
      accumulatedResults: jobs.length,
      batchResults: batch.jobs.length,
    });

    console.log("[SMART_MATCHES] advancing variant", {
      fromVariantIndex: variantIndex,
      toVariantIndex: variantIndex + 1,
      fromPage: page,
      reason: "below-limit",
    });
    variantIndex += 1;
    page = 1;
  }

  if (jobs.length === 0) {
    const fallback = await fetchProviderBatch(
      { query: "jobs", location: "", strategy: "fallback-broad" },
      1,
      limit,
      searchConfig.includeRemote,
      providerCache,
      requestKey
    );
    jobs = fallback.jobs;
    variantIndex = variants.length - 1;
    page = 2;
  }

  const payload = {
    jobs,
    nextCursor: encodeCursor({ variantIndex, page }),
    meta: {
      query: searchConfig.searchQuery,
      preferredLocation: searchConfig.preferredLocation,
      includeRemote: searchConfig.includeRemote,
      expanded: usedVariants.length > 1,
      usedVariants,
    },
  } satisfies SmartMatchesApiResponse;

  writeSmartMatchesResponseCache(requestKey, payload);

  return NextResponse.json(payload);
}
