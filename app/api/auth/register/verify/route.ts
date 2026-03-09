import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { hashOtp } from "@/app/lib/security/otp";
import { sendWelcomeEmail } from "@/app/lib/email/sendgrid";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { mergeGuestProfileIntoUserProfile } from "@/app/lib/profile/mergeGuestProfile";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const recaptchaToken = body.recaptchaToken ?? null;

    if (!email.includes("@") || code.length !== 6) {
      return NextResponse.json({ error: "Invalid email or code" }, { status: 400 });
    }

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_verify");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    const otp = await prisma.emailOtp.findUnique({
      where: { email },
      select: { codeHash: true, expiresAt: true, attempts: true },
    });

    if (!otp) {
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      await prisma.emailOtp.deleteMany({ where: { email } });
      await prisma.emailVerificationCode.deleteMany({ where: { email } });
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (otp.attempts >= 6) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const validCode = hashOtp(code) === otp.codeHash;
    if (!validCode) {
      await prisma.emailOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { email },
        data: {
          emailVerifiedAt: new Date(),
          isGuest: false,
        },
        select: { id: true },
      });

      await tx.userProfile.updateMany({
        where: { email },
        data: { registrationStatus: "verified" },
      });

      await tx.userProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          email,
          registrationStatus: "registered",
        },
        update: {
          email,
          registrationStatus: "registered",
        },
      });

      if (guestId) {
        await mergeGuestProfileIntoUserProfile(tx, {
          userId: user.id,
          guestId,
          email,
        });
      }

      await tx.emailOtp.deleteMany({ where: { email } });
      await tx.emailVerificationCode.deleteMany({ where: { email } });
    });

    const profile = await prisma.userProfile.findFirst({
      where: { email },
      select: { id: true, firstName: true, welcomeEmailSentAt: true, userId: true },
    });

    if (profile && !profile.welcomeEmailSentAt) {
      const claimed = await prisma.userProfile.updateMany({
        where: { id: profile.id, welcomeEmailSentAt: null },
        data: { welcomeEmailSentAt: new Date() },
      });

      if (claimed.count === 1) {
        try {
          await sendWelcomeEmail(email, profile.firstName ?? undefined);
        } catch (emailError) {
          console.warn("Welcome email failed after verification:", emailError);
        }
      }
    }

    invalidateCachedProfile({
      userId: profile?.userId ?? null,
      guestId,
    });

    const response = NextResponse.json({ ok: true });
    if (guestId) {
      response.cookies.set("guest_user_id", "", {
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    console.error("signup verify error:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
