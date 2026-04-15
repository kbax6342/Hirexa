"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import JobDetailsPanel from "@/app/components/dashboard/JobDetailsPanel";
import {
  buildApplyProviderPayload,
  detectApplyProviderFromUrl,
} from "@/app/lib/apply/providerDetection";
import { readJobDetailSummary } from "@/app/lib/jobs/clientDetailSummary";
import type {
  Job,
  JobDetail,
  JobDetailSection,
  JobPretty,
} from "@/app/lib/jobs/types";

type JobDetailsRouteClientProps = {
  jobId: string;
};

type JobDetailsResponse = {
  job: JobDetail;
  pretty: JobPretty;
  fullDetailsUnavailable?: boolean;
};

type PlanStatusResponse = {
  active?: boolean;
  pending?: boolean;
};

type AdzunaDetailsResponse = {
  id?: string | number | null;
  title?: string | null;
  company?: string | { display_name?: string | null } | null;
  companyName?: string | null;
  location?:
    | string
    | {
        display_name?: string | null;
        area?: Array<string | null | undefined> | null;
      }
    | null;
  posted?: string | null;
  created?: string | null;
  postedLabel?: string | null;
  salary?: string | null;
  salaryText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryIsEstimated?: boolean | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: boolean | number | string | null;
  employmentType?: string | null;
  schedule?: string | null;
  contract_time?: string | null;
  category?: string | { label?: string | null; tag?: string | null } | null;
  source?: string | null;
  redirect_url?: string | null;
  descriptionIntro?: string[] | null;
  responsibilities?: Array<string | null | undefined> | null;
  qualifications?: Array<string | null | undefined> | null;
  benefits?: Array<string | null | undefined> | null;
  sections?:
    | Array<{
        title?: string | null;
        kind?: "paragraphs" | "bullets" | "callout" | "smallprint" | null;
        paragraphs?: Array<string | null | undefined> | null;
        bullets?: Array<string | null | undefined> | null;
        callout?:
          | {
              label?: string | null;
              value?: string | null;
            }
          | null;
      }>
    | null;
  description?: string | null;
  descriptionText?: string | null;
  descriptionHtml?: string | null;
  content?: string | null;
  contentHtml?: string | null;
  rawDescription?: string | null;
  summary?: string | null;
  snippet?: string | null;
  jobUrl?: string | null;
  applyUrl?: string | null;
  externalUrl?: string | null;
  url?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
  job?: AdzunaDetailsResponse | null;
  result?: AdzunaDetailsResponse | null;
  error?: string;
};

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : "";
}

