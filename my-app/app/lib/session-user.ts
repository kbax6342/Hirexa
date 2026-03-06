import { auth } from "@/lib/auth/server";
import { prisma } from "@/app/lib/prisma";

export async function getSessionUserId() {
  const session = await auth.getSession();
  let userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId && session?.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    userId = dbUser?.id ?? null;
  }

  return userId;
}
