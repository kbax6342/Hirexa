import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "../../../../lib/security/recaptcha";
import { validatePassword, hashPassword } from "../../../../lib/security/password";
import { generateOtp6, hashOtp } from "../../../../lib/security/otp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const recaptchaToken = body.recaptchaToken ?? null;

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

    const passwordHash = await hashPassword(password);

    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        password: passwordHash,
        isGuest: false,
        emailVerifiedAt: null,
        userProfile: { create: { email } },
      },
      update: {
        password: passwordHash,
        isGuest: false,
        userProfile: {
          upsert: {
            create: { email },
            update: { email },
          },
        },
      },
    });

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

    console.log("[OTP]", email, code);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
