"use server";

import { redirect } from "next/navigation";

export async function startOnboarding() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set");
  }

  const res = await fetch(`${baseUrl}/api/onboarding/start`, {
    method: "POST",
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to start onboarding: ${res.status} ${text}`);
  }

  redirect("/questions/step2");
}
