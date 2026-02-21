import "server-only";

import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function getActor() {
  const session = await auth();
  const userId = session?.user?.id ?? undefined;

  const cookieStore = await cookies();
  const guestId = cookieStore.get("guest_user_id")?.value ?? undefined;

  if (!userId && !guestId) {
    return { userId: undefined, guestId: undefined, profileId: undefined };
  }

  const profile = await prisma.userProfile.findFirst({
    where: userId ? { userId } : { guestId },
    select: { id: true },
  });

  return {
    userId,
    guestId: userId ? undefined : guestId,
    profileId: profile?.id,
  };
}
