import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { sendRegistrationConfirmedEmailIfNeeded } from "@/app/lib/email/lifecycle";
import { syncLoopsContact } from "@/app/lib/email/loops";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  updateOnboardingDraftPayload,
} from "@/app/lib/onboarding/draft-session";

function normalizeEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;
    const draft = !userId ? await getActiveOnboardingDraftForCookies(c) : null;

    if (!userId && !guestId && !draft) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const email = normalizeEmail(body?.email ?? body?.normalizedEmail);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    if (!userId && draft) {
      await updateOnboardingDraftPayload({
        draftToken: draft.draftToken,
        payloadPatch: {
          onboardingEmail: {
            email,
            confirmed: true,
          },
          profile: {
            email,
          },
          signup: {
            email,
          },
        },
        guestId: pickDraftGuestId({ cookieStore: c, draft }),
      });

      const res = NextResponse.json({
        ok: true,
        proof: {
          userId: null,
          guestId: pickDraftGuestId({ cookieStore: c, draft }),
          email,
          savedToDraft: true,
        },
      });

      res.cookies.set("onboarding_email", email, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      });

      return res;
    }

    /* -----------------------------------------------------
       1) UPSERT PROFILE (SAFE FOR USER OR GUEST)
    ----------------------------------------------------- */
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId
        ? { userId, email, subscriptionEmail: email }
        : { guestId: guestId!, email, subscriptionEmail: email },
      update: { email, subscriptionEmail: email },
      select: {
        id: true,
        userId: true,
        guestId: true,
        email: true,
        firstName: true,
        lastName: true,
        welcomeEmailSentAt: true,
      },
    });

    await syncLoopsContact({
      email,
      userId: userId ?? guestId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      source: "onboarding/confirm-email",
      userGroup: userId ? "hirexa_users" : "hirexa_guests",
    });

    /* -----------------------------------------------------
       2) UPDATE USER EMAIL (ONLY IF LOGGED IN)
       – HARD BLOCK DUPLICATES (NO P2002)
    ----------------------------------------------------- */
    if (userId) {
      const owner = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (owner && owner.id !== userId) {
        return NextResponse.json(
          {
            ok: false,
            error: "Email already in use. Please log in instead.",
            proof: {
              email,
              emailOwnerUserId: owner.id,
              currentUserId: userId,
            },
          },
          { status: 409 }
        );
      }

      await prisma.user.update({
        where: { id: userId },
        data: { email },
        select: { id: true },
      });
    }

    /* -----------------------------------------------------
       3) SEND WELCOME EMAIL (ONCE ONLY)
    ----------------------------------------------------- */
    if (profile.id) {
      await sendRegistrationConfirmedEmailIfNeeded(profile.id).catch((emailErr) => {
        console.warn("Welcome email failed:", emailErr);
      });
    }

    /* -----------------------------------------------------
       4) SET COOKIE FOR ONBOARDING CONTINUITY
    ----------------------------------------------------- */
    const res = NextResponse.json({
      ok: true,
      proof: {
        userId,
        guestId,
        profileId: profile.id,
        email,
      },
    });

    res.cookies.set("onboarding_email", email, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14, // 14 days
    });

    return res;
  } catch (e: any) {
    console.error("confirm-email error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save email" },
      { status: 500 }
    );
  }
}
