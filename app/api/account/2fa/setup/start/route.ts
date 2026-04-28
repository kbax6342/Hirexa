import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import {
  createTotpSetupPayload,
  encryptTwoFactorSecret,
  generateTwoFactorSecret,
} from "@/app/lib/security/twoFactor";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const email = String(session?.user?.email ?? "").trim().toLowerCase();

  if (!userId || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, twoFactorEnabled: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json(
      { ok: false, error: "Two-factor authentication is already enabled." },
      { status: 400 }
    );
  }

  const secret = generateTwoFactorSecret();

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorPendingSecretEncrypted: encryptTwoFactorSecret(secret) },
    select: { id: true },
  });

  const setup = await createTotpSetupPayload({ secret, email });

  console.info("[TWO_FACTOR] setup started", { userId });

  return NextResponse.json({
    ok: true,
    qrCodeDataUrl: setup.qrCodeDataUrl,
    manualEntryKey: setup.manualEntryKey,
  });
}
