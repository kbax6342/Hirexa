import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import {
  getOnboardingStatusForUser,
  onboardingStatusSelect,
} from "@/app/lib/onboarding/status";
import {
  ONBOARDING_PROFILE_ROUTE,
  QUESTIONS_CLIENTS_ROUTE,
  RESUME_ROUTE,
} from "@/app/lib/onboarding-flow";
import { prisma } from "@/app/lib/prisma";
import {
  ensureGuestOnboardingProfile,
  getGuestUserCookieOptions,
  GUEST_USER_COOKIE,
} from "@/app/lib/onboarding/start";

export const runtime = "nodejs";

async function getUserId() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return userId ?? null;
}

function hasSavedKeyQuestions(
  profile:
    | {
        questionsCompleted?: boolean | null;
        keyQuestions?: unknown;
      }
    | null
    | undefined
) {
  return Boolean(profile?.questionsCompleted || profile?.keyQuestions);
}

function getKeyQuestionsNextPath(
  profile:
    | {
        questionsCompleted?: boolean | null;
        keyQuestions?: unknown;
        registrationStatus?: string | null;
      }
    | null
    | undefined
) {
  if (!profile?.registrationStatus || profile.registrationStatus === "pending_verification") {
    return ONBOARDING_PROFILE_ROUTE;
  }

  if (!hasSavedKeyQuestions(profile)) {
    return QUESTIONS_CLIENTS_ROUTE;
  }

  return RESUME_ROUTE;
}

export async function GET() {
  try {
    const userId = await getUserId();
    const cookieStore = await cookies();
    const guestId = cookieStore.get(GUEST_USER_COOKIE)?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json(
        { completed: false, data: null, nextPath: ONBOARDING_PROFILE_ROUTE },
        { status: 200 }
      );
    }

    if (userId) {
      const onboarding = await getOnboardingStatusForUser(userId);
      const keyQuestions =
        (onboarding.profile?.keyQuestions as Record<string, unknown> | null) ?? null;
      const completed = onboarding.completed;
      const nextPath = completed
        ? "/dashboard"
        : onboarding.nextPath ?? getKeyQuestionsNextPath(onboarding.profile);

      return NextResponse.json(
        { completed, data: keyQuestions, nextPath },
        { status: 200 }
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { guestId: guestId as string },
      select: onboardingStatusSelect,
    });
    const keyQuestions =
      (profile?.keyQuestions as Record<string, unknown> | null) ?? null;
    const nextPath = getKeyQuestionsNextPath(profile);

    return NextResponse.json(
      { completed: false, data: keyQuestions, nextPath },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error in GET key-questions.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    const cookieStore = await cookies();
    let guestId = cookieStore.get(GUEST_USER_COOKIE)?.value ?? null;
    const shouldSetGuestCookie = !userId && !guestId;

    if (!userId && !guestId) {
      guestId = await ensureGuestOnboardingProfile(null);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const payload = {
      authorizedUS: String(body.authorizedUS ?? "").trim(),
      sponsorship: String(body.sponsorship ?? "").trim(),
      startDate: String(body.startDate ?? "").trim(),
      screening: String(body.screening ?? "").trim(),
      relocate: String(body.relocate ?? "").trim(),
      gender: String(body.gender ?? "").trim(),
      pronouns: String(body.pronouns ?? "").trim(),
      ethnicity: String(body.ethnicity ?? "").trim(),
      disability: String(body.disability ?? "").trim(),
      veteran: String(body.veteran ?? "").trim(),
    };

    if (!payload.authorizedUS || !payload.sponsorship) {
      return NextResponse.json(
        { error: "Please answer the required questions." },
        { status: 400 }
      );
    }

    const where = userId ? { userId } : { guestId: guestId as string };
    const createScope = userId ? { userId } : { guestId: guestId as string };

    await prisma.userProfile.upsert({
      where,
      create: {
        ...createScope,
        questionsCompleted: true,
        registrationStatus: "QUESTIONS_COMPLETE_PENDING_BENEFITS",
        keyQuestions: payload,
        ...payload,
      },
      update: {
        questionsCompleted: true,
        registrationStatus: "QUESTIONS_COMPLETE_PENDING_BENEFITS",
        keyQuestions: payload,
        ...payload,
      },
      select: { id: true },
    });

    const nextPath = RESUME_ROUTE;

    const response = NextResponse.json({ ok: true, nextPath }, { status: 200 });

    if (shouldSetGuestCookie && guestId) {
      response.cookies.set(GUEST_USER_COOKIE, guestId, getGuestUserCookieOptions());
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error in POST key-questions.",
      },
      { status: 500 }
    );
  }
}
