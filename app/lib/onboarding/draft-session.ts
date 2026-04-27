import "server-only";

import { randomUUID } from "crypto";

import type { OnboardingDraft } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import {
  GUEST_USER_COOKIE,
  getGuestUserCookieOptions,
  getOrCreateGuestOnboardingId,
} from "@/app/lib/onboarding/start";

export const ONBOARDING_DRAFT_COOKIE = "hirexa_onboarding_draft";
export const ONBOARDING_DRAFT_TTL_SECONDS = 60 * 60 * 24 * 7;

type CookieTarget = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      sameSite?: "lax" | "strict" | "none";
      secure?: boolean;
      path?: string;
      maxAge?: number;
    }
  ): void;
};

export type DraftProfilePayload = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  phone?: string;
  email?: string;
};

export type DraftJobPayload = {
  uuid?: string;
  title?: string;
};

export type DraftJobInterestsPayload = {
  jobs?: DraftJobPayload[];
  roleFocus?: string | null;
  jobSearchGoal?: string | null;
  jobPriorities?: string[];
  workStoryTags?: string[];
  workStoryHighlight?: string | null;
  skills?: string[];
  highlightSkillsConfidence?: string | null;
};

export type DraftPreferencesPayload = {
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
  applicationAnswerPreferences?: Record<string, unknown>;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
};

export type DraftOnboardingEmailPayload = {
  email?: string | null;
  newsletterOptIn?: boolean;
  newsletterSource?: string | null;
  confirmed?: boolean;
};

export type DraftMinSalaryPayload = {
  minCompensation?: number | null;
  compensationType?: "yearly" | "hourly";
};

export type DraftSignupPayload = {
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type OnboardingDraftPayload = {
  profile?: DraftProfilePayload;
  jobInterests?: DraftJobInterestsPayload;
  preferences?: DraftPreferencesPayload;
  onboardingEmail?: DraftOnboardingEmailPayload;
  minSalary?: DraftMinSalaryPayload;
  signup?: DraftSignupPayload;
};

export const ONBOARDING_ONLY_COOKIES = [
  ONBOARDING_DRAFT_COOKIE,
  "onboarding_email",
  "min_comp_type",
  "min_comp_value",
  "onboarding_min_salary_saved",
  "newsletter_opt_in",
  "job_interest_ids",
  "job_interest_titles",
  "job_interest_count",
  "onboarding_job_interests_saved",
  "onboarding_role_focus",
  "onboarding_job_search_goal",
  "onboarding_job_priorities",
  "onboarding_work_story_tags",
  "onboarding_work_story_highlight",
  "onboarding_highlight_skills_confidence",
  "onboarding_resume_skipped",
  "onboarding_locations",
  "onboarding_locations_count",
  "onboarding_include_remote",
  "user_skills",
  "skills_saved",
  "hirexa_selected_jobs",
  "hirexa_onboarding",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isActiveDraftRecord(draft: OnboardingDraft | null | undefined) {
  if (!draft) return false;
  if (draft.status !== "active") return false;
  if (draft.expiresAt && draft.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

function createDraftExpiresAt() {
  return new Date(Date.now() + ONBOARDING_DRAFT_TTL_SECONDS * 1000);
}

function createDraftToken() {
  return `draft_${randomUUID()}`;
}

export function getOnboardingDraftCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONBOARDING_DRAFT_TTL_SECONDS,
  };
}

export function readOnboardingDraftPayload(
  value: unknown
): OnboardingDraftPayload {
  return isPlainObject(value) ? (value as OnboardingDraftPayload) : {};
}

function mergeDraftPayloadValue(
  currentValue: unknown,
  patchValue: unknown
): unknown {
  if (Array.isArray(patchValue)) {
    return patchValue;
  }

  if (!isPlainObject(patchValue)) {
    return patchValue;
  }

  const base = isPlainObject(currentValue) ? currentValue : {};
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patchValue)) {
    merged[key] = mergeDraftPayloadValue(base[key], value);
  }

  return merged;
}

export function mergeDraftPayload(
  current: OnboardingDraftPayload,
  patch: OnboardingDraftPayload
) {
  const merged = mergeDraftPayloadValue(current, patch);
  return readOnboardingDraftPayload(merged);
}

export function setOnboardingDraftCookie(
  target: CookieTarget,
  draftToken: string
) {
  target.set(ONBOARDING_DRAFT_COOKIE, draftToken, getOnboardingDraftCookieOptions());
}

export function setGuestOnboardingCookie(target: CookieTarget, guestId: string) {
  target.set(GUEST_USER_COOKIE, guestId, getGuestUserCookieOptions());
}

export function clearCookie(target: CookieTarget, name: string) {
  target.set(name, "", {
    path: "/",
    maxAge: 0,
  });
}

export function clearOnboardingCookies(
  target: CookieTarget,
  options?: { includeGuestCookie?: boolean }
) {
  for (const cookieName of ONBOARDING_ONLY_COOKIES) {
    clearCookie(target, cookieName);
  }

  if (options?.includeGuestCookie) {
    clearCookie(target, GUEST_USER_COOKIE);
  }
}

