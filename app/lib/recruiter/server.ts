import "server-only";

import { redirect } from "next/navigation";
import type { RecruiterAgency } from "@prisma/client";

import { auth } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

type RecruiterSession = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
} | null;

export type RecruiterAccessResult =
  | {
      ok: true;
      userId: string;
      agency: RecruiterAgency;
    }
  | {
      ok: false;
      reason: "UNAUTHENTICATED" | "NOT_RECRUITER";
      userId?: string;
    };

const DEFAULT_RECRUITER_CALLBACK_URL = "/recruiter/dashboard";

function getRecruiterAgencyDelegate() {
  const delegate = (
    prisma as typeof prisma & {
      recruiterAgency?: typeof prisma.recruiterAgency;
    }
  ).recruiterAgency;

  if (!delegate) {
    throw new Error(
      'Prisma client is stale: `prisma.recruiterAgency` is undefined even though `RecruiterAgency` exists in `prisma/schema.prisma`. Run `npx prisma generate` and restart the app server.'
    );
  }

  return delegate;
}

function buildRecruiterLoginUrl({
  callbackUrl,
  reason,
}: {
  callbackUrl: string;
  reason?: "not-recruiter";
}) {
  const params = new URLSearchParams({
    mode: "recruiter",
    callbackUrl,
  });

  if (reason) {
    params.set("reason", reason);
  }

  return `/login?${params.toString()}`;
}

export async function isRecruiterUser(userId: string | null | undefined) {
  if (!userId) return false;

  const recruiterAgency = getRecruiterAgencyDelegate();
  const agency = await recruiterAgency.findUnique({
    where: { ownerUserId: userId },
    select: { id: true },
  });

  return Boolean(agency);
}

export async function getRecruiterAccessResult(): Promise<RecruiterAccessResult> {
  const session = (await auth()) as RecruiterSession;
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;

  if (!userId) {
    return {
      ok: false,
      reason: "UNAUTHENTICATED",
    };
  }

  const recruiterAgency = getRecruiterAgencyDelegate();
  const agency = await recruiterAgency.findUnique({
    where: { ownerUserId: userId },
  });

  if (!agency) {
    return {
      ok: false,
      reason: "NOT_RECRUITER",
      userId,
    };
  }

  return {
    ok: true,
    userId,
    agency,
  };
}

export async function requireRecruiterContextOrRedirect(
  options?: { callbackUrl?: string } | string
) {
  const callbackUrl =
    typeof options === "string"
      ? options
      : options?.callbackUrl ?? DEFAULT_RECRUITER_CALLBACK_URL;
  const access = await getRecruiterAccessResult();

  if (!access.ok) {
    if (access.reason === "UNAUTHENTICATED") {
      redirect(buildRecruiterLoginUrl({ callbackUrl }));
    }

    redirect(buildRecruiterLoginUrl({ callbackUrl, reason: "not-recruiter" }));
  }

  return access;
}

export async function requireRecruiterAgencyForApi() {
  const access = await getRecruiterAccessResult();

  if (!access.ok) {
    return {
      ok: false as const,
      status: access.reason === "UNAUTHENTICATED" ? 401 : 403,
      error:
        access.reason === "UNAUTHENTICATED"
          ? "Unauthorized"
          : "Recruiter account required.",
    };
  }

  return {
    ok: true as const,
    userId: access.userId,
    agency: access.agency,
  };
}

export function dedupeNormalizedStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function parseStringListInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupeNormalizedStrings(value);
  }

  if (typeof value !== "string") {
    return [];
  }

  return dedupeNormalizedStrings(
    value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function toNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export function toNullableInteger(value: unknown) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}