function normalizeStringArray(values: Array<string | null | undefined> | null | undefined) {
  return (values ?? [])
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function normalizeLocationPart(value: string | null | undefined) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function dedupeLocationParts(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values
    .map((value) => normalizeLocationPart(value))
    .filter((value) => {
      const key = value.toLowerCase().replace(/\./g, "").trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeLocationString(value: string | null | undefined) {
  const parts = dedupeLocationParts(String(value ?? "").split(","));
  return parts.join(", ");
}

function isAdzunaJobId(value: string) {
  return value.toLowerCase().startsWith("adzuna:");
}

function decodeAdzunaProviderId(fullId: string) {
  const [, rawProviderId = ""] = fullId.split(":", 2);
  const decodedSegment = (() => {
    try {
      return decodeURIComponent(rawProviderId);
    } catch {
      return rawProviderId;
    }
  })();
  const trimmed = decodedSegment.trim();
  if (!trimmed) return "";

  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = atob(padded);
    if (!decoded.includes("::")) {
      return trimmed;
    }
    const [decodedId] = decoded.split("::").filter(Boolean);
    const normalizedDecodedId = normalizeText(decodedId);
    return normalizedDecodedId || trimmed;
  } catch {
    return trimmed;
  }
}

function normalizeAdzunaPayload(payload: AdzunaDetailsResponse) {
  if (payload.job && typeof payload.job === "object") {
    return payload.job;
  }

  if (payload.result && typeof payload.result === "object") {
    return payload.result;
  }

  return payload;
}

function readAdzunaCompany(payload: AdzunaDetailsResponse) {
  if (payload.company && typeof payload.company === "object") {
    return normalizeText(payload.company.display_name);
  }

  return normalizeText(
    typeof payload.company === "string" ? payload.company : payload.companyName
  );
}

function readAdzunaLocation(payload: AdzunaDetailsResponse) {
  if (payload.location && typeof payload.location === "object") {
    const displayName = normalizeLocationString(payload.location.display_name);
    if (displayName) return displayName;

    const area = dedupeLocationParts(payload.location.area ?? []);
    if (area.length > 0) {
      return area.slice(-2).reverse().join(", ");
    }
  }

  return normalizeLocationString(
    typeof payload.location === "string" ? payload.location : null
  );
}

function isEstimatedSalary(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function formatAdzunaSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  estimated: unknown,
) {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);

  if (!hasMin && !hasMax) return "";

  const estimatedTag = isEstimatedSalary(estimated) ? " (Estimated)" : "";

  if (hasMin && hasMax) {
    return `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()}${estimatedTag}`;
  }

  if (hasMin) {
    return `From $${Math.round(min).toLocaleString()}${estimatedTag}`;
  }

  return `Up to $${Math.round(max!).toLocaleString()}${estimatedTag}`;
}

function readAdzunaCategory(payload: AdzunaDetailsResponse) {
  if (payload.category && typeof payload.category === "object") {
    const label = normalizeText((payload.category as { label?: string | null }).label);
    const tag = normalizeText((payload.category as { tag?: string | null }).tag);
    return label || tag;
  }

  return normalizeText(
    typeof payload.category === "string" ? payload.category : null
  );
}

function buildAdzunaPretty(payload: AdzunaDetailsResponse, detail: JobDetail): JobPretty {
  const highlights = [
    { label: "Source", value: "Adzuna" },
    detail.salaryText ? { label: "Compensation", value: detail.salaryText } : null,
    detail.employmentType
      ? { label: "Employment Type", value: detail.employmentType }
      : null,
    detail.category ? { label: "Category", value: detail.category } : null,
    normalizeText(payload.postedLabel) || normalizeText(payload.created)
      ? {
          label: "Posted",
          value: normalizeText(payload.postedLabel) || normalizeText(payload.created),
        }
      : null,
  ].filter(Boolean) as JobPretty["highlights"];

  const intro = normalizeStringArray(payload.descriptionIntro);
  const sections = (payload.sections ?? [])
    .map((section) => {
      const title = normalizeText(section?.title);
      const kind = section?.kind ?? "paragraphs";
      const paragraphs = normalizeStringArray(section?.paragraphs);
      const bullets = normalizeStringArray(section?.bullets);
      const calloutValue = normalizeText(section?.callout?.value);
      const calloutLabel = normalizeText(section?.callout?.label);

      if (!title) return null;

      if (kind === "bullets" && bullets.length > 0) {
        return { title, kind: "bullets" as const, bullets };
      }

      if (kind === "callout" && calloutValue) {
        return {
          title,
          kind: "callout" as const,
          callout: calloutLabel
            ? { label: calloutLabel, value: calloutValue }
            : { value: calloutValue },
        };
      }

      if (kind === "smallprint" && paragraphs.length > 0) {
        return { title, kind: "smallprint" as const, paragraphs };
      }

      if (paragraphs.length > 0) {
        return { title, kind: "paragraphs" as const, paragraphs };
      }

      return null;
    })
    .filter((section): section is JobPretty["sections"][number] => section !== null);

  if (intro.length > 0) {
    sections.unshift({
      title: "Position Overview",
      kind: "paragraphs",
      paragraphs: intro,
    });
  }

  return {
    highlights,
    sections,
  };
}

function buildAdzunaDetailSections(payload: AdzunaDetailsResponse) {
  const sections: JobDetailSection[] = [];

  for (const section of payload.sections ?? []) {
    const title = normalizeText(section?.title);
    const kind = section?.kind ?? "paragraphs";
    const paragraphs = normalizeStringArray(section?.paragraphs);
    const bullets = normalizeStringArray(section?.bullets);
    const calloutValue = normalizeText(section?.callout?.value);
    const calloutLabel = normalizeText(section?.callout?.label);

    if (!title) continue;

    if (kind === "bullets" && bullets.length > 0) {
      sections.push({ title, kind: "bullets", bullets });
      continue;
    }

    if (kind === "callout" && calloutValue) {
      sections.push({
        title,
        kind: "callout",
        callout: calloutLabel
          ? { label: calloutLabel, value: calloutValue }
          : { value: calloutValue },
      });
      continue;
    }

    if (kind === "smallprint" && paragraphs.length > 0) {
      sections.push({ title, kind: "smallprint", paragraphs });
      continue;
    }

    if (paragraphs.length > 0) {
      sections.push({ title, kind: "paragraphs", paragraphs });
    }
  }

  return sections;
}

function mapAdzunaDetailToJobDetail(
  jobId: string,
  payload: AdzunaDetailsResponse,
  summary: Job | null,
): JobDetail {
  const normalizedPayload = normalizeAdzunaPayload(payload);
  const title =
    normalizeText(normalizedPayload.title) || summary?.title || "Unknown title";
  const company =
    readAdzunaCompany(normalizedPayload) ||
    summary?.company ||
    "Unknown company";
  const location =
    readAdzunaLocation(normalizedPayload) ||
    normalizeLocationString(summary?.location) ||
    "Unknown location";
  const posted =
    normalizeText(normalizedPayload.postedLabel) ||
    normalizeText(normalizedPayload.posted) ||
    normalizeText(normalizedPayload.created) ||
    summary?.posted ||
    "Recently";
  const salaryText =
    normalizeText(normalizedPayload.salaryText) ||
    normalizeText(normalizedPayload.salary) ||
    formatAdzunaSalary(
      normalizedPayload.salaryMin ?? normalizedPayload.salary_min,
      normalizedPayload.salaryMax ?? normalizedPayload.salary_max,
      normalizedPayload.salaryIsEstimated ?? normalizedPayload.salary_is_predicted,
    ) ||
    summary?.salary ||
    null;
  const jobUrl =
    normalizeText(normalizedPayload.externalUrl) ||
    normalizeText(normalizedPayload.applyUrl) ||
    normalizeText(normalizedPayload.jobUrl) ||
    normalizeText(normalizedPayload.redirect_url) ||
    normalizeText(normalizedPayload.url) ||
    summary?.jobUrl ||
    "";
  const descriptionHtml =
    normalizeText(normalizedPayload.descriptionHtml) ||
    normalizeText(normalizedPayload.contentHtml);
  const descriptionPlain =
    normalizeText(normalizedPayload.descriptionText) ||
    normalizeText(normalizedPayload.description) ||
    normalizeText(normalizedPayload.content) ||
    normalizeText(normalizedPayload.rawDescription) ||
    normalizeText(normalizedPayload.summary) ||
    normalizeText(normalizedPayload.snippet) ||
    normalizeText(summary?.description);
  const preferredDescription = descriptionHtml || descriptionPlain;
  const salaryIsEstimated =
    normalizedPayload.salaryIsEstimated ??
    isEstimatedSalary(normalizedPayload.salary_is_predicted);
  const employmentType =
    normalizeText(normalizedPayload.contract_time) ||
    normalizeText(normalizedPayload.employmentType) ||
    normalizeText(normalizedPayload.schedule) ||
    null;
  const category = readAdzunaCategory(normalizedPayload) || null;

  return {
    id: jobId,
    source: "adzuna",
    title,
    company,
    location,
    posted,
    salary: salaryText ?? undefined,
    salaryText,
    salaryMin:
      typeof (normalizedPayload.salaryMin ?? normalizedPayload.salary_min) === "number"
        ? (normalizedPayload.salaryMin ?? normalizedPayload.salary_min)
        : null,
    salaryMax:
      typeof (normalizedPayload.salaryMax ?? normalizedPayload.salary_max) === "number"
        ? (normalizedPayload.salaryMax ?? normalizedPayload.salary_max)
        : null,
    salaryIsEstimated,
    employmentType,
    category,
    description: preferredDescription || undefined,
    descriptionPlain: descriptionPlain || null,
    descriptionHtml: descriptionHtml || null,
    content: preferredDescription || null,
    contentHtml: descriptionHtml || null,
    duties: normalizeStringArray(normalizedPayload.responsibilities),
    requirements: normalizeStringArray(normalizedPayload.qualifications),
    benefits: normalizeStringArray(normalizedPayload.benefits),
    summary:
      normalizeText(normalizedPayload.summary) ||
      descriptionPlain ||
      summary?.description ||
      null,
    snippet:
      normalizeText(normalizedPayload.snippet) ||
      descriptionPlain ||
      summary?.description ||
      null,
    jobUrl: jobUrl || undefined,
    applyUrl: jobUrl || null,
    externalUrl: jobUrl || null,
    descriptionIntro: normalizeStringArray(normalizedPayload.descriptionIntro),
    sections: buildAdzunaDetailSections(normalizedPayload),
    detailLevel: descriptionHtml ? "full" : descriptionPlain ? "partial" : "summary",
    providerHasFullDetails: Boolean(descriptionHtml || descriptionPlain),
    metadata: normalizedPayload.metadata ?? {
      source: "Adzuna",
      salaryText: salaryText,
      salaryIsEstimated,
      employmentType,
      category,
    },
  };
}

function normalizeJobUrl(job: JobDetail | null) {
  return String(job?.externalUrl ?? job?.applyUrl ?? job?.jobUrl ?? "").trim();
}

export default function JobDetailsRouteClient({
  jobId,
}: JobDetailsRouteClientProps) {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [pretty, setPretty] = useState<JobPretty>({ sections: [], highlights: [] });
  const [aiApplyLoading, setAiApplyLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setDetailsError("Missing job id.");
      setDetailsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadDetails() {
      try {
        setDetailsLoading(true);
        setDetailsError(null);

        const storedSummary = readJobDetailSummary("public", jobId);

        if (isAdzunaJobId(jobId)) {
          const providerId = decodeAdzunaProviderId(jobId);

          if (providerId) {
            const adzunaResponse = await fetch(
              `/api/adzuna/details?id=${encodeURIComponent(providerId)}`,
              {
                cache: "no-store",
              }
            );
            const adzunaPayload = (await adzunaResponse.json()) as AdzunaDetailsResponse;

            if (adzunaResponse.ok) {
              if (cancelled) return;

              const mappedJob = mapAdzunaDetailToJobDetail(
                jobId,
                adzunaPayload,
                storedSummary,
              );
              setJob(mappedJob);
              setPretty(buildAdzunaPretty(normalizeAdzunaPayload(adzunaPayload), mappedJob));
              return;
            }
          }
        }

        const requestInit = storedSummary
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ job: storedSummary }),
            }
          : undefined;

        const response = await fetch(
          requestInit
            ? "/api/jobs/details"
            : `/api/jobs/details?id=${encodeURIComponent(jobId)}`,
          {
            cache: "no-store",
            ...(requestInit ?? {}),
          }
        );

        const payload = (await response.json()) as Partial<JobDetailsResponse> & {
          error?: string;
        };

        if (!response.ok || !payload?.job || !payload?.pretty) {
          throw new Error(payload?.error ?? "Failed to load job details");
        }

        if (cancelled) return;

        setJob(payload.job);
        setPretty(payload.pretty);
      } catch (error) {
        if (cancelled) return;

        setJob(null);
        setPretty({ sections: [], highlights: [] });
        setDetailsError(
          error instanceof Error ? error.message : "Failed to load job details"
        );
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const externalApplyUrl = useMemo(() => normalizeJobUrl(job), [job]);
  const applyProvider = useMemo(
    () => detectApplyProviderFromUrl(externalApplyUrl),
    [externalApplyUrl]
  );

  async function handleAutoApply() {
    if (!externalApplyUrl) return;
    if (aiApplyLoading) return;

    const aiApplyHref = `/job-tools/ai-assistant/apply?jobUrl=${encodeURIComponent(externalApplyUrl)}`;

    if (!applyProvider || !job) {
      router.push(aiApplyHref);
      return;
    }

    setAiApplyLoading(true);

    try {
      const callbackHref =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : `/jobs/${encodeURIComponent(jobId)}`;

      if (authStatus === "loading") {
        return;
      }

      if (authStatus !== "authenticated") {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return;
      }

      const readPlanStatus = async (forceSync: boolean) => {
        const response = await fetch(
          forceSync
            ? "/api/billing/plan-status?forceSync=1"
            : "/api/billing/plan-status",
          { cache: "no-store" }
        );

        if (response.status === 401) {
          router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
          return null;
        }

        if (!response.ok) {
          throw new Error("Unable to verify subscription status.");
        }

        return (await response.json()) as PlanStatusResponse;
      };

      let planData = await readPlanStatus(false);
      if (!planData) return;

      if (planData.pending === true || planData.active !== true) {
        const refreshedPlanData = await readPlanStatus(true);
        if (!refreshedPlanData) return;
        planData = refreshedPlanData;
      }

      if (planData.pending === true || planData.active !== true) {
        const params = new URLSearchParams();
        params.set("source", `${applyProvider}-auto-apply`);
        params.set("jobUrl", externalApplyUrl);
        router.push(`/plans?${params.toString()}`);
        return;
      }

      const createResponse = await fetch("/api/applications/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildApplyProviderPayload({
            ...job,
            jobUrl: externalApplyUrl,
          })
        ),
      });

      const createPayload = (await createResponse.json()) as {
        applicationId?: string;
        error?: string;
      };

      if (!createResponse.ok || !createPayload?.applicationId) {
        throw new Error(createPayload?.error ?? "Unable to start auto apply.");
      }

      router.push(
        `/dashboard/application/${createPayload.applicationId}/audit?successJobId=${encodeURIComponent(jobId)}`
      );
    } catch (error) {
      console.error("[JOB_DETAILS_AUTO_APPLY] falling back to AI apply", error);
      router.push(aiApplyHref);
    } finally {
      setAiApplyLoading(false);
    }
  }

  function handleCareerCoach() {
    router.push(`/job-tools/career-coach?jobId=${encodeURIComponent(jobId)}`);
  }

  function handleOutreach() {
    router.push(
      `/job-tools/agents/linkedin-outreach?jobId=${encodeURIComponent(jobId)}`
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="mt-[60] flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/saved-jobs"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Back to Saved Jobs
          </Link>

          <Link
            href="/jobs"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Browse Jobs
          </Link>
        </div>

        <JobDetailsPanel
          job={job}
          pretty={pretty}
          formatted={null}
          detailsLoading={detailsLoading}
          detailsError={detailsError}
          aiApplyLoading={aiApplyLoading}
          aiApplyDisabled={!externalApplyUrl}
          aiApplyLabel="Auto Apply Now"
          aiApplyLoadingLabel="Starting auto apply..."
          onAiApply={handleAutoApply}
          onCareerCoach={handleCareerCoach}
          onOutreach={handleOutreach}
        />

        {externalApplyUrl ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={externalApplyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Apply on Company Site
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
