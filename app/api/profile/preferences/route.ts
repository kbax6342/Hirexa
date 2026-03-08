import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import type { Prisma } from "@prisma/client";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import {
  parseSalaryInputToNumber,
  SALARY_BOUNDS,
  type CompensationType,
} from "@/app/lib/salary";

type PreferencesBody = {
  minCompensation?: number | null;
  compensationType?: "yearly" | "hourly";
  workplaceLocations?: Array<{ label: string }> | null;
  includeRemote?: boolean;
  selectedPlan?: "trial" | "annual";
  benefits?: string[];
  roleFocus?: string;
  availability?: string;
};

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = String((item as { label?: unknown }).label ?? "").trim();
      return label ? { label } : null;
    })
    .filter((item): item is { label: string } => Boolean(item));
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;

    if (!userId && !guestId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PreferencesBody;

    const includeRemote = Boolean(body.includeRemote);
    const compensationType: CompensationType =
      body.compensationType === "hourly" ? "hourly" : "yearly";
    let minCompensation: number | null = null;

    if (body.minCompensation !== null && body.minCompensation !== undefined) {
      const parsed = parseSalaryInputToNumber(body.minCompensation);
      if (parsed === null) {
        return NextResponse.json({ error: "Invalid min compensation." }, { status: 400 });
      }

      const max = SALARY_BOUNDS[compensationType].max;
      minCompensation = Math.min(max, Math.max(0, parsed));
    }

    const workplaceLocations = body.workplaceLocations === null ? null : normalizeList(body.workplaceLocations);
    const normalizedWorkplaceLocations =
      workplaceLocations && workplaceLocations.length ? [workplaceLocations[0]] : workplaceLocations;
    const selectedPlan = body.selectedPlan === "annual" ? "annual" : "trial";
    const workplaceLocationsJson = normalizedWorkplaceLocations as Prisma.InputJsonValue | null;
    const benefits = Array.isArray(body.benefits)
      ? body.benefits.map((item) => String(item).trim()).filter(Boolean)
      : [];

    const roleFocus = String(body.roleFocus ?? "").trim();
    const availability = String(body.availability ?? "").trim();

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId as string },
      create: {
        ...(userId ? { userId } : { guestId: guestId as string }),
        minCompensation,
        compensationType,
        workplaceLocations: workplaceLocationsJson ?? undefined,
        includeRemote,
        keyQuestions: {
          roleFocus,
          availability,
        },
      },
      update: {
        minCompensation,
        compensationType,
        workplaceLocations: workplaceLocationsJson ?? undefined,
        includeRemote,
        keyQuestions: {
          roleFocus,
          availability,
        },
      },
      select: { id: true },
    });

    const existingBenefit = await prisma.benefitSelection.findFirst({
      where: { userProfileId: profile.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existingBenefit?.id) {
      await prisma.benefitSelection.update({
        where: { id: existingBenefit.id },
        data: { selectedPlan, benefits },
      });
    } else {
      await prisma.benefitSelection.create({
        data: {
          userProfileId: profile.id,
          guestId: guestId ?? undefined,
          selectedPlan,
          benefits,
        },
      });
    }

    invalidateCachedProfile({ userId, guestId });

    return NextResponse.json({
      ok: true,
      preferences: {
        minCompensation,
        compensationType,
        workplaceLocations: normalizedWorkplaceLocations,
        includeRemote,
        selectedPlan,
        benefits,
        roleFocus,
        availability,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
