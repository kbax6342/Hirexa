import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { auth } from "../../../lib/auth";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();

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
        newsletterOptIn,
        newsletterSource,
        // emailVerifiedAt: null, // keep null unless you add verification
        // unsubscribedAt: null,  // only set when they unsubscribe
      },
      create: userId
        ? { userId, email, newsletterOptIn, newsletterSource }
        : { guestId: guestId!, email, newsletterOptIn, newsletterSource },
      select: {
        id: true,
        userId: true,
        guestId: true,
        email: true,
        newsletterOptIn: true,
        newsletterSource: true,
        emailVerifiedAt: true,
        unsubscribedAt: true,
      },
    });

    const res = NextResponse.json({
      ok: true,
      proof: {
        session: { userId, guestId },
        savedToProfile: profile,
        cookiesSet: {
          onboarding_email: email,
          newsletter_opt_in: String(newsletterOptIn),
        },
      },
    });

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
