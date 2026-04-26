import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import { resolveDirectJobUrl } from "@/app/lib/apply/directJobResolver";
import { normalizeAdzunaProviderId } from "@/app/lib/jobs/adzunaProviderId";
import {
  isAggregatorHandoffUrl,
  isAdzunaUrl,
  isSearchResultsUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";

type ResolveApplyUrlBody = {
  source?: unknown;
  sourceJobId?: unknown;
  title?: unknown;
  company?: unknown;
  location?: unknown;
  originalSourceUrl?: unknown;
  jobUrl?: unknown;
  preferredDirectUrl?: unknown;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSource(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function isAggregatorSource(args: { source?: string | null; url?: string | null }) {
  const source = normalizeSource(args.source);
  const normalizedUrl = normalizeJobUrl(normalizeText(args.url));
  return (
    source.includes("adzuna") ||
    (normalizedUrl ? isAdzunaUrl(normalizedUrl) || isAggregatorHandoffUrl(normalizedUrl) : false)
  );
}

function normalizeSourceJobId(args: {
  source?: string | null;
  sourceJobId?: string | null;
}) {
  const rawSourceJobId = normalizeText(args.sourceJobId);
  const source = normalizeSource(args.source);
  const sourceJobLooksAdzuna = rawSourceJobId.toLowerCase().startsWith("adzuna:");
  if (source.includes("adzuna") || sourceJobLooksAdzuna) {
    return normalizeAdzunaProviderId(rawSourceJobId);
  }
  return rawSourceJobId || null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as ResolveApplyUrlBody;
    const source = normalizeSource(body.source);
    const title = normalizeText(body.title);
    const company = normalizeText(body.company);
    const location = normalizeText(body.location) || null;
    const originalSourceUrl = normalizeJobUrl(
      normalizeText(body.originalSourceUrl) || normalizeText(body.jobUrl),
    );
    const preferredDirectUrl = normalizeJobUrl(normalizeText(body.preferredDirectUrl));
    const sourceJobId = normalizeSourceJobId({
      source,
      sourceJobId: normalizeText(body.sourceJobId),
    });
    const isAggregatorJob = isAggregatorSource({
      source,
      url: originalSourceUrl,
    });

    if (!title || !company) {
      return NextResponse.json(
        {
          ok: false,
          error: "title and company are required.",
        },
        { status: 400 },
      );
    }

    const resolution = await resolveDirectJobUrl({
      title,
      company,
      location,
      currentUrl: originalSourceUrl,
      source,
      sourceJobId,
      preferredDirectUrl,
    });

    const resolvedApplyUrl = resolution.ok
      ? normalizeJobUrl(resolution.resolvedUrl ?? "")
      : "";
    const hasResolvedApplyUrl = Boolean(
      resolvedApplyUrl &&
        !isAdzunaUrl(resolvedApplyUrl) &&
        !isAggregatorHandoffUrl(resolvedApplyUrl) &&
        !isSearchResultsUrl(resolvedApplyUrl),
    );
    const status = hasResolvedApplyUrl
      ? "found"
      : isAggregatorJob
        ? "fallback_required"
        : "not_found";

    return NextResponse.json({
      ok: hasResolvedApplyUrl,
      status,
      source,
      isAggregatorJob,
      originalSourceUrl: originalSourceUrl || null,
      resolvedApplyUrl: hasResolvedApplyUrl ? resolvedApplyUrl : null,
      resolvedApplyUrlSource: hasResolvedApplyUrl ? "direct_search" : null,
      resolvedApplyUrlProvider:
        resolution.searchProvider ?? resolution.provider ?? null,
      resolvedApplyUrlConfidence: resolution.confidence ?? null,
      resolvedApplyUrlMatchReason: resolution.matchReason ?? null,
      resolvedApplyUrlStatus: status,
      queries: resolution.queries ?? [],
      candidates: resolution.candidates ?? [],
      error: resolution.error ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Failed to resolve apply URL.",
      },
      { status: 500 },
    );
  }
}
