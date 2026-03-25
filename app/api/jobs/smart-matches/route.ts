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
import {
  applyLocationMatchMetadata,
  type JobMatchTier,
  summarizeLocationMatchTiers,
} from "@/app/lib/jobs/locationMatch";
import type { Job } from "@/app/lib/jobs/types";
import {
  applyJobMatchStages,
  dedupeJobs,
  expandRoleQueryVariants,
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
const FIRST_PAGE_LOCAL_POOL_THRESHOLD = 12;
const FIRST_PAGE_BROADER_CAP = 2;
const HOTFIX_FIRST_PAGE_MIN_LOCAL_RESULTS = 6;
const LOCAL_FIRST_VARIANT_PAGE_DEPTH = 3;
const MAX_CANDIDATE_POOL_SIZE = 60;
const LOCAL_SERVICE_ROLE_REGEX =
  /\b(barista|cashier|cafe|coffee|server|host|restaurant|retail|food service)\b/i;
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

type RankedMatchSummary = Record<Exclude<JobMatchTier, "none">, number>;

type RequestBehavior = {
  explicitFiltersActive: boolean;
  explicitRoleActive: boolean;
  explicitLocationActive: boolean;
  firstRender: boolean;
  hotfixExplicitMode: boolean;
  suppressProfileFallback: boolean;
  suppressGenericFallback: boolean;
  suppressLocationWidening: boolean;
  localPageBudget: number;
};

type SmartMatchesGlobalState = typeof globalThis & {
  __hirexaSmartMatchesInFlight__?: Map<string, Promise<SmartMatchesApiResponse>>;
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
    profileQuery?: string | null;
    profilePreferredLocation?: string | null;
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
  activeLocation?: string | null,
  requestBehavior?: RequestBehavior
): SearchVariant[] {
  const exactTitles = dedupeStrings(
    requestBehavior?.suppressProfileFallback
      ? expandRoleQueryVariants(config.searchQuery)
      : [
          ...expandRoleQueryVariants(config.searchQuery),
          ...config.jobTitles.flatMap((title) => expandRoleQueryVariants(title)),
        ]
  ).slice(0, requestBehavior?.firstRender ? 4 : 6);
  const titleKeywords = dedupeStrings(
    exactTitles.map((title) => simplifyTitle(title))
  ).slice(0, 3);
  const skillQueries = requestBehavior?.suppressProfileFallback
    ? []
    : dedupeStrings(config.skillTerms).slice(0, 4);

  const primaryLocations =
    typeof activeLocation !== "undefined"
      ? dedupeStrings([activeLocation])
      : dedupeStrings([config.preferredLocation, ...config.locationOptions]).slice(0, 2);

  const focusedLocations = primaryLocations.length > 0 ? primaryLocations : [""];
  const remoteAwareLocations = requestBehavior?.suppressLocationWidening
    ? dedupeStrings([focusedLocations[0]])
    : dedupeStrings([
        focusedLocations[0],
        config.includeRemote ? "remote" : null,
        "",
      ]);

  const variants: SearchVariant[] = [];
  const seen = new Set<string>();

  if (requestBehavior?.hotfixExplicitMode) {
    const lockedQuery =
      (requestBehavior.explicitRoleActive
        ? exactTitles[0] ?? config.searchQuery.trim()
        : exactTitles[0] ?? config.searchQuery.trim()) || "jobs";
    const lockedLocation = focusedLocations[0] ?? "";

    console.info("[SMART_LOCK] using locked first-render variant", {
      query: lockedQuery,
      location: lockedLocation || null,
      explicitRoleActive: requestBehavior.explicitRoleActive,
      explicitLocationActive: requestBehavior.explicitLocationActive,
    });

    return [
      {
        query: lockedQuery,
        location: lockedLocation,
        strategy: "title",
      },
    ];
  }

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

  if (config.includeRemote && !requestBehavior?.suppressGenericFallback) {
    pushVariant({
      query: exactTitles[0] ?? titleKeywords[0] ?? skillQueries[0] ?? "jobs",
      location: "remote",
      strategy: "remote",
    });
  }

  if (!requestBehavior?.suppressGenericFallback) {
    pushVariant({
      query: exactTitles[0] ?? skillQueries[0] ?? "jobs",
      location: focusedLocations[0] ?? "",
      strategy: "fallback-location",
    });
  }

  if (config.includeRemote && !requestBehavior?.suppressGenericFallback) {
    pushVariant({
      query: "jobs",
      location: "remote",
      strategy: "fallback-broad",
    });
  }

  if (!requestBehavior?.suppressGenericFallback) {
    pushVariant({
      query: "jobs",
      location: "",
      strategy: "fallback-broad",
    });
  }

  return variants.length > 0
    ? variants
    : [{ query: "jobs", location: "", strategy: "fallback-broad" }];
}

function buildProviderFallbackVariants(
  variant: SearchVariant,
  requestBehavior?: RequestBehavior
) {
  const simplifiedQuery = simplifyTitle(variant.query);
  if (requestBehavior?.hotfixExplicitMode) {
    const candidates = [
      variant,
      simplifiedQuery && simplifiedQuery !== variant.query
        ? { ...variant, query: simplifiedQuery }
        : null,
    ].filter((value): value is SearchVariant => Boolean(value));

    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.query.toLowerCase()}|${candidate.location.toLowerCase()}|${candidate.strategy}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

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

function shouldUseTightLocalProviderBudget(
  variant: SearchVariant,
  requestBehavior: RequestBehavior
) {
  return (
    requestBehavior.hotfixExplicitMode &&
    requestBehavior.explicitLocationActive &&
    Boolean(variant.location) &&
    variant.location.toLowerCase() !== "remote" &&
    LOCAL_SERVICE_ROLE_REGEX.test(variant.query)
  );
}

function buildRoleFamilyQueries(
  config: SmartMatchSearchConfig,
  baseQuery: string,
  requestBehavior?: RequestBehavior
) {
  const roleVariants = expandRoleQueryVariants(baseQuery);
  if (requestBehavior?.hotfixExplicitMode) {
    const normalizedBaseQuery = normalizeText(baseQuery);

    if (
      normalizedBaseQuery.includes("barista") ||
      normalizedBaseQuery.includes("cashier")
    ) {
      return dedupeStrings([
        normalizedBaseQuery.includes("barista") ? "barista" : null,
        normalizedBaseQuery.includes("cashier") ? "cashier" : null,
        normalizedBaseQuery.includes("barista") &&
        normalizedBaseQuery.includes("cashier")
          ? "barista cashier"
          : null,
        normalizedBaseQuery.includes("barista") ? "cafe barista" : null,
      ]).slice(0, 4);
    }

    return dedupeStrings(
      roleVariants.filter(
        (query) => query.toLowerCase() !== "jobs" && query.toLowerCase() !== "hiring"
      )
    ).slice(0, LATER_PAGE_EXPANSION_LIMIT);
  }

  if (requestBehavior?.suppressProfileFallback) {
    return dedupeStrings(roleVariants).slice(0, LATER_PAGE_EXPANSION_LIMIT);
  }

  const normalizedSeed = normalizeText(
    [
      baseQuery,
      ...roleVariants,
      config.searchQuery,
      ...config.jobTitles,
      ...config.skillTerms,
    ].join(" ")
  );
  const matchedRoleFamily = ROLE_FAMILY_EXPANSIONS.find((entry) =>
    entry.test.test(normalizedSeed)
  );
  const fallbackQueries = dedupeStrings([
    ...roleVariants,
    ...config.jobTitles.map((title) => simplifyTitle(title)),
    ...config.skillTerms,
  ]);

  return dedupeStrings([
    ...roleVariants,
    baseQuery,
    ...(matchedRoleFamily?.queries ?? []),
    ...fallbackQueries,
  ]).slice(0, LATER_PAGE_EXPANSION_LIMIT);
}

function buildQueryProviderPlans(
  variant: SearchVariant,
  config: SmartMatchSearchConfig,
  expandedMode: boolean,
  requestBehavior?: RequestBehavior
) {
  const exactPlan: QueryProviderPlan = {
    query: variant.query,
    location: variant.location,
    reason: "exact",
  };

  if (requestBehavior?.hotfixExplicitMode) {
    const strictQueries = requestBehavior.explicitRoleActive
      ? buildRoleFamilyQueries(config, variant.query, requestBehavior)
      : [variant.query];

    if (!requestBehavior.explicitRoleActive) {
      return [exactPlan];
    }

    return dedupeStrings(strictQueries)
      .slice(0, LATER_PAGE_EXPANSION_LIMIT)
      .map((query, index) => ({
        query,
        location: variant.location,
        reason: index === 0 ? "exact" : "role-family-strict",
      }));
  }

  const plans: QueryProviderPlan[] = [exactPlan];

  if (!expandedMode) {
    return plans;
  }

  const extraQueries = buildRoleFamilyQueries(
    config,
    variant.query,
    requestBehavior
  ).filter(
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

function summarizeRankedTiers(jobs: Array<Pick<Job, "matchTier">>): RankedMatchSummary {
  return jobs.reduce(
    (summary, job) => {
      const tier = job.matchTier ?? "broader";
      summary[tier] += 1;
      return summary;
    },
    {
      exact: 0,
      nearby: 0,
      same_state: 0,
      remote: 0,
      broader: 0,
    } satisfies RankedMatchSummary
  );
}

function countLocalPool(summary: RankedMatchSummary) {
  return summary.exact + summary.nearby + summary.same_state;
}

function getLocationWideningStage(
  requestedLocation: string | null | undefined,
  activeLocation: string | null | undefined
) {
  const normalizedRequested = normalizeText(requestedLocation);
  const normalizedActive = normalizeText(activeLocation);

  if (!normalizedActive) return "national";
  if (!normalizedRequested || normalizedRequested === normalizedActive) {
    return "selected-city";
  }
  if (!String(activeLocation ?? "").includes(",")) {
    return "same-state";
  }

  return "broader-local";
}

function getSmartMatchesInFlightStore() {
  const globalState = globalThis as SmartMatchesGlobalState;
  if (!globalState.__hirexaSmartMatchesInFlight__) {
    globalState.__hirexaSmartMatchesInFlight__ = new Map();
  }

  return globalState.__hirexaSmartMatchesInFlight__;
}

function rankJobsForFeed(
  jobs: Job[],
  preferredLocation: string | null | undefined,
  includeRemote: boolean,
  options?: {
    limit?: number;
    firstPage?: boolean;
    allowBroaderFallback?: boolean;
  }
) {
  const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);
  const firstPage = options?.firstPage !== false;
  const allowBroaderFallback = options?.allowBroaderFallback !== false;
  const breakdown = summarizeLocationMatchTiers(
    jobs,
    preferredLocation,
    includeRemote
  ) as RankedMatchSummary;
  const matchedJobs = applyLocationMatchMetadata(
    jobs,
    preferredLocation,
    includeRemote
  );
  const exactJobs = lightlyDiversifyJobs(
    shuffleArray(matchedJobs.filter((job) => job.matchTier === "exact"))
  );
  const nearbyJobs = lightlyDiversifyJobs(
    shuffleArray(matchedJobs.filter((job) => job.matchTier === "nearby"))
  );
  const sameStateJobs = lightlyDiversifyJobs(
    shuffleArray(matchedJobs.filter((job) => job.matchTier === "same_state"))
  );
  const remoteJobs = lightlyDiversifyJobs(
    shuffleArray(matchedJobs.filter((job) => job.matchTier === "remote"))
  );
  const broaderJobs = lightlyDiversifyJobs(
    shuffleArray(matchedJobs.filter((job) => job.matchTier === "broader"))
  );
  const rankedJobs = [
    ...exactJobs,
    ...nearbyJobs,
    ...sameStateJobs,
    ...remoteJobs,
    ...broaderJobs,
  ];

  if (!firstPage) {
    const pageJobs = rankedJobs.slice(0, limit);

    return {
      rankedJobs,
      pageJobs,
      breakdown,
      pageBreakdown: summarizeRankedTiers(pageJobs),
      localPoolCount: countLocalPool(breakdown),
      broaderCapApplied: false,
    };
  }

  const localJobs = [...exactJobs, ...nearbyJobs, ...sameStateJobs];
  const localPoolCount = countLocalPool(breakdown);
  const pageJobs = localJobs.slice(0, limit);

  if (pageJobs.length < limit && includeRemote) {
    pageJobs.push(...remoteJobs.slice(0, limit - pageJobs.length));
  }

  if (allowBroaderFallback && pageJobs.length < limit) {
    const broaderAllowance =
      localPoolCount >= Math.min(FIRST_PAGE_LOCAL_POOL_THRESHOLD, limit)
        ? Math.min(FIRST_PAGE_BROADER_CAP, limit - pageJobs.length)
        : limit - pageJobs.length;
    pageJobs.push(...broaderJobs.slice(0, broaderAllowance));
  }

  const usedIds = new Set(pageJobs.map((job) => job.id));
  const remainingJobs = rankedJobs.filter((job) => !usedIds.has(job.id));

  return {
    rankedJobs: [...pageJobs, ...remainingJobs],
    pageJobs,
    breakdown,
    pageBreakdown: summarizeRankedTiers(pageJobs),
    localPoolCount,
    broaderCapApplied:
      localPoolCount >= Math.min(FIRST_PAGE_LOCAL_POOL_THRESHOLD, limit) &&
      pageJobs.some((job) => job.matchTier === "broader"),
  };
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
  const locationBreakdown = summarizeLocationMatchTiers(
    stages.queryMatchedJobs,
    variant.location,
    includeRemote
  );

  console.info("[SMART_LOCATION] provider match stages", {
    provider,
    query: variant.query,
    location: variant.location || null,
    includeRemote,
    page,
    limit,
    raw: stages.counts.raw,
    matched: stages.counts.matched,
    postLocation: stages.counts.postLocation,
    postDedupe: stages.counts.postDedupe,
    final: stages.counts.final,
    exact: locationBreakdown.exact,
    nearby: locationBreakdown.nearby,
    same_state: locationBreakdown.same_state,
    broader: locationBreakdown.broader,
    postLocationFilteredOut:
      stages.counts.matched > 0 && stages.counts.postLocation < stages.counts.matched,
  });

  return stages;
}

async function fetchProviderBatch(
  variant: SearchVariant,
  page: number,
  limit: number,
  includeRemote: boolean,
  searchConfig: SmartMatchSearchConfig,
  expandedMode: boolean,
  requestBehavior: RequestBehavior,
  cache: RequestScopedProviderCache,
  requestKey: string
): Promise<{
  jobs: Job[];
  pageJobs: Job[];
  counts: ProviderCounts;
  cacheMeta: BatchCacheMeta;
  breakdown: RankedMatchSummary;
  pageBreakdown: RankedMatchSummary;
  localPoolCount: number;
}> {
  ensureSharedProviderRefreshStarted();
  const tightLocalProviderBudget = shouldUseTightLocalProviderBudget(
    variant,
    requestBehavior
  );
  const queryProviderPlans = buildQueryProviderPlans(
    variant,
    searchConfig,
    expandedMode,
    requestBehavior
  );
  const useSharedProviders = !tightLocalProviderBudget;
  const useUsaJobs = !tightLocalProviderBudget;
  const enabledProviders = [
    "adzuna",
    useSharedProviders ? "shared-ats" : null,
    useUsaJobs ? "usajobs" : null,
  ].filter(Boolean);

  console.info("[SMART_PROVIDER] Smart Matches batch request", {
    query: variant.query,
    location: variant.location || null,
    includeRemote,
    limit,
    page,
    expandedMode,
    enabledProviders,
  });
  console.info("[SMART_BUDGET] provider fanout", {
    query: variant.query,
    location: variant.location || null,
    tightLocalProviderBudget,
    useSharedProviders,
    useUsaJobs,
    enabledProviders,
    localPageBudget: requestBehavior.localPageBudget,
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
      console.info("[SMART_PROVIDER] query provider request", {
        provider,
        query: plan.query,
        location: plan.location || null,
        page,
        limit,
        includeRemote,
        reason: plan.reason,
      });

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
        console.info("[SMART_PROVIDER] query provider fallback", {
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
    useSharedProviders
      ? fetchCachedSharedProviderSnapshot(variant.query, cache)
      : Promise.resolve({
          snapshot: {
            greenhouseJobs: [],
            leverJobs: [],
            ashbyJobs: [],
            workableJobs: [],
            remotiveJobs: [],
            remoteokJobs: [],
            counts: {
              greenhouse: 0,
              lever: 0,
              ashby: 0,
              workable: 0,
              remotive: 0,
              remoteok: 0,
              total: 0,
            },
          },
          cache: {
            key: "disabled",
            hit: false,
            fresh: false,
            stale: false,
            ageMs: null,
          },
        } satisfies SharedProviderCacheResult),
    fetchPlannedQueryProviderJobs("adzuna"),
    useUsaJobs
      ? fetchPlannedQueryProviderJobs("usajobs")
      : Promise.resolve({
          jobs: [],
          cache: {
            provider: "usajobs",
            key: "disabled",
            hit: false,
            fresh: false,
            stale: false,
            ageMs: null,
          },
        } satisfies QueryProviderCacheResult),
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

  const ranking = rankJobsForFeed(
    dedupedJobs,
    searchConfig.preferredLocation,
    includeRemote,
    {
      limit,
      firstPage: page === 1 && !expandedMode,
      allowBroaderFallback: !(
        requestBehavior.hotfixExplicitMode
      ),
    }
  );
  const orderedJobs = ranking.rankedJobs.slice(0, MAX_CANDIDATE_POOL_SIZE);
  const results = ranking.pageJobs;

  console.info("[SMART_RANK] ranked Smart Matches batch", {
    preferredLocation: searchConfig.preferredLocation,
    includeRemote,
    beforeRanking: dedupedJobs.length,
    afterRanking: orderedJobs.length,
    returned: results.length,
    breakdown: ranking.breakdown,
    pageBreakdown: ranking.pageBreakdown,
    localPoolCount: ranking.localPoolCount,
    broaderCapApplied: ranking.broaderCapApplied,
    byProvider: summarizeJobsByProvider(results),
  });

  console.info("[SMART_LOCAL_POOL] batch local pool", {
    query: variant.query,
    location: variant.location || null,
    page,
    localPoolCount: ranking.localPoolCount,
    broaderPoolCount: ranking.breakdown.broader,
    breakdown: ranking.breakdown,
    topWindowBreakdown: ranking.pageBreakdown,
  });

  console.log("[SMART_MATCHES] returning jobs", {
    returned: results.length,
    page,
    byProvider: summarizeJobsByProvider(results),
  });

  return {
    jobs: orderedJobs,
    pageJobs: results,
    counts,
    cacheMeta: {
      shared: sharedProviders.cache,
      providers: {
        adzuna: adzunaResult.cache,
        usajobs: usajobsResult.cache,
      },
    },
    breakdown: ranking.breakdown,
    pageBreakdown: ranking.pageBreakdown,
    localPoolCount: ranking.localPoolCount,
  };
}

async function fetchVariantJobs(
  variant: SearchVariant,
  page: number,
  limit: number,
  includeRemote: boolean,
  searchConfig: SmartMatchSearchConfig,
  expandedMode: boolean,
  requestBehavior: RequestBehavior,
  cache: RequestScopedProviderCache,
  requestKey: string
): Promise<{
  jobs: Job[];
  pageJobs: Job[];
  counts: ProviderCounts;
  cacheMeta: BatchCacheMeta;
  breakdown: RankedMatchSummary;
  pageBreakdown: RankedMatchSummary;
  localPoolCount: number;
}> {
  const providerVariants = buildProviderFallbackVariants(variant, requestBehavior);
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
  let latestBreakdown: RankedMatchSummary = {
    exact: 0,
    nearby: 0,
    same_state: 0,
    remote: 0,
    broader: 0,
  };
  let latestPageBreakdown: RankedMatchSummary = {
    exact: 0,
    nearby: 0,
    same_state: 0,
    remote: 0,
    broader: 0,
  };
  let latestLocalPoolCount = 0;
  let latestPageJobs: Job[] = [];
  const localPoolTarget = searchConfig.preferredLocation
    ? Math.min(FIRST_PAGE_LOCAL_POOL_THRESHOLD, limit)
    : 0;

  for (const providerVariant of providerVariants) {
    const result = await fetchProviderBatch(
      providerVariant,
      page,
      limit,
      includeRemote,
      searchConfig,
      expandedMode,
      requestBehavior,
      cache,
      requestKey
    );
    latestCounts = result.counts;
    latestCacheMeta = result.cacheMeta;
    latestBreakdown = result.breakdown;
    latestPageBreakdown = result.pageBreakdown;
    latestLocalPoolCount = result.localPoolCount;
    latestPageJobs = result.pageJobs;

    if (result.jobs.length > 0) {
      aggregatedJobs = dedupeJobs([...aggregatedJobs, ...result.jobs]).slice(
        0,
        MAX_CANDIDATE_POOL_SIZE
      );
    }

    if (aggregatedJobs.length > 0) {
      const aggregateRanking = rankJobsForFeed(
        aggregatedJobs,
        searchConfig.preferredLocation,
        includeRemote,
        {
          limit,
          firstPage: page === 1 && !expandedMode,
          allowBroaderFallback: !(
            requestBehavior.hotfixExplicitMode
          ),
        }
      );

      latestBreakdown = aggregateRanking.breakdown;
      latestPageBreakdown = aggregateRanking.pageBreakdown;
      latestLocalPoolCount = aggregateRanking.localPoolCount;
      latestPageJobs = aggregateRanking.pageJobs;
    }

    if (
      latestPageJobs.length >= limit &&
      (localPoolTarget === 0 || latestLocalPoolCount >= localPoolTarget)
    ) {
      return {
        jobs: aggregatedJobs,
        pageJobs: latestPageJobs,
        counts: latestCounts,
        cacheMeta: latestCacheMeta,
        breakdown: latestBreakdown,
        pageBreakdown: latestPageBreakdown,
        localPoolCount: latestLocalPoolCount,
      };
    }

    if (result.jobs.length === 0) {
      continue;
    }

    if (
      providerVariant.query !== variant.query ||
      providerVariant.location !== variant.location
    ) {
      console.info("[SMART_FALLBACK] provider fallback variant", {
        fromQuery: variant.query,
        fromLocation: variant.location || null,
        toQuery: providerVariant.query,
        toLocation: providerVariant.location || null,
        page,
        candidatePool: aggregatedJobs.length,
        localPoolCount: latestLocalPoolCount,
        broaderPoolCount: latestBreakdown.broader,
      });
    }
  }

  return {
    jobs: aggregatedJobs,
    pageJobs: latestPageJobs,
    counts: latestCounts,
    cacheMeta: latestCacheMeta,
    breakdown: latestBreakdown,
    pageBreakdown: latestPageBreakdown,
    localPoolCount: latestLocalPoolCount,
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
  requestBehavior: RequestBehavior;
  cache: RequestScopedProviderCache;
  requestKey: string;
}) {
  let variantIndex = Math.min(params.startVariantIndex, params.variants.length - 1);
  let page = Math.max(params.startPage, 1);
  let jobs: Job[] = [];
  const seen = new Set<string>();
  const usedVariants: SmartMatchesApiResponse["meta"]["usedVariants"] = [];
  const maxAttempts = Math.max(
    params.variants.length * params.requestBehavior.localPageBudget,
    4
  );
  const isFirstFeedPage =
    !params.expandedMode &&
    params.startPage === 1 &&
    params.startVariantIndex === 0;
  const localPoolTarget = params.searchConfig.preferredLocation
    ? Math.min(FIRST_PAGE_LOCAL_POOL_THRESHOLD, params.limit)
    : 0;
  let pagesFetchedForVariant = 0;
  let rankedJobs: Job[] = [];
  let latestPageBreakdown: RankedMatchSummary = {
    exact: 0,
    nearby: 0,
    same_state: 0,
    remote: 0,
    broader: 0,
  };
  let latestLocalPoolCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const currentVariant =
      params.variants[Math.min(variantIndex, params.variants.length - 1)];
    const batch = await fetchVariantJobs(
      currentVariant,
      page,
      params.limit,
      params.includeRemote,
      params.searchConfig,
      params.expandedMode,
      params.requestBehavior,
      params.cache,
      params.requestKey
    );
    const uniqueBatch = batch.jobs.filter((job) => {
      if (!job?.id || seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });

    jobs = [...jobs, ...uniqueBatch].slice(0, MAX_CANDIDATE_POOL_SIZE);
    const aggregateRanking = rankJobsForFeed(
      jobs,
      params.searchConfig.preferredLocation,
      params.includeRemote,
      {
        limit: params.limit,
        firstPage: isFirstFeedPage,
        allowBroaderFallback: !(
          params.requestBehavior.hotfixExplicitMode
        ),
      }
    );
    rankedJobs = aggregateRanking.pageJobs;
    latestPageBreakdown = aggregateRanking.pageBreakdown;
    latestLocalPoolCount = aggregateRanking.localPoolCount;
    pagesFetchedForVariant += 1;

    usedVariants.push({
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      strategy: currentVariant.strategy,
      results: batch.pageJobs.length,
      uniqueResults: uniqueBatch.length,
    });

    const isLastVariant = variantIndex >= params.variants.length - 1;
    const hasStrongLocalPool =
      localPoolTarget === 0 || aggregateRanking.localPoolCount >= localPoolTarget;
    const hasEnoughRankedJobs = rankedJobs.length >= params.limit;
    const shouldStopLocalGrowth =
      params.requestBehavior.hotfixExplicitMode &&
      localPoolTarget > 0 &&
      aggregateRanking.localPoolCount >= localPoolTarget;
    const canFetchMoreLocalPages =
      Boolean(currentVariant.location) &&
      pagesFetchedForVariant < params.requestBehavior.localPageBudget &&
      localPoolTarget > 0 &&
      !hasStrongLocalPool &&
      batch.jobs.length > 0;
    const canKeepPagingCurrentVariant =
      Boolean(currentVariant.location) &&
      pagesFetchedForVariant < params.requestBehavior.localPageBudget &&
      !hasStrongLocalPool &&
      !hasEnoughRankedJobs &&
      batch.jobs.length > 0;

    console.info("[SMART_LOCAL_POOL] aggregate candidate pool", {
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      pagesFetchedForVariant,
      localPoolTarget,
      localPoolCount: aggregateRanking.localPoolCount,
      broaderPoolCount: aggregateRanking.breakdown.broader,
      candidatePoolSize: jobs.length,
      topWindowBreakdown: aggregateRanking.pageBreakdown,
    });

    if (canFetchMoreLocalPages) {
      console.info("[SMART_FALLBACK] holding broader fallback for local pages", {
        query: currentVariant.query,
        location: currentVariant.location || null,
        page,
        nextPage: page + 1,
        pagesFetchedForVariant,
        localPoolCount: aggregateRanking.localPoolCount,
        localPoolTarget,
      });
      page += 1;
      continue;
    }

    if (shouldStopLocalGrowth) {
      console.info("[SMART_STOP] local pool target reached", {
        query: currentVariant.query,
        location: currentVariant.location || null,
        localPoolCount: aggregateRanking.localPoolCount,
        localPoolTarget,
        growthStopped: true,
        nextPageBlocked: true,
        pagesFetchedForVariant,
      });
      page += 1;
      break;
    }

    if (hasEnoughRankedJobs && hasStrongLocalPool) {
      console.info("[SMART_BUDGET] early exit after local-first batch", {
        explicitFiltersActive: params.requestBehavior.explicitFiltersActive,
        firstRender: params.requestBehavior.firstRender,
        pagesFetchedForVariant,
        rankedJobs: rankedJobs.length,
        localPoolCount: aggregateRanking.localPoolCount,
        localPoolTarget,
      });
      page += 1;
      break;
    }

    if (canKeepPagingCurrentVariant) {
      console.info("[SMART_LOCAL_POOL] growing current local variant", {
        query: currentVariant.query,
        location: currentVariant.location || null,
        page,
        nextPage: page + 1,
        pagesFetchedForVariant,
        rankedJobs: rankedJobs.length,
      });
      page += 1;
      continue;
    }

    if (isLastVariant) {
      console.info("[SMART_STOP] stopping at last allowed variant", {
        query: currentVariant.query,
        location: currentVariant.location || null,
        localPoolCount: aggregateRanking.localPoolCount,
        localPoolTarget,
        growthStopped: true,
        reason: "last-variant",
      });
      page += 1;
      break;
    }

    console.info("[SMART_FALLBACK] advancing variant", {
      query: currentVariant.query,
      location: currentVariant.location || null,
      page,
      includeRemote: params.includeRemote,
      requestedLimit: params.limit,
      candidatePoolSize: jobs.length,
      rankedJobs: rankedJobs.length,
      localPoolCount: aggregateRanking.localPoolCount,
      localPoolTarget,
      reason: hasStrongLocalPool ? "under-limit-after-local-pages" : "local-pool-below-threshold",
      fromVariantIndex: variantIndex,
      toVariantIndex: variantIndex + 1,
      fromPage: page,
    });
    variantIndex += 1;
    page = 1;
    pagesFetchedForVariant = 0;
  }

  return {
    jobs: rankedJobs,
    usedVariants,
    variantIndex,
    page,
    pageBreakdown: latestPageBreakdown,
    localPoolCount: latestLocalPoolCount,
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
  const explicitFiltersParam = url.searchParams.get("explicit")?.trim();
  const requestedPageValue = Number(url.searchParams.get("page") ?? "");
  const requestedPage =
    Number.isFinite(requestedPageValue) && requestedPageValue > 0
      ? requestedPageValue
      : 1;
  const limit = Math.max(
    10,
    Math.min(Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT), 30)
  );
  const rawCursor = url.searchParams.get("cursor")?.trim() || "";
  const expandedMode = Boolean(rawCursor) || requestedPage > 1;
  const firstRender = requestedPage === 1 && !rawCursor;
  const resolvedSearchQuery = requestedQuery || baseSearchConfig.searchQuery;
  const resolvedPreferredLocation =
    requestedLocation || baseSearchConfig.preferredLocation || "";
  const resolvedIncludeRemote =
    includeRemoteParam === null
      ? baseSearchConfig.includeRemote
      : includeRemoteParam !== "false" && includeRemoteParam !== "0";
  const requestSource = rawCursor
    ? "load-more"
    : explicitFiltersParam === "1"
      ? "apply-filters"
      : "initial-load";
  const activeFilterOverrideUsed =
    explicitFiltersParam === "1" ||
    Boolean(requestedQuery) ||
    Boolean(requestedLocation);
  const inferredResolvedExplicitSearch =
    firstRender &&
    Boolean(resolvedPreferredLocation) &&
    Boolean(resolvedSearchQuery) &&
    normalizeText(resolvedSearchQuery) !== "jobs";
  const explicitFiltersActive =
    explicitFiltersParam === "1" ||
    (firstRender && Boolean(requestedQuery || requestedLocation)) ||
    inferredResolvedExplicitSearch;
  const hotfixExplicitMode = explicitFiltersActive && firstRender;
  const requestBehavior: RequestBehavior = {
    explicitFiltersActive,
    explicitRoleActive:
      explicitFiltersActive &&
      Boolean(resolvedSearchQuery) &&
      normalizeText(resolvedSearchQuery) !== "jobs",
    explicitLocationActive: explicitFiltersActive && Boolean(resolvedPreferredLocation),
    firstRender,
    hotfixExplicitMode,
    suppressProfileFallback:
      hotfixExplicitMode || (explicitFiltersActive && Boolean(requestedQuery)),
    suppressGenericFallback: hotfixExplicitMode,
    suppressLocationWidening: hotfixExplicitMode && Boolean(resolvedPreferredLocation),
    localPageBudget: hotfixExplicitMode ? 1 : LOCAL_FIRST_VARIANT_PAGE_DEPTH,
  };

  const searchConfig: SmartMatchSearchConfig = {
    ...baseSearchConfig,
    searchQuery: resolvedSearchQuery,
    jobTitles: requestBehavior.suppressProfileFallback
      ? dedupeStrings([resolvedSearchQuery]).filter(
          (value) => normalizeText(value) !== "jobs"
        )
      : requestedQuery
        ? dedupeStrings([requestedQuery, ...baseSearchConfig.jobTitles])
        : baseSearchConfig.jobTitles,
    skillTerms: requestBehavior.hotfixExplicitMode ? [] : baseSearchConfig.skillTerms,
    preferredLocation: resolvedPreferredLocation || null,
    locationOptions:
      requestBehavior.explicitLocationActive && resolvedPreferredLocation
        ? dedupeStrings([resolvedPreferredLocation])
        : requestedLocation
          ? dedupeStrings([requestedLocation, ...baseSearchConfig.locationOptions])
          : baseSearchConfig.locationOptions,
    includeRemote: resolvedIncludeRemote,
  };
  const roleVariants = buildRoleFamilyQueries(
    searchConfig,
    resolvedSearchQuery || searchConfig.searchQuery,
    requestBehavior
  );
  const searchFingerprint = JSON.stringify({
    searchQuery: searchConfig.searchQuery,
    preferredLocation: searchConfig.preferredLocation,
    includeRemote: searchConfig.includeRemote,
    explicitFiltersActive: requestBehavior.explicitFiltersActive,
    firstRender: requestBehavior.firstRender,
    jobTitles: searchConfig.jobTitles.slice(0, 4),
    skillTerms: searchConfig.skillTerms.slice(0, 4),
  });

  console.info("[SMART_FILTERS] resolved Smart Matches filters", {
    userId,
    profileTargetRole: baseSearchConfig.searchQuery,
    activeFilterRole: searchConfig.searchQuery,
    requestedRole: requestedQuery || null,
    profilePreferredLocation: baseSearchConfig.preferredLocation,
    activeFilterLocation: searchConfig.preferredLocation,
    requestedLocation: requestedLocation || null,
    includeRemote: searchConfig.includeRemote,
    requestSource,
    activeFilterOverrideUsed,
  });
  console.info("[SMART_INPUT] Smart Matches request input", {
    explicitFiltersActive: requestBehavior.explicitFiltersActive,
    firstRender: requestBehavior.firstRender,
    hotfixExplicitMode: requestBehavior.hotfixExplicitMode,
    profileTargetRole: baseSearchConfig.searchQuery,
    appliedRole: resolvedSearchQuery || searchConfig.searchQuery,
    profilePreferredLocation: baseSearchConfig.preferredLocation,
    appliedLocation: resolvedPreferredLocation || searchConfig.preferredLocation,
    includeRemote: searchConfig.includeRemote,
    requestSource,
    activeFilterOverrideUsed,
    searchFingerprint,
  });
  console.info("[SMART_LOCK] Smart Matches explicit lock summary", {
    explicitFiltersActive: requestBehavior.explicitFiltersActive,
    firstRender: requestBehavior.firstRender,
    hotfixExplicitMode: requestBehavior.hotfixExplicitMode,
    query: resolvedSearchQuery || searchConfig.searchQuery,
    location: resolvedPreferredLocation || searchConfig.preferredLocation,
    genericFallbackBlocked: requestBehavior.suppressGenericFallback,
    nullLocationFallbackBlocked: requestBehavior.suppressLocationWidening,
    profileTitleFallbackBlocked: requestBehavior.suppressProfileFallback,
    skillFallbackBlocked: requestBehavior.hotfixExplicitMode,
  });
  console.info("[SMART_HOTFIX] Smart Matches emergency explicit mode", {
    enabled: requestBehavior.hotfixExplicitMode,
    query: resolvedSearchQuery || searchConfig.searchQuery,
    location: resolvedPreferredLocation || searchConfig.preferredLocation,
    localPageBudget: requestBehavior.localPageBudget,
  });
  console.info("[SMART_QUERY] active Smart Matches query", {
    targetRole: searchConfig.searchQuery,
    preferredLocation: searchConfig.preferredLocation,
    includeRemote: searchConfig.includeRemote,
  });
  console.info("[SMART_ROLE_VARIANTS] expanded Smart Matches role queries", {
    targetRole: searchConfig.searchQuery,
    variants: roleVariants,
  });
  console.info("[SMART_QUERY_PLAN] Smart Matches page-one plan", {
    firstRender: requestBehavior.firstRender,
    hotfixExplicitMode: requestBehavior.hotfixExplicitMode,
    requestSource,
    allowedRoleVariants: roleVariants,
    allowedLocationVariants: requestBehavior.suppressLocationWidening
      ? [resolvedPreferredLocation || searchConfig.preferredLocation].filter(Boolean)
      : searchConfig.locationOptions,
    profileTitlesSuppressed: requestBehavior.suppressProfileFallback,
    genericFallbackSuppressed: requestBehavior.suppressGenericFallback,
    locationWideningSuppressed: requestBehavior.suppressLocationWidening,
    skillTermsSuppressed: requestBehavior.hotfixExplicitMode,
    localPageBudget: requestBehavior.localPageBudget,
  });

  const initialCursor = decodeCursor(rawCursor);
  const requestKey = normalizeSmartMatchesKey({
    userId: userId ?? "anon",
    query: resolvedSearchQuery || searchConfig.searchQuery,
    location: resolvedPreferredLocation || searchConfig.preferredLocation || "",
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

  const inFlightStore = getSmartMatchesInFlightStore();
  const existingInFlight = inFlightStore.get(requestKey);
  if (existingInFlight) {
    console.info("[SMART_DEDUPE] reusing in-flight Smart Matches request", {
      requestKey,
      explicitFiltersActive: requestBehavior.explicitFiltersActive,
      firstRender: requestBehavior.firstRender,
      query: resolvedSearchQuery || searchConfig.searchQuery,
      location: resolvedPreferredLocation || searchConfig.preferredLocation,
      duplicateSkipped: true,
    });

    return NextResponse.json(await existingInFlight);
  }

  const payloadPromise = (async (): Promise<SmartMatchesApiResponse> => {
    const providerCache: RequestScopedProviderCache = {
      shared: new Map(),
      queryProviders: new Map(),
    };
    const startVariantIndex = Math.max(initialCursor.variantIndex, 0);
    const startPage = rawCursor ? Math.max(initialCursor.page, 1) : requestedPage;
    const hotfixLocalResultThreshold = Math.min(
      HOTFIX_FIRST_PAGE_MIN_LOCAL_RESULTS,
      limit
    );

    console.log("[SMART_MATCHES] request mode", {
      page: startPage,
      expandedMode,
    });
    console.info("[SMART_PROGRESS] Smart Matches request progress", {
      requestSource,
      currentWideningStage: requestBehavior.suppressLocationWidening
        ? "selected-city-then-state"
        : "fallback-resolution",
      profileFallbackUsed: !activeFilterOverrideUsed,
      activeFilterOverrideUsed,
    });
    console.info("[SMART_BUDGET] Smart Matches request budget", {
      firstRender: requestBehavior.firstRender,
      explicitFiltersActive: requestBehavior.explicitFiltersActive,
      hotfixExplicitMode: requestBehavior.hotfixExplicitMode,
      localPageBudget: requestBehavior.localPageBudget,
      genericFallbackSuppressed: requestBehavior.suppressGenericFallback,
      locationWideningSuppressed: requestBehavior.suppressLocationWidening,
    });

    async function loadJobsForLocation(activeLocation: string) {
      const locationScopedConfig: SmartMatchSearchConfig = {
        ...searchConfig,
        // Keep ranking anchored to the user-selected city while widening the
        // provider request location in controlled stages.
        preferredLocation: searchConfig.preferredLocation,
        locationOptions: searchConfig.locationOptions,
      };
      const variants = buildSearchVariants(
        locationScopedConfig,
        activeLocation,
        requestBehavior
      );
      const wideningStage = getLocationWideningStage(
        searchConfig.preferredLocation,
        activeLocation
      );
      if (requestBehavior.firstRender) {
        console.info("[SMART_QUERY_PLAN] allowed first-render search variants", {
          appliedRole: resolvedSearchQuery || searchConfig.searchQuery,
          appliedLocation: searchConfig.preferredLocation,
          wideningStage,
          variants: variants.map((variant) => ({
            query: variant.query,
            location: variant.location || null,
            strategy: variant.strategy,
          })),
        });
      }
      const result = await executeVariantSequence({
        variants,
        startVariantIndex,
        startPage,
        limit,
        includeRemote: searchConfig.includeRemote,
        searchConfig: locationScopedConfig,
        expandedMode,
        requestBehavior,
        cache: providerCache,
        requestKey,
      });

      return {
        ...result,
        resolvedLocation: activeLocation,
        wideningStage,
      };
    }

    const requestedLocationPreference =
      requestedLocation || searchConfig.preferredLocation || null;
    const allowStateExpansionOnFirstPage =
      requestBehavior.suppressLocationWidening &&
      Boolean(requestedLocationPreference?.includes(","));
    const preferredResolvedLocation =
      initialCursor.resolvedLocation &&
      initialCursor.resolvedLocation.trim() &&
      initialCursor.resolvedLocation.trim().toLowerCase() !==
        (requestedLocationPreference ?? "").trim().toLowerCase()
        ? initialCursor.resolvedLocation
        : null;

    if (requestBehavior.suppressLocationWidening) {
      console.info("[SMART_LOCK] freezing explicit page-one location", {
        appliedLocation: requestedLocationPreference,
        maxAttempts: allowStateExpansionOnFirstPage ? 2 : 1,
      });
    }

    const locationResolution = await resolveLocationFallback({
      preferredLocation: requestedLocationPreference,
      additionalLocations: requestBehavior.suppressLocationWidening
        ? []
        : searchConfig.locationOptions,
      leadingLocations:
        requestBehavior.suppressLocationWidening || !preferredResolvedLocation
          ? []
          : [preferredResolvedLocation],
      includeRemote: searchConfig.includeRemote,
      maxAttempts: allowStateExpansionOnFirstPage
        ? 2
        : requestBehavior.suppressLocationWidening
          ? 1
          : 10,
      timeoutMs: 10000,
      fetchForLocation: loadJobsForLocation,
      isUsableResult: (result) => {
        if (!Array.isArray(result.jobs) || result.jobs.length === 0) {
          return false;
        }

        const shouldAdvanceExplicitLocalStage =
          requestBehavior.hotfixExplicitMode &&
          result.wideningStage === "selected-city" &&
          result.localPoolCount < hotfixLocalResultThreshold &&
          result.jobs.length < hotfixLocalResultThreshold;

        console.info("[SMART_FALLBACK] evaluated location stage", {
          appliedLocation: searchConfig.preferredLocation,
          activeLocation: result.resolvedLocation || null,
          wideningStage: result.wideningStage,
          localPoolCount: result.localPoolCount,
          localPoolTarget: hotfixLocalResultThreshold,
          returnedJobs: result.jobs.length,
          advancing: shouldAdvanceExplicitLocalStage,
          reason: shouldAdvanceExplicitLocalStage
            ? "selected-city-results-too-thin"
            : "location-stage-usable",
        });

        return !shouldAdvanceExplicitLocalStage;
      },
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

    console.info("[SMART_LOCATION] Smart Matches location resolution", {
      ...resolutionMetadata,
      preferredLocation: searchConfig.preferredLocation,
      wideningStage: locationResolution.result?.wideningStage ?? "none",
      localPoolCount: locationResolution.result?.localPoolCount ?? 0,
      returnedJobs: jobs.length,
    });
    console.info("[SMART_RANK] final Smart Matches composition", {
      preferredLocation: searchConfig.preferredLocation,
      includeRemote: searchConfig.includeRemote,
      returnedJobs: jobs.length,
      top20Composition: summarizeRankedTiers(jobs.slice(0, 20)),
    });
    console.info("[SMART_RESULT] final page-one Smart Matches result", {
      requestKey,
      explicitFiltersActive: requestBehavior.explicitFiltersActive,
      firstRender: requestBehavior.firstRender,
      hotfixExplicitMode: requestBehavior.hotfixExplicitMode,
      requestSource,
      profileTargetRole: baseSearchConfig.searchQuery,
      profilePreferredLocation: baseSearchConfig.preferredLocation,
      activeFilterRole: searchConfig.searchQuery,
      activeFilterLocation: searchConfig.preferredLocation,
      byProvider: summarizeJobsByProvider(jobs.slice(0, 20)),
      byMatchType: summarizeRankedTiers(jobs.slice(0, 20)),
    });
    console.info("[SMART_FALLBACK] final fallback state", {
      fallbackUsed: resolutionMetadata.fallbackUsed,
      requestedState: resolutionMetadata.requestedState,
      resolvedState: resolutionMetadata.resolvedState,
      attemptedStates: resolutionMetadata.attemptedStates,
    });

    const payload = {
      jobs,
      nextCursor,
      meta: {
        query: searchConfig.searchQuery,
        preferredLocation: searchConfig.preferredLocation,
        profileQuery: baseSearchConfig.searchQuery,
        profilePreferredLocation: baseSearchConfig.preferredLocation,
        includeRemote: searchConfig.includeRemote,
        ...resolutionMetadata,
        resolvedLocationMessage: formatResolvedStateMessage(resolutionMetadata),
        expanded: usedVariants.length > 1,
        usedVariants,
      },
    } satisfies SmartMatchesApiResponse;

    writeSmartMatchesResponseCache(requestKey, payload);

    return payload;
  })();

  inFlightStore.set(requestKey, payloadPromise);

  try {
    const payload = await payloadPromise;
    return NextResponse.json(payload);
  } finally {
    if (inFlightStore.get(requestKey) === payloadPromise) {
      inFlightStore.delete(requestKey);
    }
  }
}
