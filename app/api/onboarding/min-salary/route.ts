import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const compensationType = body?.compensationType === "hourly" ? "hourly" : "yearly";
    const minCompRaw = Number(body?.minCompensation);
    const minCompensation = Math.round(minCompRaw);

    if (!Number.isFinite(minCompensation) || minCompensation <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid min compensation" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "No session (user or guest)" }, { status: 401 });
    }

    // ✅ ensure profile exists
    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true, userId: true, guestId: true },
    });

    // ✅ save to cookies/session so the final page can read it
    c.set("min_comp_type", compensationType, { httpOnly: true, sameSite: "lax", path: "/" });
    c.set("min_comp_value", String(minCompensation), { httpOnly: true, sameSite: "lax", path: "/" });
    c.set("onboarding_min_salary_saved", "1", { httpOnly: true, sameSite: "lax", path: "/" });

    // ✅ save to DB user profile
    const updated = await prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        minCompensation,
        compensationType,
      },
      select: { id: true, minCompensation: true, compensationType: true },
    });

    // ✅ proof printout
    return NextResponse.json({
      ok: true,
      profileId: profile.id,
      userId: profile.userId ?? null,
      guestId: profile.guestId ?? guestId ?? null,
      savedToCookies: {
        min_comp_type: compensationType,
        min_comp_value: String(minCompensation),
        onboarding_min_salary_saved: "1",
      },
      savedToProfile: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
