import type { Job } from "./types";
import { fetchAdzuna } from "./sources/adzuna";
import { fetchAshby } from "./sources/ashby";
import {
  ASHBY_COMPANIES,
  GREENHOUSE_COMPANIES,
  LEVER_COMPANIES,
  WORKABLE_COMPANIES,
} from "./sources/boards";
import type { SourceFetchArgs } from "./sources/common";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { fetchRemoteOK } from "./sources/remoteok";
import { fetchRemotive } from "./sources/remotive";
import { fetchUSAJobs } from "./sources/usajobs";
import { fetchWorkable } from "./sources/workable";
import {
  EMPTY_QUERY_PROVIDER_TTL_MS,
  getCacheMeta,
  getJobCacheStore,
  isFresh,
  pruneJobCacheStore,
  QUERY_PROVIDER_TTL_MS,
  type QueryProviderName,
  SHARED_PROVIDER_ACTIVE_WINDOW_MS,
  SHARED_PROVIDER_TTL_MS,
  type SharedProviderName,
  type SharedProviderSnapshot,
  normalizeProviderKey,
  normalizeSharedProviderKey,
} from "./cache";

const SHARED_PROVIDER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_CACHED_PROVIDER_LIMIT = 60;
const QUERY_PROVIDER_REFRESH_TIMEOUT_MS = 6500;

type SharedProviderCacheMeta = {
  key: string;
  hit: boolean;
  fresh: boolean;
  stale: boolean;
  ageMs: number | null;
};

type QueryProviderCacheMeta = {
  provider: QueryProviderName;
  key: string;
  hit: boolean;
  fresh: boolean;
  stale: boolean;
  ageMs: number | null;
};

export type SharedProviderCacheResult = {
  snapshot: SharedProviderSnapshot;
  cache: SharedProviderCacheMeta;
};

export type QueryProviderCacheResult = {
  jobs: Job[];
  cache: QueryProviderCacheMeta;
};

type SharedProviderPayloadMap = Record<SharedProviderName, Job[]>;

type SharedProviderRequest = {
  query: string;
};

type QueryProviderRequest = {
  provider: QueryProviderName;
  query: string;
  location: string;
  page: number;
  limit: number;
  includeRemote: boolean;
};

type QueryProviderFetcher = (args: SourceFetchArgs) => Promise<Job[]>;

function normalizeQuery(value: string | null | undefined) {
  return value?.trim() || "jobs";
}

function normalizeLocation(value: string | null | undefined) {
  return value?.trim() || "";
}

function buildBroadProviderArgs(query: string): SourceFetchArgs {
  return {
    query,
    location: "",
    limit: MIN_CACHED_PROVIDER_LIMIT,
    includeRemote: true,
    skipLocalMatch: true,
  };
}

function buildSharedProviderCounts(providerJobs: SharedProviderPayloadMap) {
  const greenhouse = providerJobs.greenhouse.length;
  const lever = providerJobs.lever.length;
  const ashby = providerJobs.ashby.length;
  const workable = providerJobs.workable.length;
  const remotive = providerJobs.remotive.length;
  const remoteok = providerJobs.remoteok.length;

  return {
    greenhouse,
    lever,
    ashby,
    workable,
    remotive,
    remoteok,
    total:
      greenhouse + lever + ashby + workable + remotive + remoteok,
  };
}

function buildSharedProviderSnapshot(providerJobs: SharedProviderPayloadMap): SharedProviderSnapshot {
  return {
    greenhouseJobs: providerJobs.greenhouse,
    leverJobs: providerJobs.lever,
    ashbyJobs: providerJobs.ashby,
    workableJobs: providerJobs.workable,
    remotiveJobs: providerJobs.remotive,
    remoteokJobs: providerJobs.remoteok,
    counts: buildSharedProviderCounts(providerJobs),
  };
}

