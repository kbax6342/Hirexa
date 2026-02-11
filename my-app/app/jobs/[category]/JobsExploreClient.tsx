//Hirexa/my-app/app/jobs/[category]/JobsExplorerClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BuildingOffice2Icon,
  MapPinIcon,
  CurrencyDollarIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string;
  posted?: string;
  salary?: string;
  jobUrl?: string;
  description?: string;
  schedule?: string; // "Full-time", etc
  level?: string; // "Senior-level", etc
  tags?: string[];
};

type Props = {
  categorySlug: string;
  categoryLabel: string;
  initialJobs: Job[];
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function JobsExplorerClient({
  categorySlug,
  categoryLabel,
  initialJobs,
}: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialJobs?.[0]?.id ?? null
  );
  const [q, setQ] = useState("");
  const [onlyWithSalary, setOnlyWithSalary] = useState(false);
  const [loading, setLoading] = useState(false);

  // Optional: client refresh when category changes (or when initialJobs empty)
  useEffect(() => {
    let ignore = false;

    async function refetch() {
      // If SSR already gave jobs, you can skip refetch.
      if (initialJobs?.length) return;

      setLoading(true);
      try {
        const res = await fetch(`/api/jobs?category=${encodeURIComponent(categorySlug)}`);
        const data = (await res.json()) as { jobs?: Job[] };
        if (!ignore) {
          const nextJobs = data.jobs ?? [];
          setJobs(nextJobs);
          setSelectedId(nextJobs?.[0]?.id ?? null);
        }
      } catch {
        if (!ignore) setJobs([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    refetch();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySlug]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (jobs ?? [])
      .filter((j) => (onlyWithSalary ? Boolean(j.salary) : true))
      .filter((j) => {
        if (!needle) return true;
        const hay = `${j.title} ${j.company} ${j.location ?? ""} ${(j.tags ?? []).join(" ")}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [jobs, q, onlyWithSalary]);

  const selected = useMemo(
    () => filtered.find((j) => j.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    // Keep selection valid when filters change
    if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);
    if (selectedId && !filtered.some((j) => j.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-6">
      {/* Top bar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs text-slate-500">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>{" "}
            <span className="mx-1">›</span>
            <span className="text-slate-600">Jobs</span>
            <span className="mx-1">›</span>
            <span className="font-medium text-slate-700">{categoryLabel}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {categoryLabel} Jobs
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Browse your matches and open any job to view details on the right.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/matches"
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to Matches
          </Link>
        </div>
      </div>

      {/* Layout */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left: list */}
        <aside className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Search + filters */}
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search title, company, location…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none ring-0 focus:border-sky-300 focus:bg-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyWithSalary((v) => !v)}
                  className={cx(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold shadow-sm",
                    onlyWithSalary
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  aria-pressed={onlyWithSalary}
                >
                  <FunnelIcon className="h-5 w-5" />
                  Salary
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {loading ? "Loading…" : `${filtered.length} job${filtered.length === 1 ? "" : "s"}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setOnlyWithSalary(false);
                  }}
                  className="font-semibold text-slate-600 hover:text-slate-900"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[70vh] overflow-auto p-3">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <div className="text-sm font-semibold text-slate-900">No jobs found</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Try clearing filters or changing your search.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((job) => {
                    const active = job.id === (selected?.id ?? selectedId);
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => setSelectedId(job.id)}
                        className={cx(
                          "w-full text-left rounded-2xl border p-4 transition shadow-sm",
                          active
                            ? "border-sky-200 bg-sky-50/50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        )}
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

                            {/* Posted */}
                            {job.posted ? (
                              <div className="mt-3 text-xs text-slate-500 line-clamp-1">
                                {job.posted}
                              </div>
                            ) : (
                              <div className="mt-3 h-4" />
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {job.salary ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                {job.salary}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                                Salary N/A
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Right: details */}
        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="p-5 sm:p-6">
              {!selected ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                  <div className="text-sm font-semibold text-slate-900">Select a job</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Choose a job on the left to view details.
                  </div>
                </div>
              ) : (
                <>
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
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
                      >
                        Apply with Hirexa
                      </button>

                      {selected.jobUrl ? (
                        <a
                          href={selected.jobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          View source
                          <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* Value callout (like screenshot) */}
                  <div className="mt-6 rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-5">
                    <div className="text-sm font-semibold text-slate-900">
                      Automate your job search with Hirexa.
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      <li className="flex gap-2">
                        <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <span>
                          Submit more applications with less effort using AI-assisted autofill.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <span>
                          Get better matches by aligning roles to your resume and preferences.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <span>
                          Generate cover letters and follow-ups tailored to each job.
                        </span>
                      </li>
                    </ul>

                    <button
                      type="button"
                      className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Learn more about Hirexa
                    </button>
                  </div>

                  {/* Overview */}
                  <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">Overview</div>
                      <span className="text-xs text-slate-500">{selected.posted ?? ""}</span>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <ClockIcon className="h-4 w-4 text-slate-400" />
                          Schedule
                        </div>
                        <div className="mt-1 text-sm text-slate-900">
                          {selected.schedule ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <CurrencyDollarIcon className="h-4 w-4 text-slate-400" />
                          Salary
                        </div>
                        <div className="mt-1 text-sm text-slate-900">
                          {selected.salary ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                          <CheckCircleIcon className="h-4 w-4 text-slate-400" />
                          Career level
                        </div>
                        <div className="mt-1 text-sm text-slate-900">
                          {selected.level ?? "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Job Description */}
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-slate-900">Job Description</div>
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                      {selected.description ? (
                        <p className="whitespace-pre-wrap">{selected.description}</p>
                      ) : (
                        <p className="text-slate-600">
                          No description provided yet. (Wire this to your scraper/API.)
                        </p>
                      )}
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
