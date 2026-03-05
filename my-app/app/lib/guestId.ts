"use client";

const GUEST_ID_KEY = "hirexa_guest_id";

export function getOrCreateGuestId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;

  const next = crypto.randomUUID();
  window.localStorage.setItem(GUEST_ID_KEY, next);
  return next;
}

export { GUEST_ID_KEY };
