const PROFILE_CACHE_TTL_MS = 60_000;

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const profileCache = new Map<string, CacheEntry<unknown>>();

function toCacheKey(userId: string | null, guestId: string | null) {
  if (userId) return `user:${userId}`;
  if (guestId) return `guest:${guestId}`;
  return null;
}

export function getCachedProfile<T>(params: { userId: string | null; guestId: string | null }) {
  const key = toCacheKey(params.userId, params.guestId);
  if (!key) return null;

  const hit = profileCache.get(key);
  if (!hit) return null;

  if (hit.expiresAt <= Date.now()) {
    profileCache.delete(key);
    return null;
  }

  return hit.data as T;
}

export function setCachedProfile<T>(params: {
  userId: string | null;
  guestId: string | null;
  data: T;
}) {
  const key = toCacheKey(params.userId, params.guestId);
  if (!key) return;

  profileCache.set(key, {
    data: params.data,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });
}

export function invalidateCachedProfile(params: { userId: string | null; guestId: string | null }) {
  const key = toCacheKey(params.userId, params.guestId);
  if (!key) return;

  profileCache.delete(key);
}

