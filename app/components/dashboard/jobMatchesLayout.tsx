// File: /Hirexa/my-app/app/components/JobMatchesLayout.tsx
"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import {
  loadAppliedJobsSession,
  saveAppliedJobsSession,
} from "@/app/lib/appliedJobsSession";
import type { Job, JobDetail, JobPretty } from "@/app/lib/jobs/types";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";
import { isRemoteJob } from "@/app/lib/jobs/isRemoteJob";
import JobDetailsPanel, { type FormattedJob } from "@/app/components/dashboard/JobDetailsPanel";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import {
  buildApplyProviderPayload,
  detectApplyProviderFromJob,
  getApplyProviderButtonLabel,
  getApplyProviderLoadingLabel,
} from "@/app/lib/apply/providerDetection";
import { storeJobDetailSummary } from "@/app/lib/jobs/clientDetailSummary";

type SmartMatchesResponse = {
  jobs: Job[];
  nextCursor: string | null;
  meta?: {
    query?: string;
    preferredLocation?: string | null;
    profileQuery?: string | null;
    profilePreferredLocation?: string | null;
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

type DashboardFilters = {
  query: string;
  location: string;
  includeRemote: boolean;
};

type JobMatchesLayoutProps = {
  initialProfileFilters?: DashboardFilters | null;
};

type PlanStatusResponse = {
  active?: boolean;
  pending?: boolean;
};

type CreditStatusResponse = {
  hirePilotCredits?: number;
};

type SupportedAutoApplyJob = Pick<
  Job,
  "id" | "source" | "title" | "company" | "location" | "jobUrl"
>;

function sameDashboardFilters(left: DashboardFilters, right: DashboardFilters) {
  return (
    left.query === right.query &&
    left.location === right.location &&
    left.includeRemote === right.includeRemote
  );
}


function getJobIdentity(job: Pick<Job, "id" | "source">) {
  const normalizedId = String(job.id ?? "").trim();
  const sourcePrefix = `${job.source}:`;
  return normalizedId.startsWith(sourcePrefix)
    ? normalizedId
    : `${sourcePrefix}${normalizedId}`;
}

function normalizeJobUrl(url: string | undefined) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function getJobDedupeKey(
  job: Pick<Job, "id" | "source" | "jobUrl" | "title" | "company" | "location">
) {
  const normalizedUrl = normalizeJobUrl(job.jobUrl);
  if (normalizedUrl) return normalizedUrl;

  const identity = getJobIdentity(job);
  if (identity) return identity;

  return [job.title, job.company, job.location]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
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

function dedupeJobs(jobList: Job[]) {
  const unique = new Set<string>();

  return jobList.filter((job) => {
    if (!job?.id || !job?.source) return false;

    const dedupeKey = getJobDedupeKey(job);
    if (!dedupeKey || unique.has(dedupeKey)) return false;

    unique.add(dedupeKey);
    return true;
  });
}

function toJobDetailSummary(job: Job | null): JobDetail | null {
  if (!job) return null;

  return {
    ...job,
    remote: isRemoteJob(job),
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

export default function JobMatchesLayout({
  initialProfileFilters = null,
}: JobMatchesLayoutProps) {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryParam = searchParams.get("q")?.trim() || "";
  const locationParam = searchParams.get("location")?.trim() || "";
  const includeRemoteParam = searchParams.get("includeRemote");
  const explicitParam = searchParams.get("explicit")?.trim();
  const hasTransientFilterParams =
    Boolean(queryParam || locationParam) ||
    includeRemoteParam !== null ||
    explicitParam === "1";
  const profileBackedFilters = useMemo(
    () =>
      initialProfileFilters ?? {
        query: "",
        location: "",
        includeRemote: false,
      },
    [initialProfileFilters]
  );
  const [allJobs, setAllJobs] = useState<Job[]>([]);
  const [filters, setFilters] = useState<DashboardFilters>(() => profileBackedFilters);
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilters>(
    () => profileBackedFilters
  );
  const [profileDefaultFilters, setProfileDefaultFilters] =
    useState<DashboardFilters | null>(() => initialProfileFilters);
  const [explicitFiltersActive, setExplicitFiltersActive] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [savingFilters, setSavingFilters] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(true);
  const [resolutionMeta, setResolutionMeta] = useState<SmartMatchesResolutionMeta | null>(
    null
  );
  const [filterError, setFilterError] = useState<string | null>(null);

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
  const [cardAiApplyLoadingId, setCardAiApplyLoadingId] = useState<string | null>(null);
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
  const profileDefaultsInitializedRef = useRef(Boolean(initialProfileFilters));
  const explicitFiltersRequestedRef = useRef(false);
  const activeFeedRequestRef = useRef<AbortController | null>(null);
  const inFlightFeedRequestRef = useRef<string | null>(null);
  const latestFeedRequestIdRef = useRef(0);
  const requestSourceRef = useRef<"initial-load" | "apply-filters" | "load-more">(
    "initial-load"
  );
  const selectedJobParam = searchParams.get("job")?.trim() || "";
  const visibleJobs = useMemo(
    () =>
      appliedFilters.includeRemote
        ? allJobs
        : allJobs.filter((job) => !isRemoteJob(job)),
    [allJobs, appliedFilters.includeRemote]
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
  const rightApplyProvider = detectApplyProviderFromJob(right);
  const rightAiApplyLabel = getApplyProviderButtonLabel(rightApplyProvider);
  const rightAiApplyLoadingLabel = getApplyProviderLoadingLabel(rightApplyProvider);

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

  const clearTransientFilterParams = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("q");
    nextParams.delete("location");
    nextParams.delete("includeRemote");
    nextParams.delete("explicit");

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [pathname, searchParams]);

  async function applyFilters() {
    const nextFilters = {
      query: filters.query.trim(),
      location: filters.location.trim(),
      includeRemote: filters.includeRemote,
    };

    if (!nextFilters.query) {
      setFilterError("Choose one saved target role to power your job feed.");
      return;
    }

    console.info("[SMART_FILTERS] applying dashboard filters", {
      profileTargetRole: profileDefaultFilters?.query || null,
      profilePreferredLocation: profileDefaultFilters?.location || null,
      activeFilterRole: nextFilters.query || null,
      activeFilterLocation: nextFilters.location || null,
      includeRemote: nextFilters.includeRemote,
      requestSource: "apply-filters",
    });

    setSavingFilters(true);
    setFilterError(null);

    try {
      const currentSavedRole = profileDefaultFilters?.query?.trim() || "";
      if (nextFilters.query !== currentSavedRole) {
        const response = await fetch("/api/job-interests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            jobs: [{ title: nextFilters.query }],
            roleFocus: nextFilters.query,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | { error?: string; roleFocus?: string | null }
          | null;

        if (!response.ok) {
          throw new Error(
            data?.error ?? "We could not update your saved target role."
          );
        }

        const savedRole = data?.roleFocus?.trim() || nextFilters.query;
        nextFilters.query = savedRole;
        setFilters((current) => ({ ...current, query: savedRole }));
        setProfileDefaultFilters((current) =>
          current
            ? { ...current, query: savedRole }
            : {
                query: savedRole,
                location: nextFilters.location,
                includeRemote: nextFilters.includeRemote,
              }
        );
      }
    } catch (error) {
      setSavingFilters(false);
      setFilterError(
        error instanceof Error
          ? error.message
          : "We could not update your saved target role."
      );
      return;
    }

    requestSourceRef.current = "apply-filters";
    explicitFiltersRequestedRef.current = true;
    setExplicitFiltersActive(true);
    setAppliedFilters(nextFilters);
    console.info("[SMART_SESSION] stored temporary Smart Matches session filters", {
      profileTargetRole: profileDefaultFilters?.query || null,
      profilePreferredLocation: profileDefaultFilters?.location || null,
      activeFilterRole: nextFilters.query || null,
      activeFilterLocation: nextFilters.location || null,
      includeRemote: nextFilters.includeRemote,
      requestSource: "apply-filters",
      persistedTargetRole: true,
      persistedAcrossRefresh: false,
    });
  }

  function handleSelectJob(jobId: string) {
    setSelectedId(jobId);
    replaceSelectedJobParam(jobId);
  }

  function handleOpenJob(job: Job) {
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 1024px)").matches
    ) {
      storeJobDetailSummary("dashboard", job);
      router.push(`/dashboard/job/${encodeURIComponent(job.id)}`);
      return;
    }

    handleSelectJob(job.id);
  }

  useEffect(() => {
    const nextFilters = profileDefaultFilters ?? profileBackedFilters;
    const temporarySessionActive = explicitFiltersRequestedRef.current;

    console.info("[SMART_INIT] hydrating Smart Matches dashboard filters", {
      profileTargetRole: nextFilters.query || null,
      profilePreferredLocation: nextFilters.location || null,
      activeFilterRole: nextFilters.query || null,
      activeFilterLocation: nextFilters.location || null,
      hydrationSource: "profile",
      ignoredTemporaryFilterState: hasTransientFilterParams,
      requestSource: "initial-load",
    });

    if (!temporarySessionActive) {
      setFilters((current) =>
        sameDashboardFilters(current, nextFilters) ? current : nextFilters
      );
      setAppliedFilters((current) =>
        sameDashboardFilters(current, nextFilters) ? current : nextFilters
      );
    }

    if (hasTransientFilterParams) {
      console.info("[SMART_SESSION] ignored stale temporary Smart Matches filters on refresh", {
        profileTargetRole: nextFilters.query || null,
        profilePreferredLocation: nextFilters.location || null,
        ignoredQuery: queryParam || null,
        ignoredLocation: locationParam || null,
        ignoredIncludeRemote:
          includeRemoteParam === null ? null : includeRemoteParam === "1",
        hydrationSource: "profile",
      });
      clearTransientFilterParams();
    }
  }, [
    hasTransientFilterParams,
    includeRemoteParam,
    locationParam,
    profileBackedFilters,
    profileDefaultFilters,
    queryParam,
    clearTransientFilterParams,
  ]);

  useEffect(() => {
    setAppliedJobs(dedupeJobs(loadAppliedJobsSession<Job>()));
    setAppliedJobsSessionReady(true);
  }, []);

  useEffect(() => {
    if (!appliedJobsSessionReady) return;
    saveAppliedJobsSession(appliedJobs);
  }, [appliedJobs, appliedJobsSessionReady]);

  async function loadPage(cursor: string | null, options?: { reset?: boolean }) {
    const requestExplicit =
      explicitFiltersRequestedRef.current || explicitFiltersActive;
    const requestSource = options?.reset
      ? requestSourceRef.current
      : "load-more";
    const requestSignature = JSON.stringify({
      cursor: cursor ?? "",
      query: appliedFilters.query,
      location: appliedFilters.location,
      includeRemote: appliedFilters.includeRemote,
      explicit: requestExplicit,
      requestSource,
      reset: Boolean(options?.reset),
    });

    if (loadingMore && !options?.reset) {
      if (inFlightFeedRequestRef.current === requestSignature) {
        console.info("[SMART_DEDUPE] skipped duplicate Smart Matches client request", {
          cursor,
          query: appliedFilters.query || null,
          location: appliedFilters.location || null,
          explicitFiltersActive: requestExplicit,
        });
      }
      return;
    }

    if (inFlightFeedRequestRef.current === requestSignature) {
      console.info("[SMART_DEDUPE] skipped in-flight Smart Matches client request", {
        cursor,
        query: appliedFilters.query || null,
        location: appliedFilters.location || null,
        explicitFiltersActive: requestExplicit,
      });
      return;
    }

    const requestId = latestFeedRequestIdRef.current + 1;
    latestFeedRequestIdRef.current = requestId;

    if (options?.reset && activeFeedRequestRef.current) {
      console.info("[SMART_ABORT] aborting stale Smart Matches request", {
        query: appliedFilters.query || null,
        location: appliedFilters.location || null,
        explicitFiltersActive: requestExplicit,
      });
      activeFeedRequestRef.current.abort();
    }

    const controller = new AbortController();
    activeFeedRequestRef.current = controller;
    inFlightFeedRequestRef.current = requestSignature;

    setLoadingMore(true);

    try {
      const LIMIT = 25;
      let requestCursor = cursor;
      let filtered: Job[] = [];
      let responseCursor: string | null = cursor;

      console.info("[SMART_INPUT] dashboard Smart Matches request", {
        profileTargetRole: profileDefaultFilters?.query || null,
        profilePreferredLocation: profileDefaultFilters?.location || null,
        activeFilterRole: appliedFilters.query || null,
        activeFilterLocation: appliedFilters.location || null,
        includeRemote: appliedFilters.includeRemote,
        requestSource,
        activeFilterOverrideUsed:
          Boolean(appliedFilters.query || appliedFilters.location) &&
          (profileDefaultFilters === null ||
            appliedFilters.query !== (profileDefaultFilters.query || "") ||
            appliedFilters.location !== (profileDefaultFilters.location || "")),
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const url = new URL("/api/jobs", window.location.origin);
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
        if (requestExplicit) {
          url.searchParams.set("explicit", "1");
        }
        if (requestCursor) {
          url.searchParams.set("cursor", requestCursor);
        }

        console.info("[SMART_PROVIDER] dashboard smart-matches request", {
          attempt: attempt + 1,
          cursor: requestCursor,
          profileTargetRole: profileDefaultFilters?.query || null,
          profilePreferredLocation: profileDefaultFilters?.location || null,
          activeFilterRole: appliedFilters.query || null,
          activeFilterLocation: appliedFilters.location || null,
          includeRemote: appliedFilters.includeRemote,
          requestSource,
          url: url.toString(),
        });

        const res = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Failed to load jobs");
        }

        const data = (await res.json()) as SmartMatchesResponse;
        const incoming = Array.isArray(data?.jobs) ? data.jobs : [];
        const shouldInitializeFromResponse = !initializedFiltersRef.current;

        if (shouldInitializeFromResponse) {
          initializedFiltersRef.current = true;
        }

        if (data?.meta) {
          setResolutionMeta(data.meta);
        }

        if (shouldInitializeFromResponse && data?.meta) {
          const resolvedProfileDefaults = {
            query: data.meta.profileQuery || data.meta.query || "",
            location:
              data.meta.profilePreferredLocation ||
              data.meta.preferredLocation ||
              "",
            includeRemote: data.meta.includeRemote ?? appliedFilters.includeRemote,
          };
          initializedFiltersRef.current = true;
          if (!profileDefaultsInitializedRef.current) {
            profileDefaultsInitializedRef.current = true;
            setProfileDefaultFilters(resolvedProfileDefaults);
          }
          if (!requestExplicit) {
            setFilters(resolvedProfileDefaults);
            setAppliedFilters(resolvedProfileDefaults);
          }
        }

        filtered = incoming.filter((job) => {
          if (!job?.id) return false;
          const dedupeKey = getJobDedupeKey(job);
          if (!dedupeKey || seen.current.has(dedupeKey)) return false;
          seen.current.add(dedupeKey);
          return true;
        });

        responseCursor =
          typeof data?.nextCursor === "string" && data.nextCursor.trim()
            ? data.nextCursor
            : null;

        if (
          filtered.length > 0 ||
          !responseCursor ||
          responseCursor === requestCursor
        ) {
          break;
        }

        requestCursor = responseCursor;
      }

      if (latestFeedRequestIdRef.current !== requestId) {
        console.info("[SMART_DEDUPE] ignored stale Smart Matches response", {
          query: appliedFilters.query || null,
          location: appliedFilters.location || null,
          explicitFiltersActive: requestExplicit,
        });
        return;
      }

      setNextCursor(responseCursor);
      setAllJobs((prev) =>
        options?.reset ? filtered : dedupeJobs([...prev, ...filtered])
      );

      console.info("[SMART_RESULT] dashboard Smart Matches page result", {
        profileTargetRole: profileDefaultFilters?.query || null,
        profilePreferredLocation: profileDefaultFilters?.location || null,
        activeFilterRole: appliedFilters.query || null,
        activeFilterLocation: appliedFilters.location || null,
        requestSource,
        returnedJobs: filtered.length,
        nextCursor: responseCursor,
      });

      const visibleFiltered = appliedFilters.includeRemote
        ? filtered
        : filtered.filter((job) => !isRemoteJob(job));

      if (selectedJobParam) {
        const selectedFromUrl = visibleFiltered.find(
          (job) => job.id === selectedJobParam
        );
        if (selectedFromUrl?.id) {
          setSelectedId(selectedFromUrl.id);
        }
      } else if ((options?.reset || !selectedId) && visibleFiltered[0]?.id) {
        setSelectedId(visibleFiltered[0].id);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.info("[SMART_ABORT] Smart Matches request aborted", {
          query: appliedFilters.query || null,
          location: appliedFilters.location || null,
          explicitFiltersActive: requestExplicit,
        });
        return;
      }
      console.error("Jobs feed failed:", error);
    } finally {
      if (activeFeedRequestRef.current === controller) {
        activeFeedRequestRef.current = null;
      }
      if (inFlightFeedRequestRef.current === requestSignature) {
        inFlightFeedRequestRef.current = null;
      }
      if (latestFeedRequestIdRef.current === requestId) {
        setLoadingMore(false);
        if (options?.reset) {
          setSavingFilters(false);
          requestSourceRef.current = "initial-load";
        }
      }
    }
  }

  async function loadMore() {
    if (!nextCursor) {
      return;
    }

    requestSourceRef.current = "load-more";
    console.info("[SMART_LOAD_MORE] continuing Smart Matches session", {
      profileTargetRole: profileDefaultFilters?.query || null,
      profilePreferredLocation: profileDefaultFilters?.location || null,
      activeFilterRole: appliedFilters.query || null,
      activeFilterLocation: appliedFilters.location || null,
      requestSource: "load-more",
      nextCursor,
    });
    await loadPage(nextCursor);
  }

  useEffect(() => {
    console.info("[SMART_FILTERS] resetting Smart Matches feed", {
      profileTargetRole: profileDefaultFilters?.query || null,
      profilePreferredLocation: profileDefaultFilters?.location || null,
      activeFilterRole: appliedFilters.query || null,
      activeFilterLocation: appliedFilters.location || null,
      includeRemote: appliedFilters.includeRemote,
      requestSource: requestSourceRef.current,
    });
    seen.current.clear();
    detailCache.current.clear();
    setAllJobs([]);
    setSelectedId("");
    setSelectedDetails(null);
    setPretty({ sections: [], highlights: [] });
    setFormatted(null);
    setNextCursor(null);
    setResolutionMeta(null);
    if (!initializedFiltersRef.current) {
      requestSourceRef.current = "initial-load";
    }
    void loadPage(null, { reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedFilters.includeRemote,
    appliedFilters.location,
    appliedFilters.query,
    explicitFiltersActive,
  ]);

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
      const selected = visibleJobs.find((job) => job.id === selectedId) ?? null;
      if (!selected) {
        if (!cancelled) {
          setSelectedDetails(null);
          setPretty({ sections: [], highlights: [] });
          setFormatted(null);
        }
        return;
      }
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
  }, [selectedId, visibleJobs]);

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

  const readPlanStatus = useCallback(
    async (forceSync: boolean, callbackHref: string) => {
      const res = await fetch(
        forceSync ? "/api/billing/plan-status?forceSync=1" : "/api/billing/plan-status",
        { cache: "no-store" }
      );

      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return null;
      }

      if (!res.ok) {
        throw new Error("Unable to verify subscription status.");
      }

      return (await res.json()) as PlanStatusResponse;
    },
    [router]
  );

  const readCreditStatus = useCallback(
    async (callbackHref: string) => {
      const res = await fetch("/api/user/hirepilot-status", {
        cache: "no-store",
      });

      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return null;
      }

      if (!res.ok) {
        throw new Error("Unable to verify credit balance.");
      }

      return (await res.json()) as CreditStatusResponse;
    },
    [router]
  );

  const startProviderAutoApply = useCallback(
    async (job: SupportedAutoApplyJob) => {
      const applyProvider = detectApplyProviderFromJob(job);
      const jobUrl = job.jobUrl?.trim() ?? "";

      if (!applyProvider || !jobUrl) {
        return false;
      }

      const callbackHref =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/dashboard";

      if (authStatus === "loading") {
        return false;
      }

      if (authStatus !== "authenticated") {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return false;
      }

      let planData = await readPlanStatus(false, callbackHref);
      if (!planData) return false;

      if (planData.pending === true || planData.active !== true) {
        const refreshedPlanData = await readPlanStatus(true, callbackHref);
        if (!refreshedPlanData) return false;
        planData = refreshedPlanData;
      }

      if (planData.pending === true || planData.active !== true) {
        const params = new URLSearchParams();
        params.set("source", `${applyProvider}-auto-apply`);
        params.set("jobUrl", jobUrl);
        router.push(`/plans?${params.toString()}`);
        return false;
      }

      const res = await fetch("/api/applications/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApplyProviderPayload(job)),
      });

      const data = await res.json();

      if (!res.ok || !data?.applicationId) {
        throw new Error(data?.error ?? "Unable to start auto apply.");
      }

      router.push(`/dashboard/application/${data.applicationId}/audit`);
      return true;
    },
    [authStatus, readPlanStatus, router]
  );

  const handleAiApplyFromDetails = async () => {
    if (!right?.id) return;
    setAiApplyLoading(true);
    try {
      const applyProvider = detectApplyProviderFromJob(right);
      if (applyProvider) {
        await startProviderAutoApply(right);
        return;
      }

      await addAppliedJob(right);
    } finally {
      setAiApplyLoading(false);
    }
  };

  const handleCareerCoachFromDetails = () => {
    router.push("/job-tools/career-coach");
  };

  const handleAiApplyFromCard = async (job: Job) => {
    const applyProvider = detectApplyProviderFromJob(job);
    if (applyProvider) {
      const loadingId = getJobIdentity(job);
      setCardAiApplyLoadingId(loadingId);

      try {
        await startProviderAutoApply(job);
      } catch (error) {
        console.error(`[SMART_MATCHES] ${applyProvider} auto apply failed`, error);
      } finally {
        setCardAiApplyLoadingId((current) => (current === loadingId ? null : current));
      }
      return;
    }

    const jobUrl = job.jobUrl?.trim() ?? "";
    if (!jobUrl) return;

    const aiApplyHref = `/job-tools/generate?jobUrl=${encodeURIComponent(jobUrl)}`;
    const loadingId = getJobIdentity(job);

    if (authStatus === "loading") {
      return;
    }

    if (authStatus !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(aiApplyHref)}`);
      return;
    }

    setCardAiApplyLoadingId(loadingId);

    try {
      let planData = await readPlanStatus(false, aiApplyHref);
      if (!planData) return;

      if (planData.pending === true || planData.active !== true) {
        const refreshedPlanData = await readPlanStatus(true, aiApplyHref);
        if (!refreshedPlanData) return;
        planData = refreshedPlanData;
      }

      if (planData.pending === true || planData.active !== true) {
        const creditData = await readCreditStatus(aiApplyHref);
        if (!creditData) return;

        if (Number(creditData.hirePilotCredits ?? 0) <= 0) {
          const params = new URLSearchParams();
          params.set("source", "smart-matches-ai-apply");
          params.set("jobUrl", jobUrl);
          router.push(`/plans?${params.toString()}`);
          return;
        }
      }

      router.push(aiApplyHref);
    } catch (error) {
      console.error("[SMART_MATCHES] AI apply access check failed", error);
      router.push(aiApplyHref);
    } finally {
      setCardAiApplyLoadingId((current) => (current === loadingId ? null : current));
    }
  };

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
                      Your saved target role drives this feed. Update it here after login.
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
                      void applyFilters();
                    }}
                  >
                    <div className="flex flex-col gap-3">
                      {filterError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {filterError}
                        </div>
                      ) : null}

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
                              {
                                setFilterError(null);
                                setFilters((current) => ({
                                  ...current,
                                  query: event.target.value,
                                }));
                              }
                            }
                            placeholder="Target role"
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
                              {
                                setFilterError(null);
                                setFilters((current) => ({
                                  ...current,
                                  location: event.target.value,
                                }));
                              }
                            }
                            placeholder="Detroit, MI"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </label>
                      </div>

                      <div className="flex">
                        <button
                          type="submit"
                          disabled={savingFilters || !filters.query.trim()}
                          className="ml-auto shrink-0 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingFilters ? "Applying..." : "Apply filters"}
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
              const jobIdentity = getJobIdentity(job);
              const isCardAiApplyLoading = cardAiApplyLoadingId === jobIdentity;
              const cardApplyProvider = detectApplyProviderFromJob(job);
              const cardAiApplyLabel = getApplyProviderButtonLabel(cardApplyProvider);
              const cardAiApplyLoadingLabel = getApplyProviderLoadingLabel(cardApplyProvider);

              return (
                <div
                  key={jobIdentity}
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
                          onClick={() => handleOpenJob(job)}
                          className="truncate text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                        >
                          {job.title}
                        </button>

                        <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          {getSourceLabel(job.source)}
                        </span>

                        {job.matchLabel ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            {job.matchLabel}
                          </span>
                        ) : null}

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
                        <div className="w-full space-y-2 sm:w-auto">
                          <span>Job Posted {job.posted}</span>
                          {job.source === "adzuna" ? (
                            <div>
                              <AdzunaAttribution className="text-[11px]" />
                            </div>
                          ) : null}
                        </div>

                        <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center xl:justify-end">
                          <button
                            type="button"
                            onClick={() => void handleAiApplyFromCard(job)}
                            disabled={
                              authStatus === "loading" ||
                              isCardAiApplyLoading ||
                              !job.jobUrl
                            }
                            className="w-full rounded-md bg-[linear-gradient(135deg,#F97316_0%,#EA580C_100%)] px-3 py-2 text-center text-[11px] font-semibold text-white shadow-[0_10px_22px_rgba(194,65,12,0.28)] transition hover:bg-[linear-gradient(135deg,#EA580C_0%,#C2410C_100%)] hover:shadow-[0_12px_24px_rgba(194,65,12,0.34)] disabled:cursor-not-allowed disabled:opacity-60 lg:hidden xl:w-auto xl:min-w-[150px]"
                          >
                            {isCardAiApplyLoading
                              ? cardAiApplyLoadingLabel
                              : cardAiApplyLabel}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenJob(job)}
                            className="w-full rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-center text-[11px] font-medium text-[#374151] hover:bg-gray-50 lg:hidden xl:w-auto xl:min-w-[110px]"
                          >
                            View Posting
                          </button>

                          {job.jobUrl ? (
                            <a
                              href={job.jobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hidden w-full rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-center text-[11px] font-medium text-[#374151] hover:bg-gray-50 lg:inline-flex lg:w-auto lg:min-w-[110px] lg:items-center lg:justify-center"
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
              disabled={loadingMore || !nextCursor}
              className="w-full rounded-lg bg-blue-600 py-2 font-medium text-white disabled:opacity-60"
            >
              {loadingMore
                ? "Loading..."
                : nextCursor
                  ? "Find More Jobs"
                  : "No More Jobs"}
            </button>
          </div>
        </aside>

        {/* RIGHT DETAILS */}
        <section className="hidden min-h-0 flex-col lg:col-span-7 lg:flex">
          <JobDetailsPanel
            job={right}
            pretty={pretty}
            formatted={formatted}
            detailsLoading={detailsLoading}
            aiApplyLoading={aiApplyLoading}
            aiApplyLabel={rightAiApplyLabel}
            aiApplyLoadingLabel={rightAiApplyLoadingLabel}
            onAiApply={handleAiApplyFromDetails}
            onCareerCoach={handleCareerCoachFromDetails}
            onOutreach={handleOutreachFromDetails}
            hideAdzunaAttribution
          />
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
