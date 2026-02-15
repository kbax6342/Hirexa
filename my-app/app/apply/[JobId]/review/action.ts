"use server";

import { prisma } from "@/app/lib/prisma";

export async function finalSubmitApplication({ draftId }: { draftId: string }) {
  const draft = await prisma.applicationDraft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: false, error: "Draft not found" };

  // minimal required checks (expand as needed)
  const required = ["fullName", "email", "phone", "location", "workAuth"] as const;
  for (const k of required) {
    if (!String((draft as any)[k] ?? "").trim()) {
      return { ok: false, error: `Missing required field: ${k}` };
    }
  }

  // ✅ Mark submitted
  await prisma.applicationDraft.update({
    where: { id: draftId },
    data: { status: "SUBMITTED" },
  });

  // ✅ Next step: enqueue background job (recommended)
  // e.g. await prisma.applyQueue.create({ data: { draftId } })

  return { ok: true };
}
