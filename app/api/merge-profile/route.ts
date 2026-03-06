// app/api/onboarding/merge-profile/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function POST() {
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    // If no guest profile, nothing to merge — still OK
    if (!guestId) {
      return NextResponse.json({ ok: true, merged: false, reason: "No guestId cookie" });
    }

    // Find guest profile
    const guestProfile = await prisma.userProfile.findUnique({
      where: { guestId },
    });

    if (!guestProfile) {
      return NextResponse.json({ ok: true, merged: false, reason: "No guest profile" });
    }

    // If user already has a profile, merge into it
    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (userProfile) {
      const merged = await prisma.userProfile.update({
        where: { id: userProfile.id },
        data: {
          // merge fields safely (keep user values if present)
          skills: userProfile.skills.length ? userProfile.skills : guestProfile.skills,
          resumeSkills: userProfile.resumeSkills.length ? userProfile.resumeSkills : guestProfile.resumeSkills,
          minCompensation: userProfile.minCompensation ?? guestProfile.minCompensation,
          compensationType: userProfile.compensationType ?? guestProfile.compensationType,
          firstName: userProfile.firstName ?? guestProfile.firstName,
          lastName: userProfile.lastName ?? guestProfile.lastName,
          phone: userProfile.phone ?? guestProfile.phone,

          // IMPORTANT: keep email from account (or guest if user missing)
          email: userProfile.email ?? guestProfile.email,

          // If you added these fields:
          // workplaceLocations: userProfile.workplaceLocations ?? guestProfile.workplaceLocations,
          // includeRemote: userProfile.includeRemote ?? guestProfile.includeRemote,

          guestId: null, // detach
        },
      });

      // delete guest profile
      await prisma.userProfile.delete({ where: { id: guestProfile.id } });

      // clear guest cookie (optional)
      const res = NextResponse.json({ ok: true, merged: true, mode: "merged_into_existing", profileId: merged.id });
      res.cookies.set("guest_user_id", "", { path: "/", maxAge: 0 });
      return res;
    }

    // If user does NOT have a profile yet, simply convert guest profile to user profile
    const converted = await prisma.userProfile.update({
      where: { id: guestProfile.id },
      data: {
        userId,
        guestId: null,
      },
    });

    const res = NextResponse.json({ ok: true, merged: true, mode: "converted_guest_to_user", profileId: converted.id });
    res.cookies.set("guest_user_id", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Merge failed" }, { status: 500 });
  }
}
