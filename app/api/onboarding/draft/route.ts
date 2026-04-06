import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  readOnboardingDraftPayload,
  updateOnboardingDraftPayload,
} from "@/app/lib/onboarding/draft-session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);

    if (!draft) {
      return NextResponse.json({ ok: true, draft: null });
    }

    return NextResponse.json({
      ok: true,
      draft: {
        id: draft.id,
        guestId: pickDraftGuestId({ cookieStore, draft }),
        status: draft.status,
        lastStep: draft.lastStep,
        payload: readOnboardingDraftPayload(draft.payload),
        expiresAt: draft.expiresAt,
        updatedAt: draft.updatedAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load onboarding draft.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);

    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "Missing onboarding draft." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const payloadPatch =
      body && typeof body === "object" && !Array.isArray(body) && body.payload
        ? body.payload
        : body;

    const updatedDraft = await updateOnboardingDraftPayload({
      draftToken: draft.draftToken,
      payloadPatch:
        payloadPatch && typeof payloadPatch === "object" && !Array.isArray(payloadPatch)
          ? payloadPatch
          : {},
      lastStep:
        typeof body?.lastStep === "string" ? body.lastStep.trim() || null : undefined,
      guestId: pickDraftGuestId({ cookieStore, draft }),
    });

    return NextResponse.json({
      ok: true,
      draft: updatedDraft
        ? {
            id: updatedDraft.id,
            guestId: pickDraftGuestId({ cookieStore, draft: updatedDraft }),
            status: updatedDraft.status,
            lastStep: updatedDraft.lastStep,
            payload: readOnboardingDraftPayload(updatedDraft.payload),
            expiresAt: updatedDraft.expiresAt,
            updatedAt: updatedDraft.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save onboarding draft.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const cookieStore = await cookies();
    const draft = await getActiveOnboardingDraftForCookies(cookieStore);

    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "Missing onboarding draft." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const updatedDraft = await updateOnboardingDraftPayload({
      draftToken: draft.draftToken,
      payloadPatch: {},
      lastStep:
        typeof body?.lastStep === "string" ? body.lastStep.trim() || null : undefined,
    });

    return NextResponse.json({
      ok: true,
      draft: updatedDraft
        ? {
            id: updatedDraft.id,
            guestId: pickDraftGuestId({ cookieStore, draft: updatedDraft }),
            status: updatedDraft.status,
            lastStep: updatedDraft.lastStep,
            payload: readOnboardingDraftPayload(updatedDraft.payload),
            expiresAt: updatedDraft.expiresAt,
            updatedAt: updatedDraft.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to update onboarding draft.",
      },
      { status: 500 }
    );
  }
}
