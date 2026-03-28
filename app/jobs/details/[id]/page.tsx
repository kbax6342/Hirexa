"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  Building2,
  DollarSign,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import type { JobDetail, JobPretty } from "@/app/lib/jobs/types";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import StructuredJobDescription from "@/app/components/jobs/StructuredJobDescription";
import { cleanJobText } from "@/app/lib/jobs/clean-job-text";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";

type JobDetailsResponse = {
  job: JobDetail;
  pretty: JobPretty;
  fullDetailsUnavailable?: boolean;
};

type AdzunaStructuredJob = JobDetail & {
  salaryIsEstimated?: boolean;
  category?: string | null;
  descriptionIntro?: string[] | null;
};

function formatPosted(value?: string | null) {
  if (!value) return "";

  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function fallbackCompanyInitial(company?: string) {
  const normalized = (company ?? "").trim();
  return normalized ? normalized[0].toUpperCase() : "*";
}

function safeText(value?: string | null) {
  return String(value ?? "").trim();
}

function dedupeTextItems(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = safeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(safeText(value));
  }

  return result;
}

function splitParagraphs(value?: string | null) {
  return safeText(value)
    .split(/\n{2,}/)
    .map((paragraph) => safeText(paragraph))
    .filter(Boolean);
}

function firstNonEmptyText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = safeText(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function hasPrettyContent(pretty?: JobPretty | null) {
  return Boolean(pretty?.highlights.length || pretty?.sections.length);
}

function normalizePrettyResponse(value: unknown): JobPretty | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const highlights = Array.isArray(raw.highlights)
    ? raw.highlights
        .map((highlight) => {
          const item =
            highlight && typeof highlight === "object"
              ? (highlight as Record<string, unknown>)
              : null;
          const label = safeText(String(item?.label ?? ""));
          const valueText = safeText(String(item?.value ?? ""));

          return label && valueText ? { label, value: valueText } : null;
        })
        .filter(
          (
            highlight
          ): highlight is JobPretty["highlights"][number] => highlight !== null
        )
    : [];

  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((section) => {
          const item =
            section && typeof section === "object"
              ? (section as Record<string, unknown>)
              : null;

          const title = safeText(String(item?.title ?? ""));
          const kind = safeText(String(item?.kind ?? ""));
          if (!title || !kind) return null;

          const paragraphs = Array.isArray(item?.paragraphs)
            ? dedupeTextItems(item.paragraphs as string[])
            : [];
          const bullets = Array.isArray(item?.bullets)
            ? dedupeTextItems(item.bullets as string[])
            : [];
          const calloutLabel = safeText(
            String(
              item?.callout && typeof item.callout === "object"
                ? (item.callout as Record<string, unknown>).label ?? ""
                : ""
            )
          );
          const calloutValue = safeText(
            String(
              item?.callout && typeof item.callout === "object"
                ? (item.callout as Record<string, unknown>).value ?? ""
                : ""
            )
          );

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
        .filter(
          (section): section is JobPretty["sections"][number] => section !== null
        )
    : [];

  if (highlights.length === 0 && sections.length === 0) {
    return null;
  }

  return { highlights, sections };
}

function ensurePrettyContent(pretty: JobPretty | null, rawDescription: string) {
  if (hasPrettyContent(pretty)) {
    return pretty as JobPretty;
  }

  const paragraphs = dedupeTextItems(
    splitParagraphs(cleanJobText(rawDescription, { source: "adzuna" }))
  );
  if (paragraphs.length === 0) {
    return { highlights: [], sections: [] } satisfies JobPretty;
  }

  return {
    highlights: [],
    sections: [
      {
        title: "Position Overview",
        kind: "paragraphs",
        paragraphs,
      },
    ],
  } satisfies JobPretty;
}

function getPrettyHighlightValue(
  pretty: JobPretty | null,
  matcher: RegExp
) {
  const match = pretty?.highlights.find((highlight) => matcher.test(highlight.label));
  return safeText(match?.value);
}

export default function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<JobDetailsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adzunaPretty, setAdzunaPretty] = useState<JobPretty | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        setAdzunaPretty(null);

        const res = await fetch(`/api/jobs/details?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });

        const json = (await res.json()) as Partial<JobDetailsResponse> & {
          error?: string;
        };
        if (!res.ok || !json?.job || !json?.pretty) {
          throw new Error(json?.error ?? "Failed to load job details");
        }

        if (!cancelled) {
          setData(json as JobDetailsResponse);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setErr(error instanceof Error ? error.message : "Failed to load job details");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = useMemo(() => safeText(data?.job.title) || "Job Details", [data?.job.title]);
  const company = useMemo(
    () => safeText(data?.job.company) || "Unknown company",
    [data?.job.company]
  );
  const location = useMemo(
    () => safeText(data?.job.location) || "Unknown location",
    [data?.job.location]
  );
  const postedPretty = useMemo(() => formatPosted(data?.job.posted), [data?.job.posted]);
  const jobUrl = useMemo(
    () =>
      safeText(data?.job.externalUrl || data?.job.applyUrl || data?.job.jobUrl) || "",
    [data?.job.applyUrl, data?.job.externalUrl, data?.job.jobUrl]
  );

  const metadata = data?.job.metadata ?? {};
  const isAdzuna = data?.job.source === "adzuna";
  const adzunaDetail = (isAdzuna ? data?.job : null) as AdzunaStructuredJob | null;
  const compensation = safeText(
    data?.job.salaryText || data?.job.salary || (metadata.salary ? String(metadata.salary) : "")
  );
  const schedule = safeText(
    data?.job.employmentType ||
      (metadata.schedule ? String(metadata.schedule) : "") ||
      (metadata.category ? String(metadata.category) : "")
  );
  const workplace = data?.job.remote
    ? "Remote eligible"
    : safeText(metadata.telework ? String(metadata.telework) : "");
  const clearance = safeText(
    metadata.securityClearance ? String(metadata.securityClearance) : ""
  );

  const overviewItems = [
    schedule
      ? {
          label: "Schedule",
          value: schedule,
          icon: Briefcase,
        }
      : null,
    workplace
      ? {
          label: "Workplace",
          value: workplace,
          icon: MapPin,
        }
      : null,
    clearance
      ? {
          label: "Clearance",
          value: clearance,
          icon: ShieldCheck,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon: typeof Briefcase;
  }>;

  const adzunaSourceText = safeText(
    cleanJobText(
      adzunaDetail?.descriptionPlain ??
        adzunaDetail?.content ??
        adzunaDetail?.description ??
        "",
      { source: "adzuna" }
    )
  );

  const adzunaLocalPretty = useMemo(() => {
    if (!adzunaDetail) return null;

    const immediatePretty =
      data?.job.source === "adzuna" && hasPrettyContent(data.pretty)
        ? data.pretty
        : prettyFromDescription(adzunaSourceText, {
            source: "adzuna",
            detail: adzunaDetail,
          });

    return ensurePrettyContent(immediatePretty, adzunaSourceText);
  }, [adzunaDetail, adzunaSourceText, data?.job.source, data?.pretty]);

  const adzunaDisplayPretty = useMemo(() => {
    if (!adzunaDetail) return null;
    return ensurePrettyContent(adzunaPretty ?? adzunaLocalPretty, adzunaSourceText);
  }, [adzunaDetail, adzunaLocalPretty, adzunaPretty, adzunaSourceText]);

  const adzunaCategory = safeText(
    adzunaDetail?.category ||
      (typeof metadata.category === "string" ? metadata.category : "")
  );
  const adzunaEmploymentType = firstNonEmptyText(
    getPrettyHighlightValue(adzunaDisplayPretty, /employment/i),
    adzunaDetail?.employmentType,
    data?.job.employmentType
  );
  const adzunaSchedule = firstNonEmptyText(
    getPrettyHighlightValue(adzunaDisplayPretty, /schedule/i),
    typeof metadata.schedule === "string" ? metadata.schedule : ""
  );
  const adzunaCompensation = firstNonEmptyText(
    getPrettyHighlightValue(adzunaDisplayPretty, /compensation|salary/i),
    compensation,
    safeText(adzunaDetail?.salaryText ?? adzunaDetail?.salary)
  );
  const adzunaSnapshotItems = [
    { label: "Source", value: "Adzuna", icon: Briefcase },
    postedPretty
      ? { label: "Posted", value: postedPretty, icon: CalendarDays }
      : null,
    adzunaEmploymentType
      ? {
          label: "Employment Type",
          value: adzunaEmploymentType,
          icon: Briefcase,
        }
      : null,
    adzunaSchedule
      ? { label: "Schedule", value: adzunaSchedule, icon: CalendarDays }
      : null,
    adzunaCompensation
      ? { label: "Compensation", value: adzunaCompensation, icon: DollarSign }
      : null,
    adzunaCategory
      ? { label: "Category", value: adzunaCategory, icon: CheckCircle2 }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon: typeof Briefcase;
  }>;

  useEffect(() => {
    if (!isAdzuna || !adzunaDetail || !adzunaSourceText) return;
    if (adzunaPretty) return;

    let cancelled = false;

    async function enhanceAdzunaDetails() {
      try {
        const res = await fetch("/api/jobs/pretty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: data?.job.id ?? id,
            source: "adzuna",
            htmlOrText: adzunaSourceText,
          }),
        });

        const json = (await res.json()) as unknown;
        if (!res.ok || cancelled) return;

        const normalized = normalizePrettyResponse(json);
        if (!normalized) return;

        if (!cancelled) {
          setAdzunaPretty(ensurePrettyContent(normalized, adzunaSourceText));
        }
      } catch {
        // Keep the immediate local parser result if the canonical formatter fails.
      }
    }

    void enhanceAdzunaDetails();

    return () => {
      cancelled = true;
    };
  }, [
    adzunaDetail,
    adzunaPretty,
    adzunaSourceText,
    data?.job.id,
    id,
    isAdzuna,
  ]);

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <nav className="pt-6 text-sm text-slate-600">
          <Link href="/" className="font-semibold text-blue-800 hover:underline">
            Home
          </Link>
          <span className="mx-2 text-slate-400">&gt;</span>
          <Link href="/jobs" className="font-semibold text-blue-800 hover:underline">
            All Job Categories
          </Link>
        </nav>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Loading...
          </div>
        ) : null}

        {!loading && err ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
            {err}
          </div>
        ) : null}

        {!loading && data ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <section>
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 ring-1 ring-slate-200">
                    <span className="text-sm font-semibold text-slate-700">
                      {fallbackCompanyInitial(company)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                      {title}
                    </h1>

                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {company}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {location}
                      </span>
                      {adzunaCompensation || compensation ? (
                        <span className="inline-flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          {adzunaCompensation || compensation}
                        </span>
                      ) : null}
                    </div>

                    {postedPretty ? (
                      <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        Posted {postedPretty}
                      </div>
                    ) : null}

                    {isAdzuna ? <AdzunaAttribution className="mt-4" /> : null}
                  </div>
                </div>
              </section>

              {isAdzuna ? (
                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">Role Snapshot</div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    {adzunaSnapshotItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="flex gap-3">
                          <Icon className="mt-0.5 h-5 w-5 text-slate-500" />
                          <div>
                            <div className="text-xs font-semibold text-slate-500">
                              {item.label}
                            </div>
                            <div className="text-sm text-slate-800">{item.value}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : overviewItems.length > 0 ? (
                <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-semibold text-slate-900">Overview</div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    {overviewItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="flex gap-3">
                          <Icon className="mt-0.5 h-5 w-5 text-slate-500" />
                          <div>
                            <div className="text-xs font-semibold text-slate-500">
                              {item.label}
                            </div>
                            <div className="text-sm text-slate-800">{item.value}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="mt-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">Job Description</h2>
                  {data.fullDetailsUnavailable ? (
                    <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                      Showing the best available description for this source.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  {isAdzuna && adzunaDetail ? (
                    <StructuredJobDescription
                      pretty={adzunaDisplayPretty}
                      emptyMessage="Open the original posting for the latest full description and application instructions."
                      showHighlights={false}
                    />
                  ) : (
                    <StructuredJobDescription
                      detail={data.job}
                      pretty={data.pretty}
                      emptyMessage="Open the original posting for the latest full description and application instructions."
                    />
                  )}
                </div>
              </section>

              <div className="mt-10">
                <Link href="/jobs" prefetch={false} className="text-sm text-black hover:underline">
                  &larr; Back to Jobs
                </Link>
              </div>
            </div>

            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <h2 className="text-base font-semibold text-slate-900">
                  Want a tailored application for this job?
                </h2>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ATS Resume Rewrite
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Tailored Cover Letter
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Interview Prep
                  </li>
                </ul>
                <p className="mt-4 text-2xl font-bold text-slate-900">$29</p>
                <Link
                  href={`/job-hunter-pack?jobId=${encodeURIComponent(id)}`}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Buy Job Hunter Pack
                </Link>
                {jobUrl ? (
                  <a
                    href={jobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    Apply Externally -&gt;
                  </a>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
