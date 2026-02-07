import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { randomUUID } from "crypto";

export async function POST() {
  const guestEmail = `guest_${randomUUID()}@guest.hirexa.local`;

  const user = await prisma.user.create({
    data: {
      email: guestEmail,
      isGuest: true,
      userProfile: { create: {} },
    },
    select: { id: true },
  });

  const res = NextResponse.json({ ok: true });

  // ✅ cookies().set works HERE
  res.cookies.set("guest_user_id", user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });

  return res;
}
