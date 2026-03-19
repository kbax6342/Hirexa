import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { syncLoopsContact } from "@/app/lib/email/loops";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;
    const body = (await request.json().catch(() => null)) as { email?: string } | null;
    const email = normalizeEmail(body?.email);

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }

    const newsletterData = {
      newsletterOptIn: true,
      newsletterSource: "newsletter/page",
      unsubscribedAt: null,
    } as const;

    let profileId: string | null = null;
    let profileFirstName: string | null = null;
    let profileLastName: string | null = null;

    if (userId) {
      const profile = await prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          email,
          subscriptionEmail: email,
          ...newsletterData,
        },
        update: {
          email,
          subscriptionEmail: email,
          ...newsletterData,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      profileId = profile.id;
      profileFirstName = profile.firstName;
      profileLastName = profile.lastName;
    } else if (guestId) {
      const profile = await prisma.userProfile.upsert({
        where: { guestId },
        create: {
          guestId,
          email,
          subscriptionEmail: email,
          ...newsletterData,
        },
        update: {
          email,
          subscriptionEmail: email,
          ...newsletterData,
        },
        select: { id: true, firstName: true, lastName: true },
      });
      profileId = profile.id;
      profileFirstName = profile.firstName;
      profileLastName = profile.lastName;
    } else {
      const existingProfile = await prisma.userProfile.findFirst({
        where: { email },
        orderBy: { updatedAt: "desc" },
        select: { id: true, firstName: true, lastName: true },
      });

      if (existingProfile) {
        const profile = await prisma.userProfile.update({
          where: { id: existingProfile.id },
          data: {
            email,
            subscriptionEmail: email,
            ...newsletterData,
          },
          select: { id: true, firstName: true, lastName: true },
        });
        profileId = profile.id;
        profileFirstName = profile.firstName;
        profileLastName = profile.lastName;
      } else {
        const profile = await prisma.userProfile.create({
          data: {
            email,
            subscriptionEmail: email,
            ...newsletterData,
          },
          select: { id: true, firstName: true, lastName: true },
        });
        profileId = profile.id;
        profileFirstName = profile.firstName;
        profileLastName = profile.lastName;
      }
    }

    await syncLoopsContact({
      email,
      userId: userId ?? guestId,
      firstName: profileFirstName,
      lastName: profileLastName,
      source: newsletterData.newsletterSource,
      subscribed: true,
      userGroup: userId ? "hirexa_users" : guestId ? "hirexa_guests" : "newsletter_leads",
    });

    return NextResponse.json({
      ok: true,
      profileId,
      message: "You’re subscribed to the Hirexa AI newsletter.",
    });
  } catch (error) {
    console.error("[newsletter] subscribe failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Unable to subscribe right now. Please try again." },
      { status: 500 }
    );
  }
}
