import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/app/lib/auth";
import { cookies } from "next/headers";
import { sendWelcomeEmail } from "@/app/lib/email/sendgrid";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // must have either logged-in user or guest
    if (!userId && !guestId) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    // find profile (user OR guest)
    const profile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId! },
      select: { id: true, userId: true, guestId: true, welcomeEmailSentAt: true, firstName: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // 1) update profile (store email here if you want it)
    await prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        // if you have an email field on profile, add it here.
        // email,
      },
    });

    // 2) update the User table email (only if we have a real userId)
    // If your flow "promotes" a guest into a real user, do that before this step.
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { email },
      });
    }

    // 3) send email once (recommended)
    if (!profile.welcomeEmailSentAt) {
      await sendWelcomeEmail(email, profile.firstName);

      await prisma.userProfile.update({
        where: { id: profile.id },
        data: { welcomeEmailSentAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("confirm-email error:", err);
    return NextResponse.json(
      { error: "Failed to save email or send message" },
      { status: 500 }
    );
  }
}
