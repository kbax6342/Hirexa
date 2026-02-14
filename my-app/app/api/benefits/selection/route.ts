import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type BenefitSelectionRecord = {
  id: string;
  selectedPlan: string;
  benefits: string[];
  createdAt: Date;
};

async function createBenefitSelection(params: {
  userProfileId: string;
  guestId: string | null;
  selectedPlan: string;
  benefits: string[];
}): Promise<BenefitSelectionRecord> {
  const benefitSelectionModel = (prisma as unknown as {
    benefitSelection?: {
      create?: (args: {
        data: {
          userProfileId: string;
          guestId: string | null;
          selectedPlan: string;
          benefits: string[];
        };
        select: {
          id: true;
          selectedPlan: true;
          benefits: true;
          createdAt: true;
        };
      }) => Promise<BenefitSelectionRecord>;
    };
  }).benefitSelection;

  // Keep the regular Prisma delegate path when the generated client includes BenefitSelection.
  if (benefitSelectionModel?.create) {
    return benefitSelectionModel.create({
      data: params,
      select: {
        id: true,
        selectedPlan: true,
        benefits: true,
        createdAt: true,
      },
    });
  }

  // Fallback for environments with a stale generated Prisma client.
  const insertedRows = await prisma.$queryRaw<BenefitSelectionRecord[]>`
    INSERT INTO "BenefitSelection" ("userProfileId", "guestId", "selectedPlan", "benefits", "createdAt", "updatedAt")
    VALUES (${params.userProfileId}, ${params.guestId}, ${params.selectedPlan}, ${params.benefits}, NOW(), NOW())
    RETURNING "id", "selectedPlan", "benefits", "createdAt"
  `;

  const inserted = insertedRows[0];

  if (!inserted) {
    throw new Error("Failed to save benefits");
  }

  return inserted;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const cookieStore = await cookies();
    const guestId = cookieStore.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const selectedPlan = typeof body?.selectedPlan === "string" ? body.selectedPlan.trim() : "";
    const benefits = Array.isArray(body?.benefits)
      ? body.benefits.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

    if (!selectedPlan) {
      return NextResponse.json({ ok: false, error: "selectedPlan is required" }, { status: 400 });
    }

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId! },
      create: userId ? { userId } : { guestId: guestId! },
      update: {},
      select: { id: true },
    });

    const savedSelection = await createBenefitSelection({
      userProfileId: profile.id,
      guestId,
      selectedPlan,
      benefits,
    });

    return NextResponse.json({ ok: true, savedSelection });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save benefits";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
