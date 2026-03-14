import { cookies } from "next/headers";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Step2Client from "@/app/questions/step2/step2Client";

type PageProps = {
  searchParams?: Promise<{ resumeId?: string }>;
};

export default async function ResumePage({ searchParams }: PageProps) {
  const session = await auth();

  const cookieStore = await cookies();
  const guestId = cookieStore.get("guest_user_id")?.value ?? null;

  const sp = (await searchParams) ?? {};
  const resumeId = sp.resumeId ?? null;

  const profile = await prisma.userProfile.findFirst({
    where: session?.user?.id
      ? { userId: session.user.id }
      : guestId
        ? { guestId }
        : { id: "__nope__" },
    select: { id: true },
  });

  return (
    <Step2Client
      profileId={profile?.id ?? null}
      resumeId={resumeId}
    />
  );
}
