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
import {
  formatResolvedStateMessage,
  resolveLocationFallback,
} from "@/app/lib/jobs/locationFallback";
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
const LATER_PAGE_EXPANSION_LIMIT = 5;
const ROLE_FAMILY_EXPANSIONS: Array<{
  test: RegExp;
  queries: string[];
}> = [
  {
    test: /\b(qa|quality assurance|testing|test engineer|sdet|automation tester|software tester|cypress)\b/i,
    queries: [
      "Quality Assurance",
      "QA Engineer",
      "Test Engineer",
      "SDET",
      "Automation Engineer",
    ],
  },
  {
    test: /\b(registered nurse|rn|nurse|nursing|clinical|patient care)\b/i,
    queries: [
      "Registered Nurse",
      "Nursing",
      "Clinical Nurse",
      "Patient Care",
      "Care Coordinator",
    ],
  },
  {
    test: /\b(sales|account executive|business development|sdr|bdr)\b/i,
    queries: [
      "Sales",
      "Account Executive",
      "Business Development",
      "Sales Representative",
      "Customer Success",
    ],
  },
  {
    test: /\b(data analyst|data engineer|analytics|business intelligence|bi)\b/i,
    queries: [
      "Data Analyst",
      "Analytics",
      "Business Intelligence",
      "Data Engineer",
      "Reporting Analyst",
    ],
  },
  {
    test: /\b(product manager|product|program manager|project manager)\b/i,
    queries: [
      "Product Manager",
      "Program Manager",
      "Project Manager",
      "Product Operations",
      "Product Analyst",
    ],
  },
];

