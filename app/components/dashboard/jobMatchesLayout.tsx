// File: /Hirexa/my-app/app/components/JobMatchesLayout.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookmarkIcon as BookmarkOutline,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolid } from "@heroicons/react/24/solid";
import { useSession } from "next-auth/react";
import type { ApplyStopClassification } from "@/app/lib/apply/stopClassification";
import type { Job, JobDetail, JobPretty } from "@/app/lib/jobs/types";
import { prettyFromDescription } from "@/app/lib/jobs/pretty-from-text";
import { isRemoteJob } from "@/app/lib/jobs/isRemoteJob";
import JobDetailsPanel, { type FormattedJob } from "@/app/components/dashboard/JobDetailsPanel";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import SavedStrategyPanel from "@/app/components/apply/SavedStrategyPanel";
import { APPLY_SESSION_POLL_INTERVAL_MS } from "@/app/lib/apply/applySessionPolling";
import {
  buildApplyProviderPayload,
  detectApplyProviderFromJob,
} from "@/app/lib/apply/providerDetection";
import { storeJobDetailSummary } from "@/app/lib/jobs/clientDetailSummary";
import {
  clearAutoApplyPopupState,
  createEmptyAutoApplyPopupState,
  isAutoApplyPopupStateExpired,
  loadAutoApplyPopupState,
  saveAutoApplyPopupState,
  type AutoApplyPopupItem,
  type AutoApplyPopupState,
} from "@/app/lib/apply/autoApplyPopupSession";
import {
  isApplySessionTerminalStatus,
  isApplySessionSuccessStatus,
  toApplySessionDisplayStatus,
} from "@/app/lib/apply/sessionStatus";

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

type SaveJobResponse = {
  error?: string;
};

type SavedJobsListResponse = {
  jobs?: Array<{
    jobId?: string;
  }>;
};

type SupportedAutoApplyJob = Pick<
  Job,
  "id" | "source" | "title" | "company" | "location" | "jobUrl"
>;

type AutoApplyStartResponse = {
  ok?: boolean;
  applicationId?: string;
  applySessionId?: string;
  status?: string;
  submissionStatus?: string;
  emailStatus?: string;
  message?: string;
  error?: string;
  finalUrl?: string | null;
  stoppedAtUrl?: string | null;
  stoppedAtTitle?: string | null;
  currentUrl?: string | null;
  lastAction?: string | null;
  lastActionText?: string | null;
  lastActionSelector?: string | null;
  stopReason?: string | null;
  stopClassification?: ApplyStopClassification | null;
  missingRequired?: string[];
};

type AutoApplyBannerState = {
  message: string;
  ctaLabel: string;
  ctaHref: string;
};

type ApplySessionPollResponse = {
  ok?: boolean;
  found?: boolean;
  storageBackendUsed?: string;
  session?: {
    status?: string;
    submissionStatus?: string;
    emailStatus?: string;
    lastUrl?: string;
    error?: string;
    message?: string;
    debug?: {
      finalUrl?: string | null;
      stoppedAtUrl?: string | null;
      stoppedAtTitle?: string | null;
      currentUrl?: string | null;
      lastAction?: string | null;
      lastActionText?: string | null;
      lastActionSelector?: string | null;
      stopReason?: string | null;
      stopClassification?: ApplyStopClassification | null;
    };
  };
  error?: string;
};

const AUTO_APPLY_CTA_LABEL = "Apply Now";
const AUTO_APPLY_LOADING_LABEL = "Starting auto apply...";
const AUTO_APPLY_MISSING_RESUME_MESSAGE =
  "Auto Apply needs a PDF resume first. Upload your resume to continue.";

function isMissingResumeAutoApplyError(payload: AutoApplyStartResponse | null | undefined) {
  const missingRequired = Array.isArray(payload?.missingRequired)
    ? payload?.missingRequired
    : [];
  const hasResumeMissingFlag = missingRequired.some(
    (field) => String(field).trim().toLowerCase() === "resume"
  );
  const message = String(payload?.error ?? "").trim().toLowerCase();

  return (
    hasResumeMissingFlag ||
    message.includes("resume required for auto apply") ||
    message.includes("resume is required for auto apply") ||
    message.includes("upload a resume to continue") ||
    message.includes("upload a pdf resume")
  );
}

