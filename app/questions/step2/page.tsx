// /app/questions/step2/page.tsx
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Step2Client from "./step2Client";

type PageProps = {
  searchParams?: Promise<{ resumeId?: string }>;
};

export default async function Step2({ searchParams }: PageProps) {
  const session = await auth();

  const c = await cookies();
  const guestId = c.get("guest_user_id")?.value ?? null;

  const sp = (await searchParams) ?? {};
  const resumeId = sp.resumeId ?? null;
  // ✅ SERVER-SIDE LOG (Node console)
console.log("🧭 Step2 server searchParams:", sp);
console.log("🧾 Step2 server resumeId:", resumeId);

  // ✅ Find the profile for logged-in user OR guest
  const profile = await prisma.userProfile.findFirst({
    where: session?.user?.id
      ? { userId: session.user.id }
      : guestId
        ? { guestId }
        : { id: "__nope__" }, // forces null result
    select: { id: true },
  });

  return (
    <Step2Client
      profileId={profile?.id ?? null}
      resumeId={resumeId}
    />
  );
}
