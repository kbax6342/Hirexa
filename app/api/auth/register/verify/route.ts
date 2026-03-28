import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { hashOtp } from "@/app/lib/security/otp";
import { sendRegistrationConfirmedEmailIfNeeded } from "@/app/lib/email/lifecycle";
import { syncLoopsContact } from "@/app/lib/email/loops";
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

    const { userId } = await prisma.$transaction(async (tx) => {
      const verifiedAt = new Date();

      const user = await tx.user.update({
        where: { email },
        data: {
          emailVerifiedAt: verifiedAt,
          isGuest: false,
        },
        select: { id: true, name: true },
      });

      const [firstNameFromUser, ...remainingNameParts] = String(user.name ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const lastNameFromUser = remainingNameParts.join(" ").trim() || null;

      const mergeResult = guestId
        ? await mergeGuestProfileIntoUserProfile(tx, {
            userId: user.id,
            guestId,
            email,
          })
        : null;

      if (mergeResult?.profileId) {
        await tx.userProfile.update({
          where: { id: mergeResult.profileId },
          data: {
            email,
            subscriptionEmail: email,
            emailVerifiedAt: verifiedAt,
          },
          select: { id: true },
        });
      } else {
        await tx.userProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            email,
            subscriptionEmail: email,
            emailVerifiedAt: verifiedAt,
            registrationStatus: "registered",
            firstName: firstNameFromUser || undefined,
            lastName: lastNameFromUser ?? undefined,
          },
          update: {
            email,
            subscriptionEmail: email,
            emailVerifiedAt: verifiedAt,
            registrationStatus: "registered",
            ...(firstNameFromUser
              ? { firstName: firstNameFromUser, lastName: lastNameFromUser }
              : {}),
          },
        });
      }

      await tx.emailOtp.deleteMany({ where: { email } });
      await tx.emailVerificationCode.deleteMany({ where: { email } });

      return { userId: user.id };
    });

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true, firstName: true, welcomeEmailSentAt: true, userId: true },
    });

    if (profile?.id) {
      await syncLoopsContact({
        email,
        userId: profile.userId,
        firstName: profile.firstName,
        source: "auth/register/verify",
        userGroup: "hirexa_users",
      });

      await sendRegistrationConfirmedEmailIfNeeded(profile.id).catch((emailError) => {
        console.warn("Welcome email failed after verification:", emailError);
      });
    }

    invalidateCachedProfile({
      userId,
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
