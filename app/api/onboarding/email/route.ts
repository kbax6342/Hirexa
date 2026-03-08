import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";

// Canonical source of truth: UserProfile.email (subscriptionEmail mirrors email for billing use).
function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;
    const cookieEmail = normalizeEmail(c.get("onboarding_email")?.value ?? "");

    if (!userId && !guestId) {
      return NextResponse.json({ ok: true, email: cookieEmail || null });
    }

    const profile = await prisma.userProfile.findFirst({
      where: userId ? { userId } : { guestId: guestId as string },
      select: { email: true, subscriptionEmail: true },
    });

    const email = normalizeEmail(profile?.email ?? profile?.subscriptionEmail ?? cookieEmail);

    return NextResponse.json({ ok: true, email: email || null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load email" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    let guestId = c.get("guest_user_id")?.value ?? null;
    const shouldSetGuestCookie = !guestId;

    if (!guestId) {
      guestId = `guest_${crypto.randomUUID()}`;
    }

    const body = await req.json().catch(() => null);
    const email = normalizeEmail(body?.email);

    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!okEmail) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    // ✅ Treat hitting this page as explicit opt-in
    const newsletterOptIn = true;
    const newsletterSource = "onboarding/job-alerts";

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      update: {
        email,
        subscriptionEmail: email,
        newsletterOptIn,
        newsletterSource,
        // emailVerifiedAt: null, // keep null unless you add verification
        // unsubscribedAt: null,  // only set when they unsubscribe
      },
      create: userId
        ? { userId, email, subscriptionEmail: email, newsletterOptIn, newsletterSource }
        : { guestId: guestId!, email, subscriptionEmail: email, newsletterOptIn, newsletterSource },
      select: {
        id: true,
        userId: true,
        guestId: true,
        email: true,
        subscriptionEmail: true,
        newsletterOptIn: true,
        newsletterSource: true,
        emailVerifiedAt: true,
        unsubscribedAt: true,
      },
    });

    console.info("[onboarding/email] saved", {
      userId,
      guestId,
      email,
    });

    const res = NextResponse.json({
      ok: true,
      email,
      proof: {
        session: { userId, guestId },
        savedToProfile: profile,
        cookiesSet: {
          onboarding_email: email,
          newsletter_opt_in: String(newsletterOptIn),
        },
      },
    });

    if (shouldSetGuestCookie) {
      res.cookies.set("guest_user_id", guestId!, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    // ✅ Cookies: httpOnly so they’re safe (client JS cannot read them)
    res.cookies.set("onboarding_email", email, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    });

    res.cookies.set("newsletter_opt_in", String(newsletterOptIn), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to save email" },
      { status: 500 }
    );
  }
}
