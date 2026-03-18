// File: /Hirexa/my-app/app/components/JobMatchesLayout.tsx
"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import {
  loadAppliedJobsSession,
  saveAppliedJobsSession,
} from "@/app/lib/appliedJobsSession";
import type { Job, JobDetail, JobPretty } from "@/app/lib/jobs/types";
import {
  extractCompanyLocationFromDescription,
  prettyFromDescription,
} from "@/app/lib/jobs/pretty-from-text";
import { buildJobDetailBodyHtml } from "@/app/lib/jobs/detailContent";
import JobDetailsSkeleton from "@/app/components/skeletons/JobDetailsSkeleton";

type SmartMatchesResponse = {
  jobs: Job[];
  nextCursor: string;
  meta?: {
    query?: string;
    preferredLocation?: string | null;
    includeRemote?: boolean;
    requestedState?: string | null;
    resolvedState?: string | null;
    fallbackUsed?: boolean;
    attemptedStates?: string[];
    resolvedLocationMessage?: string | null;
  };
};

type SmartMatchesResolutionMeta = NonNullable<SmartMatchesResponse["meta"]>;

type JobDetailsResponse = {
  job: JobDetail;
  pretty: JobPretty;
  fullDetailsUnavailable?: boolean;
};

/** --------------------------
 * OPTIONAL: LLM formatting output
 * -------------------------- */
type FormattedSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type FormattedJob = {
  intro?: string[];
  sections: FormattedSection[];
  salary?: string | null;
};

function getJobIdentity(job: Pick<Job, "id" | "source">) {
  const normalizedId = String(job.id ?? "").trim();
  const sourcePrefix = `${job.source}:`;
  return normalizedId.startsWith(sourcePrefix)
    ? normalizedId
    : `${sourcePrefix}${normalizedId}`;
}

function getSourceLabel(source: Job["source"]) {
  switch (source) {
    case "greenhouse":
      return "Greenhouse";
    case "adzuna":
      return "Adzuna";
    case "lever":
      return "Lever";
    case "ashby":
      return "Ashby";
    case "workable":
      return "Workable";
    case "usajobs":
      return "USAJobs";
    case "remotive":
      return "Remotive";
    case "remoteok":
      return "RemoteOK";
    default:
      return source;
  }
}

function isRemoteJob(job: Job) {
  const searchableText = [
    job.location,
    job.description,
    job.searchText,
  ]
    .filter(Boolean)
    .join(" ");

  return /\bremote\b/i.test(searchableText);
}

function dedupeJobs(jobList: Job[]) {
  const unique = new Set<string>();

  return jobList.filter((job) => {
    if (!job?.id || !job?.source) return false;

    const identity = getJobIdentity(job);
    if (unique.has(identity)) return false;

    unique.add(identity);
    return true;
  });
}

function toJobDetailSummary(job: Job | null): JobDetail | null {
  if (!job) return null;

  return {
    ...job,
    remote: /remote/i.test(job.location || ""),
    salaryText: job.salary ?? null,
    applyUrl: job.jobUrl ?? null,
    externalUrl: job.jobUrl ?? null,
    descriptionPlain: job.searchText?.trim() || job.description?.trim() || null,
    descriptionHtml: job.description?.includes("<") ? job.description : null,
    detailLevel: "summary",
    providerHasFullDetails: false,
    metadata: {
      source: job.source,
    },
  };
}

