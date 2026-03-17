import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import { normalizeLocationLabel } from "@/app/lib/locationOptions";
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
  selectedPlan?: string;
  benefits?: string[];
  roleFocus?: string;
  availability?: string;
  employmentType?: string;
  seniorityLevel?: string;
};

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const label = normalizeLocationLabel(
        String((item as { label?: unknown }).label ?? "")
      );
      return label ? { label } : null;
    })
    .filter((item): item is { label: string } => Boolean(item));
}

function readKeyQuestions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
    const hasField = <K extends keyof PreferencesBody>(key: K) =>
      Object.prototype.hasOwnProperty.call(body, key);

    const existingProfile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId as string },
      select: {
        id: true,
        minCompensation: true,
        compensationType: true,
        workplaceLocations: true,
        includeRemote: true,
        keyQuestions: true,
      },
    });

    const existingBenefit = existingProfile?.id
      ? await prisma.benefitSelection.findFirst({
          where: { userProfileId: existingProfile.id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            selectedPlan: true,
            benefits: true,
          },
        })
      : null;

    const existingKeyQuestions = readKeyQuestions(existingProfile?.keyQuestions);
    const includeRemote = hasField("includeRemote")
      ? Boolean(body.includeRemote)
      : (existingProfile?.includeRemote ?? true);
    const compensationType: CompensationType = hasField("compensationType")
      ? body.compensationType === "hourly"
        ? "hourly"
        : "yearly"
      : existingProfile?.compensationType === "hourly"
      ? "hourly"
      : "yearly";

    let minCompensation =
      typeof existingProfile?.minCompensation === "number"
        ? existingProfile.minCompensation
        : null;

    if (hasField("minCompensation")) {
      if (body.minCompensation === null) {
        minCompensation = null;
      } else if (body.minCompensation !== undefined) {
        const parsed = parseSalaryInputToNumber(body.minCompensation);
        if (parsed === null) {
          return NextResponse.json({ error: "Invalid min compensation." }, { status: 400 });
        }

        const max = SALARY_BOUNDS[compensationType].max;
        minCompensation = Math.min(max, Math.max(0, parsed));
      }
    }

    const normalizedWorkplaceLocations = hasField("workplaceLocations")
      ? body.workplaceLocations === null
        ? null
        : normalizeList(body.workplaceLocations).slice(0, 1)
      : Array.isArray(existingProfile?.workplaceLocations)
      ? normalizeList(existingProfile.workplaceLocations)
      : null;
    const workplaceLocationsJson = normalizedWorkplaceLocations as Prisma.InputJsonValue | null;
    const selectedPlan = hasField("selectedPlan")
      ? String(body.selectedPlan ?? "").trim() || existingBenefit?.selectedPlan || "trial"
      : existingBenefit?.selectedPlan || "trial";
    const benefits = hasField("benefits")
      ? Array.isArray(body.benefits)
        ? body.benefits.map((item) => String(item).trim()).filter(Boolean)
        : []
      : existingBenefit?.benefits ?? [];

    const roleFocus = hasField("roleFocus")
      ? String(body.roleFocus ?? "").trim()
      : String(existingKeyQuestions.roleFocus ?? "").trim();
    const availability = hasField("availability")
      ? String(body.availability ?? "").trim()
      : String(existingKeyQuestions.availability ?? "").trim();
    const employmentType = hasField("employmentType")
      ? String(body.employmentType ?? "").trim()
      : String(existingKeyQuestions.employmentType ?? "").trim();
    const seniorityLevel = hasField("seniorityLevel")
      ? String(body.seniorityLevel ?? "").trim()
      : String(existingKeyQuestions.seniorityLevel ?? "").trim();
    const nextKeyQuestions = {
      ...existingKeyQuestions,
      roleFocus,
      availability,
      employmentType,
      seniorityLevel,
    };

    const profile = await prisma.userProfile.upsert({
      where: userId ? { userId } : { guestId: guestId as string },
      create: {
        ...(userId ? { userId } : { guestId: guestId as string }),
        minCompensation,
        compensationType,
        workplaceLocations: workplaceLocationsJson ?? Prisma.JsonNull,
        includeRemote,
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
      },
      update: {
        minCompensation,
        compensationType,
        workplaceLocations: workplaceLocationsJson ?? Prisma.JsonNull,
        includeRemote,
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
      },
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
        employmentType,
        seniorityLevel,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
