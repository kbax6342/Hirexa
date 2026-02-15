"use server";

import { prisma } from "@/app/lib/prisma";
import { APPLY_FIELDS } from "@/app/lib/apply/fields";

function requiredKeys() {
  return APPLY_FIELDS.filter((f) => f.required).map((f) => f.key);
}

export async function saveDraftIntake(formData: FormData) {
  const draftId = String(formData.get("draftId") ?? "");
  if (!draftId) return { ok: false, error: "Missing draftId" };

  const patch: Record<string, any> = {};
  for (const f of APPLY_FIELDS) {
    const v = formData.get(f.key);
    if (v !== null) patch[f.key] = String(v).trim() || null;
  }

  // Map keys to draft columns (same names here)
  const updated = await prisma.applicationDraft.update({
    where: { id: draftId },
    data: {
      fullName: patch.fullName ?? undefined,
      email: patch.email ?? undefined,
      phone: patch.phone ?? undefined,
      location: patch.location ?? undefined,
      workAuth: patch.workAuth ?? undefined,
      linkedin: patch.linkedin ?? undefined,
      portfolio: patch.portfolio ?? undefined,
    },
  });

  const req = requiredKeys();
  const isReady = req.every((k) => String((updated as any)[k] ?? "").trim());

  if (isReady && updated.status === "DRAFT") {
    await prisma.applicationDraft.update({
      where: { id: draftId },
      data: { status: "READY" },
    });
  }

  return { ok: true };
}
