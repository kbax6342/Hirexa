"use client";

import {
  ArrowRightIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import Spinner from "@/app/components/spinner/Spinner";
import type { Job, JobDetail, JobSource } from "@/app/lib/jobs/types";

type CareerLevel = "Entry" | "Experienced" | "Senior";

type JobAnalysis = {
  salary: string | null;
  careerLevel: CareerLevel | null;
  schedule: string | null;
  loading?: boolean;
};

type JobsResponse = {
  jobs?: Job[];
  items?: Job[];
  bySource?: {
    adzuna?: Job[];
  };
  nextCursor?: string;
  error?: string;
};

type JobDetailsResponse = {
  job?: JobDetail;
  error?: string;
};

type StoredSelectedJob = {
  id?: string;
  source?: string;
  category?: string;
  title?: string;
  company?: string;
  location?: string;
  posted?: string;
  salary?: string;
  jobUrl?: string;
  url?: string;
  description?: string;
  schedule?: string;
  level?: string;
  tags?: string[];
};

type SplitJob = {
  key: string;
  id?: string;
  source?: JobSource;
  title: string;
  company: string;
  location: string;
  posted: string;
  salary?: string | null;
  jobUrl?: string | null;
  description?: string | null;
  schedule?: string | null;
  level?: string | null;
  tags?: string[];
  employmentType?: string | null;
  category?: string | null;
  remote?: boolean;
  metadata?: Record<string, string | number | boolean | null>;
  detailLoaded?: boolean;
  detailLoading?: boolean;
  detailError?: string | null;
};

type LoadMoreState = {
  params: string;
  cursor: string;
};

const AI_APPLY_SELECTED_JOB_STORAGE_KEY = "hirexa_ai_apply_selected_job";
const SELECTED_JOB_STORAGE_KEY = "selectedJob";
const MIN_INITIAL_RELATED_JOBS = 12;
const MAX_INITIAL_RELATED_PAGES = 3;

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

function cleanMultilineText(value?: string | null) {
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

function pickText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeDisplayText(value);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeJobSource(value?: string | null): JobSource | undefined {
  switch (normalizeDisplayText(value)?.toLowerCase()) {
    case "adzuna":
      return "adzuna";
    case "greenhouse":
      return "greenhouse";
    case "lever":
      return "lever";
    case "ashby":
      return "ashby";
    case "workable":
      return "workable";
    case "usajobs":
      return "usajobs";
    case "remotive":
      return "remotive";
    case "remoteok":
      return "remoteok";
    case "workday":
      return "workday";
    case "icims":
      return "icims";
    case "jazzhr":
      return "jazzhr";
    case "other":
      return "other";
    default:
      return undefined;
  }
}

function normalizeSalaryText(value?: string | null) {
  const normalized = normalizeDisplayText(value);
  if (!normalized || !/\d/.test(normalized)) {
    return null;
  }

  let result = normalized;

  const duplicateRangeMatch = normalized.match(
    /^(?<amount>\$?\d[\d,]*(?:\.\d+)?)\s*-\s*(?<same>\$?\d[\d,]*(?:\.\d+)?)(?<suffix>\s*\/\s*[A-Za-z][A-Za-z -]*)$/i
  );

  if (
    duplicateRangeMatch?.groups?.amount &&
    duplicateRangeMatch.groups.amount === duplicateRangeMatch.groups.same
  ) {
    result = `${duplicateRangeMatch.groups.amount}${duplicateRangeMatch.groups.suffix}`;
  }

  return result
    .replace(/\s*-\s*estimated\b/gi, "")
    .replace(/\bestimated\b/gi, "")
    .replace(/\s*\/\s*(year|hour|week|month|day)\b/gi, " $1")
    .replace(/\s*-\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function formatPostedLabel(value?: string | null) {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;

  const cleaned = normalized.replace(/^posted\s+/i, "").trim();
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return cleaned;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getSourceLabel(source?: JobSource | string | null) {
  switch (source?.trim().toLowerCase()) {
    case "adzuna":
      return "Adzuna";
    case "greenhouse":
      return "Greenhouse";
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
    case "workday":
      return "Workday";
    case "icims":
      return "iCIMS";
    case "jazzhr":
      return "JazzHR";
    default:
      return normalizeDisplayText(source);
  }
}

function buildFallbackKey(value: {
  title?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  const parts = [value.title, value.company, value.location]
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean);

  return parts.join("|") || null;
}

function buildJobKey(value: {
  id?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
}) {
  return normalizeDisplayText(value.id) ?? buildFallbackKey(value) ?? "selected-job";
}

function slugifyCategory(value?: string | null) {
  return (
    normalizeDisplayText(value)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") ?? null
  );
}

function readMetadataText(
  metadata: Record<string, string | number | boolean | null> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" || typeof value === "number") {
      const normalized = normalizeDisplayText(String(value));
      if (normalized) return normalized;
    }
  }

  return null;
}

function readDescriptionText(job: {
  description?: string | null;
  descriptionPlain?: string | null;
  content?: string | null;
  summary?: string | null;
  snippet?: string | null;
}) {
  return (
    cleanMultilineText(job.descriptionPlain) ??
    cleanMultilineText(job.description) ??
    cleanMultilineText(job.content) ??
    cleanMultilineText(job.summary) ??
    cleanMultilineText(job.snippet) ??
    null
  );
}

function normalizeStoredJob(value: unknown): SplitJob | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as StoredSelectedJob;
  const title = pickText(raw.title);
  const company = pickText(raw.company) ?? "Unknown company";
  const location = pickText(raw.location) ?? "Location not listed";
  const posted = pickText(raw.posted) ?? "";
  const source = normalizeJobSource(raw.source) ?? "adzuna";
  const rawId = pickText(raw.id);
  const id =
    source === "adzuna" && rawId && !rawId.includes(":") ? `adzuna:${rawId}` : rawId;

  if (!title) return null;

  return {
    key: buildJobKey({ id, title, company, location }),
    id: id ?? undefined,
    source,
    title,
    company,
    location,
    posted,
    salary: normalizeDisplayText(raw.salary),
    jobUrl: pickText(raw.jobUrl, raw.url),
    description: cleanMultilineText(raw.description),
    schedule: pickText(raw.schedule),
    level: pickText(raw.level),
    category: pickText(raw.category),
    tags: Array.isArray(raw.tags)
      ? raw.tags
          .map((tag) => normalizeDisplayText(tag))
          .filter((tag): tag is string => Boolean(tag))
      : [],
    detailLoaded: false,
    detailLoading: false,
    detailError: null,
  };
}

function normalizeFeedJob(job: Job): SplitJob {
  return {
    key: buildJobKey(job),
    id: job.id,
    source: job.source,
    title: pickText(job.title) ?? "Untitled role",
    company: pickText(job.company) ?? "Unknown company",
    location: pickText(job.location) ?? "Location not listed",
    posted: pickText(job.posted) ?? "",
    salary: normalizeDisplayText(job.salary),
    jobUrl: pickText(job.jobUrl),
    description: cleanMultilineText(job.description),
    detailLoaded: false,
    detailLoading: false,
    detailError: null,
  };
}

function normalizeDetailJob(job: JobDetail): SplitJob {
  const metadata = job.metadata ?? undefined;
  const schedule = pickText(
    job.employmentType,
    readMetadataText(metadata, "schedule", "shift", "workPattern", "positionSchedule")
  );
  const level = pickText(
    readMetadataText(
      metadata,
      "careerLevel",
      "experienceLevel",
      "seniority",
      "jobLevel",
      "grade",
      "level"
    )
  );

  return {
    key: buildJobKey(job),
    id: job.id,
    source: job.source,
    title: pickText(job.title) ?? "Untitled role",
    company: pickText(job.company) ?? "Unknown company",
    location: pickText(job.location) ?? "Location not listed",
    posted: pickText(job.posted) ?? "",
    salary: pickText(job.salaryText, job.salary),
    jobUrl: pickText(job.externalUrl, job.applyUrl, job.jobUrl),
    description: readDescriptionText(job),
    schedule,
    level,
    employmentType: pickText(job.employmentType),
    category: pickText(
      job.category,
      readMetadataText(metadata, "category", "team", "department")
    ),
    remote: job.remote,
    metadata,
    detailLoaded: true,
    detailLoading: false,
    detailError: null,
  };
}

function mergeJob(existing: SplitJob | undefined, incoming: SplitJob): SplitJob {
  if (!existing) return incoming;

  return {
    ...existing,
    ...incoming,
    key: existing.key,
    id: incoming.id ?? existing.id,
    source: incoming.source ?? existing.source,
    title: pickText(incoming.title, existing.title) ?? "Untitled role",
    company: pickText(incoming.company, existing.company) ?? "Unknown company",
    location: pickText(incoming.location, existing.location) ?? "Location not listed",
    posted: pickText(incoming.posted, existing.posted) ?? "",
    salary: pickText(incoming.salary, existing.salary),
    jobUrl: pickText(incoming.jobUrl, existing.jobUrl),
    description: cleanMultilineText(incoming.description) ?? existing.description ?? null,
    schedule: pickText(incoming.schedule, existing.schedule),
    level: pickText(incoming.level, existing.level),
    employmentType: pickText(incoming.employmentType, existing.employmentType),
    category: pickText(incoming.category, existing.category),
    tags: incoming.tags?.length ? incoming.tags : existing.tags,
    remote: incoming.remote ?? existing.remote,
    metadata: incoming.metadata ?? existing.metadata,
    detailLoaded: incoming.detailLoaded ?? existing.detailLoaded,
    detailLoading: incoming.detailLoading ?? existing.detailLoading,
    detailError: incoming.detailError ?? existing.detailError,
  };
}

function mergeJobs(current: SplitJob[], incoming: SplitJob[], pinnedKey: string | null) {
  const merged = new Map<string, SplitJob>();

  for (const job of current) {
    merged.set(job.key, mergeJob(merged.get(job.key), job));
  }

  for (const job of incoming) {
    merged.set(job.key, mergeJob(merged.get(job.key), job));
  }

  const orderedKeys: string[] = [];
  const seen = new Set<string>();

  function pushKey(key: string) {
    if (seen.has(key) || !merged.has(key)) return;
    seen.add(key);
    orderedKeys.push(key);
  }

  if (pinnedKey) {
    pushKey(pinnedKey);
  }

  for (const job of current) {
    pushKey(job.key);
  }

  for (const job of incoming) {
    pushKey(job.key);
  }

  return orderedKeys
    .map((key) => merged.get(key))
    .filter((job): job is SplitJob => Boolean(job));
}

function buildRelatedQuery(job: SplitJob) {
  const title = pickText(job.title) ?? "";
  const base =
    title
      .split(/\s[-–—|:]\s|[-–—|:]/)
      .map((part) => part.trim())
      .find(Boolean) ?? title;

  const tokens = base.split(/\s+/).filter(Boolean);
  return tokens.slice(0, 5).join(" ");
}

function buildFallbackQuery(job: SplitJob) {
  const titleQuery = buildRelatedQuery(job);
  const locationPart =
    normalizeDisplayText(job.location)
      ?.split(",")
      .map((part) => part.trim())
      .filter(Boolean)[0] ?? null;

  const candidates = [titleQuery, pickText(job.company), locationPart].filter(
    (value): value is string => Boolean(value)
  );
  const seen = new Set<string>();

  return candidates
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function buildRelatedRequests(job: SplitJob) {
  const requests: Array<{ key: string; params: URLSearchParams }> = [];
  const seen = new Set<string>();

  function pushCategory(category: string) {
    const normalized = slugifyCategory(category);
    if (!normalized) return;

    const key = `category:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);

    requests.push({
      key,
      params: new URLSearchParams({
        category: normalized,
        limit: "24",
      }),
    });
  }

  function pushQuery(query: string) {
    const normalized = normalizeDisplayText(query);
    if (!normalized) return;

    const key = `q:${normalized.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    requests.push({
      key,
      params: new URLSearchParams({
        q: normalized,
        limit: "24",
      }),
    });
  }

  pushCategory(job.category ?? "");
  pushQuery(buildRelatedQuery(job));
  pushQuery(buildFallbackQuery(job));

  return requests;
}

function getRelatedResponseJobs(data: JobsResponse) {
  return data.bySource?.adzuna?.length
    ? data.bySource.adzuna
    : (data.jobs ?? data.items ?? []);
}

function toJobSummary(job: SplitJob): Job | null {
  if (
    !job.id ||
    !job.source ||
    !job.title ||
    !job.company ||
    !job.location ||
    !job.posted
  ) {
    return null;
  }

  return {
    id: job.id,
    source: job.source,
    title: job.title,
    company: job.company,
    location: job.location,
    posted: job.posted,
    ...(job.salary ? { salary: job.salary } : {}),
    ...(job.description ? { description: job.description } : {}),
    ...(job.jobUrl ? { jobUrl: job.jobUrl } : {}),
  };
}

export default function JobsDetailsPage() {
  const router = useRouter();
  const relatedFetchKeyRef = useRef<string | null>(null);
  const [jobs, setJobs] = useState<SplitJob[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [loadMoreState, setLoadMoreState] = useState<LoadMoreState | null>(null);
  const [loadingMoreJobs, setLoadingMoreJobs] = useState(false);
  const [analysisByJobKey, setAnalysisByJobKey] = useState<
    Record<string, JobAnalysis>
  >({});

  useEffect(() => {
    const { style } = document.body;
    const previousStyles = {
      backgroundRepeat: style.backgroundRepeat,
      backgroundSize: style.backgroundSize,
      backgroundAttachment: style.backgroundAttachment,
      backgroundPosition: style.backgroundPosition,
    };

    style.backgroundRepeat = "no-repeat";
    style.backgroundSize = "cover";
    style.backgroundAttachment = "fixed";
    style.backgroundPosition = "top center";

    return () => {
      style.backgroundRepeat = previousStyles.backgroundRepeat;
      style.backgroundSize = previousStyles.backgroundSize;
      style.backgroundAttachment = previousStyles.backgroundAttachment;
      style.backgroundPosition = previousStyles.backgroundPosition;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SELECTED_JOB_STORAGE_KEY);
      if (!raw) {
        setReady(true);
        return;
      }

      const storedJob = normalizeStoredJob(JSON.parse(raw));
      if (!storedJob) {
        setReady(true);
        return;
      }

      setJobs([storedJob]);
      setPinnedKey(storedJob.key);
      setSelectedKey(storedJob.key);
      setLoadMoreState(null);
    } catch {
      // Ignore storage parsing issues and fall back to the empty state.
    } finally {
      setReady(true);
    }
  }, []);

  const selected = useMemo(
    () => jobs.find((job) => job.key === selectedKey) ?? jobs[0] ?? null,
    [jobs, selectedKey]
  );
  const pinnedJob = useMemo(
    () => jobs.find((job) => job.key === pinnedKey) ?? jobs[0] ?? null,
    [jobs, pinnedKey]
  );
  const selectedDescription = useMemo(
    () => cleanMultilineText(selected?.description) ?? "",
    [selected?.description]
  );
  const selectedAnalysis = useMemo(
    () => (selected ? analysisByJobKey[selected.key] ?? null : null),
    [analysisByJobKey, selected]
  );
  const selectedSalary =
    normalizeSalaryText(selected?.salary) ?? selectedAnalysis?.salary ?? null;
  const selectedSchedule =
    selectedAnalysis?.schedule ??
    pickText(
      selected?.schedule,
      selected?.employmentType,
      readMetadataText(
        selected?.metadata,
        "schedule",
        "shift",
        "workPattern",
        "positionSchedule"
      )
    );
  const selectedCareerLevel =
    selectedAnalysis?.careerLevel ??
    normalizeCareerLevel(
      pickText(
        selected?.level,
        readMetadataText(
          selected?.metadata,
          "careerLevel",
          "experienceLevel",
          "seniority",
          "jobLevel",
          "grade",
          "level"
        )
      )
    );
  const selectedSourceLabel = useMemo(
    () => getSourceLabel(selected?.source),
    [selected?.source]
  );
  const selectedPostedLabel = useMemo(
    () => formatPostedLabel(selected?.posted),
    [selected?.posted]
  );
  const selectedCompanyInitial = useMemo(
    () => (pickText(selected?.company)?.[0] ?? "H").toUpperCase(),
    [selected?.company]
  );
  const selectedMetaPills = useMemo(() => {
    const candidates = [
      pickText(selected?.category),
      pickText(selected?.employmentType),
      selectedCareerLevel ? `${selectedCareerLevel} level` : "Role match",
    ].filter((value): value is string => Boolean(value));

    const seen = new Set<string>();
    return candidates.filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selected?.category, selected?.employmentType, selectedCareerLevel]);
  const detailPending = Boolean(selected?.detailLoading || selectedAnalysis?.loading);
  const overviewItems = useMemo(
    () => [
      {
        label: "Salary",
        value: selectedSalary ?? (detailPending ? "Loading details" : "Not listed"),
        subtext: selectedSalary
          ? "Compensation shown in the current posting"
          : detailPending
            ? "Checking the listing for pay details"
            : "The employer did not include pay details",
        icon: CurrencyDollarIcon,
      },
      {
        label: "Schedule",
        value:
          selectedSchedule ?? (detailPending ? "Analyzing schedule" : "Not specified"),
        subtext: selectedSchedule
          ? "Work pattern pulled from the listing"
          : detailPending
            ? "Checking the listing for schedule details"
            : "No schedule or shift information was provided",
        icon: ClockIcon,
      },
      {
        label: "Career Level",
        value:
          selectedCareerLevel ?? (detailPending ? "Analyzing level" : "Not specified"),
        subtext: selectedCareerLevel
          ? "Seniority inferred from the role details"
          : detailPending
            ? "Reviewing the description for seniority"
            : "Experience level was not listed in the posting",
        icon: CheckCircleIcon,
      },
    ],
    [detailPending, selectedCareerLevel, selectedSalary, selectedSchedule]
  );
  const aiApplyHref = useMemo(
    () =>
      selected?.id
        ? `/ai-apply?jobId=${encodeURIComponent(selected.id)}`
        : "/ai-apply",
    [selected?.id]
  );

  useEffect(() => {
    if (!selectedKey && jobs[0]?.key) {
      setSelectedKey(jobs[0].key);
    }

    if (selectedKey && !jobs.some((job) => job.key === selectedKey)) {
      setSelectedKey(jobs[0]?.key ?? null);
    }
  }, [jobs, selectedKey]);

  useEffect(() => {
    if (!pinnedJob) return;

    const requests = buildRelatedRequests(pinnedJob);
    if (!requests.length) return;

    const requestKey = `${pinnedJob.key}|${requests.map((request) => request.key).join("||")}`;
    if (relatedFetchKeyRef.current === requestKey) {
      return;
    }
    let ignore = false;

    async function loadRelatedJobs() {
      setRelatedLoading(true);

      try {
        let mergedRelatedJobs: SplitJob[] = [];
        let nextLoadMoreState: LoadMoreState | null = null;

        for (const request of requests) {
          let cursor = "";
          let pageCount = 0;

          while (pageCount < MAX_INITIAL_RELATED_PAGES) {
            const params = new URLSearchParams(request.params);
            if (cursor) {
              params.set("cursor", cursor);
            }

            const response = await fetch(`/api/jobs?${params.toString()}`, {
              cache: "no-store",
            });
            const data = (await response.json()) as JobsResponse;
            if (!response.ok) {
              break;
            }

            const nextJobs = getRelatedResponseJobs(data).map(normalizeFeedJob);
            mergedRelatedJobs = mergeJobs(mergedRelatedJobs, nextJobs, null);

            cursor = normalizeDisplayText(data.nextCursor) ?? "";
            if (cursor) {
              nextLoadMoreState = {
                params: request.params.toString(),
                cursor,
              };
            }
            pageCount += 1;

            if (
              mergedRelatedJobs.length >= MIN_INITIAL_RELATED_JOBS ||
              !cursor
            ) {
              break;
            }
          }

          if (mergedRelatedJobs.length >= MIN_INITIAL_RELATED_JOBS) {
            break;
          }
        }

        if (ignore) return;

        setLoadMoreState(nextLoadMoreState);
        if (mergedRelatedJobs.length > 0) {
          setJobs((current) =>
            mergeJobs(current, mergedRelatedJobs, pinnedKey ?? pinnedJob.key)
          );
        }
        relatedFetchKeyRef.current = requestKey;
      } catch {
        // Keep the pinned job visible even if the related fetch fails.
      } finally {
        if (!ignore) {
          setRelatedLoading(false);
        }
      }
    }

    void loadRelatedJobs();

    return () => {
      ignore = true;
    };
  }, [pinnedJob, pinnedKey]);

  useEffect(() => {
    if (!selected?.id || selected.detailLoaded || selected.detailLoading) {
      return;
    }

    const selectedId = selected.id;
    const summary = toJobSummary(selected);
    let ignore = false;

    setJobs((current) =>
      current.map((job) =>
        job.key === selected.key
          ? { ...job, detailLoading: true, detailError: null }
          : job
      )
    );

    async function loadSelectedJobDetails() {
      try {
        const response = await fetch(
          summary
            ? "/api/jobs/details"
            : `/api/jobs/details?id=${encodeURIComponent(selectedId)}`,
          {
            method: summary ? "POST" : "GET",
            cache: "no-store",
            headers: summary ? { "Content-Type": "application/json" } : undefined,
            body: summary ? JSON.stringify({ job: summary }) : undefined,
          }
        );

        const data = (await response.json()) as JobDetailsResponse;
        if (!response.ok || !data.job) {
          throw new Error(data.error ?? "Failed to load job details");
        }

        if (ignore) return;

        const detailedJob = {
          ...normalizeDetailJob(data.job),
          key: selected.key,
        };
        setJobs((current) =>
          mergeJobs(current, [detailedJob], pinnedKey ?? selected.key)
        );
      } catch (error: unknown) {
        if (ignore) return;

        setJobs((current) =>
          current.map((job) =>
            job.key === selected.key
              ? {
                  ...job,
                  detailLoading: false,
                  detailError:
                    error instanceof Error
                      ? error.message
                      : "Failed to load job details",
                }
              : job
          )
        );
      }
    }

    void loadSelectedJobDetails();

    return () => {
      ignore = true;
    };
  }, [pinnedKey, selected]);

  useEffect(() => {
    if (!selected || !selectedDescription || selectedAnalysis) {
      return;
    }

    let ignore = false;

    setAnalysisByJobKey((current) => ({
      ...current,
      [selected.key]: {
        salary: null,
        careerLevel: null,
        schedule: null,
        loading: true,
      },
    }));

    async function analyzeSelectedJob() {
      try {
        const response = await fetch("/api/jobs/format", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId: selected.id ?? selected.key,
            text: selectedDescription,
          }),
        });

        const data = (await response.json()) as {
          formatted?: {
            salary?: string | null;
            careerLevel?: CareerLevel | null;
            schedule?: string | null;
          };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to analyze job");
        }

        if (ignore) return;

        setAnalysisByJobKey((current) => ({
          ...current,
          [selected.key]: {
            salary: normalizeSalaryText(data.formatted?.salary),
            careerLevel: normalizeCareerLevel(data.formatted?.careerLevel),
            schedule: pickText(data.formatted?.schedule),
          },
        }));
      } catch {
        if (ignore) return;

        setAnalysisByJobKey((current) => ({
          ...current,
          [selected.key]: {
            salary: null,
            careerLevel: null,
            schedule: null,
          },
        }));
      }
    }

    void analyzeSelectedJob();

    return () => {
      ignore = true;
    };
  }, [selected, selectedAnalysis, selectedDescription]);

  function handleAiAssistantApply() {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          AI_APPLY_SELECTED_JOB_STORAGE_KEY,
          JSON.stringify({
            id: selected?.id ?? null,
            jobUrl: selected?.jobUrl ?? null,
          })
        );
      } catch {
        // Ignore session storage failures and continue routing.
      }
    }

    router.push(aiApplyHref);
  }

  async function handleLoadMoreJobs() {
    if (!loadMoreState) return;

    setLoadingMoreJobs(true);

    try {
      const params = new URLSearchParams(loadMoreState.params);
      params.set("cursor", loadMoreState.cursor);

      const response = await fetch(`/api/jobs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as JobsResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load more jobs");
      }

      const nextJobs = getRelatedResponseJobs(data).map(normalizeFeedJob);
      setJobs((current) => mergeJobs(current, nextJobs, pinnedKey));

      const nextCursor = normalizeDisplayText(data.nextCursor) ?? "";
      setLoadMoreState(
        nextCursor
          ? {
              params: loadMoreState.params,
              cursor: nextCursor,
            }
          : null
      );
    } catch {
      // Keep the existing rail content if the next page fails.
    } finally {
      setLoadingMoreJobs(false);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
        <Spinner compact label="Loading selected job..." />
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-6">
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center">
          <div className="text-lg font-semibold text-white">No selected job found</div>
          <p className="mt-2 text-sm text-white/70">
            Pick a role from the Find Jobs page to open it here in split view.
          </p>
          <Link
            href="/jobs"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Back to Find Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-10 lg:px-6">
      <div className="mt-[65px] mb-4 max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Review this role and compare similar matches
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/80">
          The job you clicked stays pinned first so you can explore related openings
          without losing your original selection.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <aside className="lg:col-span-6">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">
                {jobs.length} jobs
                {relatedLoading && jobs.length > 0 ? (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    Refreshing...
                  </span>
                ) : null}
              </div>
              <Link
                href="/jobs"
                className="text-sm font-semibold text-black hover:text-black/80"
              >
                Back
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-3 pr-2">
              <div className="space-y-3">
                {jobs.map((job) => {
                  const active = job.key === (selected?.key ?? selectedKey);
                  const normalizedSalary = normalizeSalaryText(job.salary);
                  const isAdzunaJob = job.source === "adzuna";

                  return (
                    <div
                      key={job.key}
                      className={cx(
                        "rounded-2xl border p-4 shadow-sm transition",
                        active
                          ? "border-sky-200 bg-sky-50/50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedKey(job.key)}
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

                          {normalizedSalary ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                              {normalizedSalary}
                            </span>
                          ) : null}
                        </div>
                      </button>

                      {isAdzunaJob ? <AdzunaAttribution className="mt-3" /> : null}
                    </div>
                  );
                })}

                {loadMoreState ? (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleLoadMoreJobs}
                      disabled={loadingMoreJobs}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMoreJobs ? "Loading more..." : "Load more jobs"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-6">
          <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex min-h-0 flex-1 flex-col">
              {!selected ? (
                <div className="p-5 sm:p-6">
                  <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                    <div className="text-sm font-semibold text-slate-900">
                      Select a job
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Choose a job on the left to view details.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-6">
                    <div className="flex items-center gap-3 sm:hidden">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sm font-semibold text-sky-700 ring-1 ring-sky-100">
                        {selectedCompanyInitial}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {selected.company}
                        </div>
                        {selected.location ? (
                          <div className="truncate text-xs text-slate-500">
                            {selected.location}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:mt-0">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        {selected.source === "adzuna" || !selectedSourceLabel
                          ? "Live listing"
                          : `${selectedSourceLabel} listing`}
                      </span>
                      <span className="text-slate-500">
                        {selectedPostedLabel
                          ? `Posted ${selectedPostedLabel}`
                          : "Recently updated"}
                      </span>
                      <button
                        type="button"
                        onClick={handleAiAssistantApply}
                        className="ml-auto inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                      >
                        <span>Apply Now</span>
                        <ArrowRightIcon className="h-4 w-4" />
                      </button>
                    </div>

                    <h2 className="mt-4 text-2xl font-semibold leading-tight text-slate-900 sm:text-[1.75rem]">
                      {selected.title}
                    </h2>

                    <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 sm:flex">
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

                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedMetaPills.map((pill) => (
                        <span
                          key={pill}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                        >
                          {pill}
                        </span>
                      ))}
                    </div>

                    {selected.source === "adzuna" ? (
                      <AdzunaAttribution className="mt-4" />
                    ) : null}
                  </div>

                  <div className="space-y-6 p-5 sm:p-6">
                    <section>
                      <div className="text-sm font-semibold text-slate-900">
                        Job Overview
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {overviewItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.label}
                              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                            >
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                <Icon className="h-4 w-4 text-sky-600" />
                                {item.label}
                              </div>
                              <div className="mt-3 text-sm font-semibold text-slate-900">
                                {item.value}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-500">
                                {item.subtext}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section>
                      <div className="text-sm font-semibold text-slate-900">
                        Job Description
                      </div>
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-700">
                        {!selectedDescription && selected.detailLoading ? (
                          <Spinner compact label="Loading job details..." />
                        ) : selectedDescription ? (
                          <p className="whitespace-pre-wrap">{selectedDescription}</p>
                        ) : (
                          <p className="text-slate-600">
                            Open the original posting for the latest full description
                            and application instructions.
                          </p>
                        )}

                        {selected.detailError ? (
                          <p className="mt-4 text-xs text-amber-700">
                            Full details could not be loaded for this role yet. Showing
                            the best available summary.
                          </p>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
