import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import TwoFactorClient from "@/app/auth/2fa/TwoFactorClient";
import {
  getAuthSessionBinding,
  getTwoFactorCookieName,
  isTwoFactorCookieVerified,
} from "@/app/lib/security/twoFactor";
import { prisma } from "@/app/lib/prisma";

export default async function TwoFactorPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    redirect("/login?callbackUrl=/auth/2fa");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  if (!user?.twoFactorEnabled) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  const sessionBinding = getAuthSessionBinding(cookieStore);
  const verified = isTwoFactorCookieVerified({
    value: cookieStore.get(getTwoFactorCookieName())?.value,
    userId,
    sessionBinding,
  });

  if (verified) {
    redirect("/dashboard");
  }

  return <TwoFactorClient />;
}
