"use client";

const HIREXA_GUEST_KEY = "hirexa_guest_id";

export function getOrCreateGuestId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(HIREXA_GUEST_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(HIREXA_GUEST_KEY, created);
  return created;
}
