"use server";

import { prisma } from "@/app/lib/prisma";
import { getActorOwnershipWhere } from "@/app/lib/apply/ownership";

export async function finalSubmitApplication({ draftId }: { draftId: string }) {
  const ownershipWhere = await getActorOwnershipWhere();
  if (!ownershipWhere) {
    return { ok: false, error: "Unauthorized" };
  }

  const draft = await prisma.applicationDraft.findFirst({
    where: { id: draftId, ...ownershipWhere },
  });
  if (!draft) return { ok: false, error: "Draft not found" };

  // minimal required checks (expand as needed)
  const required = ["fullName", "email", "phone", "location", "workAuth"] as const;
  for (const k of required) {
    if (!String(draft[k] ?? "").trim()) {
      return { ok: false, error: `Missing required field: ${k}` };
    }
  }

  // ✅ Mark submitted
  await prisma.applicationDraft.updateMany({
    where: { id: draftId, ...ownershipWhere },
    data: { status: "SUBMITTED" },
  });

  // ✅ Next step: enqueue background job (recommended)
  // e.g. await prisma.applyQueue.create({ data: { draftId } })

  return { ok: true };
}
