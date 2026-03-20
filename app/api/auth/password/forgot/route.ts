import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import { sendPasswordResetEmail } from "@/app/lib/email/sendgrid";
import { getSiteUrl } from "@/app/lib/site-url";
import {
  generatePasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "@/app/lib/security/reset-token";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for this email, we sent a password reset link.",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { email?: string } | null;
    const email = normalizeEmail(body?.email);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!user?.email) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const { token, tokenHash, expiresAt } = generatePasswordResetToken();
    const resetUrl = `${getSiteUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          email: user.email!,
          tokenHash,
          expiresAt,
        },
      });
    });

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        expiresInMinutes: Math.round(PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000)),
      });
    } catch (error) {
      console.error("Password reset email failed:", error);
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("forgot password error:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to process password reset." },
      { status: 500 }
    );
  }
}
