// /Hirexa/my-app/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
// import { getServerSession } from "next-auth"; // if you use next-auth
// import { authOptions } from "@/app/lib/auth"; // adjust path

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Please fill in First name and Last name." },
        { status: 400 }
      );
    }

    // ✅ Replace this with YOUR auth/guest logic
    // If logged in:
    // const session = await getServerSession(authOptions);
    // const userId = session?.user?.id ?? null;

    const userId = body.userId ? String(body.userId) : null; // TEMP fallback if you're passing it
    const guestId = body.guestId ? String(body.guestId) : null;

    // Prefer userId since it's unique in your Prisma error output
    if (userId) {
      const profile = await prisma.userProfile.upsert({
        where: { userId }, // ✅ unique
        create: { userId, firstName, lastName },
        update: { firstName, lastName },
        select: { id: true, userId: true, firstName: true, lastName: true },
      });

      return NextResponse.json({ ok: true, profile });
    }

    // If you have a unique guestId, you can use it too
    if (guestId) {
      const profile = await prisma.userProfile.upsert({
        where: { guestId }, // ✅ unique
        create: { guestId, firstName, lastName },
        update: { firstName, lastName },
        select: { id: true, guestId: true, firstName: true, lastName: true },
      });

      return NextResponse.json({ ok: true, profile });
    }

    // Otherwise just create a record (no upsert)
    const profile = await prisma.userProfile.create({
      data: { firstName, lastName },
      select: { id: true, firstName: true, lastName: true },
    });

    return NextResponse.json({ ok: true, profile });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
