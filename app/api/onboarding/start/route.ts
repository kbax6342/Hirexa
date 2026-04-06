import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  clearOnboardingCookies,
  getActiveOnboardingDraftForCookies,
  ensureOnboardingDraft,
  markOnboardingDraftStatus,
  setGuestOnboardingCookie,
  setOnboardingDraftCookie,
} from "@/app/lib/onboarding/draft-session";
import { GUEST_USER_COOKIE, getOrCreateGuestOnboardingId } from "@/app/lib/onboarding/start";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const body = await req.json().catch(() => null);
    const url = new URL(req.url);
    const freshStart =
      body?.freshStart === true ||
      url.searchParams.get("fresh") === "1" ||
      url.searchParams.get("fresh") === "true";
    const currentDraft = await getActiveOnboardingDraftForCookies(cookieStore);

    if (freshStart && currentDraft) {
      await markOnboardingDraftStatus({
        draftToken: currentDraft.draftToken,
        status: "abandoned",
      });
    }

    const existingDraft = freshStart ? null : currentDraft;
    const guestId = existingDraft?.guestId
      ? existingDraft.guestId
      : getOrCreateGuestOnboardingId(
          existingDraft
            ? cookieStore.get(GUEST_USER_COOKIE)?.value ?? null
            : null
        );
    const draft = await ensureOnboardingDraft({
      existingDraftToken: existingDraft?.draftToken ?? null,
      guestId,
      fresh: freshStart || !existingDraft,
    });

    const response = NextResponse.json({
      ok: true,
      guestId,
      draftToken: draft.draftToken,
      resumed: Boolean(existingDraft),
    });

    if (freshStart || !existingDraft) {
      clearOnboardingCookies(response.cookies, { includeGuestCookie: true });
    }
    setGuestOnboardingCookie(response.cookies, guestId);
    setOnboardingDraftCookie(response.cookies, draft.draftToken);
    response.headers.set(
      "x-hirexa-onboarding-fresh",
      freshStart || !existingDraft ? "1" : "0"
    );

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
