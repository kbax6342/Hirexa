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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();

    // basic validation
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // upsert profile by userId (if logged in) else guestId
    await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      update: { email },
      create: userId ? { userId, email } : { guestId: guestId!, email },
      select: { id: true },
    });

    // Optional: store email in a cookie too (nice for UX / prefill)
    const res = NextResponse.json({ ok: true });
    res.cookies.set("onboarding_email", email, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14, // 14 days
    });

    return res;
  } catch {
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }
}
