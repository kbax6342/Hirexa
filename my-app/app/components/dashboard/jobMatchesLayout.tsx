// File: /Hirexa/my-app/app/(dashboard)/jobs/components/JobMatchesLayout.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Job, JobPretty } from "@/app/lib/jobs/types";
import { JobDescription } from "../description/DashboardDescription";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";
import { useRouter } from "next/navigation";

type Props = {
  /** ✅ pass this from a server component (best) or wherever you know the plan status */
  hasActivePlan: boolean;
};

export default function JobMatchesLayout({ hasActivePlan }: Props) {
  const router = useRouter();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [appliedJobs, setAppliedJobs] = useState<Job[]>([]);
  const [showAppliedPanel, setShowAppliedPanel] = useState(false);

  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // optional analytics/UI
  const [page, setPage] = useState(1);

  // details
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<
    (Job & { fullDescriptionHtml?: string }) | null
  >(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [pretty, setPretty] = useState<JobPretty>({
    sections: [],
    highlights: [],
  });

  const selectedSummary = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId]
  );

  const right = selectedDetails ?? selectedSummary;

  // dedupe across pagination
  const seen = useRef<Set<string>>(new Set());

  const appliedJobIds = useMemo(
    () => new Set(appliedJobs.map((job) => job.id)),
    [appliedJobs]
  );

  // ✅ robust “current job” values for the Auto-fill button
  const currentJobId = right?.id ?? "";
  const currentJobUrl2 =
    // supports common shapes; keep the first one that exists
    (right as any)?.jobUrl ??
    (right as any)?.url ??
    (right as any)?.job_url ??
    "";

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);

    try {
      const url = new URL("/api/jobs", window.location.origin);

      url.searchParams.set("limit", "10");
      url.searchParams.set("q", "software engineer"); // TODO: replace w/ user prefs
      url.searchParams.set("page", String(page + 1));

      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();

      const incoming: Job[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.jobs)
        ? data.jobs
        : [];

      const filtered = incoming.filter((j) => {
        if (!j?.id) return false;
        if (seen.current.has(j.id)) return false;
        seen.current.add(j.id);
        return true;
      });

      setJobs((prev) => [...prev, ...filtered]);

      if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);

      setCursor(data.nextCursor ?? null);
      setPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  // initial load
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ✅ Fetch details for the selected job and build "pretty"
   * - Always render something quickly using prettyFromDescription
   */
  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    (async () => {
      setDetailsLoading(true);
      setDetailsError(null);

      try {
        const res = await fetch(
          `/api/jobs/details?id=${encodeURIComponent(selectedId)}`,
          { cache: "no-store" }
        );

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load details");
        if (cancelled) return;

        setSelectedDetails(data.job);

        const htmlOrText = String(
          data.job?.fullDescriptionHtml ?? data.job?.description ?? ""
        );

        // ✅ fast fallback (instant)
        setPretty(prettyFromDescription(htmlOrText));
      } catch (e: unknown) {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : "Failed to load details";
          setDetailsError(message);
          setPretty({ sections: [], highlights: [] });
          setSelectedDetails(null);
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const addAppliedJob = (job: Job) => {
    setAppliedJobs((prev) => {
      if (prev.some((appliedJob) => appliedJob.id === job.id)) return prev;
      return [job, ...prev];
    });
    setShowAppliedPanel(true);
  };

  const currentJobId2 = right?.id ?? "";
const currentJobUrl =
  (right as any)?.jobUrl ??
  (right as any)?.url ??
  (right as any)?.job_url ??
  "";

const handleAutoFill = () => {
  // gate
  if (!hasActivePlan) {
    router.push("/plans");
    return;
  }

  // must have a selected job
  if (!currentJobId2) return;

  const qs = currentJobUrl
    ? `?jobUrl=${encodeURIComponent(currentJobUrl)}`
    : "";

  router.push(`/apply/${currentJobId2}${qs}`);
};

  return (
    <div className="pb-36">
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-5">
          <div className="mt-5 space-y-4">
            <div className="text-black">
              <h2 className="text-lg font-semibold">Smart Matches</h2>

              <p className="mt-1 text-sm text-gray-700">
                We’ve scanned millions of jobs to find your best matches, saving
                you hours of searching. Simply select your favorites — we’ll
                fill out the applications.
              </p>
            </div>

            {jobs.slice(0, 5).map((job) => {
              const active = job.id === selectedId;

              return (
                <div
                  key={job.id}
                  className={[
                    "w-full text-left",
                    "rounded-lg border bg-white p-4 shadow-sm",
                    "transition",
                    active
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {/* ✅ ONLY CLICKABLE THING FOR DETAILS */}
                        <button
                          type="button"
                          onClick={() => setSelectedId(job.id)}
                          className="truncate text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                        >
                          {job.title}
                        </button>

                        {job.badge && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                            {job.badge}
                          </span>
                        )}

                        <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                          {job.source}
                        </span>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span className="font-medium text-gray-700">
                          {job.company}
                        </span>
                        <span>•</span>
                        <span>{job.location}</span>
                        {job.salary ? (
                          <>
                            <span>•</span>
                            <span>{job.salary}</span>
                          </>
                        ) : null}
                      </div>

                      <p className="mt-2 line-clamp-2 text-xs text-gray-600">
                        {job.description}
                      </p>

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
                        <span>{job.posted}</span>

                        {/* ✅ Separate button (no nesting) */}
                        <button
                          type="button"
                          onClick={() => addAppliedJob(job)}
                          disabled={appliedJobIds.has(job.id)}
                          className="rounded-md border px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {appliedJobIds.has(job.id) ? "Applied" : "Apply Tool"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore || !cursor}
              className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        </aside>

        <section className="lg:col-span-7 pt-4">
          <div className="h-[calc(120vh-140px)] rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">
            <div className="border-b border-gray-100 p-5 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {right?.title ?? "Select a job"}
              </h2>

              <div className="mt-1 text-xs text-gray-600">
                <span className="font-medium text-gray-700">
                  {right?.company ?? "Unknown company"}
                </span>
                {right?.location ? (
                  <> • {right.location}</>
                ) : (
                  <> • Unknown location</>
                )}
              </div>

              <div className="mt-3">
              <button
                type="button"
                onClick={handleAutoFill}
                disabled={!right?.id}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60"
              >
                {hasActivePlan ? "+ Auto-fill application" : "Unlock Auto-Apply"}
                </button>

              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {detailsLoading ? (
                <div className="text-sm text-gray-600">
                  Loading job details…
                </div>
              ) : detailsError ? (
                <div className="text-sm text-red-600">{detailsError}</div>
              ) : (
                <JobDescription pretty={pretty} />
              )}
            </div>
          </div>
        </section>
      </div>

      {appliedJobs.length > 0 && (
        <>
          {showAppliedPanel && (
            <div className="fixed bottom-24 right-4 z-40 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Applied jobs
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAppliedPanel(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {appliedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-gray-800">
                      {job.title}
                    </p>
                    <p className="text-[11px] text-gray-600">
                      {job.company} • {job.location}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAppliedPanel((prev) => !prev)}
            className="fixed bottom-5 right-4 z-50 inline-flex min-w-[110px] flex-col items-center rounded-full bg-blue-600 px-5 py-3 text-white shadow-lg transition hover:bg-blue-700"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Applied Jobs
            </span>
            <span className="text-xl font-bold leading-none">
              {appliedJobs.length}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
