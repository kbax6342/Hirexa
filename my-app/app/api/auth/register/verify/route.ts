import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { verifyRecaptchaV3 } from "@/app/lib/security/recaptcha";
import { hashOtp } from "@/app/lib/security/otp";
import crypto from "crypto";

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const code = String(body.code ?? "").trim();
    const recaptchaToken = body.recaptchaToken ?? null;

    const rc = await verifyRecaptchaV3(recaptchaToken, "signup_verify");

      // ✅ Look up latest code record
    const record = await prisma.emailVerificationCode.findUnique({
      where: { email },
      select: { codeHash: true, expiresAt: true },
    });

    if (!rc.ok) {
      return NextResponse.json({ error: rc.error }, { status: 403 });
    }

    const otp = await prisma.emailOtp.findUnique({ where: { email } });
    if (!otp || otp.expiresAt < new Date()) {
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    if (otp.attempts >= 6) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    await prisma.emailOtp.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });

    // ✅ Mark verified on UserProfile (adjust if you store it elsewhere)
    await prisma.userProfile.updateMany({
      where: { email },
      data: {
        registrationStatus: "verified",
        // If you have this field in your schema, keep it; otherwise remove:
        // emailVerifiedAt: new Date(),
      },
    });

     

    if (hashOtp(code) !== otp.codeHash) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { email },
      data: {
        emailVerifiedAt: new Date(),
        isGuest: false,
      },
      select: {
        id: true,
      },
    });

    await prisma.userProfile.upsert({
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

    await prisma.emailOtp.delete({ where: { email } }).catch(() => null);
    // ✅ burn the code
    await prisma.emailVerificationCode.delete({ where: { email } });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
