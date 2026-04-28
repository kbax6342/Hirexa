import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import {
  decryptTwoFactorSecret,
  getTwoFactorCookieName,
  getTwoFactorCookieOptions,
  normalizeTwoFactorCode,
  verifyTotpCode,
} from "@/app/lib/security/twoFactor";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rate = consumeRateLimit({
    key: `2fa-disable:${userId}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = normalizeTwoFactorCode(body?.code);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true, twoFactorSecretEncrypted: true },
  });

  if (!user?.twoFactorEnabled) {
    return NextResponse.json({ ok: true });
  }

  const secret = decryptTwoFactorSecret(user.twoFactorSecretEncrypted);
  if (!verifyTotpCode({ secret, code })) {
    console.info("[TWO_FACTOR] verify failed", { userId, action: "disable" });
    return NextResponse.json(
      { ok: false, error: "Invalid authentication code. Try again." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        twoFactorPendingSecretEncrypted: null,
        twoFactorDisabledAt: new Date(),
      },
      select: { id: true },
    }),
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
  ]);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getTwoFactorCookieName(), "", {
    ...getTwoFactorCookieOptions(),
    maxAge: 0,
  });

  console.info("[TWO_FACTOR] disabled", { userId });

  return response;
}
