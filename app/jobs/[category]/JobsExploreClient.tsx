// /Hirexa/my-app/app/jobs/[category]/JobsExplorerClient.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BuildingOffice2Icon,
  MapPinIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import MobileListLoadingScreen from "@/app/components/loading/MobileListLoadingScreen";
import { usePublicJobLocation } from "@/app/hooks/usePublicJobLocation";

export type Job = {
  id: string;
  title: string;
  company: string;
  source?: string;
  location?: string;
  posted?: string;
  salary?: string;
  jobUrl?: string;
  description?: string;
  schedule?: string;
  level?: string;
  tags?: string[];
};

type CareerLevel = "Entry" | "Experienced" | "Senior";

type JobAnalysis = {
  salary: string | null;
  careerLevel: CareerLevel | null;
  schedule: string | null;
  loading?: boolean;
};

type FormatRouteResponse = {
  formatted?: {
    salary?: string | null;
    careerLevel?: CareerLevel | null;
    schedule?: string | null;
  };
};

type Props = {
  categorySlug: string;
  categoryLabel: string;
  initialJobs: Job[];
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeDisplayText(value?: string | null) {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (
    /^(?:n\/a|na|none|unknown|unspecified|not specified|-+|salary n\/a)$/i.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

function normalizeSalaryText(value?: string | null) {
  const normalized = normalizeDisplayText(value);
  if (!normalized || !/\d/.test(normalized)) {
    return null;
  }

  const duplicateRangeMatch = normalized.match(
    /^(?<amount>\$?\d[\d,]*(?:\.\d+)?)\s*-\s*(?<same>\$?\d[\d,]*(?:\.\d+)?)(?<suffix>\s*\/\s*[A-Za-z][A-Za-z -]*)$/i
  );

  if (
    duplicateRangeMatch?.groups?.amount &&
    duplicateRangeMatch.groups.amount === duplicateRangeMatch.groups.same
  ) {
    return `${duplicateRangeMatch.groups.amount}${duplicateRangeMatch.groups.suffix}`;
  }

  return normalized;
}

function hasDisplaySalary(job: Pick<Job, "salary">) {
  if (job.salary == null) return false;

  const normalized = job.salary.trim();
  if (!normalized) return false;

  return ![
    "salary n/a",
    "n/a",
    "not provided",
    "unknown",
  ].includes(normalized.toLowerCase());
}

function getPreferredSelectedId(jobs: Job[], previousSelectedId?: string | null) {
  const visibleJobs = jobs.filter(hasDisplaySalary);

  if (
    previousSelectedId &&
    visibleJobs.some((job) => job.id === previousSelectedId)
  ) {
    return previousSelectedId;
  }

  return visibleJobs[0]?.id ?? null;
}

function normalizeCareerLevel(value?: string | null): CareerLevel | null {
  const normalized = normalizeDisplayText(value)?.toLowerCase();

  if (!normalized) return null;
  if (normalized.startsWith("entry")) return "Entry";
  if (normalized.startsWith("senior")) return "Senior";
  if (normalized === "experienced" || normalized.startsWith("mid")) {
    return "Experienced";
  }

  return null;
}

export default function JobsExplorerClient({
  categorySlug,
  categoryLabel,
  initialJobs,
}: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialJobs?.find(hasDisplaySalary)?.id ?? null
  );
  const [loading, setLoading] = useState(false);
  const [analysisByJobId, setAnalysisByJobId] = useState<
    Record<string, JobAnalysis>
  >({});
  const isMountedRef = useRef(true);
  const localizedFetchKeyRef = useRef<string | null>(null);
  const baseJobsLoadedRef = useRef(Boolean(initialJobs?.length));
  const [baseJobsLoaded, setBaseJobsLoaded] = useState(Boolean(initialJobs?.length));
  const publicLocation = usePublicJobLocation();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function refetch() {
      localizedFetchKeyRef.current = null;
      baseJobsLoadedRef.current = false;
      setBaseJobsLoaded(false);

      if (initialJobs?.length) {
        if (!ignore) {
          setJobs(initialJobs);
          setSelectedId((current) => getPreferredSelectedId(initialJobs, current));
          baseJobsLoadedRef.current = true;
          setBaseJobsLoaded(true);
        }
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `/api/jobs?category=${encodeURIComponent(categorySlug)}`
        );
        const data = (await res.json()) as { jobs?: Job[]; items?: Job[] };
        if (!ignore) {
          const nextJobs = data.jobs ?? data.items ?? [];
          setJobs(nextJobs);
          setSelectedId((current) => getPreferredSelectedId(nextJobs, current));
        }
      } catch {
        if (!ignore) {
          setJobs([]);
          setSelectedId(null);
        }
      } finally {
        if (!ignore) {
          baseJobsLoadedRef.current = true;
          setBaseJobsLoaded(true);
          setLoading(false);
        }
      }
    }

    void refetch();
    return () => {
      ignore = true;
    };
  }, [categorySlug, initialJobs]);

  const localizedSearch = useMemo(() => {
    const params = new URLSearchParams();

    if (publicLocation.locationLabel) {
      params.set("location", publicLocation.locationLabel);
    }
    if (publicLocation.stateName) {
      params.set("state", publicLocation.stateName);
    }

    return params.toString();
  }, [publicLocation.locationLabel, publicLocation.stateName]);

  useEffect(() => {
    if (!baseJobsLoaded || !baseJobsLoadedRef.current || !publicLocation.resolved) {
      return;
    }

    if (!localizedSearch) {
      return;
    }

    const requestKey = `${categorySlug}?${localizedSearch}`;
    if (localizedFetchKeyRef.current === requestKey) {
      return;
    }

    localizedFetchKeyRef.current = requestKey;
    let ignore = false;

    async function refetchWithLocation() {
      setLoading(true);

      try {
        const res = await fetch(
          `/api/jobs?category=${encodeURIComponent(categorySlug)}&${localizedSearch}`
        );
        const data = (await res.json()) as { jobs?: Job[]; items?: Job[] };

        if (!ignore) {
          const nextJobs = data.jobs ?? data.items ?? [];
          setJobs(nextJobs);
          setSelectedId((current) => getPreferredSelectedId(nextJobs, current));
        }
      } catch {
        // Keep the generic jobs feed if localized refetch fails.
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void refetchWithLocation();

    return () => {
      ignore = true;
    };
  }, [baseJobsLoaded, categorySlug, localizedSearch, publicLocation.resolved]);

  const visibleJobs = useMemo(() => jobs.filter(hasDisplaySalary), [jobs]);
  const selected = useMemo(
    () => visibleJobs.find((j) => j.id === selectedId) ?? visibleJobs[0] ?? null,
    [selectedId, visibleJobs]
  );
  const selectedDescription = useMemo(
    () =>
      typeof selected?.description === "string" ? selected.description.trim() : "",
    [selected?.description]
  );
  const selectedAnalysis = useMemo(
    () => (selected ? analysisByJobId[selected.id] ?? null : null),
    [analysisByJobId, selected]
  );
  const selectedSalary =
    normalizeSalaryText(selected?.salary) ?? selectedAnalysis?.salary ?? null;
  const selectedSchedule =
    selectedAnalysis?.schedule ?? normalizeDisplayText(selected?.schedule);
  const selectedCareerLevel =
    selectedAnalysis?.careerLevel ?? normalizeCareerLevel(selected?.level);
  const selectedIsAdzuna = selected?.source?.toLowerCase() === "adzuna";
  const loginHref = useMemo(
    () =>
      `/login?callbackUrl=${encodeURIComponent(`/jobs/${categorySlug}`)}`,
    [categorySlug]
  );

  useEffect(() => {
    if (!selectedId && visibleJobs[0]?.id) setSelectedId(visibleJobs[0].id);
    if (selectedId && !visibleJobs.some((j) => j.id === selectedId)) {
      setSelectedId(visibleJobs[0]?.id ?? null);
    }
    if (!visibleJobs.length && selectedId) {
      setSelectedId(null);
    }
  }, [selectedId, visibleJobs]);

  useEffect(() => {
    if (!selected?.id || !selectedDescription || selectedAnalysis) {
      return;
    }

    const jobId = selected.id;

    setAnalysisByJobId((prev) => ({
      ...prev,
      [jobId]: {
        salary: null,
        careerLevel: null,
        schedule: null,
        loading: true,
      },
    }));

    void (async () => {
      try {
        const res = await fetch("/api/jobs/format", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            text: selectedDescription,
          }),
        });

        const data = (await res.json()) as FormatRouteResponse & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data?.error ?? "Failed to analyze job");
        }

        if (!isMountedRef.current) return;

        setAnalysisByJobId((prev) => ({
          ...prev,
          [jobId]: {
            salary: normalizeSalaryText(data?.formatted?.salary),
            careerLevel: normalizeCareerLevel(data?.formatted?.careerLevel),
            schedule: normalizeDisplayText(data?.formatted?.schedule),
          },
        }));
      } catch {
        if (!isMountedRef.current) return;

        setAnalysisByJobId((prev) => ({
          ...prev,
          [jobId]: {
            salary: null,
            careerLevel: null,
            schedule: null,
          },
        }));
      }
    })();
  }, [selected, selectedAnalysis, selectedDescription]);

  if (loading && visibleJobs.length === 0) {
    return (
      <MobileListLoadingScreen
        eyebrow="Category Matches"
        title={`Loading ${categoryLabel} jobs`}
        subtitle={
          publicLocation.locationLabel
            ? `Pulling fresh ${categoryLabel.toLowerCase()} roles near ${publicLocation.locationLabel}.`
            : `Pulling fresh ${categoryLabel.toLowerCase()} roles for this category.`
        }
        sectionCount={1}
        cardsPerSection={4}
        minHeightClass="min-h-[70vh]"
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-[90] lg:px-6">
      <div className="mb-4 max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Discover the Best {categoryLabel} Jobs. Apply Smarter.
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/80">
          Hirexa finds roles that match your skills and helps you apply in
          minutes instead of hours.
        </p>
        {publicLocation.locationLabel ? (
          <p className="mt-3 text-xs font-medium tracking-wide text-white/70">
            Showing jobs near {publicLocation.locationLabel}
          </p>
        ) : publicLocation.stateName ? (
          <p className="mt-3 text-xs font-medium tracking-wide text-white/70">
            Personalized for {publicLocation.stateName}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <aside className="lg:col-span-6">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">
                {visibleJobs.length ? `${visibleJobs.length} jobs` : "Live job matches"}
                {loading && visibleJobs.length > 0 ? (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    Refreshing...
                  </span>
                ) : null}
              </div>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-black hover:text-black/80"
              >
                Back
              </Link>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {visibleJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    No jobs with salary found
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Try another category.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleJobs.map((job) => {
                    const active = job.id === (selected?.id ?? selectedId);
                    const normalizedSalary = normalizeSalaryText(job.salary);
                    const isAdzunaJob = job.source?.toLowerCase() === "adzuna";

                    return (
                      <div
                        key={job.id}
                        className={cx(
                          "rounded-2xl border p-4 shadow-sm transition",
                          active
                            ? "border-sky-200 bg-sky-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(job.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {job.title}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                                <span className="inline-flex items-center gap-1">
                                  <BuildingOffice2Icon className="h-4 w-4 text-slate-400" />
                                  {job.company}
                                </span>
                                {job.location ? (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPinIcon className="h-4 w-4 text-slate-400" />
                                    {job.location}
                                  </span>
                                ) : null}
                              </div>

                              {job.posted ? (
                                <div className="mt-3 line-clamp-1 text-xs text-slate-500">
                                  {job.posted}
                                </div>
                              ) : (
                                <div className="mt-3 h-4" />
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {normalizedSalary ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                  {normalizedSalary}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>

                        {isAdzunaJob ? <AdzunaAttribution className="mt-3" /> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-6">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-6">
              {!selected ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    Select a job
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Choose a job on the left to view details.
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-h-0 flex-1 overflow-auto pr-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold text-slate-900">
                          {selected.title}
                        </h2>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <BuildingOffice2Icon className="h-5 w-5 text-slate-400" />
                            {selected.company}
                          </span>
                          {selected.location ? (
                            <span className="inline-flex items-center gap-2">
                              <MapPinIcon className="h-5 w-5 text-slate-400" />
                              {selected.location}
                            </span>
                          ) : null}
                        </div>

                        {selectedIsAdzuna ? <AdzunaAttribution className="mt-4" /> : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={loginHref}
                          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                        >
                          Apply with Hirexa
                        </Link>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-5">
                      <div className="text-md font-semibold text-slate-900 mb-3">
                        Automate your job search with Hirexa AI.
                      </div>
                          
                      <Link
                        href="/how-it-works"
                        className="m rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Learn more about Hirexa
                      </Link>
                    </div>
                  </div>

                  <div className="pt-5">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">
                          Overview
                        </div>
                        <span className="text-xs text-slate-500">
                          {selected.posted ?? ""}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <ClockIcon className="h-4 w-4 text-slate-400" />
                            Schedule
                          </div>
                          <div className="mt-1 text-sm text-slate-900">
                            {selectedSchedule ?? "-"}
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <CurrencyDollarIcon className="h-4 w-4 text-slate-400" />
                            Salary
                          </div>
                          <div className="mt-1 text-sm text-slate-900">
                            {selectedSalary ?? "-"}
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <CheckCircleIcon className="h-4 w-4 text-slate-400" />
                            Career level
                          </div>
                          <div className="mt-1 text-sm text-slate-900">
                            {selectedCareerLevel ?? "-"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="text-sm font-semibold text-slate-900">
                        Job Description
                      </div>
                      <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                        {selected.description ? (
                          <p className="whitespace-pre-wrap">
                            {selected.description}
                          </p>
                        ) : (
                          <p className="text-slate-600">
                            No description provided yet. (Wire this to your
                            scraper/API.)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
