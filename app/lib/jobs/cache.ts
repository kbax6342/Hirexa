import type { Job } from "./types";

export const SHARED_PROVIDER_TTL_MS = 5 * 60 * 1000;
export const SHARED_PROVIDER_ACTIVE_WINDOW_MS = 30 * 60 * 1000;
export const QUERY_PROVIDER_TTL_MS = 4 * 60 * 1000;
export const EMPTY_QUERY_PROVIDER_TTL_MS = 30 * 1000;
export const RESPONSE_TTL_MS = 90 * 1000;

export type SharedProviderName =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "remotive"
  | "remoteok";

export type QueryProviderName = "adzuna" | "usajobs";

export type SharedProviderCounts = Record<SharedProviderName, number> & {
  total: number;
};

export type SharedProviderSnapshot = {
  greenhouseJobs: Job[];
  leverJobs: Job[];
  ashbyJobs: Job[];
  workableJobs: Job[];
  remotiveJobs: Job[];
  remoteokJobs: Job[];
  counts: SharedProviderCounts;
};

export type SharedProviderRequest = {
  query: string;
};

export type QueryProviderRequest = {
  provider: QueryProviderName;
  query: string;
  location: string;
  page: number;
  limit: number;
  includeRemote: boolean;
};

export type SmartMatchesResponseRequest = {
  userId: string;
  query: string;
  location: string;
  page: number;
  limit: number;
  cursor: string;
  searchFingerprint: string;
};

export type SharedProviderCacheEntry = {
  key: string;
  request: SharedProviderRequest;
  snapshot?: SharedProviderSnapshot;
  updatedAt: number;
  lastAccessedAt: number;
  inFlight?: Promise<SharedProviderSnapshot>;
};

export type QueryProviderCacheEntry = {
  key: string;
  request: QueryProviderRequest;
  jobs?: Job[];
  updatedAt: number;
  lastAccessedAt: number;
  inFlight?: Promise<Job[]>;
};

export type ResponseCacheEntry<T> = {
  key: string;
  payload: T;
  updatedAt: number;
};

type JobCacheStore = {
  sharedProviders: Map<string, SharedProviderCacheEntry>;
  queryProviders: Map<string, QueryProviderCacheEntry>;
  responses: Map<string, ResponseCacheEntry<unknown>>;
  sharedRefreshTimer?: ReturnType<typeof setInterval>;
};

type GlobalJobCache = typeof globalThis & {
  __hirexaJobCache__?: JobCacheStore;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function createJobCacheStore(): JobCacheStore {
  return {
    sharedProviders: new Map(),
    queryProviders: new Map(),
    responses: new Map(),
  };
}

export function getJobCacheStore() {
  const globalJobCache = globalThis as GlobalJobCache;
  if (!globalJobCache.__hirexaJobCache__) {
    globalJobCache.__hirexaJobCache__ = createJobCacheStore();
  }

  return globalJobCache.__hirexaJobCache__;
}

export function normalizeSharedProviderKey(request: SharedProviderRequest) {
  return JSON.stringify({
    query: normalizeText(request.query) || "jobs",
  });
}

export function normalizeProviderKey(request: QueryProviderRequest) {
  return JSON.stringify({
    provider: request.provider,
    query: normalizeText(request.query) || "jobs",
    location: normalizeText(request.location),
    page: Math.max(1, request.page),
    limit: Math.max(1, request.limit),
    includeRemote: request.includeRemote,
  });
}

export function normalizeSmartMatchesKey(request: SmartMatchesResponseRequest) {
  return JSON.stringify({
    userId: request.userId || "anon",
    query: normalizeText(request.query) || "jobs",
    location: normalizeText(request.location),
    page: Math.max(0, request.page),
    limit: Math.max(1, request.limit),
    cursor: request.cursor.trim(),
    searchFingerprint: request.searchFingerprint.trim(),
  });
}

export function getCacheMeta(updatedAt: number | null | undefined, ttlMs: number) {
  if (!updatedAt) {
    return {
      ageMs: null,
      fresh: false,
      stale: false,
    };
  }

  const ageMs = Date.now() - updatedAt;
  return {
    ageMs,
    fresh: ageMs < ttlMs,
    stale: ageMs >= ttlMs,
  };
}

export function isFresh(updatedAt: number, ttlMs: number) {
  return getCacheMeta(updatedAt, ttlMs).fresh;
}

export function isStale(updatedAt: number, ttlMs: number) {
  return getCacheMeta(updatedAt, ttlMs).stale;
}

export function readSmartMatchesResponseCache<T>(key: string) {
  const store = getJobCacheStore();
  const entry = store.responses.get(key) as ResponseCacheEntry<T> | undefined;
  if (!entry) {
    return {
      hit: false,
      payload: null as T | null,
      ageMs: null as number | null,
    };
  }

  const { fresh, ageMs } = getCacheMeta(entry.updatedAt, RESPONSE_TTL_MS);
  if (!fresh) {
    store.responses.delete(key);
    return {
      hit: false,
      payload: null as T | null,
      ageMs,
    };
  }

  return {
    hit: true,
    payload: entry.payload,
    ageMs,
  };
}

export function writeSmartMatchesResponseCache<T>(key: string, payload: T) {
  const store = getJobCacheStore();
  store.responses.set(key, {
    key,
    payload,
    updatedAt: Date.now(),
  });
}

export function pruneJobCacheStore() {
  const store = getJobCacheStore();
  const now = Date.now();

  for (const [key, entry] of store.responses.entries()) {
    if (now - entry.updatedAt > RESPONSE_TTL_MS * 4) {
      store.responses.delete(key);
    }
  }

  for (const [key, entry] of store.queryProviders.entries()) {
    if (now - entry.lastAccessedAt > SHARED_PROVIDER_ACTIVE_WINDOW_MS) {
      store.queryProviders.delete(key);
    }
  }

  for (const [key, entry] of store.sharedProviders.entries()) {
    if (now - entry.lastAccessedAt > SHARED_PROVIDER_ACTIVE_WINDOW_MS) {
      store.sharedProviders.delete(key);
    }
  }
}
