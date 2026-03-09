// Hirexa/my-app/app/api/settings/account/password/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { hashPassword, verifyPassword } from "@/app/lib/security/password";
import { sendPasswordChangedEmail } from "@/app/lib/email/sendgrid";

export const runtime = "nodejs";

type PasswordChangeBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

function validateNewPassword(password: string) {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("Password must be at least 10 characters long.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must include at least one number.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let body: PasswordChangeBody | null = null;
    try {
      body = (await req.json()) as PasswordChangeBody;
    } catch {
      body = null;
    }

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "All password fields are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { ok: false, error: "New passwords do not match." },
        { status: 400 }
      );
    }

    const validation = validateNewPassword(newPassword);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, error: validation.errors[0] },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, email: true, name: true },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!user.password) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Password changes are only available for accounts that use email and password sign-in.",
        },
        { status: 400 }
      );
    }

    const currentMatches = await verifyPassword(currentPassword, user.password);
    if (!currentMatches) {
      return NextResponse.json(
        { ok: false, error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const reusingPassword = await verifyPassword(newPassword, user.password);
    if (reusingPassword) {
      return NextResponse.json(
        {
          ok: false,
          error: "New password must be different from the current password.",
        },
        { status: 400 }
      );
    }

    const nextHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: nextHash },
    });

    if (user.email) {
      try {
        await sendPasswordChangedEmail(user.email, user.name);
      } catch (emailError) {
        console.error("Password change email failed:", emailError);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update password.",
      },
      { status: 500 }
    );
  }
}
