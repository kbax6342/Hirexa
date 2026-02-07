"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Job, JobPretty } from "@/app/lib/jobs/types";
import { JobDescription } from "../description/DashboardDescription";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";

export default function JobMatchesLayout() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // If you still want page for analytics/UI you can keep it,
  // but cursor pagination doesn't need it.
  const [page, setPage] = useState(1);

  // details
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<any>(null); // or type JobDetails
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [pretty, setPretty] = useState<JobPretty>({ sections: [], highlights: [] });

  const selectedSummary = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId]
  );

  const right = selectedDetails ?? selectedSummary;

  // optional: dedupe so you don’t show repeats unless you want to
  const seen = useRef<Set<string>>(new Set());

  // Optional infinite scroll: observe a sentinel div
  //const sentinelRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? jobs[0],
    [jobs, selectedId]
  );

  

  // async function loadMore() {

  //   if (loading) return;
  //   setLoading(true);
  //   try {
  //     const url = new URL("/api/jobs", window.location.origin);
  //     url.searchParams.set("limit", "10"); // tune this
  //     url.searchParams.set("q", "software engineer"); // later: use user preferences
  //     if (cursor) url.searchParams.set("cursor", cursor);

  //     const res = await fetch(url.toString(), { cache: "no-store" });
  //     const data = await res.json();

  //     const incoming: Job[] = Array.isArray(data.items) ? data.items : [];

  //     // If you WANT repeats, remove the dedupe block.
  //     const filtered = incoming.filter((j) => {
  //       if (seen.current.has(j.id)) return false;
  //       seen.current.add(j.id);
  //       return true;
  //     });

  //     setJobs((prev) => [...prev, ...filtered]);

  //     if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);

  //     setCursor(data.nextCursor ?? null);
  //   } finally {
  //     setLoading(false);
  //   }
  // }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
  
    try {
      const url = new URL("/api/jobs", window.location.origin);
  
      // params
      url.searchParams.set("limit", "10"); // tune this
      url.searchParams.set("q", "software engineer"); // later: user prefs
      // if your API supports page too, you can send it (optional)
      url.searchParams.set("page", String(page + 1));
  
      // cursor-based pagination (preferred)
      if (cursor) url.searchParams.set("cursor", cursor);
  
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
  
      const incoming: Job[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.jobs)
        ? data.jobs
        : [];
  
      // dedupe
      const filtered = incoming.filter((j) => {
        if (!j?.id) return false;
        if (seen.current.has(j.id)) return false;
        seen.current.add(j.id);
        return true;
      });
  
      setJobs((prev) => [...prev, ...filtered]);
  
      // auto-select first job if none selected
      if (!selectedId && filtered[0]?.id) setSelectedId(filtered[0].id);
  
      // advance pagination
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

  // useEffect(() => {
  //   const el = sentinelRef.current;
  //   if (!el) return;

  //   const io = new IntersectionObserver((entries) => {
  //     if (entries[0]?.isIntersecting) loadMore();
  //   });

  //   io.observe(el);
  //   return () => io.disconnect();
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [sentinelRef.current, cursor, loading]);

  /**
   * ✅ This effect:
   * 1) fetches job details
   * 2) sends the HTML/text description to /api/jobs/pretty (OpenAI)
   * 3) falls back to prettyFromDescription if OpenAI fails
   */
   useEffect(() => {
    if (!selectedId) return;
  
    let cancelled = false;
  
    (async () => {
      setDetailsLoading(true);
      setDetailsError(null);
  
      try {
        // 1) Fetch job details
        const res = await fetch(`/api/jobs/details?id=${encodeURIComponent(selectedId)}`, {
          cache: "no-store",
        });
  
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load details");
        if (cancelled) return;
  
        setSelectedDetails(data.job);
  
        const htmlOrText = String(
          data.job?.fullDescriptionHtml ?? data.job?.description ?? ""
        );
  
        // 2) Instant fallback render (fast)
        const fallbackPretty = prettyFromDescription(htmlOrText);
        setPretty(fallbackPretty);
  
       
      } catch (e: any) {
        if (!cancelled) {
          setDetailsError(e?.message ?? "Failed to load details");
          setPretty({ sections: [], highlights: [] });
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();
  
    return () => {
      cancelled = true;
    };
  }, [selectedId]);
  

  return (
    <div>
      {/* ... your header stays the same ... */}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-5">
          {/* ... your missing info banner stays the same ... */}

          <div className="mt-5 space-y-4">
            {jobs.map((job) => {
              const active = job.id === selectedId;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
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
                        <div className="truncate text-sm font-semibold text-blue-700 underline underline-offset-2">
                          {job.title}
                        </div>
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
                        <span className="font-medium text-gray-700">{job.company}</span>
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

                      <div className="mt-2 text-[11px] text-gray-500">{job.posted}</div>
                    </div>
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore || !cursor} // optional: disable if no nextCursor
              className="w-full rounded-lg bg-blue-600 text-white py-2 font-medium disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>

            {/* infinite scroll sentinel */}
            {/* <div ref={sentinelRef} className="h-6" /> */}
          </div>
        </aside>

        <section className="lg:col-span-7">
  {/* 1️⃣ height-constrained container */}
  <div className="h-[calc(109vh-140px)] rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col">

    {/* 2️⃣ fixed header */}
    <div className="border-b border-gray-100 p-5 shrink-0">
      <h2 className="text-lg font-semibold text-gray-900">
        {right?.title ?? "Select a job"}
      </h2>

      <div className="mt-1 text-xs text-gray-600">
        <span className="font-medium text-gray-700">
          {right?.company ?? "Unknown company"}
        </span>
        {right?.location ? <> • {right.location}</> : <> • Unknown location</>}
      </div>

      <div className="mt-3">
        <button className="inline-flex h-8 items-center justify-center rounded-full bg-blue-700 px-3 text-xs font-semibold text-white">
          + Auto-fill application
        </button>
      </div>
    </div>

    {/* 3️⃣ SCROLLABLE CONTENT */}
    <div className="flex-1 overflow-y-auto p-5">
      {detailsLoading ? (
        <div className="text-sm text-gray-600">Loading job details…</div>
      ) : detailsError ? (
        <div className="text-sm text-red-600">{detailsError}</div>
      ) : (
        <JobDescription pretty={pretty} />
      )}
    </div>

  </div>
</section>

      </div>
    </div>
  );
}
