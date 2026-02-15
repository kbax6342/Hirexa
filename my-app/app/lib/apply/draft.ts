import "server-only";
import { prisma } from "@/app/lib/prisma";
import { getActor } from "@/app/lib/apply/getActor";

export async function getOrCreateDraft(jobId: string, jobUrl?: string | null) {
  const actor = await getActor();

  const existing = await prisma.applicationDraft.findFirst({
    where: {
      jobId,
      ...(actor.userId ? { userId: actor.userId } : {}),
      ...(actor.guestId ? { guestId: actor.guestId } : {}),
    },
    include: { answers: true },
  });

  if (existing) return existing;

  // Pull profile/resume data you already store
  const profile = actor.profileId
    ? await prisma.userProfile.findUnique({ where: { id: actor.profileId } })
    : null;

  // map into prefill fields
  const fullName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() || null;

  const draft = await prisma.applicationDraft.create({
    data: {
      jobId,
      jobUrl: jobUrl ?? null,
      userId: actor.userId ?? null,
      guestId: actor.guestId ?? null,
      profileId: actor.profileId ?? null,

      fullName,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      linkedin: profile?.linkedinUrl ?? null,
      portfolio: profile?.portfolioUrl ?? null,
      workAuth: profile?.workAuthorization ?? null,
    },
    include: { answers: true },
  });

  return draft;
}
