"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ensureGuestOnboardingProfile,
  getGuestUserCookieOptions,
  GUEST_USER_COOKIE,
} from "@/app/lib/onboarding/start";

export async function startOnboarding() {
  const cookieStore = await cookies();
  const existingGuestId = cookieStore.get(GUEST_USER_COOKIE)?.value;
  const guestId = await ensureGuestOnboardingProfile(existingGuestId);

  if (!existingGuestId) {
    cookieStore.set(GUEST_USER_COOKIE, guestId, getGuestUserCookieOptions());
  }

  redirect("/questions/step2");
}
