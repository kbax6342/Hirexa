import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  ensureGuestOnboardingProfile,
  getGuestUserCookieOptions,
  GUEST_USER_COOKIE,
} from "@/app/lib/onboarding/start";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const existingGuestId = cookieStore.get(GUEST_USER_COOKIE)?.value;
    const guestId = await ensureGuestOnboardingProfile(existingGuestId);

    const response = NextResponse.json({ ok: true, guestId });
    if (!existingGuestId) {
      response.cookies.set(
        GUEST_USER_COOKIE,
        guestId,
        getGuestUserCookieOptions()
      );
    }

    return response;
  } catch (error: unknown) {
    console.error("Failed to start onboarding:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
