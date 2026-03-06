// /Hirexa/my-app/app/jobs/[category]/JobsExplorerClient.tsx
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
  schedule?: string;
  level?: string;
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
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [savingApplicationId, setSavingApplicationId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let ignore = false;

    async function refetch() {
      if (initialJobs?.length) return;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/jobs?category=${encodeURIComponent(categorySlug)}`
        );
        const data = (await res.json()) as { jobs?: Job[]; items?: Job[] };
        if (!ignore) {
          const nextJobs = data.jobs ?? data.items ?? [];
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

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? jobs[0] ?? null,
    [jobs, selectedId]
  );

  useEffect(() => {
    if (!selectedId && jobs[0]?.id) setSelectedId(jobs[0].id);
    if (selectedId && !jobs.some((j) => j.id === selectedId)) {
      setSelectedId(jobs[0]?.id ?? null);
    }
  }, [jobs, selectedId]);

  async function applyToSelectedJob(job: Job) {
    setSaveMessage("");
    setSavingApplicationId(job.id);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceJobId: job.id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          jobUrl: job.jobUrl,
          status: "IN_PROGRESS",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveMessage(data?.error ?? "Could not save this application.");
        return;
      }

      setSaveMessage("Application saved. You can track it on /applications.");
    } catch {
      setSaveMessage("Could not save this application right now.");
    } finally {
      setSavingApplicationId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-[90] lg:px-6">
      <div className="max-w-4xl mb-4">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Discover the Best {categoryLabel} Jobs. Apply Smarter.
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/80">
          Hirexa finds roles that match your skills and helps you apply in
          minutes instead of hours.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <aside className="lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm h-[70vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">
                {loading ? "Loading jobs..." : `${jobs.length} jobs`}
              </div>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-black hover:text-black/80"
              >
                Back
              </Link>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {jobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    No jobs found
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Try another category.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => {
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

        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm h-[70vh] flex flex-col">
            <div className="p-5 sm:p-6 flex-1 flex flex-col min-h-0">
              {!selected ? (
                <div className="flex-1 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    Select a job
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Choose a job on the left to view details.
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 overflow-auto pr-1">
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
                          onClick={() => applyToSelectedJob(selected)}
                          disabled={savingApplicationId === selected.id}
                          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                        >
                          {savingApplicationId === selected.id
                            ? "Saving..."
                            : "Apply with Hirexa"}
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

                    {saveMessage ? (
                      <p className="mt-3 text-sm text-slate-700">{saveMessage}</p>
                    ) : null}

                    <div className="mt-6 rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-5">
                      <div className="text-sm font-semibold text-slate-900">
                        Automate your job search with Hirexa.
                      </div>
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        <li className="flex gap-2">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <span>
                            Submit more applications with less effort using
                            AI-assisted autofill.
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <span>
                            Get better matches by aligning roles to your resume
                            and preferences.
                          </span>
                        </li>
                        <li className="flex gap-2">
                          <CheckCircleIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
                          <span>
                            Generate cover letters and follow-ups tailored to
                            each job.
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
