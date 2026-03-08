import "server-only";

import { randomUUID } from "crypto";

import { prisma } from "@/app/lib/prisma";

export const GUEST_USER_COOKIE = "guest_user_id";

export function getGuestUserCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

export async function ensureGuestOnboardingProfile(guestId?: string | null) {
  const resolvedGuestId = guestId?.trim() || `guest_${randomUUID()}`;

  await prisma.userProfile.upsert({
    where: { guestId: resolvedGuestId },
    create: { guestId: resolvedGuestId },
    update: {},
  });

  return resolvedGuestId;
}