type Cursor = {
  variantIndex: number;
  page: number;
  resolvedLocation?: string | null;
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

type QueryProviderPlanReason =
  | "exact"
  | "location-relaxed"
  | "role-family-strict"
  | "role-family-broad";

type QueryProviderPlan = {
  query: string;
  location: string;
  reason: QueryProviderPlanReason;
};

type SmartMatchesApiResponse = {
  jobs: Job[];
  nextCursor: string;
  meta: {
    query: string;
    preferredLocation: string | null;
    includeRemote: boolean;
    requestedState: string | null;
    resolvedState: string | null;
    fallbackUsed: boolean;
    attemptedStates: string[];
    resolvedLocationMessage?: string | null;
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
  if (!raw) return { variantIndex: 0, page: 1, resolvedLocation: null };

  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<Cursor>;

    return {
      variantIndex:
        typeof parsed.variantIndex === "number" && parsed.variantIndex >= 0
          ? parsed.variantIndex
          : 0,
      page: typeof parsed.page === "number" && parsed.page > 0 ? parsed.page : 1,
      resolvedLocation:
        typeof parsed.resolvedLocation === "string"
          ? parsed.resolvedLocation
          : null,
    };
  } catch {
    return { variantIndex: 0, page: 1, resolvedLocation: null };
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

function buildSearchVariants(
  config: SmartMatchSearchConfig,
  activeLocation?: string | null
): SearchVariant[] {
  const exactTitles = dedupeStrings(config.jobTitles).slice(0, 4);
  const titleKeywords = dedupeStrings(
    exactTitles.map((title) => simplifyTitle(title))
  ).slice(0, 3);
  const skillQueries = dedupeStrings(config.skillTerms).slice(0, 4);

  const primaryLocations =
    typeof activeLocation !== "undefined"
      ? dedupeStrings([activeLocation])
      : dedupeStrings([config.preferredLocation, ...config.locationOptions]).slice(0, 2);

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

function buildRoleFamilyQueries(
  config: SmartMatchSearchConfig,
  baseQuery: string
) {
  const normalizedSeed = normalizeText(
    [
      baseQuery,
      config.searchQuery,
      ...config.jobTitles,
      ...config.skillTerms,
    ].join(" ")
  );
  const matchedRoleFamily = ROLE_FAMILY_EXPANSIONS.find((entry) =>
    entry.test.test(normalizedSeed)
  );
  const fallbackQueries = dedupeStrings([
    ...config.jobTitles.map((title) => simplifyTitle(title)),
    ...config.skillTerms,
  ]);

  return dedupeStrings([
    baseQuery,
    ...(matchedRoleFamily?.queries ?? []),
    ...fallbackQueries,
  ]).slice(0, LATER_PAGE_EXPANSION_LIMIT);
}

function buildQueryProviderPlans(
  variant: SearchVariant,
  config: SmartMatchSearchConfig,
  expandedMode: boolean
) {
  const plans: QueryProviderPlan[] = [
    {
      query: variant.query,
      location: variant.location,
      reason: "exact",
    },
  ];

  if (!expandedMode) {
    return plans;
  }

  const extraQueries = buildRoleFamilyQueries(config, variant.query).filter(
    (query) => query.toLowerCase() !== variant.query.toLowerCase()
  );

  if (variant.location) {
    plans.push({
      query: variant.query,
      location: "",
      reason: "location-relaxed",
    });
  }

  if (extraQueries[0]) {
    plans.push({
      query: extraQueries[0],
      location: variant.location,
      reason: "role-family-strict",
    });
  }

  for (const query of extraQueries.slice(1, 4)) {
    plans.push({
      query,
      location: "",
      reason: "role-family-broad",
    });
  }

  const dedupedPlans: QueryProviderPlan[] = [];
  const seen = new Set<string>();
  for (const plan of plans) {
    const key = `${plan.query.toLowerCase()}|${plan.location.toLowerCase()}|${plan.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedPlans.push(plan);
  }

  return dedupedPlans.slice(0, LATER_PAGE_EXPANSION_LIMIT);
}

function summarizeJobsByProvider(jobs: Job[]) {
  return jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.source] = (acc[job.source] ?? 0) + 1;
    return acc;
  }, {});
}

function lightlyDiversifyJobs(jobs: Job[]) {
  const queues = new Map<Job["source"], Job[]>();
  const order: Job["source"][] = [];

  for (const job of jobs) {
    if (!queues.has(job.source)) {
      queues.set(job.source, []);
      order.push(job.source);
    }
    queues.get(job.source)?.push(job);
  }

  const leadingJobs: Job[] = [];
  const remainder: Job[] = [];

  for (const source of order) {
    const queue = queues.get(source);
    const firstJob = queue?.shift();
    if (firstJob) {
      leadingJobs.push(firstJob);
    }
  }

  for (const source of order) {
    const queue = queues.get(source);
    if (!queue?.length) continue;
    remainder.push(...queue);
  }

  return [...leadingJobs, ...remainder];
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
  searchConfig: SmartMatchSearchConfig,
  expandedMode: boolean,
  cache: RequestScopedProviderCache,
  requestKey: string
): Promise<{ jobs: Job[]; counts: ProviderCounts; cacheMeta: BatchCacheMeta }> {
  ensureSharedProviderRefreshStarted();
  const queryProviderPlans = buildQueryProviderPlans(
    variant,
    searchConfig,
    expandedMode
  );

  console.log("[SMART_MATCHES] request", {
    query: variant.query,
    location: variant.location || null,
    includeRemote,
    limit,
    page,
    expandedMode,
  });
  if (expandedMode) {
    console.log("[SMART_MATCHES] later-page expansions", {
      query: variant.query,
      location: variant.location || null,
      page,
      plans: queryProviderPlans.map((plan) => ({
        query: plan.query,
        location: plan.location || null,
        reason: plan.reason,
      })),
    });
  }

  async function fetchPlannedQueryProviderJobs(provider: "adzuna" | "usajobs") {
    let jobs: Job[] = [];
    let latestCache: QueryProviderCacheResult["cache"] = {
      provider,
      key: "",
      hit: false,
      fresh: false,
      stale: false,
      ageMs: null,
    };

    for (const plan of queryProviderPlans) {
      const result = await fetchCachedQueryProviderJobs(
        provider,
        plan.query,
        plan.location,
        page,
        limit,
        includeRemote,
        cache
      );

      latestCache = result.cache;
      jobs = dedupeJobs([...jobs, ...result.jobs]);

      if (plan.reason !== "exact") {
        console.log("[SMART_MATCHES] provider fallback", {
          provider,
          fromQuery: variant.query,
          fromLocation: variant.location || null,
          toQuery: plan.query,
          toLocation: plan.location || null,
          page,
          results: result.jobs.length,
          cacheHit: result.cache.hit,
          reason: plan.reason,
        });
      }

      if (!expandedMode && jobs.length >= limit) {
        break;
      }
    }

    return {
      jobs,
      cache: latestCache,
    };
  }

  const [
    sharedProviders,
    adzunaResult,
    usajobsResult,
  ] = await Promise.all([
    fetchCachedSharedProviderSnapshot(variant.query, cache),
    fetchPlannedQueryProviderJobs("adzuna"),
    fetchPlannedQueryProviderJobs("usajobs"),
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
  const orderedJobs = expandedMode ? lightlyDiversifyJobs(shuffledJobs) : shuffledJobs;
  const results = orderedJobs.slice(0, limit);

  if (expandedMode) {
    console.log("[SMART_MATCHES] provider mix", {
      before: summarizeJobsByProvider(shuffledJobs.slice(0, limit)),
      after: summarizeJobsByProvider(results),
    });
  }

  console.log("[SMART_MATCHES] returning jobs", {
    returned: results.length,
    page,
    byProvider: summarizeJobsByProvider(results),
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
  searchConfig: SmartMatchSearchConfig,
  expandedMode: boolean,
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
      searchConfig,
      expandedMode,
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

async function executeVariantSequence(params: {
  variants: SearchVariant[];
  startVariantIndex: number;
  startPage: number;
  limit: number;
  includeRemote: boolean;
  searchConfig: SmartMatchSearchConfig;
  expandedMode: boolean;
  cache: RequestScopedProviderCache;
  requestKey: string;
}) {
  let variantIndex = Math.min(params.startVariantIndex, params.variants.length - 1);
  let page = Math.max(params.startPage, 1);
  let jobs: Job[] = [];
  const seen = new Set<string>();
  const usedVariants: SmartMatchesApiResponse["meta"]["usedVariants"] = [];
  const maxAttempts = Math.max(params.variants.length, 4);

  for (let attempt = 0; attempt < maxAttempts && jobs.length < params.limit; attempt += 1) {
    const currentVariant =
      params.variants[Math.min(variantIndex, params.variants.length - 1)];
    const batch = await fetchVariantJobs(
      currentVariant,
      page,
      params.limit,
      params.includeRemote,
      params.searchConfig,
      params.expandedMode,
      params.cache,
      params.requestKey
    );
    const uniqueBatch = batch.jobs.filter((job) => {
      if (!job?.id || seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    jobs = [...jobs, ...uniqueBatch].slice(0, params.limit);
    usedVariants.push({
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      strategy: currentVariant.strategy,
      results: batch.jobs.length,
      uniqueResults: uniqueBatch.length,
    });

    const isLastVariant = variantIndex >= params.variants.length - 1;

    if (jobs.length >= params.limit) {
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
      includeRemote: params.includeRemote,
      requestedLimit: params.limit,
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

  return {
    jobs,
    usedVariants,
    variantIndex,
    page,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  ensureSharedProviderRefreshStarted();
  const fallbackSearchConfig: SmartMatchSearchConfig = {
    searchQuery: "jobs",
    jobTitles: [],
    skillTerms: [],
    preferredLocation: null,
    locationOptions: [],
    includeRemote: true,
  };
  let baseSearchConfig = fallbackSearchConfig;

  if (userId) {
    try {
      baseSearchConfig = await getSmartMatchSearchConfigForUser(userId);
    } catch (error) {
      console.error("[SMART_MATCHES] failed to read profile search config", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

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

  const rawCursor = url.searchParams.get("cursor")?.trim() || "";
  const expandedMode = Boolean(rawCursor) || requestedPage > 1;
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
  const startVariantIndex = Math.max(initialCursor.variantIndex, 0);
  const startPage = rawCursor ? Math.max(initialCursor.page, 1) : requestedPage;

  console.log("[SMART_MATCHES] request mode", {
    page: startPage,
    expandedMode,
  });

  async function loadJobsForLocation(activeLocation: string) {
    const locationScopedConfig: SmartMatchSearchConfig = {
      ...searchConfig,
      preferredLocation: activeLocation || null,
      locationOptions: activeLocation ? [activeLocation] : [],
    };
    const variants = buildSearchVariants(locationScopedConfig, activeLocation);
    const result = await executeVariantSequence({
      variants,
      startVariantIndex,
      startPage,
      limit,
      includeRemote: searchConfig.includeRemote,
      searchConfig: locationScopedConfig,
      expandedMode,
      cache: providerCache,
      requestKey,
    });

    return {
      ...result,
      resolvedLocation: activeLocation,
    };
  }

  const requestedLocationPreference = requestedLocation || searchConfig.preferredLocation || null;
  const preferredResolvedLocation =
    initialCursor.resolvedLocation &&
    initialCursor.resolvedLocation.trim() &&
    initialCursor.resolvedLocation.trim().toLowerCase() !==
      (requestedLocationPreference ?? "").trim().toLowerCase()
      ? initialCursor.resolvedLocation
      : null;

  const locationResolution = await resolveLocationFallback({
    preferredLocation: requestedLocationPreference,
    additionalLocations: searchConfig.locationOptions,
    leadingLocations: preferredResolvedLocation ? [preferredResolvedLocation] : [],
    includeRemote: searchConfig.includeRemote,
    maxAttempts: 10,
    timeoutMs: 10000,
    fetchForLocation: loadJobsForLocation,
    isUsableResult: (result) => Array.isArray(result.jobs) && result.jobs.length > 0,
  });

  const jobs = locationResolution.result?.jobs ?? [];
  const usedVariants = locationResolution.result?.usedVariants ?? [];
  const nextCursor = locationResolution.result
    ? encodeCursor({
        variantIndex: locationResolution.result.variantIndex,
        page: locationResolution.result.page,
        resolvedLocation: locationResolution.result.resolvedLocation || null,
      })
    : "";
  const resolutionMetadata = {
    requestedState: locationResolution.requestedState,
    resolvedState: locationResolution.resolvedState,
    fallbackUsed: locationResolution.fallbackUsed,
    attemptedStates: locationResolution.attemptedStates,
  };

  console.log("[SMART_MATCHES] location resolution", resolutionMetadata);

  const payload = {
    jobs,
    nextCursor,
    meta: {
      query: searchConfig.searchQuery,
      preferredLocation: searchConfig.preferredLocation,
      includeRemote: searchConfig.includeRemote,
      ...resolutionMetadata,
      resolvedLocationMessage: formatResolvedStateMessage(resolutionMetadata),
      expanded: usedVariants.length > 1,
      usedVariants,
    },
  } satisfies SmartMatchesApiResponse;

  writeSmartMatchesResponseCache(requestKey, payload);

  return NextResponse.json(payload);
}