export async function getActiveOnboardingDraftByToken(
  draftToken?: string | null
) {
  const normalizedToken = draftToken?.trim();
  if (!normalizedToken) return null;

  const draft = await prisma.onboardingDraft.findUnique({
    where: { draftToken: normalizedToken },
  });

  return isActiveDraftRecord(draft) ? draft : null;
}

export async function getActiveOnboardingDraftForCookies(
  cookieStore: Pick<CookieTarget, "get">
) {
  const draftToken = cookieStore.get(ONBOARDING_DRAFT_COOKIE)?.value ?? null;
  return getActiveOnboardingDraftByToken(draftToken);
}

export async function createOnboardingDraft(params?: {
  guestId?: string | null;
  lastStep?: string | null;
  payload?: OnboardingDraftPayload;
}) {
  return prisma.onboardingDraft.create({
    data: {
      draftToken: createDraftToken(),
      guestId: params?.guestId ?? null,
      lastStep: params?.lastStep ?? null,
      payload: (params?.payload ?? {}) as object,
      expiresAt: createDraftExpiresAt(),
    },
  });
}

export async function ensureOnboardingDraft(params: {
  existingDraftToken?: string | null;
  guestId?: string | null;
  fresh?: boolean;
}) {
  if (!params.fresh) {
    const existingDraft = await getActiveOnboardingDraftByToken(
      params.existingDraftToken
    );

    if (existingDraft) {
      if (!existingDraft.guestId && params.guestId) {
        return prisma.onboardingDraft.update({
          where: { id: existingDraft.id },
          data: {
            guestId: params.guestId,
            expiresAt: createDraftExpiresAt(),
          },
        });
      }

      return prisma.onboardingDraft.update({
        where: { id: existingDraft.id },
        data: {
          expiresAt: createDraftExpiresAt(),
        },
      });
    }
  }

  return createOnboardingDraft({
    guestId: params.guestId ?? null,
  });
}

export async function bootstrapOnboardingDraftSession(params: {
  cookieStore: Pick<CookieTarget, "get">;
  responseCookies: CookieTarget;
  fresh?: boolean;
}) {
  const existingDraft = params.fresh
    ? null
    : await getActiveOnboardingDraftForCookies(params.cookieStore);

  const guestId = existingDraft?.guestId
    ? existingDraft.guestId
    : getOrCreateGuestOnboardingId(
        existingDraft
          ? params.cookieStore.get(GUEST_USER_COOKIE)?.value ?? null
          : null
      );

  if (!existingDraft || params.fresh) {
    clearOnboardingCookies(params.responseCookies, { includeGuestCookie: true });
  }

  const draft = existingDraft
    ? await ensureOnboardingDraft({
        existingDraftToken: existingDraft.draftToken,
        guestId,
      })
    : await ensureOnboardingDraft({
        guestId,
        fresh: true,
      });

  setGuestOnboardingCookie(params.responseCookies, guestId);
  setOnboardingDraftCookie(params.responseCookies, draft.draftToken);

  return {
    draft,
    guestId,
    createdFresh: !existingDraft || Boolean(params.fresh),
  };
}

export async function updateOnboardingDraftPayload(params: {
  draftToken: string;
  payloadPatch: OnboardingDraftPayload;
  lastStep?: string | null;
  guestId?: string | null;
}) {
  const current = await getActiveOnboardingDraftByToken(params.draftToken);
  if (!current) {
    return null;
  }

  const nextPayload = mergeDraftPayload(
    readOnboardingDraftPayload(current.payload),
    params.payloadPatch
  );

  return prisma.onboardingDraft.update({
    where: { id: current.id },
    data: {
      payload: nextPayload as object,
      expiresAt: createDraftExpiresAt(),
      ...(params.lastStep !== undefined ? { lastStep: params.lastStep } : {}),
      ...(params.guestId && !current.guestId ? { guestId: params.guestId } : {}),
    },
  });
}

export async function markOnboardingDraftStatus(params: {
  draftToken?: string | null;
  status: "abandoned" | "completed";
  lastStep?: string | null;
}) {
  const current = await getActiveOnboardingDraftByToken(params.draftToken);
  if (!current) return null;

  return prisma.onboardingDraft.update({
    where: { id: current.id },
    data: {
      status: params.status,
      ...(params.lastStep !== undefined ? { lastStep: params.lastStep } : {}),
    },
  });
}

export async function abandonOnboardingDraft(
  cookieStore: Pick<CookieTarget, "get">
) {
  const draftToken = cookieStore.get(ONBOARDING_DRAFT_COOKIE)?.value ?? null;
  return markOnboardingDraftStatus({
    draftToken,
    status: "abandoned",
  });
}

export function readDraftSection<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  value: unknown
) {
  return isPlainObject(value) ? (value as T) : ({} as T);
}

export function pickDraftGuestId(params: {
  cookieStore: Pick<CookieTarget, "get">;
  draft: OnboardingDraft | null;
}) {
  return (
    params.draft?.guestId ??
    params.cookieStore.get(GUEST_USER_COOKIE)?.value ??
    null
  );
}
