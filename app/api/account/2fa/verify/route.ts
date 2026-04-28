import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import {
  createTwoFactorVerifiedCookieValue,
  decryptTwoFactorSecret,
  getAuthSessionBinding,
  getTwoFactorCookieName,
  getTwoFactorCookieOptions,
  hashBackupCode,
  normalizeBackupCode,
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
    key: `2fa-verify:${userId}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const rawCode = String(body?.code ?? "").trim();
  const totpCode = normalizeTwoFactorCode(rawCode);
  const backupCode = normalizeBackupCode(rawCode);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: true,
    },
  });

  if (!user?.twoFactorEnabled) {
    const response = NextResponse.json({ ok: true, nextUrl: "/dashboard" });
    return response;
  }

  const secret = decryptTwoFactorSecret(user.twoFactorSecretEncrypted);
  let verified = verifyTotpCode({ secret, code: totpCode });

  if (!verified && backupCode.length >= 8) {
    const backupHash = hashBackupCode(backupCode);
    const matchedBackup = await prisma.twoFactorBackupCode.findFirst({
      where: { userId, codeHash: backupHash, usedAt: null },
      select: { id: true },
    });

    if (matchedBackup) {
      await prisma.twoFactorBackupCode.update({
        where: { id: matchedBackup.id },
        data: { usedAt: new Date() },
        select: { id: true },
      });
      verified = true;
    }
  }

  if (!verified) {
    console.info("[TWO_FACTOR] verify failed", { userId, action: "login_gate" });
    return NextResponse.json(
      { ok: false, error: "Invalid authentication code. Try again." },
      { status: 400 }
    );
  }

  const sessionBinding = getAuthSessionBinding(await cookies());
  const response = NextResponse.json({ ok: true, nextUrl: "/dashboard" });
  response.cookies.set(
    getTwoFactorCookieName(),
    createTwoFactorVerifiedCookieValue({ userId, sessionBinding }),
    getTwoFactorCookieOptions()
  );

  console.info("[TWO_FACTOR] verify success", { userId });

  return response;
}
