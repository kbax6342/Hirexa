import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/app/lib/auth";
import {
  getActiveOnboardingDraftForCookies,
  pickDraftGuestId,
  readDraftSection,
  readOnboardingDraftPayload,
  updateOnboardingDraftPayload,
  type DraftPreferencesPayload,
} from "@/app/lib/onboarding/draft-session";
import { prisma } from "@/app/lib/prisma";
import { Prisma } from "@prisma/client";
import { invalidateCachedProfile } from "@/app/lib/profile-cache";
import {
  deriveLocationLabel,
  normalizeLocationLabel,
} from "@/app/lib/locationOptions";
import { validateUsLocation } from "@/app/lib/location/validateUsLocation";
import {
  getSafePrivateProfileFields,
  PrivateProfileFieldValidationError,
  sanitizePrivateProfileFields,
} from "@/app/lib/profile/privateProfileFields";
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
  workSetup?: string;
  commutePreference?: string;
  schedulePreferences?: string[];
  jobFilterPaySelection?: string;
  hirexaSupportLevel?: string;
  hirexaSupportExtras?: string[];
  hiringSignalTraits?: string[];
  hiringSignalEmphasis?: string;
  city?: string;
  state?: string;
  postalCode?: string;
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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeTextArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const text = normalizeText(item);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(text);

    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export async function GET() {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;
    const draft = !userId ? await getActiveOnboardingDraftForCookies(c) : null;

    if (!userId && !guestId && !draft) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!userId && draft) {
      const draftPayload = readOnboardingDraftPayload(draft.payload);
      const draftPreferences = readDraftSection<DraftPreferencesPayload>(
        draftPayload.preferences
      );
      const draftJobInterests = readDraftSection<Record<string, unknown>>(
        draftPayload.jobInterests
      );
      const workplaceLocations = Array.isArray(draftPreferences.workplaceLocations)
        ? normalizeList(draftPreferences.workplaceLocations)
        : [];

      return NextResponse.json({
        ok: true,
        preferences: {
          minCompensation:
            typeof draftPreferences.minCompensation === "number"
              ? draftPreferences.minCompensation
              : null,
          compensationType:
            draftPreferences.compensationType === "hourly" ? "hourly" : "yearly",
          workplaceLocations,
          includeRemote: draftPreferences.includeRemote ?? true,
          selectedPlan: normalizeText(draftPreferences.selectedPlan),
          benefits: normalizeTextArray(draftPreferences.benefits, 12),
          roleFocus: normalizeText(
            draftPreferences.roleFocus ?? draftJobInterests.roleFocus
          ),
          availability: normalizeText(draftPreferences.availability),
          employmentType: normalizeText(draftPreferences.employmentType),
          seniorityLevel: normalizeText(draftPreferences.seniorityLevel),
          workSetup: normalizeText(draftPreferences.workSetup),
          commutePreference: normalizeText(draftPreferences.commutePreference),
          schedulePreferences: normalizeTextArray(
            draftPreferences.schedulePreferences,
            7
          ),
          jobFilterPaySelection: normalizeText(
            draftPreferences.jobFilterPaySelection
          ),
          hirexaSupportLevel: normalizeText(draftPreferences.hirexaSupportLevel),
          hirexaSupportExtras: normalizeTextArray(
            draftPreferences.hirexaSupportExtras,
            6
          ),
          hiringSignalTraits: normalizeTextArray(
            draftPreferences.hiringSignalTraits,
            10
          ),
          hiringSignalEmphasis: normalizeText(
            draftPreferences.hiringSignalEmphasis
          ),
          city:
            typeof draftPreferences.city === "string" ? draftPreferences.city : null,
          state:
            typeof draftPreferences.state === "string" ? draftPreferences.state : null,
          postalCode:
            typeof draftPreferences.postalCode === "string"
              ? draftPreferences.postalCode
              : null,
        },
      });
    }

    const profile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId as string },
      select: {
        minCompensation: true,
        compensationType: true,
        workplaceLocations: true,
        includeRemote: true,
        keyQuestions: true,
        city: true,
        cityEncrypted: true,
        citySearch: true,
        state: true,
        stateEncrypted: true,
        stateSearch: true,
        postalCode: true,
        postalCodeEncrypted: true,
        postalCodeSearch: true,
      },
    });

    const keyQuestions = readKeyQuestions(profile?.keyQuestions);
    const workplaceLocations = Array.isArray(profile?.workplaceLocations)
      ? normalizeList(profile.workplaceLocations)
      : [];
    const safePrivateFields = profile
      ? getSafePrivateProfileFields(profile)
      : { city: null, state: null, postalCode: null };

    return NextResponse.json({
      ok: true,
      preferences: {
        minCompensation:
          typeof profile?.minCompensation === "number"
            ? profile.minCompensation
            : null,
        compensationType:
          profile?.compensationType === "hourly" ? "hourly" : "yearly",
        workplaceLocations,
        includeRemote: profile?.includeRemote ?? true,
        roleFocus: normalizeText(keyQuestions.roleFocus),
        availability: normalizeText(keyQuestions.availability),
        employmentType: normalizeText(keyQuestions.employmentType),
        seniorityLevel: normalizeText(keyQuestions.seniorityLevel),
        workSetup: normalizeText(keyQuestions.workSetup),
        commutePreference: normalizeText(keyQuestions.commutePreference),
        schedulePreferences: normalizeTextArray(
          keyQuestions.schedulePreferences,
          7
        ),
        jobFilterPaySelection: normalizeText(keyQuestions.jobFilterPaySelection),
        hirexaSupportLevel: normalizeText(keyQuestions.hirexaSupportLevel),
        hirexaSupportExtras: normalizeTextArray(
          keyQuestions.hirexaSupportExtras,
          6
        ),
        hiringSignalTraits: normalizeTextArray(
          keyQuestions.hiringSignalTraits,
          10
        ),
        hiringSignalEmphasis: normalizeText(keyQuestions.hiringSignalEmphasis),
        city: safePrivateFields.city,
        state: safePrivateFields.state,
        postalCode: safePrivateFields.postalCode,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

    const c = await cookies();
    const guestId = c.get("guest_user_id")?.value ?? null;
    const draft = !userId ? await getActiveOnboardingDraftForCookies(c) : null;

    if (!userId && !guestId && !draft) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as PreferencesBody;
    const hasField = <K extends keyof PreferencesBody>(key: K) =>
      Object.prototype.hasOwnProperty.call(body, key);

    if (!userId && draft) {
      const draftPayload = readOnboardingDraftPayload(draft.payload);
      const existingDraftPreferences = readDraftSection<DraftPreferencesPayload>(
        draftPayload.preferences
      );
      const draftGuestId = pickDraftGuestId({ cookieStore: c, draft });

      const includeRemote = hasField("includeRemote")
        ? Boolean(body.includeRemote)
        : (existingDraftPreferences.includeRemote ?? true);
      const compensationType: CompensationType = hasField("compensationType")
        ? body.compensationType === "hourly"
          ? "hourly"
          : "yearly"
        : existingDraftPreferences.compensationType === "hourly"
          ? "hourly"
          : "yearly";

      let minCompensation =
        typeof existingDraftPreferences.minCompensation === "number"
          ? existingDraftPreferences.minCompensation
          : null;

      if (hasField("minCompensation")) {
        if (body.minCompensation === null) {
          minCompensation = null;
        } else if (body.minCompensation !== undefined) {
          const parsed = parseSalaryInputToNumber(body.minCompensation);
          if (parsed === null) {
            return NextResponse.json(
              { error: "Invalid min compensation." },
              { status: 400 }
            );
          }

          const max = SALARY_BOUNDS[compensationType].max;
          minCompensation = Math.min(max, Math.max(0, parsed));
        }
      }

      const hasLocationFields =
        hasField("city") || hasField("state") || hasField("postalCode");
      const locationCandidate = hasLocationFields
        ? {
            city: hasField("city") ? body.city : existingDraftPreferences.city,
            state: hasField("state") ? body.state : existingDraftPreferences.state,
            postalCode: hasField("postalCode")
              ? body.postalCode
              : existingDraftPreferences.postalCode,
          }
        : null;
      const validatedLocation = locationCandidate
        ? await validateUsLocation(locationCandidate)
        : null;

      if (validatedLocation && !validatedLocation.ok) {
        return NextResponse.json(
          {
            error: validatedLocation.message,
            code: validatedLocation.code,
            field: validatedLocation.field,
            message: validatedLocation.message,
          },
          { status: 400 }
        );
      }

      const sanitizedLocationFields = hasLocationFields
        ? sanitizePrivateProfileFields({
            city: validatedLocation?.ok
              ? validatedLocation.normalized.city
              : existingDraftPreferences.city,
            state: validatedLocation?.ok
              ? validatedLocation.normalized.stateCode
              : existingDraftPreferences.state,
            postalCode: validatedLocation?.ok
              ? validatedLocation.normalized.postalCode
              : existingDraftPreferences.postalCode,
          })
        : null;
      const derivedWorkplaceLocation = sanitizedLocationFields
        ? deriveLocationLabel(
            sanitizedLocationFields.city,
            sanitizedLocationFields.state
          )
        : null;
      const normalizedWorkplaceLocations = hasField("workplaceLocations")
        ? body.workplaceLocations === null
          ? null
          : normalizeList(body.workplaceLocations).slice(0, 1)
        : sanitizedLocationFields
          ? derivedWorkplaceLocation
            ? [{ label: derivedWorkplaceLocation }]
            : null
          : Array.isArray(existingDraftPreferences.workplaceLocations)
            ? normalizeList(existingDraftPreferences.workplaceLocations)
            : null;
      const selectedPlan = hasField("selectedPlan")
        ? String(body.selectedPlan ?? "").trim() ||
          existingDraftPreferences.selectedPlan ||
          "trial"
        : existingDraftPreferences.selectedPlan || "trial";
      const benefits = hasField("benefits")
        ? Array.isArray(body.benefits)
          ? body.benefits.map((item) => String(item).trim()).filter(Boolean)
          : []
        : normalizeTextArray(existingDraftPreferences.benefits, 12);
      const roleFocus = hasField("roleFocus")
        ? normalizeText(body.roleFocus)
        : normalizeText(existingDraftPreferences.roleFocus);
      const availability = hasField("availability")
        ? normalizeText(body.availability)
        : normalizeText(existingDraftPreferences.availability);
      const employmentType = hasField("employmentType")
        ? normalizeText(body.employmentType)
        : normalizeText(existingDraftPreferences.employmentType);
      const seniorityLevel = hasField("seniorityLevel")
        ? normalizeText(body.seniorityLevel)
        : normalizeText(existingDraftPreferences.seniorityLevel);
      const workSetup = hasField("workSetup")
        ? normalizeText(body.workSetup)
        : normalizeText(existingDraftPreferences.workSetup);
      const commutePreference = hasField("commutePreference")
        ? normalizeText(body.commutePreference)
        : normalizeText(existingDraftPreferences.commutePreference);
      const schedulePreferences = hasField("schedulePreferences")
        ? normalizeTextArray(body.schedulePreferences, 7)
        : normalizeTextArray(existingDraftPreferences.schedulePreferences, 7);
      const jobFilterPaySelection = hasField("jobFilterPaySelection")
        ? normalizeText(body.jobFilterPaySelection)
        : normalizeText(existingDraftPreferences.jobFilterPaySelection);
      const hirexaSupportLevel = hasField("hirexaSupportLevel")
        ? normalizeText(body.hirexaSupportLevel)
        : normalizeText(existingDraftPreferences.hirexaSupportLevel);
      const hirexaSupportExtras = hasField("hirexaSupportExtras")
        ? normalizeTextArray(body.hirexaSupportExtras, 6)
        : normalizeTextArray(existingDraftPreferences.hirexaSupportExtras, 6);
      const hiringSignalTraits = hasField("hiringSignalTraits")
        ? normalizeTextArray(body.hiringSignalTraits, 10)
        : normalizeTextArray(existingDraftPreferences.hiringSignalTraits, 10);
      const hiringSignalEmphasis = hasField("hiringSignalEmphasis")
        ? normalizeText(body.hiringSignalEmphasis)
        : normalizeText(existingDraftPreferences.hiringSignalEmphasis);

      const nextPreferences: DraftPreferencesPayload = {
        ...existingDraftPreferences,
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
        workSetup,
        commutePreference,
        schedulePreferences,
        jobFilterPaySelection,
        hirexaSupportLevel,
        hirexaSupportExtras,
        hiringSignalTraits,
        hiringSignalEmphasis,
        city: sanitizedLocationFields?.city ?? existingDraftPreferences.city ?? null,
        state:
          sanitizedLocationFields?.state ?? existingDraftPreferences.state ?? null,
        postalCode:
          sanitizedLocationFields?.postalCode ??
          existingDraftPreferences.postalCode ??
          null,
      };

      await updateOnboardingDraftPayload({
        draftToken: draft.draftToken,
        payloadPatch: {
          preferences: nextPreferences,
        },
        guestId: draftGuestId,
      });

      return NextResponse.json({
        ok: true,
        preferences: nextPreferences,
      });
    }

    const existingProfile = await prisma.userProfile.findUnique({
      where: userId ? { userId } : { guestId: guestId as string },
      select: {
        id: true,
        minCompensation: true,
        compensationType: true,
        workplaceLocations: true,
        includeRemote: true,
        keyQuestions: true,
        city: true,
        cityEncrypted: true,
        citySearch: true,
        state: true,
        stateEncrypted: true,
        stateSearch: true,
        postalCode: true,
        postalCodeEncrypted: true,
        postalCodeSearch: true,
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

    const existingKeyQuestions = {
      ...readKeyQuestions(existingProfile?.keyQuestions),
    };
    const existingSafePrivateFields = existingProfile
      ? getSafePrivateProfileFields(existingProfile)
      : { city: null, state: null, postalCode: null };
    delete existingKeyQuestions.felony;
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

    const hasLocationFields =
      hasField("city") || hasField("state") || hasField("postalCode");
    const locationCandidate = hasLocationFields
      ? {
          city: hasField("city") ? body.city : existingSafePrivateFields.city,
          state: hasField("state") ? body.state : existingSafePrivateFields.state,
          postalCode: hasField("postalCode")
            ? body.postalCode
            : existingSafePrivateFields.postalCode,
        }
      : null;
    const validatedLocation = locationCandidate
      ? await validateUsLocation(locationCandidate)
      : null;

    if (validatedLocation && !validatedLocation.ok) {
      return NextResponse.json(
        {
          error: validatedLocation.message,
          code: validatedLocation.code,
          field: validatedLocation.field,
          message: validatedLocation.message,
        },
        { status: 400 }
      );
    }

    const sanitizedLocationFields = hasLocationFields
      ? sanitizePrivateProfileFields({
          city: validatedLocation?.ok
            ? validatedLocation.normalized.city
            : existingSafePrivateFields.city,
          state: validatedLocation?.ok
            ? validatedLocation.normalized.stateCode
            : existingSafePrivateFields.state,
          postalCode: validatedLocation?.ok
            ? validatedLocation.normalized.postalCode
            : existingSafePrivateFields.postalCode,
        })
      : null;
    const derivedWorkplaceLocation = sanitizedLocationFields
      ? deriveLocationLabel(
          sanitizedLocationFields.city,
          sanitizedLocationFields.state
        )
      : null;
    const normalizedWorkplaceLocations = hasField("workplaceLocations")
      ? body.workplaceLocations === null
        ? null
        : normalizeList(body.workplaceLocations).slice(0, 1)
      : sanitizedLocationFields
      ? derivedWorkplaceLocation
        ? [{ label: derivedWorkplaceLocation }]
        : null
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
      ? normalizeText(body.roleFocus)
      : normalizeText(existingKeyQuestions.roleFocus);
    const availability = hasField("availability")
      ? normalizeText(body.availability)
      : normalizeText(existingKeyQuestions.availability);
    const employmentType = hasField("employmentType")
      ? normalizeText(body.employmentType)
      : normalizeText(existingKeyQuestions.employmentType);
    const seniorityLevel = hasField("seniorityLevel")
      ? normalizeText(body.seniorityLevel)
      : normalizeText(existingKeyQuestions.seniorityLevel);
    const workSetup = hasField("workSetup")
      ? normalizeText(body.workSetup)
      : normalizeText(existingKeyQuestions.workSetup);
    const commutePreference = hasField("commutePreference")
      ? normalizeText(body.commutePreference)
      : normalizeText(existingKeyQuestions.commutePreference);
    const schedulePreferences = hasField("schedulePreferences")
      ? normalizeTextArray(body.schedulePreferences, 7)
      : normalizeTextArray(existingKeyQuestions.schedulePreferences, 7);
    const jobFilterPaySelection = hasField("jobFilterPaySelection")
      ? normalizeText(body.jobFilterPaySelection)
      : normalizeText(existingKeyQuestions.jobFilterPaySelection);
    const hirexaSupportLevel = hasField("hirexaSupportLevel")
      ? normalizeText(body.hirexaSupportLevel)
      : normalizeText(existingKeyQuestions.hirexaSupportLevel);
    const hirexaSupportExtras = hasField("hirexaSupportExtras")
      ? normalizeTextArray(body.hirexaSupportExtras, 6)
      : normalizeTextArray(existingKeyQuestions.hirexaSupportExtras, 6);
    const hiringSignalTraits = hasField("hiringSignalTraits")
      ? normalizeTextArray(body.hiringSignalTraits, 10)
      : normalizeTextArray(existingKeyQuestions.hiringSignalTraits, 10);
    const hiringSignalEmphasis = hasField("hiringSignalEmphasis")
      ? normalizeText(body.hiringSignalEmphasis)
      : normalizeText(existingKeyQuestions.hiringSignalEmphasis);
    const nextKeyQuestions = {
      ...existingKeyQuestions,
      roleFocus,
      availability,
      employmentType,
      seniorityLevel,
      workSetup,
      commutePreference,
      schedulePreferences,
      jobFilterPaySelection,
      hirexaSupportLevel,
      hirexaSupportExtras,
      hiringSignalTraits,
      hiringSignalEmphasis,
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
        ...(sanitizedLocationFields
          ? {
              city: null,
              cityEncrypted: sanitizedLocationFields.cityEncrypted,
              citySearch: sanitizedLocationFields.citySearch,
              state: null,
              stateEncrypted: sanitizedLocationFields.stateEncrypted,
              stateSearch: sanitizedLocationFields.stateSearch,
              postalCode: null,
              postalCodeEncrypted: sanitizedLocationFields.postalCodeEncrypted,
              postalCodeSearch: sanitizedLocationFields.postalCodeSearch,
            }
          : {}),
      },
      update: {
        minCompensation,
        compensationType,
        workplaceLocations: workplaceLocationsJson ?? Prisma.JsonNull,
        includeRemote,
        keyQuestions: nextKeyQuestions as Prisma.InputJsonValue,
        ...(sanitizedLocationFields
          ? {
              city: null,
              cityEncrypted: sanitizedLocationFields.cityEncrypted,
              citySearch: sanitizedLocationFields.citySearch,
              state: null,
              stateEncrypted: sanitizedLocationFields.stateEncrypted,
              stateSearch: sanitizedLocationFields.stateSearch,
              postalCode: null,
              postalCodeEncrypted: sanitizedLocationFields.postalCodeEncrypted,
              postalCodeSearch: sanitizedLocationFields.postalCodeSearch,
            }
          : {}),
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
        workSetup,
        commutePreference,
        schedulePreferences,
        jobFilterPaySelection,
        hirexaSupportLevel,
        hirexaSupportExtras,
        hiringSignalTraits,
        hiringSignalEmphasis,
        city: sanitizedLocationFields?.city ?? existingSafePrivateFields.city,
        state: sanitizedLocationFields?.state ?? existingSafePrivateFields.state,
        postalCode:
          sanitizedLocationFields?.postalCode ?? existingSafePrivateFields.postalCode,
      },
    });
  } catch (e) {
    if (e instanceof PrivateProfileFieldValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