function getSharedProviderJobsFromSnapshot(snapshot?: SharedProviderSnapshot): SharedProviderPayloadMap {
  return {
    greenhouse: snapshot?.greenhouseJobs ?? [],
    lever: snapshot?.leverJobs ?? [],
    ashby: snapshot?.ashbyJobs ?? [],
    workable: snapshot?.workableJobs ?? [],
    remotive: snapshot?.remotiveJobs ?? [],
    remoteok: snapshot?.remoteokJobs ?? [],
  };
}

async function fetchCompanyProviderJobs(
  companies: readonly string[],
  fetcher: (company: string, args: SourceFetchArgs) => Promise<Job[]>,
  args: SourceFetchArgs
) {
  if (companies.length === 0) return [];

  const settled = await Promise.allSettled(
    companies.map((company) => fetcher(company, args))
  );

  return settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );
}

function preserveLastKnownGoodProviderJobs(
  provider: SharedProviderName | QueryProviderName,
  nextJobs: Job[],
  previousJobs: Job[],
  ageMs: number | null
) {
  if (nextJobs.length > 0 || previousJobs.length === 0) {
    return nextJobs;
  }

  console.warn("[JOB_CACHE] serving stale provider data", {
    provider,
    reason: "refresh-empty",
    ageMs,
  });
  return previousJobs;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function refreshSharedProviderSnapshot(
  request: SharedProviderRequest,
  reason: "cold-start" | "stale" | "interval"
) {
  const store = getJobCacheStore();
  const key = normalizeSharedProviderKey(request);
  const now = Date.now();
  const existing =
    store.sharedProviders.get(key) ??
    {
      key,
      request,
      updatedAt: 0,
      lastAccessedAt: now,
      snapshot: undefined,
      inFlight: undefined,
    };

  existing.request = request;
  existing.lastAccessedAt = now;
  store.sharedProviders.set(key, existing);

  if (existing.inFlight) {
    return existing.inFlight;
  }

  const previousSnapshot = existing.snapshot;
  const previousAgeMs = previousSnapshot ? Date.now() - existing.updatedAt : null;

  existing.inFlight = (async () => {
    const startedAt = Date.now();
    console.log("[JOB_CACHE] shared refresh start", {
      reason,
      query: request.query,
    });

    const broadArgs = buildBroadProviderArgs(request.query);

    const settled = await Promise.allSettled([
      fetchCompanyProviderJobs(GREENHOUSE_COMPANIES, fetchGreenhouse, broadArgs),
      fetchCompanyProviderJobs(LEVER_COMPANIES, fetchLever, broadArgs),
      fetchCompanyProviderJobs(ASHBY_COMPANIES, fetchAshby, broadArgs),
      fetchCompanyProviderJobs(WORKABLE_COMPANIES, fetchWorkable, broadArgs),
      fetchRemotive(broadArgs),
      fetchRemoteOK(broadArgs),
    ]);

    const previousJobs = getSharedProviderJobsFromSnapshot(previousSnapshot);
    const providerJobs: SharedProviderPayloadMap = {
      greenhouse:
        settled[0]?.status === "fulfilled" ? settled[0].value : previousJobs.greenhouse,
      lever: settled[1]?.status === "fulfilled" ? settled[1].value : previousJobs.lever,
      ashby: settled[2]?.status === "fulfilled" ? settled[2].value : previousJobs.ashby,
      workable:
        settled[3]?.status === "fulfilled" ? settled[3].value : previousJobs.workable,
      remotive:
        settled[4]?.status === "fulfilled" ? settled[4].value : previousJobs.remotive,
      remoteok:
        settled[5]?.status === "fulfilled" ? settled[5].value : previousJobs.remoteok,
    };

    providerJobs.greenhouse = preserveLastKnownGoodProviderJobs(
      "greenhouse",
      providerJobs.greenhouse,
      previousJobs.greenhouse,
      previousAgeMs
    );
    providerJobs.lever = preserveLastKnownGoodProviderJobs(
      "lever",
      providerJobs.lever,
      previousJobs.lever,
      previousAgeMs
    );
    providerJobs.ashby = preserveLastKnownGoodProviderJobs(
      "ashby",
      providerJobs.ashby,
      previousJobs.ashby,
      previousAgeMs
    );
    providerJobs.workable = preserveLastKnownGoodProviderJobs(
      "workable",
      providerJobs.workable,
      previousJobs.workable,
      previousAgeMs
    );
    providerJobs.remotive = preserveLastKnownGoodProviderJobs(
      "remotive",
      providerJobs.remotive,
      previousJobs.remotive,
      previousAgeMs
    );
    providerJobs.remoteok = preserveLastKnownGoodProviderJobs(
      "remoteok",
      providerJobs.remoteok,
      previousJobs.remoteok,
      previousAgeMs
    );

    const snapshot = buildSharedProviderSnapshot(providerJobs);

    existing.snapshot = snapshot;
    existing.updatedAt = Date.now();
    existing.lastAccessedAt = Date.now();

    console.log("[JOB_CACHE] shared refresh done", {
      greenhouse: snapshot.counts.greenhouse,
      lever: snapshot.counts.lever,
      ashby: snapshot.counts.ashby,
      workable: snapshot.counts.workable,
      remotive: snapshot.counts.remotive,
      remoteok: snapshot.counts.remoteok,
      total: snapshot.counts.total,
      durationMs: Date.now() - startedAt,
    });

    return snapshot;
  })();

  try {
    return await existing.inFlight;
  } finally {
    existing.inFlight = undefined;
  }
}

async function refreshQueryProviderJobs(
  request: QueryProviderRequest,
  reason: "cold-start" | "stale"
) {
  const store = getJobCacheStore();
  const key = normalizeProviderKey(request);
  const now = Date.now();
  const existing =
    store.queryProviders.get(key) ??
    {
      key,
      request,
      updatedAt: 0,
      lastAccessedAt: now,
      jobs: undefined,
      inFlight: undefined,
    };

  existing.request = request;
  existing.lastAccessedAt = now;
  store.queryProviders.set(key, existing);

  if (existing.inFlight) {
    return existing.inFlight;
  }

  const fetcher: QueryProviderFetcher =
    request.provider === "adzuna" ? fetchAdzuna : fetchUSAJobs;
  const previousJobs = existing.jobs ?? [];
  const previousAgeMs = previousJobs.length > 0 ? Date.now() - existing.updatedAt : null;

  existing.inFlight = (async () => {
    const startedAt = Date.now();
    console.log("[JOB_CACHE] query refresh start", {
      provider: request.provider,
      reason,
      query: request.query,
      location: request.location || null,
      page: request.page,
      limit: request.limit,
      includeRemote: request.includeRemote,
    });

    const jobs = await withTimeout(
      fetcher({
        query: request.query,
        location: request.location,
        page: request.page,
        limit: request.limit,
        includeRemote: request.includeRemote,
      }),
      QUERY_PROVIDER_REFRESH_TIMEOUT_MS,
      `query provider ${request.provider}`
    );

    const stableJobs = preserveLastKnownGoodProviderJobs(
      request.provider,
      jobs,
      previousJobs,
      previousAgeMs
    );

    existing.jobs = stableJobs;
    existing.updatedAt = Date.now();
    existing.lastAccessedAt = Date.now();

    console.log("[JOB_CACHE] query refresh done", {
      provider: request.provider,
      returned: stableJobs.length,
      durationMs: Date.now() - startedAt,
    });

    return stableJobs;
  })();

  try {
    return await existing.inFlight;
  } finally {
    existing.inFlight = undefined;
  }
}

function getQueryProviderTtlMs(jobs: Job[] | undefined) {
  return jobs && jobs.length > 0 ? QUERY_PROVIDER_TTL_MS : EMPTY_QUERY_PROVIDER_TTL_MS;
}

export function ensureSharedProviderRefreshStarted() {
  const store = getJobCacheStore();
  if (store.sharedRefreshTimer) {
    return;
  }

  const timer = setInterval(() => {
    pruneJobCacheStore();

    const currentStore = getJobCacheStore();
    const now = Date.now();
    for (const entry of currentStore.sharedProviders.values()) {
      if (!entry.snapshot) continue;
      if (now - entry.lastAccessedAt > SHARED_PROVIDER_ACTIVE_WINDOW_MS) continue;
      if (isFresh(entry.updatedAt, SHARED_PROVIDER_TTL_MS)) continue;

      void refreshSharedProviderSnapshot(entry.request, "interval");
    }
  }, SHARED_PROVIDER_REFRESH_INTERVAL_MS);

  timer.unref?.();
  store.sharedRefreshTimer = timer;
}

export async function getSharedProviderSnapshot(
  query: string
): Promise<SharedProviderCacheResult> {
  ensureSharedProviderRefreshStarted();

  const request: SharedProviderRequest = {
    query: normalizeQuery(query),
  };
  const key = normalizeSharedProviderKey(request);
  const store = getJobCacheStore();
  const existing = store.sharedProviders.get(key);

  if (existing?.snapshot) {
    existing.lastAccessedAt = Date.now();
    const meta = getCacheMeta(existing.updatedAt, SHARED_PROVIDER_TTL_MS);

    if (meta.fresh) {
      console.log("[JOB_CACHE] shared cache hit", {
        query: request.query,
        ageMs: meta.ageMs,
        fresh: true,
        sharedAcrossPages: true,
      });
      return {
        snapshot: existing.snapshot,
        cache: {
          key,
          hit: true,
          fresh: true,
          stale: false,
          ageMs: meta.ageMs,
        },
      };
    }

    console.log("[JOB_CACHE] shared cache hit", {
      query: request.query,
      ageMs: meta.ageMs,
      fresh: false,
      sharedAcrossPages: true,
    });
    void refreshSharedProviderSnapshot(request, "stale");
    return {
      snapshot: existing.snapshot,
      cache: {
        key,
        hit: true,
        fresh: false,
        stale: true,
        ageMs: meta.ageMs,
      },
    };
  }

  const snapshot = await refreshSharedProviderSnapshot(request, "cold-start");
  return {
    snapshot,
    cache: {
      key,
      hit: false,
      fresh: true,
      stale: false,
      ageMs: 0,
    },
  };
}

export async function getCachedQueryProviderJobs(
  provider: QueryProviderName,
  args: SourceFetchArgs
): Promise<QueryProviderCacheResult> {
  const request: QueryProviderRequest = {
    provider,
    query: normalizeQuery(args.query),
    location: normalizeLocation(args.location),
    page: Math.max(1, args.page ?? 1),
    limit: Math.max(1, args.limit ?? 20),
    includeRemote: args.includeRemote !== false,
  };
  const key = normalizeProviderKey(request);
  const store = getJobCacheStore();
  const existing = store.queryProviders.get(key);
  const existingTtl = getQueryProviderTtlMs(existing?.jobs);

  if (existing?.jobs) {
    existing.lastAccessedAt = Date.now();
    const meta = getCacheMeta(existing.updatedAt, existingTtl);

    if (meta.fresh) {
      return {
        jobs: existing.jobs,
        cache: {
          provider,
          key,
          hit: true,
          fresh: true,
          stale: false,
          ageMs: meta.ageMs,
        },
      };
    }

    void refreshQueryProviderJobs(request, "stale");
    return {
      jobs: existing.jobs,
      cache: {
        provider,
        key,
        hit: true,
        fresh: false,
        stale: true,
        ageMs: meta.ageMs,
      },
    };
  }

  const jobs = await refreshQueryProviderJobs(request, "cold-start");
  return {
    jobs,
    cache: {
      provider,
      key,
      hit: false,
      fresh: true,
      stale: false,
      ageMs: 0,
    },
  };
}
