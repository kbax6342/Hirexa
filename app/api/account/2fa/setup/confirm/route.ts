import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { consumeRateLimit } from "@/app/lib/security/rateLimit";
import {
  decryptTwoFactorSecret,
  generateBackupCodes,
  hashBackupCode,
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
    key: `2fa-setup-confirm:${userId}`,
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
    select: { twoFactorPendingSecretEncrypted: true },
  });
  const pendingSecret = decryptTwoFactorSecret(user?.twoFactorPendingSecretEncrypted);

  if (!pendingSecret || !verifyTotpCode({ secret: pendingSecret, code })) {
    console.info("[TWO_FACTOR] verify failed", {
      userId,
      action: "setup_confirm",
    });
    return NextResponse.json(
      { ok: false, error: "Invalid authentication code. Try again." },
      { status: 400 }
    );
  }

  const backupCodes = generateBackupCodes();
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: user?.twoFactorPendingSecretEncrypted ?? null,
        twoFactorPendingSecretEncrypted: null,
        twoFactorConfirmedAt: now,
        twoFactorDisabledAt: null,
      },
      select: { id: true },
    }),
    prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorBackupCode.createMany({
      data: backupCodes.map((backupCode) => ({
        userId,
        codeHash: hashBackupCode(backupCode),
      })),
    }),
  ]);

  console.info("[TWO_FACTOR] setup confirmed", { userId });

  return NextResponse.json({ ok: true, backupCodes });
}
