"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import AdzunaAttribution from "@/app/components/jobs/AdzunaAttribution";
import JobDetailsPanel, {
  type FormattedJob,
} from "@/app/components/dashboard/JobDetailsPanel";
import type { Job, JobDetail, JobPretty } from "@/app/lib/jobs/types";
import {
  buildApplyProviderPayload,
  detectApplyProviderFromJob,
  getApplyProviderButtonLabel,
  getApplyProviderLoadingLabel,
} from "@/app/lib/apply/providerDetection";
import { readJobDetailSummary } from "@/app/lib/jobs/clientDetailSummary";

type JobDetailsResponse = {
  job: JobDetail;
  pretty: JobPretty;
  fullDetailsUnavailable?: boolean;
};

type PlanStatusResponse = {
  active?: boolean;
  pending?: boolean;
};

type CreditStatusResponse = {
  hirePilotCredits?: number;
};

function isJobSummary(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Job>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.company === "string" &&
    typeof candidate.location === "string" &&
    typeof candidate.posted === "string"
  );
}

function getSourceLabel(source: JobDetail["source"] | undefined) {
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
      return source || "Provider";
  }
}

export default function DashboardJobDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { status: authStatus } = useSession();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const jobId = useMemo(() => {
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  }, [rawId]);

  const [detailsLoading, setDetailsLoading] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [pretty, setPretty] = useState<JobPretty>({ sections: [], highlights: [] });
  const [formatted, setFormatted] = useState<FormattedJob | null>(null);
  const [aiApplyLoading, setAiApplyLoading] = useState(false);
  const applyProvider = detectApplyProviderFromJob(job);
  const aiApplyLabel = getApplyProviderButtonLabel(applyProvider);
  const aiApplyLoadingLabel = getApplyProviderLoadingLabel(applyProvider);

  useEffect(() => {
    if (!jobId) {
      setDetailsError("Missing job id.");
      setDetailsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setDetailsLoading(true);
      setDetailsError(null);
      setFormatted(null);

      try {
        const storedSummary = readJobDetailSummary("dashboard", jobId);
        const requestInit = isJobSummary(storedSummary)
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ job: storedSummary }),
            }
          : undefined;

        const res = await fetch(
          requestInit
            ? "/api/jobs/details"
            : `/api/jobs/details?id=${encodeURIComponent(jobId)}`,
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
        setJob(resolved.job);
        setPretty(resolved.pretty);

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
              body: JSON.stringify({ jobId, text: htmlOrText }),
            });

            if (fmtRes.ok) {
              const fmtData = await fmtRes.json();
              if (!cancelled && fmtData?.formatted) {
                setFormatted(fmtData.formatted as FormattedJob);
              }
            }
          } catch {
            // Ignore formatter failures and keep the normal detail render path.
          }
        }
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error ? error.message : "Failed to load job details";
        setDetailsError(message);
        setJob(null);
        setPretty({ sections: [], highlights: [] });
        setFormatted(null);
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleAiApply = async () => {
    const jobUrl = job?.jobUrl?.trim();
    if (!jobUrl || aiApplyLoading) return;

    if (applyProvider) {
      const callbackHref =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : `/dashboard/job/${encodeURIComponent(jobId)}`;

      if (authStatus === "loading") {
        return;
      }

      if (authStatus !== "authenticated") {
        router.push(`/login?callbackUrl=${encodeURIComponent(callbackHref)}`);
        return;
      }
    }

    const aiApplyHref = `/job-tools/generate?jobUrl=${encodeURIComponent(jobUrl)}`;
    setAiApplyLoading(true);

    const readPlanStatus = async (forceSync: boolean) => {
      const res = await fetch(
        forceSync ? "/api/billing/plan-status?forceSync=1" : "/api/billing/plan-status",
        { cache: "no-store" }
      );

      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(aiApplyHref)}`);
        return null;
      }

      if (!res.ok) {
        throw new Error("Unable to verify subscription status.");
      }

      return (await res.json()) as PlanStatusResponse;
    };

    const readCreditStatus = async () => {
      const res = await fetch("/api/user/hirepilot-status", {
        cache: "no-store",
      });

      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(aiApplyHref)}`);
        return null;
      }

      if (!res.ok) {
        throw new Error("Unable to verify credit balance.");
      }

      return (await res.json()) as CreditStatusResponse;
    };

    try {
      let planData = await readPlanStatus(false);
      if (!planData) return;

      if (planData.pending === true || planData.active !== true) {
        const refreshedPlanData = await readPlanStatus(true);
        if (!refreshedPlanData) return;
        planData = refreshedPlanData;
      }

      if (planData.pending === true || planData.active !== true) {
        if (applyProvider) {
          const params = new URLSearchParams();
          params.set(
            "source",
            applyProvider ? `${applyProvider}-auto-apply` : "smart-matches-ai-apply"
          );
          params.set("jobUrl", jobUrl);
          router.push(`/plans?${params.toString()}`);
          return;
        }

        const creditData = await readCreditStatus();
        if (!creditData) return;

        if (Number(creditData.hirePilotCredits ?? 0) <= 0) {
          const params = new URLSearchParams();
          params.set(
            "source",
            applyProvider ? `${applyProvider}-auto-apply` : "smart-matches-ai-apply"
          );
          params.set("jobUrl", jobUrl);
          router.push(`/plans?${params.toString()}`);
          return;
        }
      }

      if (applyProvider && job) {
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
        return;
      }

      router.push(aiApplyHref);
    } catch (error) {
      console.error("[SMART_MATCHES] mobile AI apply access check failed", error);
      if (!applyProvider) {
        router.push(aiApplyHref);
      }
    } finally {
      setAiApplyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Link
          href="/dashboard"
          className="mt-[60] inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back to job feed
        </Link>

        <JobDetailsPanel
          job={job}
          pretty={pretty}
          formatted={formatted}
          detailsLoading={detailsLoading}
          detailsError={detailsError}
          aiApplyLoading={aiApplyLoading}
          aiApplyDisabled={authStatus === "loading" || !job?.jobUrl}
          aiApplyLabel={aiApplyLabel}
          aiApplyLoadingLabel={aiApplyLoadingLabel}
          onAiApply={handleAiApply}
          onCareerCoach={() => router.push("/job-tools/career-coach")}
          onOutreach={() => router.push("/job-tools/agents/linkedin-outreach")}
          hideAiApplyOnDesktop
          hideAdzunaAttribution
        />

        <div className="flex flex-col gap-3">
          {job?.source === "adzuna" ? (
            <>
              <AdzunaAttribution className="text-sm" />
              {job.jobUrl ? (
                <a
                  href={job.jobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center text-sm font-medium text-blue-700 underline underline-offset-2 transition hover:text-blue-800 lg:self-start"
                >
                  View original posting
                </a>
              ) : null}
            </>
          ) : job?.jobUrl ? (
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center text-sm font-medium text-blue-700 underline underline-offset-2 transition hover:text-blue-800 lg:self-start"
            >
              Powered by {getSourceLabel(job.source)}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
