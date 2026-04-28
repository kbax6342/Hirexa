import { prisma } from "@/app/lib/prisma";
import {
  getAuthSessionBinding,
  getTwoFactorCookieName,
  isTwoFactorCookieVerified,
} from "@/app/lib/security/twoFactor";

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export type TwoFactorGateStatus = {
  enabled: boolean;
  verified: boolean;
  requiresTwoFactor: boolean;
};

export async function getTwoFactorGateForUser(
  userId: string | null | undefined,
  cookies: CookieReader
): Promise<TwoFactorGateStatus> {
  if (!userId) {
    return { enabled: false, verified: true, requiresTwoFactor: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorEnabled: true },
  });

  if (!user?.twoFactorEnabled) {
    return { enabled: false, verified: true, requiresTwoFactor: false };
  }

  const sessionBinding = getAuthSessionBinding(cookies);
  const verified = isTwoFactorCookieVerified({
    value: cookies.get(getTwoFactorCookieName())?.value,
    userId,
    sessionBinding,
  });

  return {
    enabled: true,
    verified,
    requiresTwoFactor: !verified,
  };
}