export default function JobMatchesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState({
    query: searchParams.get("q")?.trim() || "",
    location: searchParams.get("location")?.trim() || "",
    includeRemote: searchParams.get("includeRemote")
      ? searchParams.get("includeRemote") !== "0" &&
        searchParams.get("includeRemote") !== "false"
      : true,
  });
  const [appliedFilters, setAppliedFilters] = useState(() => ({
    query: searchParams.get("q")?.trim() || "",
    location: searchParams.get("location")?.trim() || "",
    includeRemote: searchParams.get("includeRemote")
      ? searchParams.get("includeRemote") !== "0" &&
        searchParams.get("includeRemote") !== "false"
      : true,
  }));
  const [selectedId, setSelectedId] = useState<string>("");
  const [savingFilters, setSavingFilters] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [resolutionMeta, setResolutionMeta] = useState<SmartMatchesResolutionMeta | null>(
    null
  );

  type ActionState = {
    loading?: boolean;
    success?: string | null;
    error?: string | null;
  };

  const [outreachActions, setOutreachActions] = useState<Record<string, ActionState>>({});
  const [applyOutreachActions, setApplyOutreachActions] = useState<Record<string, ActionState>>({});

  const [appliedJobs, setAppliedJobs] = useState<Job[]>([]);
  const [showAppliedPanel, setShowAppliedPanel] = useState(false);
  const [aiApplyLoading, setAiApplyLoading] = useState(false);
  const [appliedJobsSessionReady, setAppliedJobsSessionReady] = useState(false);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<JobDetail | null>(null);

  const [pretty, setPretty] = useState<JobPretty>({ sections: [], highlights: [] });
  const [formatted, setFormatted] = useState<FormattedJob | null>(null);

  const seen = useRef<Set<string>>(new Set());
  const hadJobParam = useRef(false);
  const detailCache = useRef<Map<string, JobDetailsResponse>>(new Map());
  const initializedFiltersRef = useRef(false);
  const selectedJobParam = searchParams.get("job")?.trim() || "";
  const visibleJobs = useMemo(
    () =>
      appliedFilters.includeRemote
        ? jobs
        : jobs.filter((job) => !isRemoteJob(job)),
    [jobs, appliedFilters.includeRemote]
  );

  const selectedSummary = useMemo(
    () => visibleJobs.find((j) => j.id === selectedId) ?? null,
    [visibleJobs, selectedId]
  );
  const selectedSummaryDetail = useMemo(
    () => toJobDetailSummary(selectedSummary),
    [selectedSummary]
  );

  const right = selectedDetails ?? selectedSummaryDetail;

  const descriptionSource = String(right?.description ?? "");
  const parsedMeta = useMemo(
    () => extractCompanyLocationFromDescription(descriptionSource),
    [descriptionSource]
  );

  const displayCompany =
    right?.company && right.company !== "Unknown company"
      ? right.company
      : parsedMeta.company ?? "Unknown company";

  const displayLocation =
    right?.location && right.location !== "Unknown location"
      ? right.location
      : parsedMeta.location ?? "Unknown location";

  function replaceSelectedJobParam(jobId: string | null) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (jobId) {
      nextParams.set("job", jobId);
    } else {
      nextParams.delete("job");
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  function replaceFilterParams(nextFilters: typeof appliedFilters) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextFilters.query) {
      nextParams.set("q", nextFilters.query);
    } else {
      nextParams.delete("q");
    }

    if (nextFilters.location) {
      nextParams.set("location", nextFilters.location);
    } else {
      nextParams.delete("location");
    }

    nextParams.set("includeRemote", nextFilters.includeRemote ? "1" : "0");

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  async function persistFilters(nextFilters: typeof appliedFilters) {
    try {
      setSavingFilters(true);
      await fetch("/api/profile/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleFocus: nextFilters.query,
          includeRemote: nextFilters.includeRemote,
          workplaceLocations: nextFilters.location
            ? [{ label: nextFilters.location }]
            : null,
        }),
      });
    } catch (error) {
      console.error("Failed to sync Smart Matches filters:", error);
    } finally {
      setSavingFilters(false);
    }
  }

  function applyFilters() {
    const nextFilters = {
      query: filters.query.trim(),
      location: filters.location.trim(),
      includeRemote: filters.includeRemote,
    };

    setAppliedFilters(nextFilters);
    replaceFilterParams(nextFilters);
    void persistFilters(nextFilters);
  }

  function handleSelectJob(jobId: string) {
    setSelectedId(jobId);
    replaceSelectedJobParam(jobId);
  }

  useEffect(() => {
    setAppliedJobs(dedupeJobs(loadAppliedJobsSession<Job>()));
    setAppliedJobsSessionReady(true);
  }, []);

  useEffect(() => {
    if (!appliedJobsSessionReady) return;
    saveAppliedJobsSession(appliedJobs);
  }, [appliedJobs, appliedJobsSessionReady]);

  async function loadPage(cursor: string | null, options?: { reset?: boolean }) {
    if (loadingMore) return;

    setLoadingMore(true);

    try {
      const LIMIT = 25;
      let requestCursor = cursor;
      let filtered: Job[] = [];
      let responseCursor: string | null = cursor;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const url = new URL("/api/jobs/smart-matches", window.location.origin);
        url.searchParams.set("limit", String(LIMIT));
        url.searchParams.set(
          "includeRemote",
          appliedFilters.includeRemote ? "1" : "0"
        );
        if (appliedFilters.query) {
          url.searchParams.set("q", appliedFilters.query);
        }
        if (appliedFilters.location) {
          url.searchParams.set("location", appliedFilters.location);
        }
        if (requestCursor) {
          url.searchParams.set("cursor", requestCursor);
        }

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load smart matches");
        }

        const data = (await res.json()) as SmartMatchesResponse;
        const incoming = Array.isArray(data?.jobs) ? data.jobs : [];

        if (data?.meta) {
          setResolutionMeta(data.meta);
        }

        if (!initializedFiltersRef.current && data?.meta) {
          const resolvedFilters = {
            query: appliedFilters.query || data.meta.query || "",
            location: appliedFilters.location || data.meta.preferredLocation || "",
            includeRemote:
              typeof data.meta.includeRemote === "boolean"
                ? data.meta.includeRemote
                : appliedFilters.includeRemote,
          };
          initializedFiltersRef.current = true;
          setFilters(resolvedFilters);
          setAppliedFilters(resolvedFilters);
          replaceFilterParams(resolvedFilters);
        }

        filtered = incoming.filter((job) => {
          if (!job?.id) return false;
          if (!appliedFilters.includeRemote && isRemoteJob(job)) {
            return false;
          }
          const jobIdentity = getJobIdentity(job);
          if (seen.current.has(jobIdentity)) return false;
          seen.current.add(jobIdentity);
          return true;
        });

        responseCursor = data?.nextCursor ?? requestCursor;

        if (
          filtered.length > 0 ||
          !responseCursor ||
          responseCursor === requestCursor
        ) {
          break;
        }

        requestCursor = responseCursor;
      }

      setNextCursor(responseCursor);
      setJobs((prev) => (options?.reset ? filtered : [...prev, ...filtered]));

      if (selectedJobParam) {
        const selectedFromUrl = filtered.find((job) => job.id === selectedJobParam);
        if (selectedFromUrl?.id) {
          setSelectedId(selectedFromUrl.id);
        }
      } else if ((options?.reset || !selectedId) && filtered[0]?.id) {
        setSelectedId(filtered[0].id);
      }
    } catch (error) {
      console.error("Smart matches feed failed:", error);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    await loadPage(nextCursor);
  }

  useEffect(() => {
    seen.current.clear();
    setJobs([]);
    setSelectedId("");
    setSelectedDetails(null);
    setPretty({ sections: [], highlights: [] });
    setFormatted(null);
    setNextCursor(null);
    setResolutionMeta(null);
    void loadPage(null, { reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  useEffect(() => {
    if (visibleJobs.length === 0) {
      if (selectedId) {
        setSelectedId("");
        replaceSelectedJobParam(null);
      }
      return;
    }

    const hasVisibleSelection = visibleJobs.some((job) => job.id === selectedId);
    if (hasVisibleSelection) return;

    const nextSelectedId =
      (selectedJobParam && visibleJobs.find((job) => job.id === selectedJobParam)?.id) ||
      visibleJobs[0]?.id ||
      "";

    if (!nextSelectedId) return;

    setSelectedId(nextSelectedId);
    replaceSelectedJobParam(nextSelectedId);
  }, [selectedId, selectedJobParam, visibleJobs]);

  useEffect(() => {
    console.log("[SMART_MATCHES] selected job changed", {
      jobId: selectedJobParam || null,
    });

    if (selectedJobParam) {
      hadJobParam.current = true;
      setSelectedId((current) =>
        current === selectedJobParam ? current : selectedJobParam
      );
      return;
    }

    if (!hadJobParam.current) {
      return;
    }

    hadJobParam.current = false;
    setSelectedId("");
    setSelectedDetails(null);
    setPretty({ sections: [], highlights: [] });
    setFormatted(null);
  }, [selectedJobParam]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;

    (async () => {
      const selected = jobs.find((job) => job.id === selectedId) ?? null;
      const selectedSummaryJob = toJobDetailSummary(selected);
      const cachedDetail = detailCache.current.get(selectedId);

      if (selectedSummaryJob) {
        setSelectedDetails(selectedSummaryJob);
        setPretty(
          prettyFromDescription(
            String(
              selectedSummaryJob.descriptionHtml ??
                selectedSummaryJob.descriptionPlain ??
                selectedSummaryJob.description ??
                ""
            ),
            {
              source: selectedSummaryJob.source,
              detail: selectedSummaryJob,
            }
          )
        );
      }

      if (cachedDetail) {
        setSelectedDetails(cachedDetail.job);
        setPretty(cachedDetail.pretty);
        if (cachedDetail.fullDetailsUnavailable) {
          console.warn("[JOB_DETAILS] using partial cached detail", {
            jobId: selectedId,
            source: cachedDetail.job.source,
          });
        }
        setFormatted(null);
        return;
      }

      setDetailsLoading(true);
      setFormatted(null);

      try {
        const requestInit = selected
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ job: selected }),
            }
          : undefined;

        const res = await fetch(
          selected
            ? "/api/jobs/details"
            : `/api/jobs/details?id=${encodeURIComponent(selectedId)}`,
          {
            cache: "no-store",
            ...(requestInit ?? {}),
          }
        );

        const data = (await res.json()) as Partial<JobDetailsResponse> & {
          error?: string;
        };

        if (!res.ok || !data?.job || !data.pretty) {
          throw new Error(data?.error ?? "Failed to load job details");
        }
        if (cancelled) return;

        const resolved = data as JobDetailsResponse;
        detailCache.current.set(selectedId, resolved);
        setSelectedDetails(resolved.job);
        setPretty(resolved.pretty);
        if (resolved.fullDetailsUnavailable) {
          console.warn("[JOB_DETAILS] rendering best available partial detail", {
            jobId: selectedId,
            source: resolved.job.source,
          });
        }

        const htmlOrText = String(
          resolved.job.descriptionHtml ??
            resolved.job.contentHtml ??
            resolved.job.content ??
            resolved.job.descriptionPlain ??
            resolved.job.description ??
            ""
        );

        if (resolved.job.source === "greenhouse" && htmlOrText) {
          try {
            const fmtRes = await fetch("/api/jobs/format", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ jobId: selectedId, text: htmlOrText }),
            });

            if (fmtRes.ok) {
              const fmtData = await fmtRes.json();
              if (!cancelled && fmtData?.formatted) {
                setFormatted(fmtData.formatted as FormattedJob);
              }
            }
          } catch {
            // ignore formatter errors
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Failed to load details";
          console.warn("[JOB_DETAILS] detail fetch failed, falling back silently", {
            jobId: selectedId,
            error: message,
          });
          if (selectedSummaryJob) {
            setSelectedDetails(selectedSummaryJob);
            setPretty(
              prettyFromDescription(
                String(
                  selectedSummaryJob.descriptionHtml ??
                    selectedSummaryJob.contentHtml ??
                    selectedSummaryJob.content ??
                    selectedSummaryJob.descriptionPlain ??
                    selectedSummaryJob.description ??
                    ""
                ),
                {
                  source: selectedSummaryJob.source,
                  detail: selectedSummaryJob,
                }
              )
            );
          } else {
            setSelectedDetails(null);
            setPretty({ sections: [], highlights: [] });
          }
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, selectedId]);

  const setActionState = (
    setter: Dispatch<SetStateAction<Record<string, ActionState>>>,
    jobId: string,
    patch: ActionState
  ) => {
    setter((prev) => ({
      ...prev,
      [jobId]: { ...prev[jobId], ...patch },
    }));
  };

  const clearActionFeedback = (
    setter: Dispatch<SetStateAction<Record<string, ActionState>>>,
    jobId: string
  ) => {
    setTimeout(() => {
      setter((prev) => {
        if (!prev[jobId]) return prev;
        return { ...prev, [jobId]: { ...prev[jobId], success: null, error: null } };
      });
    }, 2500);
  };

  const addOutreachJob = async (
    job: Job,
    setter: Dispatch<SetStateAction<Record<string, ActionState>>>,
    successText: string
  ) => {
    if (!job?.id) return false;

    setActionState(setter, job.id, { loading: true, success: null, error: null });

    try {
      const res = await fetch("/api/agents/linkedin/job-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Failed to add outreach target");
      }

      setActionState(setter, job.id, { success: successText });
      clearActionFeedback(setter, job.id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Outreach action failed";
      setActionState(setter, job.id, { error: message });
      clearActionFeedback(setter, job.id);
      return false;
    } finally {
      setActionState(setter, job.id, { loading: false });
    }
  };

  const addAppliedJob = async (job: Job, options?: { navigate?: boolean }) => {
    try {
      const res = await fetch("/api/job-applications/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: job.source,
          sourceJobId: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          jobUrl: job.jobUrl ?? null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.applicationId) {
        throw new Error("Could not create application.");
      }

      setAppliedJobs((prev) => {
        if (
          prev.some(
            (appliedJob) => getJobIdentity(appliedJob) === getJobIdentity(job)
          )
        ) {
          return prev;
        }
        return dedupeJobs([job, ...prev]);
      });

      setShowAppliedPanel(true);
      if (options?.navigate !== false) {
        const jobUrl = job.jobUrl ? encodeURIComponent(job.jobUrl) : "";
        router.push(`/job-tools/generate${jobUrl ? `?jobUrl=${jobUrl}` : ""}`);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const handleOutreachFromDetails = () => {
    router.push("/job-tools/agents/linkedin-outreach");
  };

  const handleAiApplyFromDetails = async () => {
    if (!right?.id) return;
    setAiApplyLoading(true);
    try {
      await addAppliedJob(right);
    } finally {
      setAiApplyLoading(false);
    }
  };

  const handleCareerCoachFromDetails = () => {
    router.push("/agents/career-coach");
  };

  const detailBodyHtml = useMemo(() => buildJobDetailBodyHtml(right), [right]);
  const showMinimalFallback =
    !detailsLoading &&
    !detailBodyHtml &&
    !formatted &&
    pretty.sections.length === 0 &&
    pretty.highlights.length === 0;

  return (
    <div className="mt-[59]">
      <div className="mt-4 grid min-h-0 grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-12 lg:gap-6 xl:h-[calc(100vh-140px)]">
        {/* LEFT LIST */}
        <aside className="flex min-h-0 flex-col lg:col-span-5">
          <div className="mt-4 shrink-0 sm:mt-8">
            <div className="text-black">
              <h2 className="text-lg font-semibold">Smart Matches</h2>
              <p className="mt-1 text-sm text-gray-700">
                We’ve scanned jobs to find your best matches, saving you hours of
                searching. Select your favorites and use Hirexa to prepare stronger,
                faster applications.
              </p>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Filters</div>
                    <p className="mt-1 text-xs text-gray-500">
                      Applying filters also updates your saved Smart Matches preferences.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersCollapsed((current) => !current)}
                    className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                    aria-expanded={!isFiltersCollapsed}
                    aria-controls="smart-match-filters"
                  >
                    <span className="whitespace-nowrap">
                      {isFiltersCollapsed ? "Show filters" : "Hide filters"}
                    </span>
                    {isFiltersCollapsed ? (
                      <ChevronDownIcon className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronUpIcon className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                </div>
                {!isFiltersCollapsed ? (
                  <form
                    id="smart-match-filters"
                    className="mt-3 rounded-2xl border border-gray-200 bg-white p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyFilters();
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center">
                        <div className="ml-auto flex shrink-0 items-center gap-3 rounded-xl px-3 py-2">
                          <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-gray-600">
                            Remote jobs
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              setFilters((current) => ({
                                ...current,
                                includeRemote: !current.includeRemote,
                              }))
                            }
                            aria-pressed={filters.includeRemote}
                            className={[
                              "relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition",
                              filters.includeRemote
                                ? "border-blue-600 bg-blue-600"
                                : "border-gray-300 bg-gray-200",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition",
                                filters.includeRemote ? "translate-x-8" : "translate-x-1",
                              ].join(" ")}
                            />
                          </button>

                          <span className="whitespace-nowrap text-xs text-gray-600">
                            {filters.includeRemote ? "On" : "Off"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex min-w-0 flex-col gap-1">
                          <span className="text-xs font-semibold text-gray-600">
                            Target role
                          </span>
                          <input
                            value={filters.query}
                            onChange={(event) =>
                              setFilters((current) => ({
                                ...current,
                                query: event.target.value,
                              }))
                            }
                            placeholder="Software Engineer"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>

                        <label className="flex min-w-0 flex-col gap-1">
                          <span className="text-xs font-semibold text-gray-600">
                            Preferred location
                          </span>
                          <input
                            value={filters.location}
                            onChange={(event) =>
                              setFilters((current) => ({
                                ...current,
                                location: event.target.value,
                              }))
                            }
                            placeholder="Detroit, MI"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      <div className="flex">
                        <button
                          type="submit"
                          disabled={savingFilters}
                          className="ml-auto shrink-0 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingFilters ? "Saving..." : "Apply filters"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : null}
              </div>

              {resolutionMeta?.fallbackUsed && resolutionMeta.resolvedLocationMessage ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {resolutionMeta.resolvedLocationMessage}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {visibleJobs.map((job) => {
              const active = job.id === selectedId;

              return (
                <div
                  key={getJobIdentity(job)}
                  className={[
                    "flex w-full flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition",
                    active
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="w-full min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectJob(job.id)}
                          className="truncate text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                        >
                          {job.title}
                        </button>

                        <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          {getSourceLabel(job.source)}
                        </span>

                        {job.badge ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                            {job.badge}
                          </span>
                        ) : null}
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

                      {job.description ? (
                        <p className="mt-2 line-clamp-2 text-xs text-gray-600">
                          {job.description}
                        </p>
                      ) : (
                        <div className="mt-3 h-4" />
                      )}

                      <div className="mt-5 flex flex-col gap-3 text-[11px] text-gray-500 sm:mt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="w-full sm:w-auto">
                          <span>Job Posted {job.posted}</span>
                        </div>

                        <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                          {job.jobUrl ? (
                            <a
                              href={job.jobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-[110px] rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-center text-[11px] font-medium text-[#374151] hover:bg-gray-50"
                            >
                              View Posting
                            </a>
                          ) : null}
                        </div>
                      </div>

                      {/* <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            addOutreachJob(job, setOutreachActions, "Outreach added")
                          }
                          disabled={outreachActions[job.id]?.loading}
                          className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-semibold text-[#374151] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {outreachActions[job.id]?.loading ? "Adding..." : "Outreach"}
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await addOutreachJob(
                              job,
                              setApplyOutreachActions,
                              "Outreach added"
                            );
                            if (!ok) return;
                            const appliedOk = await addAppliedJob(job, { navigate: false });
                            if (appliedOk) {
                              setActionState(setApplyOutreachActions, job.id, {
                                success: "Applied + outreach ready",
                              });
                              clearActionFeedback(setApplyOutreachActions, job.id);
                              const jobUrl = job.jobUrl ? encodeURIComponent(job.jobUrl) : "";
                              setTimeout(() => {
                                router.push(
                                  `/job-tools/generate${jobUrl ? `?jobUrl=${jobUrl}` : ""}`
                                );
                              }, 500);
                            }
                          }}
                          disabled={applyOutreachActions[job.id]?.loading}
                          className="rounded-md border border-transparent bg-[#111827] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#0f172a] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {applyOutreachActions[job.id]?.loading
                            ? "Working..."
                            : "Apply + Outreach"}
                        </button>

                        <button
                          type="button"
                          onClick={() => router.push("/job-tools/agents/linkedin-outreach")}
                          className="rounded-md border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-semibold text-[#374151] hover:bg-gray-50"
                        >
                          Open Outreach Copilot
                        </button>
                      </div>

                      {(outreachActions[job.id]?.success ||
                        outreachActions[job.id]?.error ||
                        applyOutreachActions[job.id]?.success ||
                        applyOutreachActions[job.id]?.error) && (
                        <div
                          className={[
                            "mt-2 text-[11px] font-medium",
                            outreachActions[job.id]?.error ||
                            applyOutreachActions[job.id]?.error
                              ? "text-red-600"
                              : "text-emerald-600",
                          ].join(" ")}
                        >
                          {outreachActions[job.id]?.error ||
                            applyOutreachActions[job.id]?.error ||
                            applyOutreachActions[job.id]?.success ||
                            outreachActions[job.id]?.success}
                        </div>
                      )} */}
                    </div>
                  </div>
                </div>
              );
            })}

            {visibleJobs.length === 0 && !loadingMore ? (
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
                Finding more matches for you...
              </div>
            ) : null}
          </div>

          <div className="mt-4 shrink-0">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Find More Jobs"}
            </button>
          </div>
        </aside>

        {/* RIGHT DETAILS */}
        <section className="flex min-h-0 flex-col lg:col-span-7">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-gray-100 p-5">
              <h2 className="text-lg font-semibold text-gray-900">
                {right?.title ?? "Select a job"}
              </h2>

              <div className="mt-1 text-xs text-gray-600">
                <span className="font-medium text-gray-700">{displayCompany}</span>
                <> • {displayLocation}</>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleAiApplyFromDetails}
                  disabled={!right?.id || aiApplyLoading}
                  className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(146,64,14,0.22)] bg-[linear-gradient(135deg,#C2410C_0%,#B45309_100%)] hover:shadow-[0_10px_22px_rgba(146,64,14,0.28)] hover:bg-[linear-gradient(135deg,#B45309_0%,#92400E_100%)] active:bg-[#7C2D12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(194,65,12,0.24)] sm:w-auto"
                >
                  {aiApplyLoading ? "Opening..." : "AI Assistant Apply"}
                </button>
                <button
                  type="button"
                  onClick={handleCareerCoachFromDetails}
                  className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 sm:w-auto"
                >
                  Career Coach
                </button>
                <button
                  type="button"
                  onClick={handleOutreachFromDetails}
                  className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 sm:w-auto"
                >
                  Outreach Copilot
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {detailsLoading ? (
                <JobDetailsSkeleton />
              ) : detailBodyHtml ? (
                <div
                  className="
                    prose max-w-none
                    text-gray-700
                    prose-p:mb-4
                    prose-p:leading-7
                    prose-strong:text-gray-900
                    prose-em:text-gray-700
                    prose-ul:mb-5
                    prose-ul:mt-3
                    prose-ol:mb-5
                    prose-ol:mt-3
                    prose-li:mb-2
                    prose-li:leading-7
                    prose-li:marker:text-blue-500
                    prose-h3:mb-3
                    prose-h3:mt-8
                    prose-h3:text-base
                    prose-h3:font-semibold
                    prose-a:text-blue-600
                    prose-a:no-underline
                    hover:prose-a:underline
                  "
                  dangerouslySetInnerHTML={{ __html: detailBodyHtml }}
                />
              ) : formatted ? (
                <div className="space-y-6">
                  {formatted.salary ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                      <div className="text-xs font-semibold text-green-700">
                        Compensation
                      </div>
                      <div className="mt-1 text-sm font-semibold text-green-900">
                        {formatted.salary}
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(formatted.intro) ? (
                    <div className="space-y-3">
                      {formatted.intro.map((p, idx) => (
                        <p key={idx} className="text-sm leading-relaxed text-gray-700">
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {Array.isArray(formatted.sections) ? (
                    <div className="space-y-6">
                      {formatted.sections.map((s, idx) => (
                        <section
                          key={idx}
                          className="rounded-xl border border-gray-200 bg-white p-4"
                        >
                          <h3 className="text-sm font-semibold text-gray-900">
                            {s.title}
                          </h3>

                          {Array.isArray(s.paragraphs) ? (
                            <div className="mt-2 space-y-2">
                              {s.paragraphs.map((p, i) => (
                                <p key={i} className="text-sm text-gray-700">
                                  {p}
                                </p>
                              ))}
                            </div>
                          ) : null}

                          {Array.isArray(s.bullets) ? (
                            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 marker:text-blue-500">
                              {s.bullets.map((b, i) => (
                                <li key={i}>{b}</li>
                              ))}
                            </ul>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : pretty.sections.length > 0 || pretty.highlights.length > 0 ? (
                <div className="space-y-6">
                  {pretty.highlights.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pretty.highlights.map((highlight) => (
                        <div
                          key={`${highlight.label}-${highlight.value}`}
                          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                        >
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {highlight.label}
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {highlight.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-6">
                    {pretty.sections.map((section, idx) => (
                      <section
                        key={`${section.title}-${idx}`}
                        className="rounded-xl border border-gray-200 bg-white p-4"
                      >
                        <h3 className="text-sm font-semibold text-gray-900">
                          {section.title}
                        </h3>

                        {section.kind === "bullets" && section.bullets?.length ? (
                          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700 marker:text-blue-500">
                            {section.bullets.map((bullet, bulletIndex) => (
                              <li key={`${section.title}-${bulletIndex}`}>{bullet}</li>
                            ))}
                          </ul>
                        ) : null}

                        {"paragraphs" in section && section.paragraphs?.length ? (
                          <div className="mt-2 space-y-2">
                            {section.paragraphs.map((paragraph, paragraphIndex) => (
                              <p
                                key={`${section.title}-${paragraphIndex}`}
                                className="text-sm text-gray-700"
                              >
                                {paragraph}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {section.kind === "callout" && section.callout ? (
                          <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                            {section.callout.label ? (
                              <span className="mr-2 font-semibold">
                                {section.callout.label}
                              </span>
                            ) : null}
                            <span>{section.callout.value}</span>
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </div>
              ) : showMinimalFallback ? (
                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Job Description
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-gray-700">
                    Open the original posting for the latest full description and
                    application instructions.
                  </p>
                </section>
              ) : (
                <div />
              )}
            </div>
          </div>
        </section>
      </div>

      {/* APPLIED JOBS FLOAT */}
      {appliedJobs.length > 0 ? (
        <>
          {showAppliedPanel ? (
            <div className="fixed inset-x-4 bottom-24 z-40 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[min(420px,calc(100vw-2rem))]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Applied jobs</h3>
                <button
                  type="button"
                  onClick={() => setShowAppliedPanel(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1 sm:max-h-56">
                {appliedJobs.map((job) => (
                  <div
                    key={getJobIdentity(job)}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-gray-800">{job.title}</p>
                    <p className="text-[11px] text-gray-600">
                      {job.company} • {job.location}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setShowAppliedPanel((prev) => !prev)}
            className="fixed bottom-4 right-4 z-50 inline-flex min-w-[110px] flex-col items-center rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg transition hover:bg-blue-700 sm:bottom-5 sm:px-5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Applied Jobs
            </span>
            <span className="text-xl font-bold leading-none">
              {appliedJobs.length}
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}
