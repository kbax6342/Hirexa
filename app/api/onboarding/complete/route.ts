// /app/api/onboarding/complete/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;

    if (!guestId) {
      return NextResponse.json(
        { ok: false, error: "Missing guest session." },
        { status: 400 }
      );
    }

    const profile = await prisma.userProfile.findUnique({
      where: { guestId },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Profile not found." },
        { status: 404 }
      );
    }

    if (profile.userId) {
      return NextResponse.json({ ok: true, userId: profile.userId, guestId });
    }

    const name = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    try {
      const user = await prisma.user.create({
        data: {
          name: name || null,
          email: profile.email ?? null,
          isGuest: true,
          userProfile: { connect: { id: profile.id } },
        },
      });

      return NextResponse.json({ ok: true, userId: user.id, guestId });
    } catch (err) {
      if (profile.email) {
        const existing = await prisma.user.findUnique({
          where: { email: profile.email },
          select: { id: true },
        });

        if (existing) {
          await prisma.userProfile.update({
            where: { id: profile.id },
            data: { userId: existing.id },
          });

          return NextResponse.json({
            ok: true,
            userId: existing.id,
            guestId,
            reused: true,
          });
        }
      }

      throw err;
    }
  } catch (err) {
    console.error("POST /api/onboarding/complete failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to complete onboarding." },
      { status: 500 }
    );
  }
}
