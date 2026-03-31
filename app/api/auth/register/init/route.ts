import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "../../../../lib/security/recaptcha";
import { validatePassword, hashPassword } from "../../../../lib/security/password";
import { generateOtp6, hashOtp } from "../../../../lib/security/otp";
import { sendVerificationCodeEmail } from "@/app/lib/email/sendgrid";
import { cleanupExpiredPendingVerifications } from "@/app/lib/auth/cleanupPendingVerification";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";

function normalizeName(value: unknown) {
  const name = String(value ?? "").trim();
  return name.length > 0 ? name : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const firstName = normalizeName(body.firstName);
    const lastName = normalizeName(body.lastName);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const recaptchaToken = body.recaptchaToken ?? null;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_init");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    const pw = validatePassword(password);
    if (!pw.ok) {
      return NextResponse.json({ error: "Password not strong enough" }, { status: 400 });
    }

    try {
      await cleanupExpiredPendingVerifications();
    } catch (cleanupError) {
      console.warn("pending verification cleanup failed before signup init:", cleanupError);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    if (existingUser?.emailVerifiedAt) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;

    await prisma.user.upsert({
      where: { email },
      create: {
        name: `${firstName} ${lastName}`,
        email,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
      update: {
        name: `${firstName} ${lastName}`,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
      },
    });

    if (guestId) {
      await prisma.userProfile.updateMany({
        where: { guestId },
        data: {
          firstName,
          lastName,
          email,
          subscriptionEmail: email,
        },
      });

      invalidateCachedProfile({ userId: null, guestId });
    }

    const code = generateOtp6();
    await prisma.emailOtp.upsert({
      where: { email },
      create: {
        email,
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      update: {
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      },
    });

    await sendVerificationCodeEmail(email, code);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
