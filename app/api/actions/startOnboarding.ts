"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  bootstrapOnboardingDraftSession,
} from "@/app/lib/onboarding/draft-session";

export async function startOnboarding() {
  const cookieStore = await cookies();
  await bootstrapOnboardingDraftSession({
    cookieStore,
    responseCookies: cookieStore,
  });

  redirect("/onboarding/profile");
}
