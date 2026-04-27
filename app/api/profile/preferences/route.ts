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
import {
  normalizeVoluntarySelfIdOption,
  sanitizeVoluntarySelfDescription,
  type VoluntarySelfIdDropdownField,
} from "@/app/lib/profile/voluntarySelfIdOptions";

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
  applicationAnswerPreferences?: Record<string, unknown>;
};

const APPLICATION_ANSWER_STRING_FIELDS = [
  "targetRole",
  "availability",
  "employmentType",
  "seniorityLevel",
  "salaryType",
  "fallbackLocation",
  "phoneCountryCode",
] as const;

const VOLUNTARY_SELF_ID_FIELDS = [
  "gender",
  "hispanicLatino",
  "raceEthnicity",
  "veteranStatus",
  "disabilityStatus",
] as const satisfies readonly VoluntarySelfIdDropdownField[];

const VOLUNTARY_SELF_ID_SELF_DESCRIBE_FIELDS = [
  "genderSelfDescribe",
  "raceEthnicitySelfDescribe",
] as const;

const LEGACY_VOLUNTARY_SELF_ID_TEXT_FIELDS = [
  "pronouns",
] as const;

const WORK_AUTH_FIELDS = [
  "authorizedUS",
  "requiresSponsorship",
  "startDate",
  "relocate",
] as const;

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

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasVoluntarySelfIdPayload(value: unknown) {
  return Object.prototype.hasOwnProperty.call(
    readRecord(value),
    "voluntarySelfId",
  );
}

function sanitizeApplicationAnswerPreferences(
  incoming: unknown,
  existing: unknown = {},
) {
  const body = readRecord(incoming);
  const previous = readRecord(existing);
  const next: Record<string, unknown> = { ...previous };

  for (const field of APPLICATION_ANSWER_STRING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const value = normalizeText(body[field]);
      if (value) next[field] = value.slice(0, 240);
      else delete next[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "remote")) {
    next.remote = Boolean(body.remote);
  }

  if (Object.prototype.hasOwnProperty.call(body, "minimumSalary")) {
    const raw = body.minimumSalary;
    if (raw === null || raw === "") {
      delete next.minimumSalary;
    } else {
      const parsed = parseSalaryInputToNumber(raw);
      if (parsed !== null) {
        next.minimumSalary = Math.min(SALARY_BOUNDS.yearly.max, Math.max(0, parsed));
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "benefits")) {
    next.benefits = normalizeTextArray(body.benefits, 30);
  }

  if (Object.prototype.hasOwnProperty.call(body, "customAnswers")) {
    const custom = readRecord(body.customAnswers);
    const normalizedCustom: Record<string, string> = {};
    for (const [key, value] of Object.entries(custom).slice(0, 50)) {
      const normalizedKey = normalizeText(key).slice(0, 180);
      const normalizedValue = normalizeText(value).slice(0, 2000);
      if (normalizedKey && normalizedValue) normalizedCustom[normalizedKey] = normalizedValue;
    }
    next.customAnswers = normalizedCustom;
  }

  const incomingWorkAuth = readRecord(body.workAuthorization);
  const existingWorkAuth = readRecord(previous.workAuthorization);
  const nextWorkAuth: Record<string, string> = { ...existingWorkAuth } as Record<string, string>;
  for (const field of WORK_AUTH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(incomingWorkAuth, field)) {
      const value = normalizeText(incomingWorkAuth[field]);
      if (value) nextWorkAuth[field] = value.slice(0, 120);
      else delete nextWorkAuth[field];
    }
  }
  if (Object.keys(nextWorkAuth).length) next.workAuthorization = nextWorkAuth;
  else delete next.workAuthorization;

  const incomingVoluntary = readRecord(body.voluntarySelfId);
  const existingVoluntary = readRecord(previous.voluntarySelfId);
  const nextVoluntary: Record<string, string | null> = { ...existingVoluntary } as Record<string, string | null>;
  for (const field of VOLUNTARY_SELF_ID_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(incomingVoluntary, field)) {
      const raw = normalizeText(incomingVoluntary[field]);
      const normalized = normalizeVoluntarySelfIdOption(field, incomingVoluntary[field]);
      if (raw && !normalized) {
        continue;
      }
      nextVoluntary[field] = normalized;
    }
  }
  for (const field of VOLUNTARY_SELF_ID_SELF_DESCRIBE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(incomingVoluntary, field)) {
      nextVoluntary[field] = sanitizeVoluntarySelfDescription(incomingVoluntary[field]);
    }
  }
  for (const field of LEGACY_VOLUNTARY_SELF_ID_TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(incomingVoluntary, field)) {
      const value = normalizeText(incomingVoluntary[field]);
      nextVoluntary[field] = value ? value.slice(0, 100) : null;
    }
  }
  if (Object.keys(nextVoluntary).length) next.voluntarySelfId = nextVoluntary;
  else delete next.voluntarySelfId;

  return next;
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
          benefits: normalizeTextArray(draftPreferences.benefits, 30),
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
          applicationAnswerPreferences: sanitizeApplicationAnswerPreferences(
            draftPreferences.applicationAnswerPreferences,
            {},
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
        applicationAnswerPreferences: sanitizeApplicationAnswerPreferences(
          keyQuestions.applicationAnswerPreferences,
          {},
        ),
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
          ? normalizeTextArray(body.benefits, 30)
          : []
        : normalizeTextArray(existingDraftPreferences.benefits, 30);
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
      const applicationAnswerPreferences = hasField("applicationAnswerPreferences")
        ? sanitizeApplicationAnswerPreferences(
            body.applicationAnswerPreferences,
            existingDraftPreferences.applicationAnswerPreferences,
          )
        : sanitizeApplicationAnswerPreferences(
            existingDraftPreferences.applicationAnswerPreferences,
            {},
          );

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
        applicationAnswerPreferences,
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

      if (
        hasField("applicationAnswerPreferences") &&
        hasVoluntarySelfIdPayload(body.applicationAnswerPreferences)
      ) {
        console.log("[VOLUNTARY_SELF_ID_SAVED]", {
          profileScope: "draft",
          fields: Object.keys(readRecord(readRecord(body.applicationAnswerPreferences).voluntarySelfId)),
        });
      }

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
        ? normalizeTextArray(body.benefits, 30)
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
    const applicationAnswerPreferences = hasField("applicationAnswerPreferences")
      ? sanitizeApplicationAnswerPreferences(
          body.applicationAnswerPreferences,
          existingKeyQuestions.applicationAnswerPreferences,
        )
      : sanitizeApplicationAnswerPreferences(
          existingKeyQuestions.applicationAnswerPreferences,
          {},
        );
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
      applicationAnswerPreferences,
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

    if (
      hasField("applicationAnswerPreferences") &&
      hasVoluntarySelfIdPayload(body.applicationAnswerPreferences)
    ) {
      console.log("[VOLUNTARY_SELF_ID_SAVED]", {
        profileId: profile.id,
        fields: Object.keys(readRecord(readRecord(body.applicationAnswerPreferences).voluntarySelfId)),
      });
    }

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
        applicationAnswerPreferences,
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
