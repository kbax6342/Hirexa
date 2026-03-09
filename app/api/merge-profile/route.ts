import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";

export async function POST() {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;
    if (!guestId) {
      return NextResponse.json({ ok: true, merged: false, reason: "No guestId cookie" });
    }

    const result = await prisma.$transaction((tx) =>
      mergeGuestProfileIntoUserProfile(tx, {
        userId,
        guestId,
        email: session?.user?.email ?? null,
      })
    );

    invalidateCachedProfile({ userId, guestId });

    const response = NextResponse.json({
      ok: true,
      merged: result.merged,
      mode: result.mode,
      profileId: result.profileId,
    });

    if (result.merged) {
      response.cookies.set("guest_user_id", "", {
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Merge failed" },
      { status: 500 }
    );
  }
}
