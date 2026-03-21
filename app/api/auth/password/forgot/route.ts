import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import {
  getPasswordResetSendMode,
  sendPasswordResetEmail,
} from "@/app/lib/email/sendgrid";
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

function getEmailDomain(email: string) {
  return email.split("@")[1] ?? null;
}

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
      console.info("[forgot-password] no matching user; returning generic success", {
        emailDomain: getEmailDomain(email),
      });
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
      const mode = await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        expiresInMinutes: Math.round(PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000)),
      });

      console.info(`[forgot-password] password reset email send succeeded (${mode})`, {
        userId: user.id,
        emailDomain: getEmailDomain(user.email),
      });
    } catch (error) {
      const mode = getPasswordResetSendMode();
      console.error(`[forgot-password] password reset email send failed (${mode})`, {
        userId: user.id,
        emailDomain: getEmailDomain(user.email),
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      await prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          tokenHash,
        },
      });
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
