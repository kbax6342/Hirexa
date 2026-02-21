"use server";

import { prisma } from "@/app/lib/prisma";
import { APPLY_FIELDS } from "@/app/lib/apply/fields";
import { getActorOwnershipWhere } from "@/app/lib/apply/ownership";

type DraftPatch = {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  workAuth?: string | null;
  linkedin?: string | null;
  portfolio?: string | null;
};

function requiredKeys() {
  return APPLY_FIELDS.filter((f) => f.required).map((f) => f.key);
}

export async function saveDraftIntake(formData: FormData) {
  const draftId = String(formData.get("draftId") ?? "");
  if (!draftId) return { ok: false, error: "Missing draftId" };

  const ownershipWhere = await getActorOwnershipWhere();
  if (!ownershipWhere) {
    return { ok: false, error: "Unauthorized" };
  }

  const patch: DraftPatch = {};
  for (const f of APPLY_FIELDS) {
    const v = formData.get(f.key);
    if (v !== null) patch[f.key] = String(v).trim() || null;
  }

  // Map keys to draft columns (same names here)
  const updated = await prisma.applicationDraft.updateManyAndReturn({
    where: { id: draftId, ...ownershipWhere },
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

  const ownedDraft = updated[0];
  if (!ownedDraft) {
    return { ok: false, error: "Draft not found" };
  }

  const req = requiredKeys();
  const isReady = req.every((k) => String(ownedDraft[k as keyof typeof ownedDraft] ?? "").trim());

  if (isReady && ownedDraft.status === "DRAFT") {
    await prisma.applicationDraft.updateMany({
      where: { id: draftId, ...ownershipWhere },
      data: { status: "READY" },
    });
  }

  return { ok: true };
}
