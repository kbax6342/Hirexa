// /app/api/auth/signup/verify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { hashOtp } from "@/app/lib/security/otp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const recaptchaToken = body.recaptchaToken ?? null;

    if (!email.includes("@") || code.length !== 6) {
      return NextResponse.json({ error: "Invalid email or code" }, { status: 400 });
    }

    // ✅ reCAPTCHA first
    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_verify");
    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    // ✅ Use ONE source of truth for OTP: emailOtp
    const otp = await prisma.emailOtp.findUnique({
      where: { email },
      select: { codeHash: true, expiresAt: true, attempts: true },
    });

    if (!otp) {
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (otp.expiresAt.getTime() < Date.now()) {
      // safe burn even if nothing exists
      await prisma.emailOtp.deleteMany({ where: { email } });
      await prisma.emailVerificationCode.deleteMany({ where: { email } }); // safe even if table exists but empty
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (otp.attempts >= 6) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    // ✅ Validate code BEFORE marking verified
    const ok = hashOtp(code) === otp.codeHash;

    if (!ok) {
      await prisma.emailOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // ✅ If valid, mark verified + burn codes atomically
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { email },
        data: {
          emailVerifiedAt: new Date(),
          isGuest: false,
        },
        select: { id: true },
      });

      // Keep your statuses consistent (verified -> registered)
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

      // ✅ burn codes (NEVER throws)
      await tx.emailOtp.deleteMany({ where: { email } });

      // If this model/table still exists in your schema, this is safe:
      await tx.emailVerificationCode.deleteMany({ where: { email } });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("signup verify error:", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
