import { NextResponse } from "next/server";

import { prisma } from "@/app/lib/prisma";
import {
  hashPassword,
  validateAccountPassword,
  verifyPassword,
} from "@/app/lib/security/password";
import { hashPasswordResetToken } from "@/app/lib/security/reset-token";
import { sendPasswordChangedEmail } from "@/app/lib/email/sendgrid";

export const runtime = "nodejs";

type ResetBody = {
  token?: string;
  newPassword?: string;
  confirmPassword?: string;
};

function normalizeToken(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ResetBody | null;
    const token = normalizeToken(body?.token);
    const newPassword = String(body?.newPassword ?? "");
    const confirmPassword = String(body?.confirmPassword ?? "");

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "This password reset link is invalid." },
        { status: 400 }
      );
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "Please enter and confirm your new password." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "New passwords do not match." },
        { status: 400 }
      );
    }

    const passwordValidation = validateAccountPassword(newPassword);
    if (!passwordValidation.ok) {
      return NextResponse.json(
        { ok: false, error: passwordValidation.errors[0] },
        { status: 400 }
      );
    }

    const tokenHash = hashPasswordResetToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
          },
        },
      },
    });

    if (!resetToken || !resetToken.user || !resetToken.user.email) {
      return NextResponse.json(
        { ok: false, error: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    if (resetToken.usedAt) {
      return NextResponse.json(
        { ok: false, error: "This password reset link has already been used." },
        { status: 400 }
      );
    }

    if (resetToken.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { ok: false, error: "This password reset link has expired." },
        { status: 400 }
      );
    }

    if (resetToken.email !== resetToken.user.email) {
      return NextResponse.json(
        { ok: false, error: "This password reset link is no longer valid." },
        { status: 400 }
      );
    }

    if (resetToken.user.password) {
      const reusingPassword = await verifyPassword(newPassword, resetToken.user.password);
      if (reusingPassword) {
        return NextResponse.json(
          {
            ok: false,
            error: "New password must be different from the current password.",
          },
          { status: 400 }
        );
      }
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          password: passwordHash,
          isGuest: false,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: {
          userId: resetToken.userId,
          usedAt: null,
        },
        data: { usedAt: now },
      });
    });

    try {
      await sendPasswordChangedEmail(resetToken.user.email, resetToken.user.name);
    } catch (error) {
      console.error("Password change email failed after reset:", error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("reset password error:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to reset password." },
      { status: 500 }
    );
  }
}
