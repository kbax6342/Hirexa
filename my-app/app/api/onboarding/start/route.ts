import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST() {

  try {
    const c = await cookies();
  let guestId = c.get("guest_user_id")?.value;

  if (!guestId) {
    guestId = `guest_${randomUUID()}`;
  }

  // ensure profile exists
  await prisma.userProfile.upsert({
    where: { guestId },
    create: { guestId },
    update: {},
  });

  const res = NextResponse.json({ ok: true, guestId });

  res.cookies.set("guest_user_id", guestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("❌ /api/onboarding/start failed:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }

}
