import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  abandonOnboardingDraft,
  clearOnboardingCookies,
} from "@/app/lib/onboarding/draft-session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    await abandonOnboardingDraft(cookieStore);

    const response = NextResponse.json({ ok: true });
    clearOnboardingCookies(response.cookies, { includeGuestCookie: true });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to exit onboarding.",
      },
      { status: 500 }
    );
  }
}
