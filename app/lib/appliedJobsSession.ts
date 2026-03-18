export const APPLIED_JOBS_SESSION_KEY = "hirexa_applied_jobs_session";

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function loadAppliedJobsSession<T>() {
  if (!canUseSessionStorage()) return [] as T[];

  try {
    const raw = window.sessionStorage.getItem(APPLIED_JOBS_SESSION_KEY);
    if (!raw) return [] as T[];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : ([] as T[]);
  } catch {
    return [] as T[];
  }
}

export function saveAppliedJobsSession<T>(jobs: T[]) {
  if (!canUseSessionStorage()) return;

  try {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      window.sessionStorage.removeItem(APPLIED_JOBS_SESSION_KEY);
      return;
    }

    window.sessionStorage.setItem(APPLIED_JOBS_SESSION_KEY, JSON.stringify(jobs));
  } catch {
    // Ignore storage quota and browser privacy errors.
  }
}

export function clearAppliedJobsSession() {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.removeItem(APPLIED_JOBS_SESSION_KEY);
  } catch {
    // Ignore storage quota and browser privacy errors.
  }
}