function formatAutoApplyStatusLabel(status: string | null | undefined) {
  const normalized = toApplySessionDisplayStatus(status) ?? status ?? "STARTING";

  switch (normalized) {
    case "APPLY_NOT_STARTED":
      return "Could not start";
    case "AUTO_APPLY_UNAVAILABLE":
      return "Not available";
    case "UNCONFIRMED":
      return "Unconfirmed";
    case "SUBMITTED":
      return "Submitted";
    default:
      return normalized
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function isStoppedAutoApplyStatus(status: string | null | undefined) {
  return (
    status === "APPLY_NOT_STARTED" ||
    status === "WAITING_HUMAN" ||
    status === "FAILED"
  );
}

function isDashboardStopPointStatus(status: string | null | undefined) {
  return isStoppedAutoApplyStatus(status) || status === "AUTO_APPLY_UNAVAILABLE";
}

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

function normalizeSavedJobValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getSavedJobId(
  job: Pick<Job, "id" | "jobUrl" | "title" | "company" | "location">
) {
  const explicitId = normalizeSavedJobValue(job.id);
  if (explicitId) return explicitId;

  const urlId = normalizeSavedJobValue(job.jobUrl);
  if (urlId) return urlId;

  const fallback = [job.title, job.company, job.location]
    .map((value) => normalizeSavedJobValue(value)?.toLowerCase() ?? "")
    .filter(Boolean)
    .join("::");

  return fallback || null;
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
  const [autoApplyBanner, setAutoApplyBanner] = useState<AutoApplyBannerState | null>(
    null
  );
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [savingJobIds, setSavingJobIds] = useState<string[]>([]);

  const [autoApplyPopupState, setAutoApplyPopupState] = useState<AutoApplyPopupState>(
    () => createEmptyAutoApplyPopupState()
  );
  const [showAppliedPanel, setShowAppliedPanel] = useState(false);
  const [aiApplyLoading, setAiApplyLoading] = useState(false);
  const [cardAiApplyLoadingId, setCardAiApplyLoadingId] = useState<string | null>(null);

  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<JobDetail | null>(null);

  const [pretty, setPretty] = useState<JobPretty>({ sections: [], highlights: [] });
  const [formatted, setFormatted] = useState<FormattedJob | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

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
  const autoApplyPollInFlightRef = useRef(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
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
  const autoApplyItems = useMemo(
    () =>
      Object.values(autoApplyPopupState.items).sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [autoApplyPopupState.items]
  );
  const selectedAutoApplyItem = useMemo(() => {
    if (!selectedId && !selectedSummary?.jobUrl) {
      return null;
    }

    const normalizedSelectedUrl = normalizeJobUrl(selectedSummary?.jobUrl);
    return (
      autoApplyItems.find((item) => {
        if (item.jobId === selectedId) {
          return true;
        }

        return Boolean(
          normalizedSelectedUrl &&
            normalizeJobUrl(item.jobUrl ?? undefined) === normalizedSelectedUrl,
        );
      }) ?? null
    );
  }, [autoApplyItems, selectedId, selectedSummary?.jobUrl]);
  const rightAutoApplyStopPoint = useMemo(() => {
    if (
      !selectedAutoApplyItem ||
      !isDashboardStopPointStatus(selectedAutoApplyItem.status)
    ) {
      return null;
    }

    const stoppedAtUrl =
      selectedAutoApplyItem.stoppedAtUrl ??
      selectedAutoApplyItem.lastUrl ??
      selectedAutoApplyItem.currentUrl ??
      selectedAutoApplyItem.jobUrl ??
      null;
    const hasStopPoint = Boolean(
      stoppedAtUrl ||
        selectedAutoApplyItem.stoppedAtTitle ||
        selectedAutoApplyItem.lastActionText ||
        selectedAutoApplyItem.lastActionSelector,
    );

    if (!hasStopPoint) {
      return null;
    }

    return {
      stoppedAtUrl,
      stoppedAtTitle: selectedAutoApplyItem.stoppedAtTitle ?? null,
      lastActionText:
        selectedAutoApplyItem.lastActionText ??
        selectedAutoApplyItem.lastAction ??
        null,
      lastActionSelector: selectedAutoApplyItem.lastActionSelector ?? null,
      status: formatAutoApplyStatusLabel(selectedAutoApplyItem.status),
    };
  }, [selectedAutoApplyItem]);

  const right = selectedDetails ?? selectedSummaryDetail;
  const rightAiApplyLabel = AUTO_APPLY_CTA_LABEL;
  const rightAiApplyLoadingLabel = AUTO_APPLY_LOADING_LABEL;
  const shareJobUrl = right?.jobUrl?.trim() ?? "";
  const displayCompany = right?.company?.trim() || "Unknown company";
  const displayLocation = right?.location?.trim() || "Location not provided";
  const canShareRightJob = Boolean(right && shareJobUrl);

  useEffect(() => {
    setCopiedShareLink(false);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, [right?.id, shareJobUrl]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareJobUrl) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(shareJobUrl);
      setCopiedShareLink(true);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedShareLink(false);
        copyResetTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error("[SMART_MATCHES] failed to copy job URL", error);
    }
  }, [shareJobUrl]);

  const handleEmailShareJob = useCallback(() => {
    if (!shareJobUrl) return;

    const subject = `Check out this job: ${right?.title ?? "Job opportunity"} at ${displayCompany}`;
    const body = [
      "I found this job and wanted to share it with you.",
      "",
      right?.title ?? "Job opportunity",
      displayCompany,
      displayLocation,
      "",
      "Apply here:",
      shareJobUrl,
    ].join("\n");

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [displayCompany, displayLocation, right?.title, shareJobUrl]);

  const replaceSelectedJobParam = useCallback((jobId: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (jobId) {
      nextParams.set("job", jobId);
    } else {
      nextParams.delete("job");
    }

    const nextQuery = nextParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [pathname, searchParams]);

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

  const updateAutoApplyPopupState = useCallback(
    (
      updater: (current: AutoApplyPopupState, now: number) => AutoApplyPopupState
    ) => {
      setAutoApplyPopupState((current) => {
        const now = Date.now();
        const base = isAutoApplyPopupStateExpired(current, now)
          ? createEmptyAutoApplyPopupState(now)
          : current;
        const next = updater(base, now);
        saveAutoApplyPopupState(next);
        return next;
      });
    },
    []
  );

  const markAutoApplyActivity = useCallback(() => {
    updateAutoApplyPopupState((current, now) => ({
      ...current,
      lastActivityAt: now,
    }));
  }, [updateAutoApplyPopupState]);

  const dismissAutoApplyPopup = useCallback(() => {
    updateAutoApplyPopupState((current, now) => {
      console.info("[AUTO_APPLY_POPUP] dismissed popup", {
        sessionKey: current.currentSessionKey,
      });

      return {
        ...current,
        dismissedAt: now,
        isOpen: false,
        lastActivityAt: now,
      };
    });
  }, [updateAutoApplyPopupState]);

  const toggleAutoApplyPopup = useCallback(() => {
    updateAutoApplyPopupState((current, now) => {
      const nextOpen = !current.isOpen;

      return {
        ...current,
        dismissedAt: nextOpen ? current.dismissedAt : now,
        isOpen: nextOpen,
        lastActivityAt: now,
      };
    });
  }, [updateAutoApplyPopupState]);

  const upsertAutoApplyPopupItem = useCallback(
    (
      item: Omit<AutoApplyPopupItem, "updatedAt"> & { updatedAt?: number },
      options?: { autoOpen?: boolean }
    ) => {
      updateAutoApplyPopupState((current, now) => {
        const hadItems = Object.keys(current.items).length > 0;
        const shouldAutoOpen =
          options?.autoOpen === true &&
          !hadItems &&
          current.dismissedAt === null;

        const next: AutoApplyPopupState = {
          ...current,
          firstShownAt:
            shouldAutoOpen && current.firstShownAt === null
              ? now
              : current.firstShownAt,
          isOpen: shouldAutoOpen ? true : current.isOpen,
          lastActivityAt: now,
          items: {
            ...current.items,
            [item.applicationId]: {
              ...(current.items[item.applicationId] ?? {}),
              ...item,
              updatedAt: item.updatedAt ?? now,
            },
          },
        };

        if (shouldAutoOpen) {
          console.info("[AUTO_APPLY_POPUP] auto-opened popup", {
            sessionKey: next.currentSessionKey,
            applicationId: item.applicationId,
          });
        }

        return next;
      });
    },
    [updateAutoApplyPopupState]
  );

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
    const now = Date.now();
    const stored = loadAutoApplyPopupState();

    if (!stored || isAutoApplyPopupStateExpired(stored, now)) {
      if (stored) {
        console.info("[AUTO_APPLY_POPUP] cleared expired popup session", {
          sessionKey: stored.currentSessionKey,
        });
      }

      clearAutoApplyPopupState();
      const fresh = createEmptyAutoApplyPopupState(now);
      setAutoApplyPopupState(fresh);
      setShowAppliedPanel(false);
      return;
    }

    setAutoApplyPopupState(stored);
    setShowAppliedPanel(stored.isOpen && Object.keys(stored.items).length > 0);
    console.info("[AUTO_APPLY_POPUP] restored popup session", {
      sessionKey: stored.currentSessionKey,
      itemCount: Object.keys(stored.items).length,
    });
  }, []);

  useEffect(() => {
    setShowAppliedPanel(
      autoApplyPopupState.isOpen &&
        Object.keys(autoApplyPopupState.items).length > 0
    );
  }, [autoApplyPopupState.isOpen, autoApplyPopupState.items]);

  useEffect(() => {
    const handleActivity = () => {
      markAutoApplyActivity();
    };

    window.addEventListener("click", handleActivity);
    window.addEventListener("focus", handleActivity);
    window.addEventListener("keydown", handleActivity);

    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [markAutoApplyActivity]);

  useEffect(() => {
    markAutoApplyActivity();
  }, [pathname, searchParams, markAutoApplyActivity]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAutoApplyPopupState((current) => {
        if (!isAutoApplyPopupStateExpired(current)) {
          return current;
        }

        console.info("[AUTO_APPLY_POPUP] expired popup session after inactivity", {
          sessionKey: current.currentSessionKey,
        });
        clearAutoApplyPopupState();
        setShowAppliedPanel(false);
        return createEmptyAutoApplyPopupState();
      });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const pendingItems = autoApplyItems.filter(
      (item) =>
        item.applySessionId && !isApplySessionTerminalStatus(item.status)
    );

    if (pendingItems.length === 0) {
      return;
    }

    const poll = async () => {
      if (autoApplyPollInFlightRef.current) return;
      autoApplyPollInFlightRef.current = true;

      try {
        const results = await Promise.all(
          pendingItems.map(async (item) => {
            const res = await fetch(`/api/apply-sessions/${item.applySessionId}`, {
              cache: "no-store",
            });
            const payload = (await res.json()) as ApplySessionPollResponse;
            return { item, res, payload };
          })
        );

        updateAutoApplyPopupState((current, now) => {
          const nextItems = { ...current.items };

          for (const { item, res, payload } of results) {
            if (res.status === 404 || payload.found === false) {
              nextItems[item.applicationId] = {
                ...nextItems[item.applicationId],
                applySessionId: null,
                status: "FAILED",
                message:
                  payload.error ??
                  "Auto apply session could not be found. Please restart auto apply.",
                updatedAt: now,
              };
              continue;
            }

            if (!res.ok || !payload.ok || !payload.session) continue;

            const displayStatus =
              toApplySessionDisplayStatus(payload.session.status) ??
              payload.session.status ??
              item.status;

            nextItems[item.applicationId] = {
              ...nextItems[item.applicationId],
              applySessionId: isApplySessionTerminalStatus(displayStatus)
                ? null
                : nextItems[item.applicationId]?.applySessionId ??
                  item.applySessionId ??
                  null,
              status: displayStatus,
              message: payload.session.message ?? payload.session.error ?? null,
              lastUrl:
                payload.session.debug?.finalUrl ??
                payload.session.lastUrl ??
                item.lastUrl ??
                null,
              stoppedAtUrl:
                payload.session.debug?.stoppedAtUrl ??
                nextItems[item.applicationId]?.stoppedAtUrl ??
                item.stoppedAtUrl ??
                null,
              stoppedAtTitle:
                payload.session.debug?.stoppedAtTitle ??
                nextItems[item.applicationId]?.stoppedAtTitle ??
                item.stoppedAtTitle ??
                null,
              currentUrl:
                payload.session.debug?.currentUrl ??
                nextItems[item.applicationId]?.currentUrl ??
                item.currentUrl ??
                null,
              lastAction:
                payload.session.debug?.lastAction ??
                nextItems[item.applicationId]?.lastAction ??
                item.lastAction ??
                null,
              lastActionText:
                payload.session.debug?.lastActionText ??
                nextItems[item.applicationId]?.lastActionText ??
                item.lastActionText ??
                null,
              lastActionSelector:
                payload.session.debug?.lastActionSelector ??
                nextItems[item.applicationId]?.lastActionSelector ??
                item.lastActionSelector ??
                null,
              stopReason:
                payload.session.debug?.stopReason ??
                nextItems[item.applicationId]?.stopReason ??
                item.stopReason ??
                null,
              stopClassification:
                payload.session.debug?.stopClassification ??
                nextItems[item.applicationId]?.stopClassification ??
                item.stopClassification ??
                null,
              updatedAt: now,
            };
          }

          return {
            ...current,
            items: nextItems,
            lastActivityAt: now,
          };
        });
      } catch (error) {
        console.error("[AUTO_APPLY_POPUP] polling failed", error);
      } finally {
        autoApplyPollInFlightRef.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, APPLY_SESSION_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [autoApplyItems, updateAutoApplyPopupState]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      setSavedJobIds([]);
      setSavingJobIds([]);
      return;
    }

    let cancelled = false;

    async function loadSavedJobs() {
      try {
        const response = await fetch("/api/saved-jobs/list", {
          cache: "no-store",
        });

        if (response.status === 401) {
          if (!cancelled) {
            setSavedJobIds([]);
          }
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as SavedJobsListResponse;
        if (!response.ok) {
          throw new Error("Unable to load saved jobs.");
        }

        if (cancelled) return;

        setSavedJobIds(
          (payload.jobs ?? [])
            .map((job) => normalizeSavedJobValue(job.jobId))
            .filter((jobId): jobId is string => Boolean(jobId))
        );
      } catch (error) {
        console.error("[SAVED_JOBS] dashboard preload failed", error);
      }
    }

    void loadSavedJobs();

    return () => {
      cancelled = true;
    };
  }, [authStatus]);

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
  }, [replaceSelectedJobParam, selectedId, selectedJobParam, visibleJobs]);

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
  }, [selectedId, visibleJobs]);

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

  const startDashboardAutoApply = useCallback(
    async (job: SupportedAutoApplyJob) => {
      setAutoApplyBanner(null);
      const applyProvider = detectApplyProviderFromJob(job);
      const jobUrl = job.jobUrl?.trim() ?? "";
      if (!jobUrl) {
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
        if (applyProvider) {
          const params = new URLSearchParams();
          params.set("source", `${applyProvider}-auto-apply`);
          params.set("jobUrl", jobUrl);
          router.push(`/plans?${params.toString()}`);
          return false;
        }

        const creditData = await readCreditStatus(callbackHref);
        if (!creditData) return false;

        if (Number(creditData.hirePilotCredits ?? 0) <= 0) {
          const params = new URLSearchParams();
          params.set("source", "smart-matches-ai-apply");
          params.set("jobUrl", jobUrl);
          router.push(`/plans?${params.toString()}`);
          return false;
        }
      }

      const createRes = await fetch("/api/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildApplyProviderPayload(job)),
      });

      const createData = (await createRes.json()) as AutoApplyStartResponse;
      if (!createRes.ok || !createData?.applicationId) {
        throw new Error(createData?.error ?? "Unable to start auto apply.");
      }

      const applicationId = createData.applicationId;
      upsertAutoApplyPopupItem(
        {
          applicationId,
          applySessionId: null,
          jobId: job.id,
          jobUrl: job.jobUrl,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          status: "STARTING",
        },
        { autoOpen: true }
      );

      console.info("[AUTO_APPLY_DASHBOARD] created auto-apply application", {
        applicationId,
        jobId: job.id,
        source: job.source,
        applyProvider,
      });

      const startRes = await fetch(`/api/applications/${applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: true }),
      });

      const startData = (await startRes.json()) as AutoApplyStartResponse;
      if (!startRes.ok || !startData?.ok || !startData.applySessionId) {
        const message = startData?.error ?? "Unable to start auto apply.";
        const missingResume = isMissingResumeAutoApplyError(startData);
        const status =
          startData?.status === "AUTO_APPLY_UNAVAILABLE"
            ? "AUTO_APPLY_UNAVAILABLE"
            : "FAILED";
        const popupMessage = missingResume
          ? AUTO_APPLY_MISSING_RESUME_MESSAGE
          : message;

        upsertAutoApplyPopupItem({
          applicationId,
          applySessionId: null,
          jobId: job.id,
          jobUrl: job.jobUrl,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          status,
          message: popupMessage,
          lastUrl: startData?.finalUrl ?? null,
          stoppedAtUrl: startData?.stoppedAtUrl ?? null,
          stoppedAtTitle: startData?.stoppedAtTitle ?? null,
          currentUrl: startData?.currentUrl ?? null,
          lastAction: startData?.lastAction ?? null,
          lastActionText: startData?.lastActionText ?? null,
          lastActionSelector: startData?.lastActionSelector ?? null,
          stopReason: startData?.stopReason ?? null,
          stopClassification: startData?.stopClassification ?? null,
        });

        if (missingResume) {
          setAutoApplyBanner({
            message: AUTO_APPLY_MISSING_RESUME_MESSAGE,
            ctaLabel: "Upload resume",
            ctaHref: "/profile",
          });
          return false;
        }

        throw new Error(message);
      }

      upsertAutoApplyPopupItem({
        applicationId,
        applySessionId: startData.applySessionId,
        jobId: job.id,
        jobUrl: job.jobUrl,
        jobTitle: job.title,
        company: job.company,
        location: job.location,
        status:
          toApplySessionDisplayStatus(startData.status) ??
          startData.status ??
          "STARTING",
        message: startData.message ?? null,
      });

      console.info("[AUTO_APPLY_DASHBOARD] started background auto-apply", {
        applicationId,
        applySessionId: startData.applySessionId,
        status: startData.status ?? "STARTING",
      });

      return true;
    },
    [
      authStatus,
      readCreditStatus,
      readPlanStatus,
      router,
      upsertAutoApplyPopupItem,
    ]
  );

  const handleAiApplyFromDetails = async () => {
    if (!right?.id) return;
    setAiApplyLoading(true);
    try {
      await startDashboardAutoApply(right);
    } finally {
      setAiApplyLoading(false);
    }
  };

  const handleCareerCoachFromDetails = () => {
    router.push("/job-tools/career-coach");
  };

  const handleAiApplyFromCard = async (job: Job) => {
    const loadingId = getJobIdentity(job);
    setCardAiApplyLoadingId(loadingId);

    try {
      await startDashboardAutoApply(job);
    } catch (error) {
      console.error("[AUTO_APPLY_DASHBOARD] Smart Matches auto apply failed", error);
    } finally {
      setCardAiApplyLoadingId((current) => (current === loadingId ? null : current));
    }
  };

  const handleToggleSavedJob = useCallback(
    async (job: Job) => {
      const savedJobId = getSavedJobId(job);
      const jobUrl = job.jobUrl?.trim() ?? "";

      if (authStatus === "loading") {
        return;
      }

      const callbackHref =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/dashboard";

      if (authStatus !== "authenticated") {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return;
      }

      if (!savedJobId || !jobUrl) {
        return;
      }

      if (savingJobIds.includes(savedJobId)) {
        return;
      }

      const currentlySaved = savedJobIds.includes(savedJobId);
      const nextSaved = !currentlySaved;

      setSavingJobIds((current) =>
        current.includes(savedJobId) ? current : [...current, savedJobId]
      );
      setSavedJobIds((current) =>
        nextSaved
          ? current.includes(savedJobId)
            ? current
            : [...current, savedJobId]
          : current.filter((jobId) => jobId !== savedJobId)
      );

      try {
        const response = await fetch("/api/saved-jobs", {
          method: currentlySaved ? "DELETE" : "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(
            currentlySaved
              ? {
                  jobId: savedJobId,
                }
              : {
                  jobId: savedJobId,
                  title: job.title,
                  company: job.company,
                  location: job.location,
                  url: jobUrl,
                }
          ),
        });

        const payload = (await response.json().catch(() => ({}))) as SaveJobResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to update saved job.");
        }
      } catch (error) {
        setSavedJobIds((current) =>
          currentlySaved
            ? current.includes(savedJobId)
              ? current
              : [...current, savedJobId]
            : current.filter((jobId) => jobId !== savedJobId)
        );
        console.error("[SAVED_JOBS] dashboard toggle failed", error);
      } finally {
        setSavingJobIds((current) =>
          current.filter((jobId) => jobId !== savedJobId)
        );
      }
    },
    [authStatus, router, savedJobIds, savingJobIds]
  );

  return (
    <div className="mt-[59]">
      <div className="mt-4 grid min-h-0 grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-12 lg:gap-6 xl:h-[calc(100vh-140px)]">
        {/* LEFT LIST */}
        <aside className="flex min-h-0 flex-col lg:col-span-5">
          <div className="mt-4 shrink-0 sm:mt-8">
            <div className="text-black">
              <h2 className="text-lg font-semibold">Smart Matches</h2>
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

              {autoApplyBanner ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p>{autoApplyBanner.message}</p>
                    <button
                      type="button"
                      onClick={() => router.push(autoApplyBanner.ctaHref)}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                    >
                      {autoApplyBanner.ctaLabel}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {visibleJobs.map((job) => {
              const active = job.id === selectedId;
              const jobIdentity = getJobIdentity(job);
              const savedJobId = getSavedJobId(job);
              const isCardSaved = savedJobId
                ? savedJobIds.includes(savedJobId)
                : false;
              const isCardSavePending = savedJobId
                ? savingJobIds.includes(savedJobId)
                : false;
              const canSaveJob = Boolean(savedJobId && job.jobUrl?.trim());
              const isCardAiApplyLoading = cardAiApplyLoadingId === jobIdentity;
              const cardAiApplyLabel = AUTO_APPLY_CTA_LABEL;
              const cardAiApplyLoadingLabel = AUTO_APPLY_LOADING_LABEL;

              return (
                <div
                  key={jobIdentity}
                  className={[
                    "relative flex w-full flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition",
                    active
                      ? "border-blue-400 ring-2 ring-blue-100"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleSavedJob(job)}
                    disabled={!canSaveJob || isCardSavePending}
                    aria-pressed={isCardSaved}
                    aria-label={isCardSaved ? `Unsave ${job.title}` : `Save ${job.title}`}
                    className="absolute top-3 right-3 z-10 p-1 text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCardSaved ? (
                      <BookmarkSolid className="h-5 w-5 text-blue-600" />
                    ) : (
                      <BookmarkOutline className="h-5 w-5 text-slate-500" />
                    )}
                  </button>

                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="w-full min-w-0 pr-12">
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
            autoApplyStopPoint={rightAutoApplyStopPoint}
            onAiApply={handleAiApplyFromDetails}
            onCareerCoach={handleCareerCoachFromDetails}
            shareActions={
              right
                ? {
                    canShare: canShareRightJob,
                    copied: copiedShareLink,
                    onCopyLink: () => void handleCopyShareLink(),
                    onEmailJob: handleEmailShareJob,
                  }
                : null
            }
            hideAdzunaAttribution
          />
        </section>
      </div>

      {/* APPLIED JOBS FLOAT */}
      {autoApplyItems.length > 0 ? (
        <>
          {showAppliedPanel ? (
            <div className="fixed inset-x-4 bottom-24 z-40 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[min(420px,calc(100vw-2rem))]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Applied jobs</h3>
                <button
                  type="button"
                  onClick={dismissAutoApplyPopup}
                  className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1 sm:max-h-56">
                {autoApplyItems.map((item) => {
                  const terminal = isApplySessionTerminalStatus(item.status);
                  const submitted = isApplySessionSuccessStatus(item.status);
                  const statusLabel = formatAutoApplyStatusLabel(item.status);
                  const stoppedStatus = isStoppedAutoApplyStatus(item.status);
                  const stoppedUrl =
                    item.lastUrl ?? item.currentUrl ?? item.jobUrl ?? null;
                  const canRenderStoppedPageUi =
                    stoppedStatus &&
                    Boolean(
                      stoppedUrl ||
                        item.stopClassification ||
                        item.stopReason ||
                        item.lastAction,
                    );

                  return (
                    <div
                      key={item.applicationId}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800">
                            {item.jobTitle}
                          </p>
                          <p className="text-[11px] text-gray-600">
                            {item.company} • {item.location}
                          </p>
                        </div>

                        {terminal ? (
                          <span
                            className={[
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              submitted
                                ? "bg-emerald-100 text-emerald-700"
                                : item.status === "AUTO_APPLY_UNAVAILABLE" ||
                                    item.status === "APPLY_NOT_STARTED"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-700",
                            ].join(" ")}
                          >
                            {submitted ? "Submitted" : statusLabel}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-2 text-[10px] font-semibold text-blue-700">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                            {statusLabel}
                          </span>
                        )}
                      </div>

                      {item.message ? (
                        canRenderStoppedPageUi ? (
                          <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                            {stoppedUrl ? (
                              <p>
                                Stopped at:{" "}
                                <a
                                  className="break-all underline"
                                  href={stoppedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {stoppedUrl}
                                </a>
                              </p>
                            ) : null}
                            <SavedStrategyPanel
                              finalUrl={stoppedUrl}
                              currentUrl={item.currentUrl}
                              lastAction={item.lastAction}
                              stopReason={item.stopReason}
                              stopClassification={item.stopClassification}
                              compact
                              className="mt-2"
                            />
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-gray-600">{item.message}</p>
                        )
                      ) : canRenderStoppedPageUi ? (
                        <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                          {stoppedUrl ? (
                            <p>
                              Stopped at:{" "}
                              <a
                                className="break-all underline"
                                href={stoppedUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {stoppedUrl}
                              </a>
                            </p>
                          ) : null}
                          <SavedStrategyPanel
                            finalUrl={stoppedUrl}
                            currentUrl={item.currentUrl}
                            lastAction={item.lastAction}
                            stopReason={item.stopReason}
                            stopClassification={item.stopClassification}
                            compact
                            className="mt-2"
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={toggleAutoApplyPopup}
            className="fixed bottom-4 right-4 z-50 inline-flex min-w-[110px] flex-col items-center rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg transition hover:bg-blue-700 sm:bottom-5 sm:px-5"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Applied Jobs
            </span>
            <span className="text-xl font-bold leading-none">
              {autoApplyItems.length}
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}
