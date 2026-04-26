import { unlink } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/app/lib/auth";
import {
  createSession,
  getApplySessionStorageBackend,
  type ApplyEmailStatus,
  type ApplySessionDebug,
  type ApplySubmissionStatus,
  updateSession,
} from "@/app/lib/apply/applySessionStore";
import {
  buildAutomationAudit,
  readAutomationAudit,
} from "@/app/lib/apply/automationAudit";
import {
  applyWithPlaywright,
  toApplySessionDebug,
} from "@/app/lib/apply/playwrightApply";
import { isAdzunaUnresolvedHandoffUrl } from "@/app/lib/apply/adzunaHandoff";
import {
  resolveDirectJobUrl,
  type DirectJobResolution,
} from "@/app/lib/apply/directJobResolver";
import { resolveAdzunaHandoffWithScrapfly } from "@/app/lib/apply/adzunaScrapflyResolver";
import {
  REAL_POSTING_NOT_FOUND_CODE,
  selectInitialAutomationTarget,
} from "@/app/lib/apply/jobSourceResolution";
import {
  prepareApplyPayload,
  type AnswersMap,
} from "@/app/lib/apply/prepareApplyPayload";
import {
  APPLY_VERIFICATION_REQUIRED_USER_MESSAGE,
  isApplySessionTerminalStatus,
  type ApplySessionStatus,
} from "@/app/lib/apply/sessionStatus";
import { writeResumeToTemp } from "@/app/lib/apply/tempResume";
import { detectApplyProviderFromJob } from "@/app/lib/apply/providerDetection";
import { normalizeEmailError } from "@/app/lib/email/errorDiagnostics";
import { sendApplicationActivityEmailForStatusChange } from "@/app/lib/email/lifecycle";
import {
  buildProfileFieldMap,
  computeMissingFromFields,
} from "@/app/lib/jobApplicationAudit";
import { prisma } from "@/app/lib/prisma";
import {
  deriveStopClassification,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";
import {
  inferApplyAutomationErrorCode,
  getApplyAutomationErrorMessage,
  normalizeApplyAutomationErrorCode,
  prefixErrorCodeInMessage,
} from "@/app/lib/apply/errorCodes";
import {
  findBestApplySiteStrategyForRun,
  recordApplySiteStrategyReplayForUser,
} from "@/app/lib/apply/playwrightStrategyRepository";
import {
  classifyJobUrlKind,
  isAggregatorHandoffUrl,
  isAdzunaUrl,
  isLikelyAtsUrl,
  isLikelyCompanyCareersUrl,
  normalizeJobUrl,
} from "@/app/lib/jobSources";
import { validateAutomationStartUrl } from "@/app/lib/apply/urlValidation";

export const runtime = "nodejs";

type ApplyBody = {
  answers?: AnswersMap;
  background?: boolean;
};

type ApplyExecutionResult = {
  ok: boolean;
  status: ApplySessionStatus;
  finalUrl?: string;
  message?: string;
  unavailable?: boolean;
  needsHuman?: boolean;
  debug: ApplySessionDebug;
  rawStatus: ApplySessionStatus;
  rawSubmissionConfirmed: boolean;
};

type StatusChangeEmailResult = {
  emailStatus: ApplyEmailStatus;
  failureMessage?: string | null;
};

type PersistAutomationOutcomeResult = {
  submissionStatus: ApplySubmissionStatus;
  emailStatus: ApplyEmailStatus;
  message?: string;
  result: ApplyExecutionResult;
};

type RawPlaywrightResult = Awaited<ReturnType<typeof applyWithPlaywright>>;
type AdzunaScrapflyResolutionResult = Awaited<
  ReturnType<typeof resolveAdzunaHandoffWithScrapfly>
>;

type RoutePlaywrightEvidence = {
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string | null;
  targetUrl: string | null;
  submitButtonFound: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
};

type AutoApplyLastAction =
  | "no_apply_cta"
  | "login_required"
  | "verification_required"
  | "adzuna_handoff_rate_limited";

type AutoApplyStopDebug = {
  stopReason: "HUMAN_INTERVENTION_REQUIRED";
  finalUrl: string | null;
  currentUrl: string | null;
  lastAction: AutoApplyLastAction;
  stopClassification: ApplyStopClassification;
  stoppedAtUrl: string | null;
  stoppedAtTitle: string | null;
  lastActionText: string | null;
  lastActionSelector: string | null;
};

async function findApplicationForUser(id: string, userId: string) {
  return prisma.jobApplication.findFirst({
    where: { id, userProfile: { userId } },
    include: { userProfile: true },
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

type LoadedApplication = NonNullable<
  Awaited<ReturnType<typeof findApplicationForUser>>
>;

type DirectResolutionDebug = Pick<
  ApplySessionDebug,
  | "originalJobUrl"
  | "resolvedDirectUrl"
  | "applySource"
  | "googleFirstResolutionTriggered"
  | "usedResolvedDirectUrl"
  | "directJobResolutionAttempted"
  | "directJobResolutionQueries"
  | "directJobResolutionNormalizedLocation"
  | "directJobResolutionSearchProvider"
  | "directJobResolutionConfidence"
  | "directJobResolutionProvider"
  | "directJobResolutionMatchReason"
  | "directJobResolutionError"
  | "directJobResolutionCandidates"
  | "adzunaStrategyReplaySkipped"
  | "startingUrlKind"
  | "finalChosenUrlKind"
>;

type DirectResolutionContext = {
  application: LoadedApplication;
  originalUrl: string;
  resolvedDirectUrl?: string;
  debug: DirectResolutionDebug;
  resolution?: DirectJobResolution;
  usedResolvedDirectUrl: boolean;
};

type MatchedStrategyGuidance = NonNullable<
  Awaited<ReturnType<typeof findBestApplySiteStrategyForRun>>
>;

type DirectResolutionAttemptResult =
  | {
      context: DirectResolutionContext;
      blocked?: false;
    }
  | {
      context: DirectResolutionContext;
      blocked: true;
      message: string;
      errorCode: string;
      failureReason: string;
    };

const ADZUNA_UNRESOLVED_TARGET_MESSAGE =
  "Adzuna handoff unresolved: no confirmed employer-hosted application URL found after search fallback";
const ADZUNA_GOOGLE_FIRST_FAILURE_MESSAGE =
  "No confirmed employer-hosted application URL found from Google-first resolution for Adzuna job";
const VERIFICATION_REQUIRED_STATUS = "VERIFICATION_REQUIRED" as const;
const VERIFICATION_REQUIRED_MESSAGE = APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;
const ADZUNA_HANDOFF_ACCESS_DENIED_CODE =
  "ADZUNA_HANDOFF_ACCESS_DENIED" as const;
const ADZUNA_HANDOFF_RATE_LIMITED_CODE =
  "ADZUNA_HANDOFF_RATE_LIMITED" as const;
const ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE =
  "ADZUNA_LOGIN_TO_CONTINUE_REQUIRED" as const;
const WRONG_EMPLOYER_DOMAIN_MESSAGE =
  "Hirexa could not confirm the real employer job posting. The selected site did not match this job. Open the original job listing or retry after refreshing job details.";
const VERIFICATION_STOP_SIGNALS = [
  "just a moment",
  "performing security verification",
  "verify you are human",
  "verify you're human",
  "verify that you are human",
  "prove you are human",
  "are you human",
  "checking if you are human",
  "checking your browser",
  "checking if the site connection is secure",
  "please enable javascript and cookies",
  "press & hold",
  "press and hold",
  "security check",
  "cloudflare",
  "captcha",
  "hcaptcha",
  "recaptcha",
  "turnstile",
  "cf-chl",
] as const;

function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isRtxHostname(hostname: string) {
  return hostname === "rtx.com" || hostname.endsWith(".rtx.com");
}

function isKnownAtsHostname(hostname: string) {
  if (!hostname) return false;
  return (
    hostname.endsWith(".myworkdayjobs.com") ||
    hostname.endsWith(".workdayjobs.com") ||
    hostname.endsWith(".myworkdaysite.com") ||
    hostname.endsWith(".greenhouse.io") ||
    hostname.endsWith(".lever.co") ||
    hostname.endsWith(".jobs.lever.co") ||
    hostname.endsWith(".ashbyhq.com") ||
    hostname.endsWith(".icims.com") ||
    hostname.endsWith(".bamboohr.com") ||
    hostname.endsWith(".jobvite.com") ||
    hostname.endsWith(".smartrecruiters.com") ||
    hostname.endsWith(".workable.com") ||
    hostname.endsWith(".recruitee.com")
  );
}

function isRtxCompanyName(value: string | null | undefined) {
  const normalized = String(value ?? "").toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("rtx") ||
    normalized.includes("raytheon") ||
    normalized.includes("collins aerospace") ||
    normalized.includes("pratt & whitney") ||
    normalized.includes("pratt and whitney") ||
    normalized.includes("raytheon technologies")
  );
}

function hostsEquivalentOrSubdomain(left: string, right: string) {
  if (!left || !right) return false;
  return (
    left === right ||
    left.endsWith(`.${right}`) ||
    right.endsWith(`.${left}`)
  );
}

function resolveExpectedEmployerHost(args: {
  preferredTargetUrl?: string | null;
  resolvedDirectUrl?: string | null;
  applicationJobUrl?: string | null;
  originalUrl?: string | null;
}) {
  const candidates = [
    args.preferredTargetUrl,
    args.resolvedDirectUrl,
    args.applicationJobUrl,
    args.originalUrl,
  ];

  for (const candidate of candidates) {
    const host = parseHostname(candidate);
    if (host) return host;
  }

  return "";
}

function rejectStrategyForDomainMismatch(args: {
  application: LoadedApplication;
  originalUrl?: string | null;
  resolvedDirectUrl?: string | null;
  expectedTargetUrl?: string | null;
  guidance: MatchedStrategyGuidance | null;
}) {
  const guidance = args.guidance;
  if (!guidance) {
    return null;
  }

  const strategySourceHost = parseHostname(
    guidance.strategy.sourceHost ?? guidance.strategy.hostname ?? null,
  );
  const strategyDestinationHost = parseHostname(
    guidance.strategy.destinationHost ?? guidance.startUrl ?? null,
  );
  const currentExpectedEmployerHost = resolveExpectedEmployerHost({
    preferredTargetUrl: args.expectedTargetUrl,
    resolvedDirectUrl: args.resolvedDirectUrl,
    applicationJobUrl: args.application.jobUrl,
    originalUrl: args.originalUrl,
  });

  const companyIsRtx = isRtxCompanyName(args.application.company);
  const strategyIsRtx =
    isRtxHostname(strategySourceHost) || isRtxHostname(strategyDestinationHost);

  let rejectionReason: string | null = null;

  if (
    strategyDestinationHost &&
    currentExpectedEmployerHost &&
    !hostsEquivalentOrSubdomain(
      strategyDestinationHost,
      currentExpectedEmployerHost,
    ) &&
    !isKnownAtsHostname(strategyDestinationHost) &&
    !isKnownAtsHostname(currentExpectedEmployerHost)
  ) {
    rejectionReason = "strategy_destination_host_mismatch";
  }

  if (!rejectionReason && !companyIsRtx && strategyIsRtx) {
    rejectionReason = "rtx_strategy_for_non_rtx_job";
  }

  if (!rejectionReason) {
    return null;
  }

  console.info("[AUTO_APPLY_STRATEGY_REJECTED_DOMAIN_MISMATCH]", {
    applicationId: args.application.id,
    jobTitle: args.application.title ?? args.application.jobTitle ?? null,
    company: args.application.company ?? null,
    source: args.application.source ?? null,
    originalUrl: args.originalUrl ?? null,
    resolvedDirectUrl: args.resolvedDirectUrl ?? null,
    candidateStrategyId: guidance.strategy.id ?? null,
    strategySourceHost: strategySourceHost || null,
    strategyDestinationHost: strategyDestinationHost || null,
    currentExpectedEmployerHost: currentExpectedEmployerHost || null,
    rejectionReason,
  });

  return rejectionReason;
}

function buildRtxStopPayload(args: {
  finalUrl?: string | null;
  currentUrl?: string | null;
  finalReason?: string | null;
  rtxFlowAttempted?: boolean;
  rtxFlowCompleted?: boolean;
  rtxProgressMarkers?: string[] | null;
  rtxFailureReason?: string | null;
  rtxJobId?: string | null;
}) {
  const finalHost = parseHostname(args.finalUrl);
  const currentHost = parseHostname(args.currentUrl);
  const finalReason = String(args.finalReason ?? "").trim();
  const hasRtxSignal =
    args.rtxFlowAttempted === true ||
    isRtxHostname(finalHost) ||
    isRtxHostname(currentHost) ||
    finalReason.toUpperCase().includes("RTX_");

  if (!hasRtxSignal) {
    return null;
  }

  return {
    flowAttempted: args.rtxFlowAttempted === true,
    flowCompleted: args.rtxFlowCompleted === true,
    failureReason:
      args.rtxFailureReason ?? (finalReason.length > 0 ? finalReason : null),
    jobId: args.rtxJobId ?? null,
    progressMarkers: [
      ...new Set([
        ...(args.rtxProgressMarkers ?? []),
        "RTX_STOP_REASON_CLASSIFIED",
      ]),
    ],
  };
}

function logRtxStopReasonClassified(args: {
  stopClassification: ApplyStopClassification;
  finalUrl?: string | null;
  currentUrl?: string | null;
  finalReason?: string | null;
  rtxFlowAttempted?: boolean;
  rtxFlowCompleted?: boolean;
  rtxProgressMarkers?: string[] | null;
  rtxFailureReason?: string | null;
  rtxJobId?: string | null;
}) {
  const payload = buildRtxStopPayload(args);
  if (!payload) return;

  console.info("[AUTO_APPLY_RTX_PROGRESS]", {
    marker: "RTX_STOP_REASON_CLASSIFIED",
    stopReason: args.stopClassification.reason,
    suggestedAction: args.stopClassification.suggestedAction,
    pageType: args.stopClassification.pageType,
    finalUrl: args.finalUrl ?? null,
    currentUrl: args.currentUrl ?? null,
    rtx: payload,
  });
}

function looksLikeVerificationBlocker(value: string | null | undefined) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  return VERIFICATION_STOP_SIGNALS.some((signal) =>
    normalized.includes(signal),
  );
}

function isVerificationStopClassification(
  stopClassification: ApplyStopClassification | null | undefined,
) {
  return (
    stopClassification?.reason === "verification_required" ||
    stopClassification?.suggestedAction === "complete_verification"
  );
}

function hasVerificationDebugSignal(args: {
  verificationDetected?: boolean;
  stopClassification?: ApplyStopClassification | null;
  stoppedAtTitle?: string | null;
  currentUrl?: string | null;
  finalReason?: string | null;
  verificationSignals?: string[] | null;
  message?: string | null;
  finalUrl?: string | null;
}) {
  if (args.verificationDetected === true) {
    return true;
  }

  if (isVerificationStopClassification(args.stopClassification)) {
    return true;
  }

  const verificationText = [
    ...(args.verificationSignals ?? []),
    args.stoppedAtTitle,
    args.currentUrl,
    args.finalReason,
    args.message,
    args.finalUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");

  return looksLikeVerificationBlocker(verificationText);
}

function isVerificationRawResult(result: RawPlaywrightResult) {
  return hasVerificationDebugSignal({
    verificationDetected: result.debug?.verificationDetected,
    stopClassification: result.debug?.stopClassification,
    stoppedAtTitle: result.debug?.stoppedAtTitle,
    currentUrl: result.debug?.currentUrl,
    finalReason: result.debug?.finalReason ?? null,
    verificationSignals: result.debug?.verificationSignals ?? [],
    message: result.message ?? null,
    finalUrl: result.finalUrl ?? result.openUrl ?? result.debug?.finalUrl ?? null,
  });
}

function isVerificationExecutionResult(result: ApplyExecutionResult) {
  return (
    result.status === VERIFICATION_REQUIRED_STATUS ||
    hasVerificationDebugSignal({
      verificationDetected: result.debug.verificationDetected,
      stopClassification: result.debug.stopClassification,
      stoppedAtTitle: result.debug.stoppedAtTitle ?? null,
      currentUrl: result.debug.currentUrl ?? null,
      finalReason: result.debug.finalReason ?? null,
      message: result.message ?? null,
      finalUrl: result.finalUrl ?? result.debug.finalUrl ?? null,
    })
  );
}

function normalizeSourceLabel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isKnownDirectEmployerJobUrl(url: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(url ?? "");
  if (!normalizedUrl || isAggregatorHandoffUrl(normalizedUrl)) {
    return false;
  }

  return (
    isLikelyAtsUrl(normalizedUrl) || isLikelyCompanyCareersUrl(normalizedUrl)
  );
}

function readPreferredKnownDirectUrl(application: LoadedApplication) {
  const debug = readAutomationAudit(application.auditJson).state.debug ?? {};
  const candidates = [
    normalizeJobUrl(String(debug.resolvedDirectUrl ?? "")),
    normalizeJobUrl(String(debug.targetUrl ?? "")),
    normalizeJobUrl(application.jobUrl ?? ""),
  ].filter(Boolean);

  return (
    candidates.find((candidate) => isKnownDirectEmployerJobUrl(candidate)) ??
    null
  );
}

function shouldAttemptDirectResolution(application: LoadedApplication) {
  const jobUrl = normalizeJobUrl(application.jobUrl ?? "");
  const source = normalizeSourceLabel(application.source);

  if (!jobUrl) return false;

  return (
    source.includes("adzuna") ||
    source.includes("external") ||
    isAggregatorHandoffUrl(jobUrl)
  );
}

function isAdzunaApplySource(args: {
  source?: string | null;
  jobUrl?: string | null;
  urlCandidates?: Array<string | null | undefined>;
}) {
  const source = normalizeSourceLabel(args.source);
  const candidateUrls = [args.jobUrl, ...(args.urlCandidates ?? [])]
    .map((value) => normalizeJobUrl(value ?? ""))
    .filter(Boolean);
  const hasAdzunaCandidate = candidateUrls.some((url) => isAdzunaUrl(url));

  return source.includes("adzuna") || hasAdzunaCandidate;
}

function findAdzunaHandoffUrl(args: {
  source?: string | null;
  jobUrl?: string | null;
  urlCandidates?: Array<string | null | undefined>;
}) {
  const candidateUrls = [args.jobUrl, ...(args.urlCandidates ?? [])]
    .map((value) => normalizeJobUrl(value ?? ""))
    .filter(Boolean);

  if (
    !isAdzunaApplySource({
      source: args.source,
      jobUrl: args.jobUrl,
      urlCandidates: candidateUrls,
    })
  ) {
    return null;
  }

  return candidateUrls.find((url) => isAdzunaUrl(url)) ?? null;
}

function shouldContinueWithOriginalUrl(url: string) {
  const normalizedUrl = normalizeJobUrl(url);
  if (!normalizedUrl) return false;

  return validateAutomationStartUrl(normalizedUrl, {
    rejectAggregator: true,
    rejectSearchEngine: true,
  }).isValid;
}

function isValidResolvedAutomationStartUrl(url: string | null | undefined) {
  const normalizedUrl = normalizeJobUrl(String(url ?? ""));
  if (!normalizedUrl) return false;
  if (isAdzunaUrl(normalizedUrl) || isAdzunaUnresolvedHandoffUrl(normalizedUrl)) {
    return false;
  }

  return validateAutomationStartUrl(normalizedUrl, {
    rejectAggregator: true,
    rejectSearchEngine: true,
  }).isValid;
}

function pickDownstreamUrlFromAdzunaScrapflyResult(
  result: AdzunaScrapflyResolutionResult | null | undefined,
) {
  if (!result) return null;

  const sortedCandidateUrls = [...(result.candidates ?? [])]
    .sort((left, right) => right.score - left.score)
    .map((candidate) => normalizeJobUrl(candidate.url))
    .filter(Boolean);

  const prioritized = [
    "resolvedUrl" in result ? result.resolvedUrl : null,
    result.resolvedDirectUrl ?? null,
    result.adzunaPostLoginResolvedDirectUrl ?? null,
    "stoppedAtUrl" in result ? result.stoppedAtUrl ?? null : null,
    result.finalUrl ?? null,
    result.handoffFinalUrl ?? null,
    result.handoffPopupUrl ?? null,
    ...sortedCandidateUrls,
  ]
    .map((value) => normalizeJobUrl(String(value ?? "")))
    .filter(Boolean);

  return (
    prioritized.find((candidate) =>
      isValidResolvedAutomationStartUrl(candidate),
    ) ?? null
  );
}

function pickMostRecentStopUrl(args: {
  stopPointStoppedAtUrl?: string | null;
  stopPointCurrentUrl?: string | null;
  browserFinalUrl?: string | null;
  scrapflyResolvedUrl?: string | null;
  resolvedDirectUrl?: string | null;
  targetUrl?: string | null;
  originalJobUrl?: string | null;
}) {
  const prioritized = [
    args.stopPointStoppedAtUrl,
    args.stopPointCurrentUrl,
    args.browserFinalUrl,
    args.scrapflyResolvedUrl,
    args.resolvedDirectUrl,
    args.targetUrl,
    args.originalJobUrl,
  ]
    .map((value) => normalizeJobUrl(String(value ?? "")))
    .filter(Boolean);

  if (prioritized.length === 0) {
    return null;
  }

  const first = prioritized[0] ?? null;
  const downstream = prioritized.find(
    (candidate) =>
      !isAdzunaUrl(candidate) && !isAggregatorHandoffUrl(candidate),
  );

  if (first && (isAdzunaUrl(first) || isAggregatorHandoffUrl(first)) && downstream) {
    return downstream;
  }

  return first;
}

function readDebugStringField(
  debug: unknown,
  key: string,
): string | null {
  if (!debug || typeof debug !== "object") return null;
  const candidate = (debug as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildManualJobSearchQuery(args: {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  queries?: string[];
}) {
  const query =
    args.queries?.find((value) => String(value ?? "").trim().length > 0) ??
    [args.title, args.company, args.location]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ");

  return query.replace(/["]+/g, "").trim();
}

function buildManualJobSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildDirectResolutionDebug(args: {
  originalUrl: string;
  source?: string | null;
  resolution?: DirectJobResolution;
  resolvedDirectUrl?: string;
  attempted: boolean;
}): DirectResolutionDebug {
  return {
    originalJobUrl: args.originalUrl || undefined,
    resolvedDirectUrl: args.resolvedDirectUrl,
    applySource: args.source ?? undefined,
    googleFirstResolutionTriggered:
      args.resolution?.googleFirstTriggered === true,
    usedResolvedDirectUrl:
      Boolean(args.resolvedDirectUrl) &&
      args.resolvedDirectUrl !== args.originalUrl,
    directJobResolutionAttempted: args.attempted,
    directJobResolutionQueries: args.resolution?.queries ?? [],
    directJobResolutionNormalizedLocation:
      args.resolution?.normalizedLocation,
    directJobResolutionSearchProvider: args.resolution?.searchProvider,
    directJobResolutionConfidence: args.resolution?.confidence,
    directJobResolutionProvider: args.resolution?.provider,
    directJobResolutionMatchReason: args.resolution?.matchReason,
    directJobResolutionError: args.resolution?.error,
    directJobResolutionCandidates: args.resolution?.candidates ?? [],
    adzunaStrategyReplaySkipped:
      args.resolution?.adzunaStrategyReplaySkipped === true,
    startingUrlKind: classifyJobUrlKind(args.originalUrl),
    finalChosenUrlKind: classifyJobUrlKind(
      args.resolvedDirectUrl ?? args.originalUrl,
    ),
  };
}

function mergeDirectResolutionAudit(args: {
  application: LoadedApplication;
  debug: DirectResolutionDebug;
}): Prisma.JsonValue {
  const previousDebug = readAutomationAudit(args.application.auditJson).state.debug ?? {};

  return buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.application.source ?? "playwright",
    automation: {
      provider: "playwright",
      debug: {
        ...previousDebug,
        ...args.debug,
      },
    },
  }) as Prisma.JsonValue;
}

function buildUrlDecisionFields(
  debug:
    | Pick<
        ApplySessionDebug,
        | "originalJobUrl"
        | "resolvedDirectUrl"
        | "usedResolvedDirectUrl"
        | "applySource"
        | "startingUrlKind"
        | "finalChosenUrlKind"
        | "targetUrl"
      >
    | null
    | undefined,
) {
  const applySource = normalizeSourceLabel(debug?.applySource);
  const isBlockedAdzunaTarget = (url: string | null | undefined) =>
    Boolean(url) &&
    applySource.includes("adzuna") &&
    isAdzunaUrl(String(url));
  const chosenApplyUrl =
    (debug?.targetUrl && !isBlockedAdzunaTarget(debug.targetUrl)
      ? debug.targetUrl
      : null) ??
    (debug?.resolvedDirectUrl && !isBlockedAdzunaTarget(debug.resolvedDirectUrl)
      ? debug.resolvedDirectUrl
      : null) ??
    (debug?.originalJobUrl &&
    !isAdzunaUnresolvedHandoffUrl(debug.originalJobUrl) &&
    !isBlockedAdzunaTarget(debug.originalJobUrl)
      ? debug.originalJobUrl
      : null);

  return {
    originalUrl: debug?.originalJobUrl ?? null,
    resolvedDirectUrl: debug?.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl: debug?.usedResolvedDirectUrl === true,
    applySource: debug?.applySource ?? null,
    startingUrlKind: debug?.startingUrlKind ?? null,
    finalChosenUrlKind: debug?.finalChosenUrlKind ?? null,
    chosenApplyUrl,
  };
}

async function resolveApplicationDirectJobUrl(args: {
  application: LoadedApplication;
}): Promise<DirectResolutionAttemptResult> {
  const originalUrl = normalizeJobUrl(args.application.jobUrl ?? "");
  const source = args.application.source ?? null;
  const adzunaSourceDetected = isAdzunaApplySource({
    source,
    jobUrl: originalUrl,
  });
  const shouldAttempt = shouldAttemptDirectResolution(args.application);
  const preferredDirectUrl = readPreferredKnownDirectUrl(args.application);

  if (!shouldAttempt) {
    return {
      context: {
        application: args.application,
        originalUrl,
        debug: buildDirectResolutionDebug({
          originalUrl,
          source,
          attempted: false,
        }),
        usedResolvedDirectUrl: false,
      } satisfies DirectResolutionContext,
    };
  }

  const resolution = await resolveDirectJobUrl({
    title: args.application.title ?? args.application.jobTitle,
    company: args.application.company,
    location: args.application.location,
    currentUrl: originalUrl,
    source,
    sourceJobId: args.application.sourceJobId ?? null,
    preferredDirectUrl,
    applicationId: args.application.id,
  });

  const resolvedDirectUrl =
    resolution.ok ? normalizeJobUrl(resolution.resolvedUrl ?? "") || null : null;
  const debug = buildDirectResolutionDebug({
    originalUrl,
    source,
    resolution,
    resolvedDirectUrl: resolvedDirectUrl ?? undefined,
    attempted: true,
  });
  const nextAudit = mergeDirectResolutionAudit({
    application: args.application,
    debug,
  });
  const usedResolvedDirectUrl =
    Boolean(resolvedDirectUrl) && resolvedDirectUrl !== originalUrl;

  console.log("[AUTO_APPLY_ROUTE] direct resolution evaluated", {
    applicationId: args.application.id,
    source,
    originalUrl,
    googleFirstResolutionTriggered:
      resolution.googleFirstTriggered === true,
    adzunaHandoffDetected: isAdzunaUnresolvedHandoffUrl(originalUrl),
    acceptanceRule: resolution.acceptanceRule ?? null,
    normalizedLocation: resolution.normalizedLocation ?? null,
    searchProvider: resolution.searchProvider ?? null,
    queries: resolution.queries ?? [],
    resolvedDirectUrl: resolvedDirectUrl ?? null,
    usedResolvedDirectUrl,
    adzunaStrategyReplaySkipped:
      resolution.adzunaStrategyReplaySkipped === true,
    confidence: resolution.confidence ?? null,
    provider: resolution.provider ?? null,
    matchReason: resolution.matchReason ?? null,
    error: resolution.error ?? null,
    startingUrlKind: debug.startingUrlKind ?? null,
    finalChosenUrlKind: debug.finalChosenUrlKind ?? null,
  });

  if (usedResolvedDirectUrl) {
    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        jobUrl: resolvedDirectUrl,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: null,
      },
    });

    return {
      context: {
        application: {
          ...args.application,
          jobUrl: resolvedDirectUrl,
          auditJson: nextAudit,
          failureReason: null,
        } as LoadedApplication,
        originalUrl,
        resolvedDirectUrl: resolvedDirectUrl ?? undefined,
        debug,
        resolution,
        usedResolvedDirectUrl,
      },
    };
  }

  if (!resolution.ok && !shouldContinueWithOriginalUrl(originalUrl)) {
    const fallbackReason = adzunaSourceDetected
      ? resolution.error ?? ADZUNA_GOOGLE_FIRST_FAILURE_MESSAGE
      : isAdzunaUnresolvedHandoffUrl(originalUrl)
        ? resolution.error ?? ADZUNA_UNRESOLVED_TARGET_MESSAGE
        : resolution.error ??
        "Could not resolve a confident direct employer/ATS application URL";

    console.warn(
      "[AUTO_APPLY_ROUTE] direct resolution deferred to browser routing",
      {
        applicationId: args.application.id,
        originalUrl,
        source,
        fallbackReason,
        directJobResolutionQueries: resolution.queries ?? [],
      },
    );

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: null,
        verificationRequired: false,
      },
    });

    return {
      context: {
        application: {
          ...args.application,
          auditJson: nextAudit,
          failureReason: null,
        } as LoadedApplication,
        originalUrl,
        debug,
        resolution,
        usedResolvedDirectUrl: false,
      },
    };
  }

  return {
    context: {
      application: {
        ...args.application,
        auditJson: nextAudit,
      } as LoadedApplication,
      originalUrl,
      resolvedDirectUrl: resolvedDirectUrl ?? undefined,
      debug,
      resolution,
      usedResolvedDirectUrl,
    },
  };
}

function toHostedAnswersMap(values: Record<string, unknown>): AnswersMap {
  const entries = Object.entries(values)
    .filter(([key]) => key !== "resumeUploaded")
    .map(([key, value]) => [key, String(value ?? "").trim()] as const);

  return Object.fromEntries(entries);
}

function normalizePlaywrightResult(
  result: Awaited<ReturnType<typeof applyWithPlaywright>>,
): ApplyExecutionResult {
  const stopDebug = buildStopDebugFromRawResult(result);
  const debug = {
    ...(toApplySessionDebug(result.debug) ??
      ({
        finalReason:
          result.message ??
          result.status.toLowerCase(),
      } satisfies ApplySessionDebug)),
    finalUrl:
      result.finalUrl ?? result.openUrl ?? result.debug?.finalUrl ?? undefined,
    stopReason: stopDebug?.stopReason,
    lastAction: stopDebug?.lastAction,
    stopClassification:
      stopDebug?.stopClassification ?? result.debug?.stopClassification,
  } satisfies ApplySessionDebug;

  return {
    ok: result.ok,
    status: result.status,
    finalUrl: stopDebug?.finalUrl ?? result.finalUrl ?? result.openUrl,
    message: result.message,
    unavailable: result.unavailable,
    needsHuman: result.needsHuman,
    debug,
    rawStatus: result.status,
    rawSubmissionConfirmed: result.debug?.submissionConfirmed ?? result.ok,
  };
}

function readRoutePlaywrightEvidence(result: RawPlaywrightResult): RoutePlaywrightEvidence {
  return {
    applyCtaFound: result.debug?.applyCtaFound === true,
    applyCtaClicked: result.debug?.applyCtaClicked === true,
    hopCount:
      typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl:
      result.debug?.currentUrl ?? result.finalUrl ?? result.openUrl ?? null,
    targetUrl: result.debug?.targetUrl ?? null,
    submitButtonFound: result.debug?.submitButtonFound === true,
    submitButtonClicked: result.debug?.submitButtonClicked === true,
    confirmationTextFound: result.debug?.confirmationTextFound === true,
  };
}

function shouldForceApplyNotStarted(evidence: RoutePlaywrightEvidence) {
  return (
    !evidence.applyCtaClicked &&
    evidence.hopCount === 0 &&
    evidence.currentUrl !== null &&
    evidence.targetUrl !== null &&
    evidence.currentUrl === evidence.targetUrl &&
    evidence.submitButtonClicked !== true &&
    evidence.confirmationTextFound !== true
  );
}

function looksLikeLoginRequired(value: string | null | undefined) {
  if (!value) return false;

  const normalized = value.toLowerCase();
  return [
    "log in",
    "login",
    "sign in",
    "signin",
    "create account",
    "sign up",
    "register",
    "set your password",
    "password",
    "confirm your email",
    "verify your email",
    "email verification",
  ].some((signal) => normalized.includes(signal));
}

function deriveLastActionFromRawResult(
  result: RawPlaywrightResult,
): AutoApplyLastAction {
  if (isVerificationRawResult(result)) {
    return "verification_required";
  }

  const applyCtaClicked = result.debug?.applyCtaClicked === true;
  const hopCount =
    typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0;

  if (!applyCtaClicked && hopCount === 0) {
    return "no_apply_cta";
  }

  const verificationText = [
    ...(result.debug?.verificationSignals ?? []),
    result.debug?.finalReason,
    result.message,
    result.finalUrl,
    result.debug?.currentUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");

  return looksLikeLoginRequired(verificationText)
    ? "login_required"
    : "verification_required";
}

function deriveLastActionFromExecutionResult(
  result: ApplyExecutionResult,
): AutoApplyLastAction {
  if (isVerificationExecutionResult(result)) {
    return "verification_required";
  }

  const applyCtaClicked = result.debug.applyCtaClicked === true;
  const hopCount =
    typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0;

  if (!applyCtaClicked && hopCount === 0) {
    return "no_apply_cta";
  }

  const verificationText = [
    result.debug.finalReason,
    result.message,
    result.finalUrl,
    result.debug.currentUrl,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");

  return looksLikeLoginRequired(verificationText)
    ? "login_required"
    : "verification_required";
}

function buildStopDebugFromRawResult(
  result: RawPlaywrightResult,
): AutoApplyStopDebug | null {
  if (
    result.needsHuman !== true &&
    result.status !== "APPLY_NOT_STARTED" &&
    result.status !== "AUTO_APPLY_UNAVAILABLE" &&
    result.status !== "FAILED"
  ) {
    return null;
  }

  const finalUrl =
    result.finalUrl ?? result.openUrl ?? result.debug?.finalUrl ?? null;
  const currentUrl = result.debug?.currentUrl ?? finalUrl;
  const lastAction = deriveLastActionFromRawResult(result);
  const stopClassification = deriveStopClassification({
    targetUrl: result.debug?.targetUrl ?? null,
    finalUrl,
    currentUrl,
    applyCtaFound: result.debug?.applyCtaFound === true,
    applyCtaClicked: result.debug?.applyCtaClicked === true,
    hopCount:
      typeof result.debug?.hopCount === "number" ? result.debug.hopCount : 0,
    submitButtonFound: result.debug?.submitButtonFound === true,
    submitButtonClicked: result.debug?.submitButtonClicked === true,
    confirmationTextFound: result.debug?.confirmationTextFound === true,
    verificationSignals: result.debug?.verificationSignals ?? [],
    pageText: result.debug?.pageText,
    finalReason:
      result.debug?.rtxFailureReason ??
      result.debug?.finalReason ??
      result.message ??
      null,
    message: result.message,
    lastAction,
    status: result.status,
    needsHuman: result.needsHuman === true,
    formDetected: result.debug?.formDetected === true,
  });

  logRtxStopReasonClassified({
    stopClassification,
    finalUrl,
    currentUrl,
    finalReason:
      result.debug?.rtxFailureReason ??
      result.debug?.finalReason ??
      result.message ??
      null,
    rtxFlowAttempted: result.debug?.rtxFlowAttempted === true,
    rtxFlowCompleted: result.debug?.rtxFlowCompleted === true,
    rtxProgressMarkers: result.debug?.rtxProgressMarkers ?? [],
    rtxFailureReason: result.debug?.rtxFailureReason,
    rtxJobId: result.debug?.rtxJobId,
  });

  return {
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    finalUrl,
    currentUrl,
    lastAction,
    stoppedAtUrl:
      pickMostRecentStopUrl({
        stopPointStoppedAtUrl: result.debug?.stoppedAtUrl ?? null,
        stopPointCurrentUrl: currentUrl,
        browserFinalUrl: finalUrl,
        scrapflyResolvedUrl:
          readDebugStringField(result.debug, "adzunaScrapflyResolvedUrl") ??
          readDebugStringField(result.debug, "adzunaPostLoginResolvedDirectUrl") ??
          readDebugStringField(result.debug, "resolvedDirectUrl") ??
          null,
        resolvedDirectUrl: result.debug?.resolvedDirectUrl ?? null,
        targetUrl: result.debug?.targetUrl ?? null,
        originalJobUrl: result.debug?.originalJobUrl ?? null,
      }) ??
      currentUrl ??
      finalUrl,
    stoppedAtTitle: result.debug?.stoppedAtTitle ?? null,
    lastActionText:
      result.debug?.lastActionText ??
      result.debug?.applyCtaClickedText ??
      result.debug?.cookiePromptClickedText ??
      result.debug?.handoffCtaClickedText ??
      result.debug?.entryCtaClickedText ??
      null,
    lastActionSelector:
      result.debug?.lastActionSelector ??
      result.debug?.applyCtaClickedSelector ??
      result.debug?.cookiePromptSelector ??
      result.debug?.handoffCtaClickedSelector ??
      result.debug?.entryCtaClickedSelector ??
      null,
    stopClassification,
  };
}

function buildStopDebugFromExecutionResult(
  result: ApplyExecutionResult,
): AutoApplyStopDebug | null {
  if (
    result.needsHuman !== true &&
    result.status !== "APPLY_NOT_STARTED" &&
    result.status !== "AUTO_APPLY_UNAVAILABLE" &&
    result.status !== "FAILED"
  ) {
    return null;
  }

  const finalUrl = result.finalUrl ?? result.debug.finalUrl ?? null;
  const currentUrl = result.debug.currentUrl ?? finalUrl;
  const lastAction =
    result.debug.lastAction ?? deriveLastActionFromExecutionResult(result);
  const stopClassification =
    result.debug.stopClassification ??
    deriveStopClassification({
      targetUrl: result.debug.targetUrl ?? null,
      finalUrl,
      currentUrl,
      applyCtaFound: result.debug.applyCtaFound === true,
      applyCtaClicked: result.debug.applyCtaClicked === true,
      hopCount:
        typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0,
      submitButtonFound: result.debug.submitButtonFound === true,
      submitButtonClicked: result.debug.submitButtonClicked === true,
      confirmationTextFound: result.debug.confirmationTextFound === true,
      finalReason:
        result.debug.rtxFailureReason ??
        result.debug.finalReason ??
        result.message ??
        null,
      message: result.message,
      lastAction,
      status: result.status,
      needsHuman: result.needsHuman === true,
      formDetected: result.debug.formDetected === true,
    });

  logRtxStopReasonClassified({
    stopClassification,
    finalUrl,
    currentUrl,
    finalReason:
      result.debug.rtxFailureReason ??
      result.debug.finalReason ??
      result.message ??
      null,
    rtxFlowAttempted: result.debug.rtxFlowAttempted === true,
    rtxFlowCompleted: result.debug.rtxFlowCompleted === true,
    rtxProgressMarkers: result.debug.rtxProgressMarkers ?? [],
    rtxFailureReason: result.debug.rtxFailureReason,
    rtxJobId: result.debug.rtxJobId,
  });

  return {
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    finalUrl,
    currentUrl,
    lastAction,
    stoppedAtUrl:
      pickMostRecentStopUrl({
        stopPointStoppedAtUrl: result.debug.stoppedAtUrl ?? null,
        stopPointCurrentUrl: currentUrl,
        browserFinalUrl: finalUrl,
        scrapflyResolvedUrl:
          result.debug.adzunaScrapflyResolvedUrl ??
          result.debug.adzunaPostLoginResolvedDirectUrl ??
          result.debug.resolvedDirectUrl ??
          null,
        resolvedDirectUrl: result.debug.resolvedDirectUrl ?? null,
        targetUrl: result.debug.targetUrl ?? null,
        originalJobUrl: result.debug.originalJobUrl ?? null,
      }) ??
      currentUrl ??
      finalUrl,
    stoppedAtTitle: result.debug.stoppedAtTitle ?? null,
    lastActionText:
      result.debug.lastActionText ??
      result.debug.applyCtaClickedText ??
      result.debug.cookiePromptClickedText ??
      result.debug.handoffCtaClickedText ??
      result.debug.entryCtaClickedText ??
      null,
    lastActionSelector:
      result.debug.lastActionSelector ??
      result.debug.applyCtaClickedSelector ??
      result.debug.cookiePromptSelector ??
      result.debug.handoffCtaClickedSelector ??
      result.debug.entryCtaClickedSelector ??
      null,
    stopClassification,
  };
}

function coerceVerificationExecutionResult(
  result: ApplyExecutionResult,
): ApplyExecutionResult {
  if (result.ok || !isVerificationExecutionResult(result)) {
    return result;
  }

  const finalUrl = result.finalUrl ?? result.debug.finalUrl ?? null;
  const currentUrl = result.debug.currentUrl ?? finalUrl;
  const existingStopClassification = result.debug.stopClassification;
  const stopClassification =
    existingStopClassification &&
    isVerificationStopClassification(existingStopClassification)
      ? existingStopClassification
      : deriveStopClassification({
          targetUrl: result.debug.targetUrl ?? null,
          finalUrl,
          currentUrl,
          applyCtaFound: result.debug.applyCtaFound === true,
          applyCtaClicked: result.debug.applyCtaClicked === true,
          hopCount:
            typeof result.debug.hopCount === "number"
              ? result.debug.hopCount
              : 0,
          submitButtonFound: result.debug.submitButtonFound === true,
          submitButtonClicked: result.debug.submitButtonClicked === true,
          confirmationTextFound: result.debug.confirmationTextFound === true,
          verificationSignals: result.debug.verificationSignals ?? [],
          finalReason: result.debug.finalReason ?? result.message ?? null,
          message: result.message,
          lastAction: "verification_required",
          status: result.status,
          needsHuman: true,
          formDetected: result.debug.formDetected === true,
        });
  const stopDebug: AutoApplyStopDebug = {
    stopReason: "HUMAN_INTERVENTION_REQUIRED",
    finalUrl,
    currentUrl,
    lastAction: "verification_required",
    stopClassification,
    stoppedAtUrl:
      pickMostRecentStopUrl({
        stopPointStoppedAtUrl: result.debug.stoppedAtUrl ?? null,
        stopPointCurrentUrl: currentUrl,
        browserFinalUrl: finalUrl,
        scrapflyResolvedUrl:
          result.debug.adzunaScrapflyResolvedUrl ??
          result.debug.adzunaPostLoginResolvedDirectUrl ??
          result.debug.resolvedDirectUrl ??
          null,
        resolvedDirectUrl: result.debug.resolvedDirectUrl ?? null,
        targetUrl: result.debug.targetUrl ?? null,
        originalJobUrl: result.debug.originalJobUrl ?? null,
      }) ??
      currentUrl ??
      finalUrl,
    stoppedAtTitle: result.debug.stoppedAtTitle ?? null,
    lastActionText: result.debug.lastActionText ?? null,
    lastActionSelector: result.debug.lastActionSelector ?? null,
  };

  return {
    ...withStopDebug(
      {
        ...result,
        ok: false,
        status: VERIFICATION_REQUIRED_STATUS,
        message: VERIFICATION_REQUIRED_MESSAGE,
        unavailable: false,
        needsHuman: true,
        debug: {
          ...result.debug,
          finalUrl: finalUrl ?? undefined,
          currentUrl: currentUrl ?? undefined,
          stoppedAtUrl: stopDebug.stoppedAtUrl ?? undefined,
          stoppedAtTitle: stopDebug.stoppedAtTitle ?? undefined,
          stopReason: "HUMAN_INTERVENTION_REQUIRED",
          lastAction: "verification_required",
          stopClassification,
          verificationDetected: true,
          submissionConfirmed: false,
          finalReason:
            result.debug.finalReason ??
            result.message ??
            VERIFICATION_REQUIRED_MESSAGE,
        },
      },
      stopDebug,
    ),
    rawStatus: result.rawStatus,
    rawSubmissionConfirmed: result.rawSubmissionConfirmed,
  };
}

function withStopDebug(
  result: ApplyExecutionResult,
  stopDebug: AutoApplyStopDebug | null,
): ApplyExecutionResult {
  if (!stopDebug) {
    return result;
  }

  return {
    ...result,
    finalUrl: stopDebug.finalUrl ?? result.finalUrl,
    debug: {
      ...result.debug,
      finalUrl: stopDebug.finalUrl ?? undefined,
      currentUrl: stopDebug.currentUrl ?? undefined,
      stoppedAtUrl: stopDebug.stoppedAtUrl ?? undefined,
      latestUrl:
        stopDebug.stoppedAtUrl ??
        stopDebug.currentUrl ??
        stopDebug.finalUrl ??
        undefined,
      stoppedAtTitle: stopDebug.stoppedAtTitle ?? undefined,
      lastActionText: stopDebug.lastActionText ?? undefined,
      lastActionSelector: stopDebug.lastActionSelector ?? undefined,
      stopReason: stopDebug.stopReason,
      lastAction: stopDebug.lastAction,
      stopClassification: stopDebug.stopClassification,
    },
  };
}

type StopUrlDomainMismatch = {
  finalHost: string;
  expectedEmployerHost: string;
  finalUrl: string | null;
  stoppedAtUrl: string | null;
  currentBrowserUrl: string | null;
  reason: "wrong_employer_domain";
};

function detectStopUrlDomainMismatch(args: {
  application: LoadedApplication;
  result: ApplyExecutionResult;
  originalJobUrl?: string | null;
  resolvedDirectUrl?: string | null;
  targetUrl?: string | null;
}): StopUrlDomainMismatch | null {
  if (args.result.ok || args.result.status === "SUBMITTED") {
    return null;
  }

  const finalUrl =
    args.result.debug.stoppedAtUrl ??
    args.result.debug.currentUrl ??
    args.result.finalUrl ??
    args.result.debug.finalUrl ??
    null;
  const finalHost = parseHostname(finalUrl);
  if (!finalHost) return null;

  const expectedEmployerHost = resolveExpectedEmployerHost({
    preferredTargetUrl: args.targetUrl ?? args.result.debug.targetUrl,
    resolvedDirectUrl: args.resolvedDirectUrl,
    applicationJobUrl: args.application.jobUrl,
    originalUrl: args.originalJobUrl,
  });
  if (!expectedEmployerHost) {
    return null;
  }

  const companyIsRtx = isRtxCompanyName(args.application.company);
  const finalHostIsRtx = isRtxHostname(finalHost);
  if (finalHostIsRtx && !companyIsRtx) {
    return {
      finalHost,
      expectedEmployerHost,
      finalUrl,
      stoppedAtUrl: args.result.debug.stoppedAtUrl ?? null,
      currentBrowserUrl: args.result.debug.currentUrl ?? null,
      reason: "wrong_employer_domain",
    };
  }

  if (
    hostsEquivalentOrSubdomain(finalHost, expectedEmployerHost) ||
    isKnownAtsHostname(finalHost)
  ) {
    return null;
  }

  return {
    finalHost,
    expectedEmployerHost,
    finalUrl,
    stoppedAtUrl: args.result.debug.stoppedAtUrl ?? null,
    currentBrowserUrl: args.result.debug.currentUrl ?? null,
    reason: "wrong_employer_domain",
  };
}

function forceApplyNotStartedForDomainMismatch(args: {
  result: ApplyExecutionResult;
  mismatch: StopUrlDomainMismatch;
}) {
  const finalUrl =
    args.result.finalUrl ??
    args.result.debug.finalUrl ??
    args.mismatch.finalUrl ??
    null;
  const currentUrl = args.result.debug.currentUrl ?? finalUrl;
  const stopClassification: ApplyStopClassification = {
    reason: "wrong_employer_domain",
    pageType: "resolver_failure",
    suggestedAction: "open_original_job_site",
  };

  return withStopDebug(
    {
      ...args.result,
      ok: false,
      status: "APPLY_NOT_STARTED",
      unavailable: true,
      needsHuman: false,
      message: WRONG_EMPLOYER_DOMAIN_MESSAGE,
      debug: {
        ...args.result.debug,
        finalUrl: finalUrl ?? undefined,
        currentUrl: currentUrl ?? undefined,
        stoppedAtTitle: undefined,
        lastActionText: undefined,
        lastActionSelector: undefined,
        stopReason: "HUMAN_INTERVENTION_REQUIRED",
        lastAction: "no_apply_cta",
        stopClassification,
        verificationDetected: false,
        verificationSignals: [],
        submissionConfirmed: false,
        finalReason: "wrong_employer_domain",
      },
    },
    {
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      finalUrl,
      currentUrl,
      lastAction: "no_apply_cta",
      stopClassification,
      stoppedAtUrl:
        pickMostRecentStopUrl({
          stopPointStoppedAtUrl: args.result.debug.stoppedAtUrl ?? null,
          stopPointCurrentUrl: currentUrl,
          browserFinalUrl: finalUrl,
          scrapflyResolvedUrl:
            args.result.debug.adzunaScrapflyResolvedUrl ??
            args.result.debug.adzunaPostLoginResolvedDirectUrl ??
            args.result.debug.resolvedDirectUrl ??
            null,
          resolvedDirectUrl: args.result.debug.resolvedDirectUrl ?? null,
          targetUrl: args.result.debug.targetUrl ?? null,
          originalJobUrl: args.result.debug.originalJobUrl ?? null,
        }) ??
        currentUrl ??
        finalUrl ??
        null,
      stoppedAtTitle: null,
      lastActionText: null,
      lastActionSelector: null,
    },
  );
}

function applyRouteLevelSubmissionGuard(args: {
  rawResult: RawPlaywrightResult;
  applicationId: string;
  phase: "background" | "foreground";
  applySessionId?: string;
}) {
  const evidence = readRoutePlaywrightEvidence(args.rawResult);
  const rawStatus = args.rawResult.status;
  const rawSubmissionConfirmed =
    args.rawResult.debug?.submissionConfirmed ?? args.rawResult.ok;

  console.log("[AUTO_APPLY_ROUTE] playwright raw result", {
    applicationId: args.applicationId,
    phase: args.phase,
    applySessionId: args.applySessionId ?? null,
    rawStatus,
    rawSubmissionConfirmed,
    originalJobUrl: args.rawResult.debug?.originalJobUrl ?? null,
    resolvedDirectUrl: args.rawResult.debug?.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl:
      args.rawResult.debug?.usedResolvedDirectUrl === true,
    applySource: args.rawResult.debug?.applySource ?? null,
    directJobResolutionAttempted:
      args.rawResult.debug?.directJobResolutionAttempted === true,
    directJobResolutionConfidence:
      args.rawResult.debug?.directJobResolutionConfidence ?? null,
    directJobResolutionProvider:
      args.rawResult.debug?.directJobResolutionProvider ?? null,
    directJobResolutionMatchReason:
      args.rawResult.debug?.directJobResolutionMatchReason ?? null,
    directJobResolutionError:
      args.rawResult.debug?.directJobResolutionError ?? null,
    directJobResolutionCandidates:
      args.rawResult.debug?.directJobResolutionCandidates ?? [],
    searchFallbackTriggered:
      args.rawResult.debug?.searchFallbackTriggered === true,
    searchFallbackQueries:
      args.rawResult.debug?.searchFallbackQueries ?? [],
    searchFallbackCandidates:
      args.rawResult.debug?.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate:
      args.rawResult.debug?.searchFallbackChosenCandidate ?? null,
    searchFallbackAttemptCount:
      args.rawResult.debug?.searchFallbackAttemptCount ?? 0,
    searchFallbackSuccess:
      args.rawResult.debug?.searchFallbackSuccess === true,
    searchFallbackFailureReason:
      args.rawResult.debug?.searchFallbackFailureReason ?? null,
    startingUrlKind: args.rawResult.debug?.startingUrlKind ?? null,
    finalChosenUrlKind: args.rawResult.debug?.finalChosenUrlKind ?? null,
    entryUrl: args.rawResult.debug?.entryUrl ?? null,
    initialLoadedUrl: args.rawResult.debug?.initialLoadedUrl ?? null,
    finalUrl: args.rawResult.finalUrl ?? args.rawResult.openUrl ?? null,
    domain: args.rawResult.debug?.domain ?? null,
    stoppedAtUrl: args.rawResult.debug?.stoppedAtUrl ?? null,
    stoppedAtTitle: args.rawResult.debug?.stoppedAtTitle ?? null,
    lastActionText: args.rawResult.debug?.lastActionText ?? null,
    lastActionSelector: args.rawResult.debug?.lastActionSelector ?? null,
    ctaAttempts: args.rawResult.debug?.ctaAttempts ?? [],
    entryCtaFound: args.rawResult.debug?.entryCtaFound === true,
    entryCtaClicked: args.rawResult.debug?.entryCtaClicked === true,
    entryCtaClickedText: args.rawResult.debug?.entryCtaClickedText ?? null,
    entryCtaClickedSelector:
      args.rawResult.debug?.entryCtaClickedSelector ?? null,
    entryDismissedBlocker:
      args.rawResult.debug?.entryDismissedBlocker === true,
    handoffPageDetected: args.rawResult.debug?.handoffPageDetected === true,
    handoffUrl: args.rawResult.debug?.handoffUrl ?? null,
    handoffContinuationAttempted:
      args.rawResult.debug?.handoffContinuationAttempted === true,
    handoffContinuationSucceeded:
      args.rawResult.debug?.handoffContinuationSucceeded === true,
    handoffCtaFound: args.rawResult.debug?.handoffCtaFound === true,
    handoffCtaClicked: args.rawResult.debug?.handoffCtaClicked === true,
    handoffCtaClickedText:
      args.rawResult.debug?.handoffCtaClickedText ?? null,
    handoffCtaClickedSelector:
      args.rawResult.debug?.handoffCtaClickedSelector ?? null,
    handoffAttempts: args.rawResult.debug?.handoffAttempts ?? [],
    cookiePromptDetected: args.rawResult.debug?.cookiePromptDetected === true,
    cookiePromptClicked: args.rawResult.debug?.cookiePromptClicked === true,
    cookiePromptClickedText:
      args.rawResult.debug?.cookiePromptClickedText ?? null,
    cookiePromptSelector: args.rawResult.debug?.cookiePromptSelector ?? null,
    cookiePromptAttempts: args.rawResult.debug?.cookiePromptAttempts ?? [],
    postCookieWaitAttempted:
      args.rawResult.debug?.postCookieWaitAttempted === true,
    postCookieUrlBefore: args.rawResult.debug?.postCookieUrlBefore ?? null,
    postCookieUrlAfter: args.rawResult.debug?.postCookieUrlAfter ?? null,
    postCookieUrlChanged:
      args.rawResult.debug?.postCookieUrlChanged === true,
    postCookieProgressDetected:
      args.rawResult.debug?.postCookieProgressDetected === true,
    postCookieTitleAfter:
      args.rawResult.debug?.postCookieTitleAfter ?? null,
    applyCtaClickedText: args.rawResult.debug?.applyCtaClickedText ?? null,
    applyCtaClickedSelector:
      args.rawResult.debug?.applyCtaClickedSelector ?? null,
    ctaClickedText: args.rawResult.debug?.ctaClickedText ?? null,
    ctaClickedSelector: args.rawResult.debug?.ctaClickedSelector ?? null,
    dismissedBlocker: args.rawResult.debug?.dismissedBlocker === true,
    resolverCandidates: args.rawResult.debug?.resolverCandidates ?? [],
    resolverRejectedCandidates:
      args.rawResult.debug?.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.rawResult.debug?.resolverSelectedLink ?? null,
    adzunaHandoffFailureReasons:
      args.rawResult.debug?.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      args.rawResult.debug?.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview:
      args.rawResult.debug?.adzunaBodyTextPreview ?? null,
    adzunaTokenizedInterstitialDetected:
      args.rawResult.debug?.adzunaTokenizedInterstitialDetected === true,
    adzunaTokenizedParamsPresent:
      args.rawResult.debug?.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      args.rawResult.debug?.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      args.rawResult.debug?.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      args.rawResult.debug?.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason:
      args.rawResult.debug?.adzunaFinalFailureReason ?? null,
    adzunaHandoffPageTitle:
      args.rawResult.debug?.adzunaHandoffPageTitle ?? null,
    adzunaHandoffVisibleCtas:
      args.rawResult.debug?.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected:
      args.rawResult.debug?.adzunaOverlayDetected === true,
    adzunaOverlayDismissed:
      args.rawResult.debug?.adzunaOverlayDismissed === true,
    adzunaOverlayType:
      args.rawResult.debug?.adzunaOverlayType ?? null,
    adzunaOverlaySelectorsTried:
      args.rawResult.debug?.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      args.rawResult.debug?.adzunaHandoffPopupOccurred === true,
    adzunaHandoffUsedPopup:
      args.rawResult.debug?.adzunaHandoffUsedPopup === true,
    adzunaDownstreamConfirmed:
      args.rawResult.debug?.adzunaDownstreamConfirmed === true,
    adzunaAuthPageDetected:
      args.rawResult.debug?.adzunaAuthPageDetected === true,
    adzunaForgotPasswordDetected:
      args.rawResult.debug?.adzunaForgotPasswordDetected === true,
    adzunaLoginAttempted:
      args.rawResult.debug?.adzunaLoginAttempted === true,
    adzunaLoginSucceeded:
      args.rawResult.debug?.adzunaLoginSucceeded === true,
    adzunaLoginFailedReason:
      args.rawResult.debug?.adzunaLoginFailedReason ?? null,
    blockedResolvedHandoffCandidates:
      args.rawResult.debug?.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      args.rawResult.debug?.selectedResolvedHandoffCandidate ?? null,
    resolvedHandoffClickAttempted:
      args.rawResult.debug?.resolvedHandoffClickAttempted === true,
    resolvedHandoffClickSucceeded:
      args.rawResult.debug?.resolvedHandoffClickSucceeded === true,
    resolvedHandoffClickedHref:
      args.rawResult.debug?.resolvedHandoffClickedHref ?? null,
    resolvedHandoffClickedText:
      args.rawResult.debug?.resolvedHandoffClickedText ?? null,
    resolvedHandoffUrlBefore:
      args.rawResult.debug?.resolvedHandoffUrlBefore ?? null,
    resolvedHandoffUrlAfter:
      args.rawResult.debug?.resolvedHandoffUrlAfter ?? null,
    playwrightLaunchStrategy:
      args.rawResult.debug?.playwrightLaunchStrategy ?? null,
    playwrightPersistentContext:
      args.rawResult.debug?.playwrightPersistentContext === true,
    playwrightUserDataDir:
      args.rawResult.debug?.playwrightUserDataDir ?? null,
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonFound: evidence.submitButtonFound,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
  });

  let guardedResult = args.rawResult;
  if (
    shouldForceApplyNotStarted(evidence) &&
    !isVerificationRawResult(args.rawResult)
  ) {
    guardedResult = {
      ...args.rawResult,
      ok: false,
      status: "APPLY_NOT_STARTED",
      unavailable: true,
      message:
        args.rawResult.message ??
        "Opened job page but could not start application.",
      debug: args.rawResult.debug
        ? {
            ...args.rawResult.debug,
            submissionConfirmed: false,
            finalStatus: "APPLY_NOT_STARTED",
            finalReason:
              args.rawResult.debug.finalReason ??
              "Route guard forced APPLY_NOT_STARTED for a no-interaction run.",
          }
        : args.rawResult.debug,
    };
  }

  const normalized = coerceVerificationExecutionResult(
    withStopDebug(
      normalizePlaywrightResult(guardedResult),
      buildStopDebugFromRawResult(guardedResult),
    ),
  );
  console.log("[AUTO_APPLY_ROUTE] playwright final promotion", {
    applicationId: args.applicationId,
    phase: args.phase,
    applySessionId: args.applySessionId ?? null,
    rawStatus,
    rawSubmissionConfirmed,
    finalStatus: normalized.status,
    finalSubmissionConfirmed: normalized.ok,
  });

  return {
    ...normalized,
    rawStatus,
    rawSubmissionConfirmed,
  };
}

function readExecutionEvidence(
  result: ApplyExecutionResult,
): RoutePlaywrightEvidence {
  return {
    applyCtaFound: result.debug.applyCtaFound === true,
    applyCtaClicked: result.debug.applyCtaClicked === true,
    hopCount:
      typeof result.debug.hopCount === "number" ? result.debug.hopCount : 0,
    currentUrl: result.debug.currentUrl ?? result.finalUrl ?? null,
    targetUrl: result.debug.targetUrl ?? null,
    submitButtonFound: result.debug.submitButtonFound === true,
    submitButtonClicked: result.debug.submitButtonClicked === true,
    confirmationTextFound: result.debug.confirmationTextFound === true,
  };
}

function applyFinalWriteGuard(args: {
  result: ApplyExecutionResult;
  applicationId: string;
  applySessionId?: string;
  storageTarget: "jobApplication" | "applySession";
}): ApplyExecutionResult {
  if (isVerificationExecutionResult(args.result)) {
    return coerceVerificationExecutionResult(args.result);
  }

  const evidence = readExecutionEvidence(args.result);
  if (!shouldForceApplyNotStarted(evidence)) {
    return args.result;
  }

  console.warn("[AUTO_APPLY_ROUTE] final write guard forced APPLY_NOT_STARTED", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    storageTarget: args.storageTarget,
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    currentUrl: evidence.currentUrl,
    targetUrl: evidence.targetUrl,
    submitButtonFound: evidence.submitButtonFound,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
  });

  const finalReason =
    args.result.debug.finalReason ??
    "Final write guard forced APPLY_NOT_STARTED for a no-interaction run.";
  const stopClassification = deriveStopClassification({
    targetUrl: args.result.debug.targetUrl ?? null,
    finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? null,
    currentUrl: evidence.currentUrl,
    applyCtaFound: evidence.applyCtaFound,
    applyCtaClicked: evidence.applyCtaClicked,
    hopCount: evidence.hopCount,
    submitButtonFound: evidence.submitButtonFound,
    submitButtonClicked: evidence.submitButtonClicked,
    confirmationTextFound: evidence.confirmationTextFound,
    finalReason,
    message: args.result.message,
    lastAction: "no_apply_cta",
    status: args.result.status,
    needsHuman: args.result.needsHuman === true,
    formDetected: args.result.debug.formDetected === true,
  });

  return {
    ...withStopDebug(args.result, {
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? null,
      currentUrl: evidence.currentUrl,
      lastAction: "no_apply_cta",
      stopClassification,
      stoppedAtUrl:
        pickMostRecentStopUrl({
          stopPointStoppedAtUrl: args.result.debug.stoppedAtUrl ?? null,
          stopPointCurrentUrl: evidence.currentUrl,
          browserFinalUrl: args.result.finalUrl ?? null,
          scrapflyResolvedUrl:
            args.result.debug.adzunaScrapflyResolvedUrl ??
            args.result.debug.adzunaPostLoginResolvedDirectUrl ??
            args.result.debug.resolvedDirectUrl ??
            null,
          resolvedDirectUrl: args.result.debug.resolvedDirectUrl ?? null,
          targetUrl: args.result.debug.targetUrl ?? null,
          originalJobUrl: args.result.debug.originalJobUrl ?? null,
        }) ??
        evidence.currentUrl ??
        args.result.finalUrl ??
        null,
      stoppedAtTitle: args.result.debug.stoppedAtTitle ?? null,
      lastActionText: args.result.debug.lastActionText ?? null,
      lastActionSelector: args.result.debug.lastActionSelector ?? null,
    }),
    ok: false,
    status: "APPLY_NOT_STARTED",
    unavailable: true,
    message:
      args.result.message ?? "Opened job page but could not start application.",
    debug: {
      ...args.result.debug,
      finalUrl: args.result.finalUrl ?? evidence.currentUrl ?? undefined,
      currentUrl: evidence.currentUrl ?? undefined,
      stopReason: "HUMAN_INTERVENTION_REQUIRED",
      lastAction: "no_apply_cta",
      stopClassification,
      submissionConfirmed: false,
      finalReason,
    },
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
  };
}

function ensureTerminalApplySessionResult(args: {
  result: ApplyExecutionResult;
  applicationId: string;
  applySessionId?: string;
}) {
  if (
    args.result.needsHuman === true ||
    isApplySessionTerminalStatus(args.result.status)
  ) {
    return args.result;
  }

  const evidence = readExecutionEvidence(args.result);
  const finalUrl =
    args.result.finalUrl ?? args.result.debug.finalUrl ?? evidence.currentUrl;
  const currentUrl = evidence.currentUrl ?? finalUrl;
  const finalReason =
    args.result.debug.finalReason ??
    args.result.message ??
    "Background apply finished without reaching a terminal session state.";
  const lastAction =
    args.result.debug.lastAction ??
    (evidence.applyCtaClicked ? "verification_required" : "no_apply_cta");
  const coercedStatus =
    args.result.unavailable === true
      ? "AUTO_APPLY_UNAVAILABLE"
      : "FAILED";
  const stopClassification =
    args.result.debug.stopClassification ??
    deriveStopClassification({
      targetUrl: args.result.debug.targetUrl ?? null,
      finalUrl,
      currentUrl,
      applyCtaFound: evidence.applyCtaFound,
      applyCtaClicked: evidence.applyCtaClicked,
      hopCount: evidence.hopCount,
      submitButtonFound: evidence.submitButtonFound,
      submitButtonClicked: evidence.submitButtonClicked,
      confirmationTextFound: evidence.confirmationTextFound,
      finalReason,
      message: args.result.message,
      lastAction,
      status: args.result.status,
      needsHuman: false,
      formDetected: args.result.debug.formDetected === true,
    });

  console.error("[AUTO_APPLY_ROUTE] coerced non-terminal session result", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    rawStatus: args.result.rawStatus,
    sessionStatus: args.result.status,
    coercedStatus,
    currentUrl,
    finalUrl,
    finalReason,
  });

  return {
    ...withStopDebug(
      {
        ...args.result,
        ok: false,
        status: coercedStatus,
        message: finalReason,
        debug: {
          ...args.result.debug,
          finalUrl: finalUrl ?? undefined,
          currentUrl: currentUrl ?? undefined,
          stopReason: "HUMAN_INTERVENTION_REQUIRED",
          lastAction,
          stopClassification,
          submissionConfirmed: false,
          finalReason,
        },
      },
      {
        stopReason: "HUMAN_INTERVENTION_REQUIRED",
        finalUrl,
        currentUrl,
        lastAction,
        stopClassification,
        stoppedAtUrl:
          pickMostRecentStopUrl({
            stopPointStoppedAtUrl: args.result.debug.stoppedAtUrl ?? null,
            stopPointCurrentUrl: currentUrl,
            browserFinalUrl: finalUrl,
            scrapflyResolvedUrl:
              args.result.debug.adzunaScrapflyResolvedUrl ??
              args.result.debug.adzunaPostLoginResolvedDirectUrl ??
              args.result.debug.resolvedDirectUrl ??
              null,
            resolvedDirectUrl: args.result.debug.resolvedDirectUrl ?? null,
            targetUrl: args.result.debug.targetUrl ?? null,
            originalJobUrl: args.result.debug.originalJobUrl ?? null,
          }) ??
          currentUrl ??
          finalUrl ??
          null,
        stoppedAtTitle: args.result.debug.stoppedAtTitle ?? null,
        lastActionText: args.result.debug.lastActionText ?? null,
        lastActionSelector: args.result.debug.lastActionSelector ?? null,
      },
    ),
    rawStatus: args.result.rawStatus,
    rawSubmissionConfirmed: args.result.rawSubmissionConfirmed,
  } satisfies ApplyExecutionResult;
}

function logFinalWrite(args: {
  applicationId: string;
  applySessionId?: string;
  rawStatus: string;
  rawSubmissionConfirmed: boolean;
  finalStatus: string;
  finalSubmissionConfirmed: boolean;
  emailStatus: ApplyEmailStatus;
  storageTarget: "jobApplication" | "applySession";
}) {
  console.info("[AUTO_APPLY_ROUTE] final write", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    rawStatus: args.rawStatus,
    rawSubmissionConfirmed: args.rawSubmissionConfirmed,
    finalStatus: args.finalStatus,
    finalSubmissionConfirmed: args.finalSubmissionConfirmed,
    emailStatus: args.emailStatus,
    storageTarget: args.storageTarget,
  });
}

function logAutoApplyDebug(args: {
  applicationId: string;
  applySessionId?: string;
  phase: "background" | "foreground";
  result: ApplyExecutionResult;
}) {
  const stopDebug = buildStopDebugFromExecutionResult(args.result);
  if (!stopDebug) {
    return;
  }

  console.info("[AUTO_APPLY_DEBUG]", {
    applicationId: args.applicationId,
    originalJobUrl: args.result.debug.originalJobUrl ?? null,
    resolvedDirectUrl: args.result.debug.resolvedDirectUrl ?? null,
    usedResolvedDirectUrl:
      args.result.debug.usedResolvedDirectUrl === true,
    applySource: args.result.debug.applySource ?? null,
    directJobResolutionAttempted:
      args.result.debug.directJobResolutionAttempted === true,
    directJobResolutionConfidence:
      args.result.debug.directJobResolutionConfidence ?? null,
    directJobResolutionProvider:
      args.result.debug.directJobResolutionProvider ?? null,
    directJobResolutionMatchReason:
      args.result.debug.directJobResolutionMatchReason ?? null,
    directJobResolutionError:
      args.result.debug.directJobResolutionError ?? null,
    directJobResolutionCandidates:
      args.result.debug.directJobResolutionCandidates ?? [],
    searchFallbackTriggered:
      args.result.debug.searchFallbackTriggered === true,
    searchFallbackQueries:
      args.result.debug.searchFallbackQueries ?? [],
    searchFallbackCandidates:
      args.result.debug.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate:
      args.result.debug.searchFallbackChosenCandidate ?? null,
    searchFallbackAttemptCount:
      args.result.debug.searchFallbackAttemptCount ?? 0,
    searchFallbackSuccess:
      args.result.debug.searchFallbackSuccess === true,
    searchFallbackFailureReason:
      args.result.debug.searchFallbackFailureReason ?? null,
    startingUrlKind: args.result.debug.startingUrlKind ?? null,
    finalChosenUrlKind: args.result.debug.finalChosenUrlKind ?? null,
    entryUrl: args.result.debug.entryUrl ?? null,
    initialLoadedUrl: args.result.debug.initialLoadedUrl ?? null,
    finalUrl: stopDebug.finalUrl,
    domain: args.result.debug.domain ?? null,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    ctaAttempts: args.result.debug.ctaAttempts ?? [],
    entryCtaFound: args.result.debug.entryCtaFound === true,
    entryCtaClicked: args.result.debug.entryCtaClicked === true,
    entryCtaClickedText: args.result.debug.entryCtaClickedText ?? null,
    entryCtaClickedSelector:
      args.result.debug.entryCtaClickedSelector ?? null,
    entryDismissedBlocker:
      args.result.debug.entryDismissedBlocker === true,
    handoffPageDetected: args.result.debug.handoffPageDetected === true,
    handoffUrl: args.result.debug.handoffUrl ?? null,
    handoffContinuationAttempted:
      args.result.debug.handoffContinuationAttempted === true,
    handoffContinuationSucceeded:
      args.result.debug.handoffContinuationSucceeded === true,
    handoffCtaFound: args.result.debug.handoffCtaFound === true,
    handoffCtaClicked: args.result.debug.handoffCtaClicked === true,
    handoffCtaClickedText:
      args.result.debug.handoffCtaClickedText ?? null,
    handoffCtaClickedSelector:
      args.result.debug.handoffCtaClickedSelector ?? null,
    handoffAttempts: args.result.debug.handoffAttempts ?? [],
    cookiePromptDetected: args.result.debug.cookiePromptDetected === true,
    cookiePromptClicked: args.result.debug.cookiePromptClicked === true,
    cookiePromptClickedText:
      args.result.debug.cookiePromptClickedText ?? null,
    cookiePromptSelector: args.result.debug.cookiePromptSelector ?? null,
    cookiePromptAttempts: args.result.debug.cookiePromptAttempts ?? [],
    postCookieWaitAttempted:
      args.result.debug.postCookieWaitAttempted === true,
    postCookieUrlBefore: args.result.debug.postCookieUrlBefore ?? null,
    postCookieUrlAfter: args.result.debug.postCookieUrlAfter ?? null,
    postCookieUrlChanged:
      args.result.debug.postCookieUrlChanged === true,
    postCookieProgressDetected:
      args.result.debug.postCookieProgressDetected === true,
    postCookieTitleAfter:
      args.result.debug.postCookieTitleAfter ?? null,
    applyCtaClickedText: args.result.debug.applyCtaClickedText ?? null,
    applyCtaClickedSelector:
      args.result.debug.applyCtaClickedSelector ?? null,
    ctaClickedText: args.result.debug.ctaClickedText ?? null,
    ctaClickedSelector: args.result.debug.ctaClickedSelector ?? null,
    dismissedBlocker: args.result.debug.dismissedBlocker === true,
    resolverCandidates: args.result.debug.resolverCandidates ?? [],
    resolverRejectedCandidates:
      args.result.debug.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.result.debug.resolverSelectedLink ?? null,
    adzunaHandoffFailureReasons:
      args.result.debug.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      args.result.debug.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview:
      args.result.debug.adzunaBodyTextPreview ?? null,
    adzunaTokenizedInterstitialDetected:
      args.result.debug.adzunaTokenizedInterstitialDetected === true,
    adzunaTokenizedParamsPresent:
      args.result.debug.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      args.result.debug.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      args.result.debug.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      args.result.debug.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason:
      args.result.debug.adzunaFinalFailureReason ?? null,
    adzunaHandoffPageTitle:
      args.result.debug.adzunaHandoffPageTitle ?? null,
    adzunaHandoffVisibleCtas:
      args.result.debug.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected:
      args.result.debug.adzunaOverlayDetected === true,
    adzunaOverlayDismissed:
      args.result.debug.adzunaOverlayDismissed === true,
    adzunaOverlayType: args.result.debug.adzunaOverlayType ?? null,
    adzunaOverlaySelectorsTried:
      args.result.debug.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      args.result.debug.adzunaHandoffPopupOccurred === true,
    adzunaHandoffUsedPopup:
      args.result.debug.adzunaHandoffUsedPopup === true,
    adzunaDownstreamConfirmed:
      args.result.debug.adzunaDownstreamConfirmed === true,
    adzunaAuthPageDetected:
      args.result.debug.adzunaAuthPageDetected === true,
    adzunaForgotPasswordDetected:
      args.result.debug.adzunaForgotPasswordDetected === true,
    adzunaLoginAttempted:
      args.result.debug.adzunaLoginAttempted === true,
    adzunaLoginSucceeded:
      args.result.debug.adzunaLoginSucceeded === true,
    adzunaLoginFailedReason:
      args.result.debug.adzunaLoginFailedReason ?? null,
    blockedResolvedHandoffCandidates:
      args.result.debug.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      args.result.debug.selectedResolvedHandoffCandidate ?? null,
    resolvedHandoffClickAttempted:
      args.result.debug.resolvedHandoffClickAttempted === true,
    resolvedHandoffClickSucceeded:
      args.result.debug.resolvedHandoffClickSucceeded === true,
    resolvedHandoffClickedHref:
      args.result.debug.resolvedHandoffClickedHref ?? null,
    resolvedHandoffClickedText:
      args.result.debug.resolvedHandoffClickedText ?? null,
    resolvedHandoffUrlBefore:
      args.result.debug.resolvedHandoffUrlBefore ?? null,
    resolvedHandoffUrlAfter:
      args.result.debug.resolvedHandoffUrlAfter ?? null,
    playwrightLaunchStrategy:
      args.result.debug.playwrightLaunchStrategy ?? null,
    playwrightPersistentContext:
      args.result.debug.playwrightPersistentContext === true,
    playwrightUserDataDir:
      args.result.debug.playwrightUserDataDir ?? null,
    currentUrl: stopDebug.currentUrl,
    applyCtaClicked: args.result.debug.applyCtaClicked === true,
    hopCount:
      typeof args.result.debug.hopCount === "number"
        ? args.result.debug.hopCount
        : 0,
    submitButtonClicked: args.result.debug.submitButtonClicked === true,
    confirmationTextFound: args.result.debug.confirmationTextFound === true,
    stopReason: stopDebug.stopReason,
    stopClassification: stopDebug.stopClassification,
  });
}

function logAutoApplyStopPoint(args: {
  applicationId: string;
  applySessionId?: string;
  phase: "background" | "foreground";
  result: ApplyExecutionResult;
}) {
  const stopDebug = buildStopDebugFromExecutionResult(args.result);
  if (!stopDebug) {
    return;
  }

  console.info("[AUTO_APPLY_STOP_POINT]", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    phase: args.phase,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    finalStatus: args.result.status,
  });
}

function buildStopResponseFields(result: ApplyExecutionResult) {
  const stopDebug = buildStopDebugFromExecutionResult(result);
  const finalUrl = stopDebug?.finalUrl ?? result.finalUrl ?? result.debug.finalUrl ?? null;
  const currentUrl = stopDebug?.currentUrl ?? result.debug.currentUrl ?? finalUrl ?? null;
  const verificationRequired = isVerificationExecutionResult(result);
  const normalizedStopClassification =
    stopDebug?.stopClassification &&
    stopDebug.stopClassification.reason === "verification_required"
      ? {
          ...stopDebug.stopClassification,
          reason: "verification_required" as const,
          pageType: "human_verification_gate" as const,
          suggestedAction: "complete_verification" as const,
        }
      : stopDebug?.stopClassification ?? null;
  const rtxStop = buildRtxStopPayload({
    finalUrl: stopDebug?.finalUrl ?? result.finalUrl ?? result.debug.finalUrl,
    currentUrl: stopDebug?.currentUrl ?? result.debug.currentUrl,
    finalReason: result.debug.finalReason ?? result.message ?? null,
    rtxFlowAttempted: result.debug.rtxFlowAttempted === true,
    rtxFlowCompleted: result.debug.rtxFlowCompleted === true,
    rtxProgressMarkers: result.debug.rtxProgressMarkers ?? [],
    rtxFailureReason: result.debug.rtxFailureReason,
    rtxJobId: result.debug.rtxJobId,
  });
  const inferredErrorCode = inferExecutionErrorCode({
    result,
    stopClassification:
      normalizedStopClassification ??
      stopDebug?.stopClassification ??
      result.debug.stopClassification ??
      null,
  });
  const nonVerificationMessage = verificationRequired
    ? null
    : buildErrorMessageWithCode({
        errorCode: inferredErrorCode,
        message: result.message ?? result.debug.finalReason ?? null,
      });

  if (!stopDebug) {
    return {
      finalUrl,
      errorCode: inferredErrorCode ?? undefined,
      rtxStop,
    };
  }

  return {
    stopReason: stopDebug.stopReason,
    reason: verificationRequired ? "Security verification required" : undefined,
    finalUrl,
    currentUrl,
    openUrl: stopDebug.stoppedAtUrl ?? currentUrl ?? finalUrl,
    stoppedAtUrl: stopDebug.stoppedAtUrl,
    stoppedAtTitle: stopDebug.stoppedAtTitle,
    lastAction: stopDebug.lastAction,
    lastActionText: stopDebug.lastActionText,
    lastActionSelector: stopDebug.lastActionSelector,
    stopClassification: normalizedStopClassification,
    suggestedAction:
      normalizedStopClassification?.suggestedAction ??
      stopDebug.stopClassification.suggestedAction,
    canResumeAfterHumanStep: verificationRequired,
    retryMode: verificationRequired ? "last_url" : undefined,
    humanMessage: verificationRequired
      ? VERIFICATION_REQUIRED_MESSAGE
      : nonVerificationMessage ?? undefined,
    userMessage: verificationRequired
      ? VERIFICATION_REQUIRED_MESSAGE
      : nonVerificationMessage ?? undefined,
    errorCode: inferredErrorCode ?? undefined,
    rtxStop,
  };
}

function isRealPostingNotFoundResult(result: ApplyExecutionResult) {
  const normalizedReason = String(result.debug.finalReason ?? "")
    .trim()
    .toUpperCase();
  const normalizedMessage = String(result.message ?? "")
    .trim()
    .toUpperCase();

  return (
    normalizedReason === REAL_POSTING_NOT_FOUND_CODE ||
    normalizedMessage.includes("REAL POSTING NOT FOUND")
  );
}

function inferExecutionErrorCode(args: {
  result: ApplyExecutionResult;
  stopClassification?: ApplyStopClassification | null;
  message?: string | null;
  explicitErrorCode?: string | null;
}) {
  return inferApplyAutomationErrorCode({
    errorCode: args.explicitErrorCode,
    stopClassification: args.stopClassification ?? args.result.debug.stopClassification,
    status: args.result.status,
    message: args.message ?? args.result.message ?? null,
    finalReason: args.result.debug.finalReason ?? null,
  });
}

function buildErrorMessageWithCode(args: {
  errorCode?: string | null;
  message?: string | null;
}) {
  const normalizedErrorCode = normalizeApplyAutomationErrorCode(args.errorCode);
  const fallbackMessage = normalizedErrorCode
    ? getApplyAutomationErrorMessage(normalizedErrorCode)
    : null;

  return (
    prefixErrorCodeInMessage({
      errorCode: normalizedErrorCode,
      message: args.message ?? fallbackMessage,
    }) ??
    args.message ??
    fallbackMessage
  );
}

async function resolveMatchedStrategyGuidance(args: {
  application: LoadedApplication;
  sourceUrl?: string | null;
  targetUrl?: string | null;
}) {
  return findBestApplySiteStrategyForRun({
    userProfileId: args.application.userProfileId,
    sourceUrl: args.sourceUrl,
    targetUrl: args.targetUrl,
    company: args.application.company,
    location: args.application.location,
  });
}

function buildStrategyReplayResult(result: ApplyExecutionResult) {
  return {
    status: result.ok ? "COMPLETED" : "FAILED",
    currentUrl: result.finalUrl ?? result.debug.finalUrl,
    reason: result.ok
      ? undefined
      : result.message ?? result.debug.finalReason ?? result.status,
  } as const;
}

async function recordMatchedStrategyOutcome(args: {
  application: LoadedApplication;
  strategyGuidance?: MatchedStrategyGuidance | null;
  result: ApplyExecutionResult;
  phase: "background" | "foreground";
  applicationId: string;
  applySessionId?: string;
}) {
  const strategyId = args.strategyGuidance?.strategy.id;
  if (!strategyId) {
    return;
  }

  try {
    await recordApplySiteStrategyReplayForUser({
      userProfileId: args.application.userProfileId,
      input: {
        strategyId,
        strategyKey: args.strategyGuidance?.strategy.strategyKey,
        replayStatus: args.result.ok ? "COMPLETED" : "FAILED",
        lastReplayedAt: new Date().toISOString(),
        lastReplayResult: buildStrategyReplayResult(args.result),
      },
    });
  } catch (error) {
    console.error("[AUTO_APPLY_STRATEGY] replay health update failed", {
      applicationId: args.applicationId,
      applySessionId: args.applySessionId ?? null,
      phase: args.phase,
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendStatusChangeEmail(args: {
  applicationId: string;
  previousStatus: string;
  nextStatus: string;
}): Promise<StatusChangeEmailResult> {
  try {
    const result = await sendApplicationActivityEmailForStatusChange({
      applicationId: args.applicationId,
      previousStatus: args.previousStatus,
      nextStatus: args.nextStatus,
    });

    return {
      emailStatus: result.sent ? "SENT" : "SKIPPED",
    };
  } catch (error) {
    const diagnostic = await normalizeEmailError(error);

    console.error("[AUTO_APPLY_EMAIL] confirmation email failed", {
      applicationId: args.applicationId,
      previousStatus: args.previousStatus,
      nextStatus: args.nextStatus,
      diagnostic,
    });

    return {
      emailStatus: "FAILED",
      failureMessage:
        args.nextStatus === "SENT"
          ? "Application submitted successfully, but the confirmation email could not be sent."
          : null,
    };
  }
}

async function prepareAutomationInput(args: {
  application: LoadedApplication;
  requestAnswers?: AnswersMap;
}) {
  const application = args.application;
  const applyProvider = detectApplyProviderFromJob({
    source: application.source,
    jobUrl: application.jobUrl,
  });

  if (applyProvider === "ashby") {
    const resume = await prisma.resumeFile.findFirst({
      where: { profileId: application.userProfileId },
      orderBy: { createdAt: "desc" },
    });
    const fields = buildProfileFieldMap(application.userProfile, resume);
    const computed = computeMissingFromFields(
      fields,
      (args.requestAnswers as Record<string, unknown> | undefined) ?? {},
    );
    const answers = toHostedAnswersMap(computed.merged);

    return {
      applyProvider,
      answers,
      finalValuesToSubmit: answers,
      targetUrl: application.jobUrl ?? undefined,
      missingRequired: computed.missing,
    };
  }

  const { answers, finalValuesToSubmit, greenhouseEmbedUrl } =
    await prepareApplyPayload({
      jobUrl: application.jobUrl ?? "",
      profile: application.userProfile,
      savedAnswers: (application.answersJson as AnswersMap | null) ?? {},
      requestAnswers: args.requestAnswers ?? {},
    });

  return {
    applyProvider,
    answers,
    finalValuesToSubmit,
    targetUrl: greenhouseEmbedUrl ?? application.jobUrl ?? undefined,
    missingRequired: [] as string[],
  };
}

function buildPreparationFailureAudit(args: {
  application: { auditJson: Prisma.JsonValue | null; source: string | null };
  applyProvider: string | null;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
  message: string;
  finalReason: string;
}) {
  return buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "playwright",
    finalValuesToSubmit: args.finalValuesToSubmit,
    missing: args.missingRequired,
    automation: {
      provider: "playwright",
      status: "FAILED",
      message: args.message,
      finalReason: args.finalReason,
    },
  });
}

function describeResumeFailure(tempResume: Awaited<ReturnType<typeof writeResumeToTemp>>) {
  const resumeIssue = tempResume.debug.resumeIssue;

  if (resumeIssue === "invalid_resume_non_pdf") {
    return {
      httpStatus: 422,
      finalReason: "invalid_resume_non_pdf",
      errorCode: "RESUME_INVALID_NON_PDF",
      missingRequired: ["resume"] as string[],
      message:
        "Auto Apply requires a PDF resume. Please upload a PDF resume to continue.",
    };
  }

  if (resumeIssue === "resume_staging_failed") {
    return {
      httpStatus: 500,
      finalReason: "resume_staging_failed",
      errorCode: "RESUME_STAGING_FAILED",
      missingRequired: [] as string[],
      message:
        "We found a resume on your profile but could not prepare it for Auto Apply. Please re-upload a PDF resume and try again.",
    };
  }

  return {
    httpStatus: 409,
    finalReason: "missing_resume",
    errorCode: "RESUME_REQUIRED",
    missingRequired: ["resume"] as string[],
    message: "Resume required for Auto Apply. Please upload a resume to continue.",
  };
}

async function persistPreparationFailure(args: {
  application: LoadedApplication;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  missingRequired: string[];
  message: string;
  finalReason: string;
}) {
  await prisma.jobApplication.update({
    where: { id: args.application.id },
    data: {
      status: "IN_PREPARATION",
      answersJson: args.answers,
      failureReason: args.message,
      verificationRequired: false,
      auditJson: buildPreparationFailureAudit({
        application: args.application,
        applyProvider: args.applyProvider,
        finalValuesToSubmit: args.finalValuesToSubmit,
        missingRequired: args.missingRequired,
        message: args.message,
        finalReason: args.finalReason,
      }) as Prisma.InputJsonValue,
    },
  });
}

async function persistAutomationOutcome(args: {
  application: LoadedApplication;
  previousStatus: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  result: ApplyExecutionResult;
  phase: "background" | "foreground";
  applySessionId?: string;
}): Promise<PersistAutomationOutcomeResult> {
  const finalResult = coerceVerificationExecutionResult(
    applyFinalWriteGuard({
      result: args.result,
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      storageTarget: "jobApplication",
    }),
  );
  logAutoApplyDebug({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    phase: args.phase,
    result: finalResult,
  });
  logAutoApplyStopPoint({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    phase: args.phase,
    result: finalResult,
  });
  const nextAudit = buildAutomationAudit({
    existingAudit: args.application.auditJson,
    provider: args.applyProvider ?? args.application.source ?? "playwright",
    finalValuesToSubmit: args.finalValuesToSubmit,
    automation: {
      provider: "playwright",
      status: finalResult.status,
      finalUrl: finalResult.finalUrl ?? null,
      message: finalResult.message ?? null,
      finalReason: finalResult.debug.finalReason ?? null,
      formDetected: finalResult.debug.formDetected,
      confirmationDetected: finalResult.debug.confirmationDetected,
      verificationDetected:
        finalResult.needsHuman ?? finalResult.debug.verificationDetected,
      debug: {
        ...(readAutomationAudit(args.application.auditJson).state.debug ?? {}),
        ...finalResult.debug,
      },
    },
  });

  if (finalResult.ok) {
    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: finalResult.rawStatus,
      rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
      finalStatus: "SENT",
      finalSubmissionConfirmed: true,
      emailStatus: "PENDING",
      storageTarget: "jobApplication",
    });

    const updatedApplication = await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "SENT",
        submittedAt: new Date(),
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        submissionProof: {
          provider: "playwright",
          finalUrl: finalResult.finalUrl ?? null,
          confirmedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        failureReason: null,
        verificationRequired: false,
      },
      select: {
        id: true,
        status: true,
      },
    });

    const emailResult = await sendStatusChangeEmail({
      applicationId: updatedApplication.id,
      previousStatus: args.previousStatus,
      nextStatus: updatedApplication.status,
    });

    return {
      submissionStatus: "SUBMITTED",
      emailStatus: emailResult.emailStatus,
      message:
        emailResult.failureMessage ??
        finalResult.message ??
        "Application submitted successfully.",
      result: finalResult,
    };
  }

  if (isVerificationExecutionResult(finalResult)) {
    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: finalResult.rawStatus,
      rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
      finalStatus: VERIFICATION_REQUIRED_STATUS,
      finalSubmissionConfirmed: false,
      emailStatus: "SKIPPED",
      storageTarget: "jobApplication",
    });

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: VERIFICATION_REQUIRED_STATUS,
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: VERIFICATION_REQUIRED_MESSAGE,
        verificationRequired: true,
      },
    });

    return {
      submissionStatus: "NOT_SUBMITTED",
      emailStatus: "SKIPPED",
      message: VERIFICATION_REQUIRED_MESSAGE,
      result: {
        ...finalResult,
        status: VERIFICATION_REQUIRED_STATUS,
        message: VERIFICATION_REQUIRED_MESSAGE,
      },
    };
  }

  if (
    finalResult.status === "APPLY_NOT_STARTED" ||
    finalResult.status === "WAITING_HUMAN" ||
    finalResult.status === "AUTO_APPLY_UNAVAILABLE"
  ) {
    console.info(
      "[AUTO_APPLY_ROUTE] preventing READY_TO_SEND promotion for unresolved/search/verification stop point",
      {
        applicationId: args.application.id,
        status: finalResult.status,
        stopClassification: finalResult.debug?.stopClassification ?? null,
      },
    );

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: finalResult.status,
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason:
          finalResult.message ?? finalResult.debug.finalReason ?? null,
        verificationRequired:
          finalResult.status === "WAITING_HUMAN",
      },
    });

    return {
      submissionStatus: "NOT_SUBMITTED",
      emailStatus: "SKIPPED",
      message: finalResult.message,
      result: finalResult,
    };
  }

  logFinalWrite({
    applicationId: args.application.id,
    applySessionId: args.applySessionId,
    rawStatus: finalResult.rawStatus,
    rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
    finalStatus: "READY_TO_SEND",
    finalSubmissionConfirmed: false,
    emailStatus: "PENDING",
    storageTarget: "jobApplication",
  });

  const updatedApplication = await prisma.jobApplication.update({
    where: { id: args.application.id },
    data: {
      status: "READY_TO_SEND",
      answersJson: args.answers,
      auditJson: nextAudit as Prisma.InputJsonValue,
      failureReason:
        finalResult.message ?? finalResult.debug.finalReason ?? null,
      verificationRequired: Boolean(finalResult.needsHuman),
    },
    select: {
      id: true,
      status: true,
    },
  });

  const emailResult = await sendStatusChangeEmail({
    applicationId: updatedApplication.id,
    previousStatus: args.previousStatus,
    nextStatus: updatedApplication.status,
  });

  return {
    submissionStatus: "NOT_SUBMITTED",
    emailStatus: emailResult.emailStatus,
    message: finalResult.message,
    result: finalResult,
  };
}

async function runBackgroundApply(args: {
  application: LoadedApplication;
  applySessionId: string;
  applyProvider: string | null;
  answers: AnswersMap;
  finalValuesToSubmit: AnswersMap;
  targetUrl?: string;
  resolvedDirectUrl?: string | null;
  selectedStartSource?: string | null;
  adzunaResolverDebug?: Partial<ApplySessionDebug>;
  resumePath: string;
  urlResolution: DirectResolutionContext;
  strategyGuidance?: MatchedStrategyGuidance | null;
}) {
  try {
    let result = applyRouteLevelSubmissionGuard({
      rawResult: await applyWithPlaywright({
        jobUrl: args.application.jobUrl ?? "",
        form: args.targetUrl ? { embedUrl: args.targetUrl } : undefined,
        metadata: {
          applicationId: args.application.id,
          applySessionId: args.applySessionId,
          originalUrl: args.urlResolution.originalUrl,
          resolvedUrl: args.resolvedDirectUrl ?? args.urlResolution.resolvedDirectUrl,
          source: args.application.source,
          title: args.application.title ?? args.application.jobTitle,
          company: args.application.company,
          location: args.application.location,
          strategy: args.strategyGuidance
            ? {
                id: args.strategyGuidance.strategy.id ?? null,
                sourceHost: args.strategyGuidance.strategy.sourceHost ?? null,
                destinationHost:
                  args.strategyGuidance.strategy.destinationHost ?? null,
                strategyType:
                  args.strategyGuidance.strategy.strategyType ?? null,
                pageType: args.strategyGuidance.strategy.pageType ?? null,
                derivedInstruction:
                  args.strategyGuidance.derivedInstruction ?? null,
                automationPrompt:
                  args.strategyGuidance.automationPrompt ?? null,
                startUrl: args.strategyGuidance.startUrl ?? null,
                steps: args.strategyGuidance.sanitizedSteps,
              }
            : undefined,
          directJobResolution: {
            attempted:
              args.urlResolution.debug.directJobResolutionAttempted === true,
            confidence:
              args.urlResolution.debug.directJobResolutionConfidence,
            provider:
              args.urlResolution.debug.directJobResolutionProvider,
            matchReason:
              args.urlResolution.debug.directJobResolutionMatchReason,
            error: args.urlResolution.debug.directJobResolutionError,
            candidates:
              args.urlResolution.debug.directJobResolutionCandidates,
          },
        },
        values: args.finalValuesToSubmit,
        resumePath: args.resumePath,
        freshSession: true,
        onStatus: ({ status, lastUrl, error, message, openUrl, remoteSessionId }) => {
          const sessionStatus = status === "SUBMITTED" ? "WAITING_CONFIRMATION" : status;
          const sessionMessage =
            status === "SUBMITTED"
              ? "Verifying application submission."
              : message;
          updateSession(args.applySessionId, {
            status: sessionStatus,
            lastUrl: lastUrl ?? openUrl,
            error,
            message: sessionMessage,
            remoteSessionId,
          }, {
            caller: "runBackgroundApply.onStatus",
            sourcePath: "app/api/applications/[id]/apply/route.ts",
            phase: "background",
          });
        },
      }),
      applicationId: args.application.id,
      phase: "background",
      applySessionId: args.applySessionId,
    });
    const backgroundDomainMismatch = detectStopUrlDomainMismatch({
      application: args.application,
      result,
      originalJobUrl: args.urlResolution.originalUrl,
      resolvedDirectUrl: args.resolvedDirectUrl ?? args.urlResolution.resolvedDirectUrl,
      targetUrl: args.targetUrl,
    });
    if (backgroundDomainMismatch) {
      console.warn("[AUTO_APPLY_STOP_URL_DOMAIN_MISMATCH]", {
        applicationId: args.application.id,
        applySessionId: args.applySessionId,
        sourceJobId: args.application.sourceJobId ?? null,
        company: args.application.company ?? null,
        jobTitle: args.application.title ?? args.application.jobTitle ?? null,
        originalJobUrl: args.urlResolution.originalUrl ?? null,
        resolvedDirectUrl:
          args.resolvedDirectUrl ?? args.urlResolution.resolvedDirectUrl ?? null,
        targetUrl: args.targetUrl ?? result.debug.targetUrl ?? null,
        finalUrl: backgroundDomainMismatch.finalUrl,
        stoppedAtUrl: backgroundDomainMismatch.stoppedAtUrl,
        selectedStartSource: args.selectedStartSource ?? null,
        strategyId: args.strategyGuidance?.strategy.id ?? null,
        strategyDomain:
          args.strategyGuidance?.strategy.destinationHost ??
          args.strategyGuidance?.strategy.sourceHost ??
          null,
        currentBrowserUrl: backgroundDomainMismatch.currentBrowserUrl,
        expectedEmployerHost: backgroundDomainMismatch.expectedEmployerHost,
        finalHost: backgroundDomainMismatch.finalHost,
        mismatchReason: backgroundDomainMismatch.reason,
      });
      result = forceApplyNotStartedForDomainMismatch({
        result,
        mismatch: backgroundDomainMismatch,
      });
    }
    if (args.adzunaResolverDebug && Object.keys(args.adzunaResolverDebug).length > 0) {
      result = {
        ...result,
        debug: {
          ...result.debug,
          ...args.adzunaResolverDebug,
        },
      };
    }

    console.log("[AUTO_APPLY_ROUTE] background apply completed", {
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      status: result.status,
      finalUrl: result.finalUrl ?? null,
      submissionConfirmed: result.ok,
    });

    const persistedOutcome = await persistAutomationOutcome({
      application: args.application,
      previousStatus: args.application.status,
      applyProvider: args.applyProvider,
      answers: args.answers,
      finalValuesToSubmit: args.finalValuesToSubmit,
      result,
      phase: "background",
      applySessionId: args.applySessionId,
    });
    await recordMatchedStrategyOutcome({
      application: args.application,
      strategyGuidance: args.strategyGuidance,
      result: persistedOutcome.result,
      phase: "background",
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
    });

    const finalResult = ensureTerminalApplySessionResult({
      result: persistedOutcome.result,
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
    });
    const finalErrorCode = inferExecutionErrorCode({
      result: finalResult,
      message: persistedOutcome.message ?? finalResult.message ?? null,
    });
    const finalSessionMessage = buildErrorMessageWithCode({
      errorCode: finalErrorCode,
      message: persistedOutcome.message ?? finalResult.message ?? null,
    });
    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: finalResult.rawStatus,
      rawSubmissionConfirmed: finalResult.rawSubmissionConfirmed,
      finalStatus: finalResult.status,
      finalSubmissionConfirmed: finalResult.ok,
      emailStatus: persistedOutcome.emailStatus,
      storageTarget: "applySession",
    });
    const latestSessionUrl =
      pickMostRecentStopUrl({
        stopPointStoppedAtUrl: finalResult.debug.stoppedAtUrl ?? null,
        stopPointCurrentUrl: finalResult.debug.currentUrl ?? null,
        browserFinalUrl: finalResult.finalUrl ?? null,
        scrapflyResolvedUrl:
          finalResult.debug.adzunaScrapflyResolvedUrl ??
          finalResult.debug.adzunaPostLoginResolvedDirectUrl ??
          null,
        resolvedDirectUrl:
          finalResult.debug.resolvedDirectUrl ??
          args.resolvedDirectUrl ??
          args.urlResolution.resolvedDirectUrl ??
          null,
        targetUrl: args.targetUrl ?? finalResult.debug.targetUrl ?? null,
        originalJobUrl:
          finalResult.debug.originalJobUrl ??
          args.urlResolution.originalUrl ??
          null,
      }) ??
      finalResult.finalUrl ??
      args.targetUrl ??
      null;

    updateSession(args.applySessionId, {
      status: finalResult.status,
      lastUrl: latestSessionUrl ?? undefined,
      error: finalResult.ok ? undefined : finalSessionMessage ?? finalResult.message,
      message: finalSessionMessage ?? persistedOutcome.message ?? finalResult.message,
      errorCode: finalErrorCode ?? undefined,
      submissionStatus: persistedOutcome.submissionStatus,
      emailStatus: persistedOutcome.emailStatus,
      debug: {
        ...finalResult.debug,
        latestUrl: latestSessionUrl ?? undefined,
        stoppedAtUrl:
          finalResult.debug.stoppedAtUrl ??
          latestSessionUrl ??
          undefined,
      },
    }, {
      caller: "runBackgroundApply.finalizeSession",
      sourcePath: "app/api/applications/[id]/apply/route.ts",
      phase: "background",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Playwright automation failed.";
    const errorCode = inferApplyAutomationErrorCode({
      status: "FAILED",
      message,
      finalReason: message,
    });
    const normalizedMessage =
      buildErrorMessageWithCode({
        errorCode,
        message,
      }) ?? message;

    console.error("[AUTO_APPLY_PLAYWRIGHT] background apply failed", {
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      error: normalizedMessage,
    });

    await recordMatchedStrategyOutcome({
      application: args.application,
      strategyGuidance: args.strategyGuidance,
      result: {
        ok: false,
        status: "FAILED",
        message: normalizedMessage,
        debug: { finalReason: normalizedMessage },
        rawStatus: "FAILED",
        rawSubmissionConfirmed: false,
      },
      phase: "background",
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
    });

    const existingAudit = readAutomationAudit(args.application.auditJson).audit;
    const nextAudit = buildAutomationAudit({
      existingAudit,
      provider: args.applyProvider ?? args.application.source ?? "playwright",
      finalValuesToSubmit: args.finalValuesToSubmit,
      automation: {
        provider: "playwright",
        status: "FAILED",
        message: normalizedMessage,
        finalReason: "playwright_error",
      },
    });

    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: "FAILED",
      rawSubmissionConfirmed: false,
      finalStatus: "READY_TO_SEND",
      finalSubmissionConfirmed: false,
      emailStatus: "SKIPPED",
      storageTarget: "jobApplication",
    });

    await prisma.jobApplication.update({
      where: { id: args.application.id },
      data: {
        status: "READY_TO_SEND",
        answersJson: args.answers,
        auditJson: nextAudit as Prisma.InputJsonValue,
        failureReason: normalizedMessage,
        verificationRequired: false,
      },
    });

    logFinalWrite({
      applicationId: args.application.id,
      applySessionId: args.applySessionId,
      rawStatus: "FAILED",
      rawSubmissionConfirmed: false,
      finalStatus: "FAILED",
      finalSubmissionConfirmed: false,
      emailStatus: "SKIPPED",
      storageTarget: "applySession",
    });

    updateSession(args.applySessionId, {
      status: "FAILED",
      error: normalizedMessage,
      message: normalizedMessage,
      errorCode: errorCode ?? undefined,
      submissionStatus: "NOT_SUBMITTED",
      emailStatus: "SKIPPED",
      debug: { finalReason: normalizedMessage },
    }, {
      caller: "runBackgroundApply.catch",
      sourcePath: "app/api/applications/[id]/apply/route.ts",
      phase: "background",
    });
  } finally {
    await unlink(args.resumePath).catch(() => undefined);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const sessionEmail = session?.user?.email ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const body = (await req.json()) as ApplyBody;

    console.log("[AUTO_APPLY_ROUTE] POST /api/applications/[id]/apply", {
      applicationId: id,
      route: `/api/applications/${id}/apply`,
      sessionUserId: userId,
      sessionEmail,
      background: Boolean(body.background),
      answerCount: Object.keys(body.answers ?? {}).length,
    });

    let foundApplication = await findApplicationForUser(id, userId);
    if (!foundApplication) {
      // Small retry to absorb occasional create->apply race timing.
      await delay(150);
      foundApplication = await findApplicationForUser(id, userId);
    }

    if (!foundApplication) {
      console.warn("[AUTO_APPLY_ROUTE] application lookup failed", {
        applicationId: id,
        sessionUserId: userId,
        route: `/api/applications/${id}/apply`,
      });
      return NextResponse.json(
        { ok: false, error: "Application not found" },
        { status: 404 },
      );
    }

    let application: LoadedApplication = foundApplication;

    if (!application.jobUrl) {
      return NextResponse.json(
        { ok: false, error: "Application missing jobUrl" },
        { status: 400 },
      );
    }

    const directResolution = await resolveApplicationDirectJobUrl({
      application,
    });
    const urlResolution = directResolution.context;
    application = urlResolution.application;

    if (directResolution.blocked) {
      const resolverStopClassification: ApplyStopClassification = {
        reason: "real_posting_not_found",
        pageType: "resolver_failure",
        suggestedAction: "open_original_job_site",
      };
      const errorCode =
        inferApplyAutomationErrorCode({
          errorCode: directResolution.errorCode,
          stopClassification: resolverStopClassification,
          status: "APPLY_NOT_STARTED",
          message: directResolution.message,
          finalReason: directResolution.failureReason,
        }) ?? "REAL_POSTING_NOT_FOUND";
      const message = buildErrorMessageWithCode({
        errorCode,
        message: directResolution.message,
      });

      return NextResponse.json(
        {
          ok: false,
          status: "APPLY_NOT_STARTED",
          error: message ?? directResolution.failureReason,
          message: message ?? directResolution.message,
          errorCode,
          stopClassification: resolverStopClassification,
          suggestedAction: resolverStopClassification.suggestedAction,
          ...buildUrlDecisionFields(urlResolution.debug),
        },
        { status: 409 },
      );
    }

    const prepared = await prepareAutomationInput({
      application,
      requestAnswers: body.answers,
    });
    const initialRoutingDecision = selectInitialAutomationTarget({
      sourceProvider: application.source,
      candidates: [
        {
          label: "resolved_direct_url",
          url: urlResolution.resolvedDirectUrl,
        },
        {
          label: "prepared_target_url",
          url: prepared.targetUrl,
        },
        {
          label: "application_job_url",
          url: application.jobUrl,
        },
        {
          label: "original_job_url",
          url: urlResolution.originalUrl,
        },
      ],
    });

    if (initialRoutingDecision.aggregatorSourceDetected) {
      console.info("[AUTO_APPLY_ROUTE] aggregator source detected", {
        applicationId: application.id,
        source: application.source ?? null,
        originalUrl: urlResolution.originalUrl ?? null,
      });
    }

    if (initialRoutingDecision.rejectedCandidates.length > 0) {
      console.info("[AUTO_APPLY_ROUTE] invalid start URL rejected", {
        applicationId: application.id,
        rejectedCandidates: initialRoutingDecision.rejectedCandidates,
      });
    }

    const rawMatchedStrategyGuidance = initialRoutingDecision.selectedUrl
      ? await resolveMatchedStrategyGuidance({
          application,
          sourceUrl: urlResolution.originalUrl || application.jobUrl,
          targetUrl: initialRoutingDecision.selectedUrl,
        })
      : null;
    const strategyDomainRejection = rejectStrategyForDomainMismatch({
      application,
      originalUrl: urlResolution.originalUrl,
      resolvedDirectUrl: urlResolution.resolvedDirectUrl,
      expectedTargetUrl: initialRoutingDecision.selectedUrl,
      guidance: rawMatchedStrategyGuidance,
    });
    const matchedStrategyGuidance = strategyDomainRejection
      ? null
      : rawMatchedStrategyGuidance;
    const finalRoutingDecision = selectInitialAutomationTarget({
      sourceProvider: application.source,
      candidates: [
        {
          label: "strategy_start_url",
          url: matchedStrategyGuidance?.startUrl,
        },
        {
          label: "initial_selected_url",
          url: initialRoutingDecision.selectedUrl,
        },
        {
          label: "resolved_direct_url",
          url: urlResolution.resolvedDirectUrl,
        },
        {
          label: "prepared_target_url",
          url: prepared.targetUrl,
        },
        {
          label: "application_job_url",
          url: application.jobUrl,
        },
        {
          label: "original_job_url",
          url: urlResolution.originalUrl,
        },
      ],
    });
    let effectiveTargetUrl = finalRoutingDecision.selectedUrl;
    let effectiveResolvedDirectUrl = urlResolution.resolvedDirectUrl ?? null;
    let effectiveUsedResolvedDirectUrl =
      urlResolution.usedResolvedDirectUrl === true;
    let effectiveRequiresEcosiaSearch = finalRoutingDecision.requiresEcosiaSearch;
    let selectedStartSource: string | null =
      finalRoutingDecision.selectedFrom ?? null;
    const directResolutionSearchProvider = String(
      urlResolution.resolution?.searchProvider ?? "",
    )
      .trim()
      .toLowerCase();
    if (
      directResolutionSearchProvider === "serpapi_google" &&
      isValidResolvedAutomationStartUrl(effectiveResolvedDirectUrl) &&
      normalizeJobUrl(effectiveTargetUrl ?? "") ===
        normalizeJobUrl(effectiveResolvedDirectUrl ?? "")
    ) {
      selectedStartSource = "serpapi_google";
      effectiveRequiresEcosiaSearch = false;
      effectiveUsedResolvedDirectUrl = true;
    }
    const configuredRemoteBrowserProvider =
      process.env.REMOTE_BROWSER_PROVIDER?.trim().toLowerCase() || "local";
    const adzunaHandoffUrlCandidates = [
      finalRoutingDecision.selectedUrl,
      initialRoutingDecision.selectedUrl,
      effectiveTargetUrl,
      prepared.targetUrl,
      application.jobUrl,
      urlResolution.originalUrl,
      urlResolution.resolvedDirectUrl,
    ];
    const adzunaHandoffUrl = findAdzunaHandoffUrl({
      source: application.source,
      jobUrl: effectiveTargetUrl,
      urlCandidates: adzunaHandoffUrlCandidates,
    });
    const isAdzunaHandoff = isAdzunaApplySource({
      source: application.source,
      jobUrl: effectiveTargetUrl,
      urlCandidates: adzunaHandoffUrlCandidates,
    });
    if (
      isAdzunaHandoff &&
      !isValidResolvedAutomationStartUrl(effectiveTargetUrl) &&
      isValidResolvedAutomationStartUrl(effectiveResolvedDirectUrl)
    ) {
      effectiveTargetUrl = normalizeJobUrl(effectiveResolvedDirectUrl ?? "");
      selectedStartSource = "resolved_direct_url";
      effectiveRequiresEcosiaSearch = false;
    }
    const hasScrapflyApiKey = Boolean(process.env.SCRAPFLY_API_KEY?.trim());
    const adzunaHandoffUsesScrapfly = Boolean(
      isAdzunaHandoff && hasScrapflyApiKey,
    );
    const hasDirectResolvedStartUrl = Boolean(
      isValidResolvedAutomationStartUrl(effectiveTargetUrl) ||
        isValidResolvedAutomationStartUrl(effectiveResolvedDirectUrl),
    );
    const shouldAttemptAdzunaScrapflyResolution = Boolean(
      adzunaHandoffUsesScrapfly &&
        adzunaHandoffUrl &&
        !hasDirectResolvedStartUrl,
    );
    const adzunaResolverDebug: Partial<ApplySessionDebug> = {
      remoteBrowserProvider: adzunaHandoffUsesScrapfly
        ? "scrapfly"
        : configuredRemoteBrowserProvider,
      scrapflyAttempted: shouldAttemptAdzunaScrapflyResolution,
      adzunaScrapflyResolutionAttempted: shouldAttemptAdzunaScrapflyResolution,
      adzunaHandoffAttempted: isAdzunaHandoff,
    };
    console.info("[REMOTE_BROWSER] provider selected", {
      provider: adzunaHandoffUsesScrapfly
        ? "scrapfly"
        : configuredRemoteBrowserProvider,
      scrapflyApiKeyPresent: hasScrapflyApiKey,
      isAdzunaHandoff,
      adzunaHandoffUrl,
      isAdzunaTarget: Boolean(adzunaHandoffUrl),
      hasDirectResolvedStartUrl,
      shouldAttemptAdzunaScrapflyResolution,
    });
    if (isAdzunaHandoff && hasDirectResolvedStartUrl) {
      console.info("[AUTO_APPLY_ROUTE] using resolved employer URL from SerpAPI Google/direct search", {
        applicationId: application.id,
        source: application.source ?? null,
        originalUrl: urlResolution.originalUrl ?? null,
        resolvedDirectUrl: effectiveResolvedDirectUrl,
        targetUrl: effectiveTargetUrl,
        selectedStartSource,
      });
    } else if (isAdzunaHandoff && shouldAttemptAdzunaScrapflyResolution) {
      console.info("[AUTO_APPLY_ROUTE] direct search failed, falling back to Adzuna handoff", {
        applicationId: application.id,
        source: application.source ?? null,
        originalUrl: urlResolution.originalUrl ?? null,
        directJobResolutionError: urlResolution.debug.directJobResolutionError ?? null,
        directJobResolutionProvider:
          urlResolution.debug.directJobResolutionSearchProvider ?? null,
        adzunaHandoffUrl,
      });
    }

    let earlyStop:
      | {
          status: ApplySessionStatus;
          message: string;
          errorCode?: string;
          stopClassification: ApplyStopClassification;
          suggestedAction: string;
          stoppedAtUrl: string;
          stoppedAtTitle?: string | null;
          lastActionText?: string | null;
          scrapflySessionId?: string;
          selectedStopSource?: ApplySessionDebug["selectedStopSource"];
        }
      | null = null;

    if (isAdzunaHandoff && !hasScrapflyApiKey && !hasDirectResolvedStartUrl) {
      console.warn("[SCRAPFLY_BROWSER] missing SCRAPFLY_API_KEY", {
        provider: "scrapfly",
        applicationId: application.id,
        isAdzunaHandoff: true,
      });
      const query = buildManualJobSearchQuery({
        title: application.title ?? application.jobTitle,
        company: application.company,
        location: application.location,
        queries: urlResolution.debug.directJobResolutionQueries,
      });
      const searchUrl = buildManualJobSearchUrl(query);
      earlyStop = {
        status: "APPLY_NOT_STARTED",
        message:
          "Scrapfly is selected as the remote browser provider, but SCRAPFLY_API_KEY is missing.",
        errorCode: "REMOTE_PROVIDER_UNAVAILABLE",
        stopClassification: {
          reason: "real_posting_not_found",
          pageType: "resolver_failure",
          suggestedAction: "open_original_job_site",
        },
        suggestedAction: "configure_scrapfly",
        stoppedAtUrl: searchUrl,
        selectedStopSource: "search_url",
      };
      adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
      adzunaResolverDebug.selectedStopSource = "search_url";
    }

    if (shouldAttemptAdzunaScrapflyResolution && adzunaHandoffUrl) {
      const scrapflyResolution = await resolveAdzunaHandoffWithScrapfly({
        adzunaUrl: adzunaHandoffUrl,
        applicationId: application.id,
        applySessionId: null,
        sourceJobId: application.sourceJobId ?? null,
        title: application.title ?? application.jobTitle ?? null,
        company: application.company ?? null,
        location: application.location ?? null,
      });

      adzunaResolverDebug.adzunaScrapflyResolutionAttempted = true;
      adzunaResolverDebug.scrapflyAttempted = true;
      adzunaResolverDebug.adzunaHandoffAttempted = true;
      adzunaResolverDebug.adzunaScrapflyCandidates =
        scrapflyResolution.candidates;
      adzunaResolverDebug.adzunaScrapflyUrlsVisited =
        scrapflyResolution.urlsVisited;
      adzunaResolverDebug.scrapflySessionId = scrapflyResolution.sessionId;
      adzunaResolverDebug.handoffClickAttempted =
        scrapflyResolution.handoffClickAttempted;
      adzunaResolverDebug.handoffClickMethod =
        scrapflyResolution.handoffClickMethod;
      adzunaResolverDebug.handoffClickUrl =
        scrapflyResolution.handoffClickUrl;
      adzunaResolverDebug.handoffClickText =
        scrapflyResolution.handoffClickText;
      adzunaResolverDebug.handoffBeforeUrl =
        scrapflyResolution.handoffBeforeUrl;
      adzunaResolverDebug.handoffAfterUrl =
        scrapflyResolution.handoffAfterUrl;
      adzunaResolverDebug.continuationAttempted =
        scrapflyResolution.continuationAttempted;
      adzunaResolverDebug.continuationText =
        scrapflyResolution.continuationText;
      adzunaResolverDebug.continuationHref =
        scrapflyResolution.continuationHref;
      adzunaResolverDebug.directGotoFallbackAttempted =
        scrapflyResolution.directGotoFallbackAttempted;
      adzunaResolverDebug.directGotoFallbackReason =
        scrapflyResolution.directGotoFallbackReason;
      adzunaResolverDebug.directGotoResponseUrl =
        scrapflyResolution.directGotoResponseUrl;
      adzunaResolverDebug.directGotoStatus =
        scrapflyResolution.directGotoStatus;
      adzunaResolverDebug.handoffPopupUrl =
        scrapflyResolution.handoffPopupUrl ?? undefined;
      adzunaResolverDebug.handoffFinalUrl =
        scrapflyResolution.handoffFinalUrl;
      adzunaResolverDebug.handoffLeftAdzunaDomain =
        scrapflyResolution.handoffLeftAdzunaDomain;
      adzunaResolverDebug.handoffResponseStatus =
        scrapflyResolution.handoffResponseStatus;
      adzunaResolverDebug.handoffPageTitle =
        scrapflyResolution.handoffPageTitle;
      adzunaResolverDebug.errorCode = scrapflyResolution.errorCode;
      adzunaResolverDebug.adzunaHandoffAccessDenied =
        scrapflyResolution.adzunaHandoffAccessDenied;
      adzunaResolverDebug.adzunaLoginContinueGateDetected =
        scrapflyResolution.adzunaLoginContinueGateDetected;
      adzunaResolverDebug.adzunaSuspiciousBehaviorGateDetected =
        scrapflyResolution.adzunaSuspiciousBehaviorGateDetected;
      adzunaResolverDebug.adzunaLoginToContinueAvailable =
        scrapflyResolution.adzunaLoginToContinueAvailable;
      adzunaResolverDebug.adzunaAuthenticateUrl =
        scrapflyResolution.adzunaAuthenticateUrl;
      adzunaResolverDebug.adzunaLoginToContinueClicked =
        scrapflyResolution.adzunaLoginToContinueClicked;
      adzunaResolverDebug.adzunaLoginPageDetected =
        scrapflyResolution.adzunaLoginPageDetected;
      adzunaResolverDebug.adzunaCredentialAvailable =
        scrapflyResolution.adzunaCredentialAvailable;
      adzunaResolverDebug.adzunaLoginAttempted =
        scrapflyResolution.adzunaLoginAttempted;
      adzunaResolverDebug.adzunaLoginSucceeded =
        scrapflyResolution.adzunaLoginSucceeded;
      adzunaResolverDebug.adzunaLoginFailedReason =
        scrapflyResolution.adzunaLoginFailedReason;
      adzunaResolverDebug.adzunaPostLoginHandoffRetried =
        scrapflyResolution.adzunaPostLoginHandoffRetried;
      adzunaResolverDebug.adzunaPostLoginResolvedDirectUrl =
        scrapflyResolution.adzunaPostLoginResolvedDirectUrl;
      adzunaResolverDebug.manualContinuationRequired =
        scrapflyResolution.manualContinuationRequired;
      adzunaResolverDebug.suggestedAction = scrapflyResolution.suggestedAction;
      adzunaResolverDebug.downstreamCandidateCount =
        scrapflyResolution.downstreamCandidateCount;
      adzunaResolverDebug.rejectedTrackingCandidateCount =
        scrapflyResolution.rejectedTrackingCandidateCount;
      adzunaResolverDebug.rejectedFinalCandidateReasons =
        scrapflyResolution.rejectedFinalCandidateReasons;
      adzunaResolverDebug.unresolvedReason =
        scrapflyResolution.unresolvedReason;
      adzunaResolverDebug.adzunaFinalFailureReason =
        scrapflyResolution.reason;
      console.info(
        "[AUTO_APPLY_ROUTE] Step 1 completed: Adzuna Scrapfly resolver return shape inspected/updated",
      );

      const scrapflyResolvedDownstreamUrl =
        pickDownstreamUrlFromAdzunaScrapflyResult(scrapflyResolution);
      if (scrapflyResolvedDownstreamUrl) {
        effectiveResolvedDirectUrl = scrapflyResolvedDownstreamUrl;
        effectiveTargetUrl = scrapflyResolvedDownstreamUrl;
        effectiveUsedResolvedDirectUrl = true;
        effectiveRequiresEcosiaSearch = false;
        selectedStartSource = "adzuna_scrapfly_resolver";
        adzunaResolverDebug.resolvedDirectUrl = scrapflyResolvedDownstreamUrl;
        adzunaResolverDebug.usedResolvedDirectUrl = true;
        adzunaResolverDebug.adzunaScrapflyResolvedUrl =
          scrapflyResolvedDownstreamUrl;
        adzunaResolverDebug.finalChosenUrlKind =
          classifyJobUrlKind(scrapflyResolvedDownstreamUrl);
        console.info(
          "[AUTO_APPLY_ROUTE] Adzuna Scrapfly resolved downstream URL accepted",
          {
            applicationId: application.id,
            originalUrl: urlResolution.originalUrl ?? null,
            resolvedDirectUrl: effectiveResolvedDirectUrl,
            targetUrl: effectiveTargetUrl,
            selectedStartSource,
            scrapflySessionId: scrapflyResolution.sessionId ?? null,
            resolutionStatus: scrapflyResolution.ok ? "ok" : "stop_required",
          },
        );
      }

      if (scrapflyResolution.ok) {
        effectiveTargetUrl = scrapflyResolution.resolvedUrl;
        effectiveResolvedDirectUrl = scrapflyResolution.resolvedUrl;
        effectiveUsedResolvedDirectUrl = true;
        effectiveRequiresEcosiaSearch = false;
        selectedStartSource = "adzuna_scrapfly_resolver";
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = true;
        adzunaResolverDebug.adzunaScrapflyResolvedUrl =
          scrapflyResolution.resolvedUrl;
        adzunaResolverDebug.resolvedDirectUrl =
          scrapflyResolution.resolvedUrl;
        adzunaResolverDebug.usedResolvedDirectUrl = true;
        adzunaResolverDebug.finalChosenUrlKind =
          classifyJobUrlKind(scrapflyResolution.resolvedUrl);
        adzunaResolverDebug.adzunaScrapflyResolutionMethod =
          scrapflyResolution.method;
        adzunaResolverDebug.selectedStopSource = "scrapfly_resolved_url";
      } else if (scrapflyResolution.verificationRequired) {
        const verificationUrl =
          scrapflyResolution.stoppedAtUrl ??
          adzunaHandoffUrl;
        earlyStop = {
          status: VERIFICATION_REQUIRED_STATUS,
          message: APPLY_VERIFICATION_REQUIRED_USER_MESSAGE,
          stopClassification: {
            reason: "verification_required",
            pageType: "human_verification_gate",
            suggestedAction: "complete_verification",
          },
          suggestedAction: "complete_verification",
          stoppedAtUrl: verificationUrl,
          stoppedAtTitle: "Human verification required",
          lastActionText:
            scrapflyResolution.reason ??
            scrapflyResolution.error,
          scrapflySessionId: scrapflyResolution.sessionId,
          selectedStopSource: "verification_required",
        };
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
        adzunaResolverDebug.selectedStopSource = "verification_required";
      } else if (
        scrapflyResolution.manualContinuationRequired ||
        scrapflyResolution.errorCode === ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE
      ) {
        const loginStopUrl =
          scrapflyResolution.stoppedAtUrl ??
          adzunaHandoffUrl;
        earlyStop = {
          status: "WAITING_HUMAN",
          message:
            'Adzuna requires login before Hirexa can continue. Complete "Login to continue", then resume.',
          errorCode: ADZUNA_LOGIN_TO_CONTINUE_REQUIRED_CODE,
          stopClassification: {
            reason: "login_required",
            pageType: "adzuna_login_continue_gate",
            suggestedAction: "login_to_continue",
          },
          suggestedAction: "login_to_continue",
          stoppedAtUrl: loginStopUrl,
          stoppedAtTitle: "Login to continue",
          lastActionText:
            scrapflyResolution.reason ??
            scrapflyResolution.error,
          scrapflySessionId: scrapflyResolution.sessionId,
        };
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
      } else if (scrapflyResolution.loginRequired) {
        const loginStopUrl =
          scrapflyResolution.stoppedAtUrl ??
          adzunaHandoffUrl;
        earlyStop = {
          status: "WAITING_HUMAN",
          message:
            "Sign in is required before Hirexa can continue. Complete login, then resume.",
          stopClassification: {
            reason: "login_required",
            pageType: "auth_gate",
            suggestedAction: "sign_in_and_retry",
          },
          suggestedAction: "sign_in_and_retry",
          stoppedAtUrl: loginStopUrl,
          stoppedAtTitle: "Sign in required",
          lastActionText:
            scrapflyResolution.reason ??
            scrapflyResolution.error,
          scrapflySessionId: scrapflyResolution.sessionId,
        };
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
      } else if (
        scrapflyResolution.errorCode === ADZUNA_HANDOFF_RATE_LIMITED_CODE ||
        scrapflyResolution.reason === "adzuna_handoff_rate_limited" ||
        scrapflyResolution.reason === "adzuna_rate_limited"
      ) {
        const rateLimitedStopUrl =
          scrapflyResolution.stoppedAtUrl ??
          scrapflyResolution.handoffFinalUrl ??
          adzunaHandoffUrl;
        earlyStop = {
          status: "WAITING_HUMAN",
          message:
            "Adzuna rate limited the handoff before Hirexa could reach the employer posting.",
          errorCode: ADZUNA_HANDOFF_RATE_LIMITED_CODE,
          stopClassification: {
            reason: "adzuna_rate_limited",
            pageType: "adzuna_rate_limited",
            suggestedAction: "try_again_later_or_employer_direct_search",
          },
          suggestedAction: "try_again_later_or_employer_direct_search",
          stoppedAtUrl: rateLimitedStopUrl,
          stoppedAtTitle:
            scrapflyResolution.handoffPageTitle ?? "Adzuna rate limited",
          lastActionText: "adzuna_handoff_rate_limited",
          scrapflySessionId: scrapflyResolution.sessionId,
          selectedStopSource: "scrapfly_resolved_url",
        };
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
        adzunaResolverDebug.selectedStopSource = "scrapfly_resolved_url";
      } else if (
        scrapflyResolution.errorCode === ADZUNA_HANDOFF_ACCESS_DENIED_CODE ||
        scrapflyResolution.reason === "adzuna_handoff_access_denied" ||
        scrapflyResolution.adzunaHandoffAccessDenied === true
      ) {
        console.info("[ADZUNA_SCRAPFLY_NAVIGATOR] fallback to employer direct search", {
          reason: "adzuna_handoff_access_denied",
          title: application.title ?? application.jobTitle ?? null,
          company: application.company ?? null,
          location: application.location ?? null,
        });
        console.info("[DIRECT_JOB_RESOLVER] fallback after adzuna access denied", {
          applicationId: application.id,
          sourceJobId: application.sourceJobId ?? null,
          source: application.source ?? null,
          currentUrl: urlResolution.originalUrl ?? application.jobUrl ?? null,
        });

        const accessDeniedFallbackResolution = await resolveDirectJobUrl({
          title: application.title ?? application.jobTitle,
          company: application.company,
          location: application.location,
          currentUrl:
            urlResolution.originalUrl ??
            application.jobUrl ??
            adzunaHandoffUrl,
          source: application.source,
          sourceJobId: application.sourceJobId ?? null,
          preferredDirectUrl: effectiveResolvedDirectUrl ?? urlResolution.resolvedDirectUrl,
          applicationId: application.id,
        });

        adzunaResolverDebug.directJobResolutionAttempted = true;
        adzunaResolverDebug.directJobResolutionQueries =
          accessDeniedFallbackResolution.queries ??
          adzunaResolverDebug.directJobResolutionQueries;
        adzunaResolverDebug.directJobResolutionNormalizedLocation =
          accessDeniedFallbackResolution.normalizedLocation ??
          adzunaResolverDebug.directJobResolutionNormalizedLocation;
        adzunaResolverDebug.directJobResolutionSearchProvider =
          accessDeniedFallbackResolution.searchProvider ??
          adzunaResolverDebug.directJobResolutionSearchProvider;
        adzunaResolverDebug.directJobResolutionConfidence =
          accessDeniedFallbackResolution.confidence ??
          adzunaResolverDebug.directJobResolutionConfidence;
        adzunaResolverDebug.directJobResolutionProvider =
          accessDeniedFallbackResolution.provider ??
          adzunaResolverDebug.directJobResolutionProvider;
        adzunaResolverDebug.directJobResolutionMatchReason =
          accessDeniedFallbackResolution.matchReason ??
          adzunaResolverDebug.directJobResolutionMatchReason;
        adzunaResolverDebug.directJobResolutionError =
          accessDeniedFallbackResolution.error ??
          adzunaResolverDebug.directJobResolutionError;
        adzunaResolverDebug.directJobResolutionCandidates =
          accessDeniedFallbackResolution.candidates ??
          adzunaResolverDebug.directJobResolutionCandidates;

        const fallbackResolvedUrl = normalizeJobUrl(
          accessDeniedFallbackResolution.resolvedUrl ?? "",
        );
        if (
          accessDeniedFallbackResolution.ok &&
          fallbackResolvedUrl &&
          !isAdzunaUrl(fallbackResolvedUrl)
        ) {
          console.info("[DIRECT_JOB_RESOLVER] candidate accepted", {
            resolvedDirectUrl: fallbackResolvedUrl,
            confidence: accessDeniedFallbackResolution.confidence ?? null,
            provider: accessDeniedFallbackResolution.provider ?? null,
            reason: accessDeniedFallbackResolution.matchReason ?? null,
          });
          effectiveTargetUrl = fallbackResolvedUrl;
          effectiveResolvedDirectUrl = fallbackResolvedUrl;
          effectiveUsedResolvedDirectUrl = true;
          effectiveRequiresEcosiaSearch = false;
          selectedStartSource = "resolved_direct_url";
          adzunaResolverDebug.resolvedDirectUrl = fallbackResolvedUrl;
          adzunaResolverDebug.usedResolvedDirectUrl = true;
          adzunaResolverDebug.finalChosenUrlKind =
            classifyJobUrlKind(fallbackResolvedUrl);
          adzunaResolverDebug.selectedStopSource = "scrapfly_resolved_url";
          adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
        } else {
          const fallbackCandidates =
            accessDeniedFallbackResolution.candidates ?? [];
          for (const candidate of fallbackCandidates.slice(0, 5)) {
            console.info("[DIRECT_JOB_RESOLVER] candidate rejected", {
              url: candidate.url,
              confidence: candidate.confidence,
              reason: candidate.reason,
            });
          }
          console.warn("[DIRECT_JOB_RESOLVER] no employer posting found", {
            applicationId: application.id,
            sourceJobId: application.sourceJobId ?? null,
            source: application.source ?? null,
            error: accessDeniedFallbackResolution.error ?? null,
            queryCount: accessDeniedFallbackResolution.queries?.length ?? 0,
          });
          const query = buildManualJobSearchQuery({
            title: application.title ?? application.jobTitle,
            company: application.company,
            location: application.location,
            queries:
              accessDeniedFallbackResolution.queries ??
              urlResolution.debug.directJobResolutionQueries,
          });
          const searchUrl = buildManualJobSearchUrl(query);
          const bestCandidate = [...fallbackCandidates].sort(
            (left, right) => right.confidence - left.confidence,
          )[0];
          const selectedStopUrl = bestCandidate?.url || searchUrl;
          const selectedStopSource = bestCandidate
            ? ("low_confidence_candidate" as const)
            : ("search_url" as const);
          earlyStop = {
            status: "APPLY_NOT_STARTED",
            message:
              "Adzuna blocked the handoff page and Hirexa could not confirm a real employer posting.",
            errorCode: ADZUNA_HANDOFF_ACCESS_DENIED_CODE,
            stopClassification: {
              reason: "real_posting_not_found",
              pageType: "aggregator",
              suggestedAction: "open_original_job_site",
            },
            suggestedAction: "open_original_job_site",
            stoppedAtUrl: selectedStopUrl,
            lastActionText:
              scrapflyResolution.reason ??
              scrapflyResolution.error,
            scrapflySessionId: scrapflyResolution.sessionId,
            selectedStopSource,
          };
          console.warn("[AUTO_APPLY_ROUTE] final stop", {
            status: "APPLY_NOT_STARTED",
            errorCode: ADZUNA_HANDOFF_ACCESS_DENIED_CODE,
            realPostingFound: false,
            stoppedAtUrl: selectedStopUrl,
          });
          adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
          adzunaResolverDebug.selectedStopSource = selectedStopSource;
        }
      } else {
        const query = buildManualJobSearchQuery({
          title: application.title ?? application.jobTitle,
          company: application.company,
          location: application.location,
          queries: urlResolution.debug.directJobResolutionQueries,
        });
        const searchUrl = buildManualJobSearchUrl(query);
        const bestCandidate = [...scrapflyResolution.candidates].sort(
          (left, right) => right.score - left.score,
        )[0];
        const selectedStopUrl = bestCandidate?.url || searchUrl;
        const selectedStopSource = bestCandidate
          ? ("low_confidence_candidate" as const)
          : ("search_url" as const);
        earlyStop = {
          status: "APPLY_NOT_STARTED",
          message:
            "Could not confirm the real employer posting. Open the suggested result and retry.",
          errorCode: REAL_POSTING_NOT_FOUND_CODE,
          stopClassification: {
            reason: "real_posting_not_found",
            pageType: "aggregator",
            suggestedAction: "open_original_job_site",
          },
          suggestedAction: "open_original_job_site",
          stoppedAtUrl: selectedStopUrl,
          lastActionText:
            scrapflyResolution.reason ??
            scrapflyResolution.error,
          scrapflySessionId: scrapflyResolution.sessionId,
          selectedStopSource,
        };
        adzunaResolverDebug.adzunaScrapflyResolutionSucceeded = false;
        adzunaResolverDebug.selectedStopSource = selectedStopSource;
      }
    }

    if (
      !earlyStop &&
      isAdzunaHandoff &&
      effectiveTargetUrl &&
      isAdzunaUrl(effectiveTargetUrl)
    ) {
      const query = buildManualJobSearchQuery({
        title: application.title ?? application.jobTitle,
        company: application.company,
        location: application.location,
        queries: urlResolution.debug.directJobResolutionQueries,
      });
      const searchUrl = buildManualJobSearchUrl(query);
      earlyStop = {
        status: "APPLY_NOT_STARTED",
        message:
          "Could not confirm the real employer posting. Open the suggested result and retry.",
        errorCode: REAL_POSTING_NOT_FOUND_CODE,
        stopClassification: {
          reason: "real_posting_not_found",
          pageType: "aggregator",
          suggestedAction: "open_original_job_site",
        },
        suggestedAction: "open_original_job_site",
        stoppedAtUrl: searchUrl,
        selectedStopSource: "search_url",
      };
      adzunaResolverDebug.selectedStopSource = "search_url";
    }

    if (effectiveRequiresEcosiaSearch) {
      console.info("[AUTO_APPLY_ROUTE] resolving real posting via Ecosia", {
        applicationId: application.id,
        source: application.source ?? null,
        selectedFrom: selectedStartSource,
      });
    }

    console.log("[AUTO_APPLY_ROUTE] prepared apply payload", {
      applicationId: application.id,
      jobUrl: application.jobUrl,
      originalUrl: urlResolution.originalUrl || null,
      resolvedDirectUrl: effectiveResolvedDirectUrl,
      googleFirstResolutionTriggered:
        urlResolution.debug.googleFirstResolutionTriggered === true,
      directJobResolutionNormalizedLocation:
        urlResolution.debug.directJobResolutionNormalizedLocation ?? null,
      directJobResolutionSearchProvider:
        urlResolution.debug.directJobResolutionSearchProvider ?? null,
      directJobResolutionQueries:
        urlResolution.debug.directJobResolutionQueries ?? [],
      adzunaStrategyReplaySkipped:
        urlResolution.debug.adzunaStrategyReplaySkipped === true,
      strategyMatched: Boolean(matchedStrategyGuidance),
      strategyDomainRejected: Boolean(strategyDomainRejection),
      strategyDomainRejectionReason: strategyDomainRejection ?? null,
      strategyId: matchedStrategyGuidance?.strategy.id ?? null,
      strategyStartUrl: matchedStrategyGuidance?.startUrl ?? null,
      usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
      targetUrl: effectiveTargetUrl ?? null,
      selectedStartSource,
      requiresEcosiaSearch: effectiveRequiresEcosiaSearch,
      rejectedStartUrlCount: finalRoutingDecision.rejectedCandidates.length,
      usesExternalPostingUrl:
        selectedStartSource === "adzuna_scrapfly_resolver" ||
        selectedStartSource === "serpapi_google" ||
        selectedStartSource === "resolved_direct_url" ||
        (Boolean(effectiveResolvedDirectUrl) &&
          normalizeJobUrl(effectiveTargetUrl ?? "") ===
            normalizeJobUrl(effectiveResolvedDirectUrl ?? "")),
      applyProvider: prepared.applyProvider ?? null,
      missingRequired: prepared.missingRequired,
      answerCount: Object.keys(prepared.finalValuesToSubmit).length,
    });

    console.log("[AUTO_APPLY_ROUTE] final target selected", {
      applicationId: application.id,
      originalUrl: urlResolution.originalUrl || null,
      resolvedDirectUrl: effectiveResolvedDirectUrl,
      targetUrl: effectiveTargetUrl ?? null,
      strategyMatched: Boolean(matchedStrategyGuidance),
      strategyDomainRejected: Boolean(strategyDomainRejection),
      strategyDomainRejectionReason: strategyDomainRejection ?? null,
      strategyId: matchedStrategyGuidance?.strategy.id ?? null,
      selectedStartSource,
      requiresEcosiaSearch: effectiveRequiresEcosiaSearch,
      usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
      applyProvider: prepared.applyProvider ?? null,
    });
    if (selectedStartSource === "serpapi_google") {
      console.info(
        "[AUTO_APPLY_ROUTE] Step 8 completed: SerpAPI direct result propagated into apply payload",
        {
          applicationId: application.id,
          resolvedDirectUrl: effectiveResolvedDirectUrl,
          targetUrl: effectiveTargetUrl,
          selectedStartSource,
          requiresEcosiaSearch: effectiveRequiresEcosiaSearch,
          usesExternalPostingUrl: true,
          usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
        },
      );
    }
    if (selectedStartSource === "adzuna_scrapfly_resolver") {
      console.info(
        "[AUTO_APPLY_ROUTE] Step 2 completed: Scrapfly downstream URL propagated into apply payload",
      );
    }

    if (earlyStop) {
      const message = buildErrorMessageWithCode({
        errorCode: earlyStop.errorCode,
        message: earlyStop.message,
      });
      const selectedEarlyStopUrl =
        pickMostRecentStopUrl({
          stopPointStoppedAtUrl: earlyStop.stoppedAtUrl,
          stopPointCurrentUrl:
            adzunaResolverDebug.handoffFinalUrl ??
            adzunaResolverDebug.handoffAfterUrl ??
            null,
          browserFinalUrl:
            adzunaResolverDebug.handoffFinalUrl ??
            adzunaResolverDebug.handoffAfterUrl ??
            null,
          scrapflyResolvedUrl:
            effectiveResolvedDirectUrl ??
            adzunaResolverDebug.adzunaScrapflyResolvedUrl ??
            adzunaResolverDebug.adzunaPostLoginResolvedDirectUrl ??
            null,
          resolvedDirectUrl: effectiveResolvedDirectUrl,
          targetUrl: effectiveTargetUrl,
          originalJobUrl: urlResolution.originalUrl,
        }) ?? earlyStop.stoppedAtUrl;
      if (selectedStartSource === "adzuna_scrapfly_resolver") {
        console.info(
          "[AUTO_APPLY_ROUTE] Step 5 completed: acceptance scenario verified for Adzuna → Workday stop point",
          {
            applicationId: application.id,
            stoppedAtUrl: selectedEarlyStopUrl,
            resolvedDirectUrl: effectiveResolvedDirectUrl,
            targetUrl: effectiveTargetUrl,
          },
        );
      }
      const scrapflyAttempted =
        adzunaResolverDebug.adzunaScrapflyResolutionAttempted === true;
      const existingDebug = readAutomationAudit(application.auditJson).state.debug ?? {};
      const stopDebug: ApplySessionDebug = {
        ...existingDebug,
        ...urlResolution.debug,
        ...adzunaResolverDebug,
        originalSourceUrl: urlResolution.originalUrl ?? undefined,
        originalJobUrl: urlResolution.originalUrl ?? undefined,
        resolvedDirectUrl: effectiveResolvedDirectUrl ?? undefined,
        usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
        responseStatus:
          adzunaResolverDebug.handoffResponseStatus ?? undefined,
        pageTitle:
          earlyStop.stoppedAtTitle ??
          adzunaResolverDebug.handoffPageTitle ??
          undefined,
        targetUrl: effectiveTargetUrl ?? undefined,
        finalUrl: selectedEarlyStopUrl,
        currentUrl: selectedEarlyStopUrl,
        stoppedAtUrl: selectedEarlyStopUrl,
        latestUrl: selectedEarlyStopUrl,
        stoppedAtTitle: earlyStop.stoppedAtTitle ?? undefined,
        lastActionText: earlyStop.lastActionText ?? undefined,
        lastActionSelector: undefined,
        stopReason: "HUMAN_INTERVENTION_REQUIRED",
        lastAction:
          earlyStop.status === VERIFICATION_REQUIRED_STATUS
            ? "verification_required"
            : earlyStop.stopClassification.reason === "login_required"
              ? "login_required"
              : earlyStop.stopClassification.reason === "adzuna_rate_limited" ||
                  earlyStop.errorCode === ADZUNA_HANDOFF_RATE_LIMITED_CODE
                ? "adzuna_handoff_rate_limited"
              : "no_apply_cta",
        stopClassification: earlyStop.stopClassification,
        finalReason:
          earlyStop.errorCode ??
          (earlyStop.status === VERIFICATION_REQUIRED_STATUS
            ? "verification_required"
            : earlyStop.stopClassification.reason === "login_required"
              ? "login_required"
            : REAL_POSTING_NOT_FOUND_CODE),
        verificationDetected:
          earlyStop.status === VERIFICATION_REQUIRED_STATUS,
      };
      const nextAudit = buildAutomationAudit({
        existingAudit: application.auditJson,
        provider: prepared.applyProvider ?? application.source ?? "playwright",
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        automation: {
          provider: "playwright",
          status: earlyStop.status,
          finalUrl: selectedEarlyStopUrl,
          message: message ?? earlyStop.message,
          finalReason: stopDebug.finalReason ?? null,
          verificationDetected:
            earlyStop.status === VERIFICATION_REQUIRED_STATUS,
          debug: stopDebug,
        },
      });

      await prisma.jobApplication.update({
        where: { id: application.id },
        data: {
          status: earlyStop.status,
          auditJson: nextAudit as Prisma.InputJsonValue,
          failureReason: message ?? earlyStop.message,
          verificationRequired:
            earlyStop.status === VERIFICATION_REQUIRED_STATUS,
        },
      });
      if (
        earlyStop.errorCode === ADZUNA_HANDOFF_RATE_LIMITED_CODE ||
        earlyStop.stopClassification.reason === "adzuna_rate_limited"
      ) {
        console.info("[AUTO_APPLY_ROUTE] Adzuna fallback rate limited", {
          applicationId: application.id,
          status: earlyStop.status,
          stoppedAtUrl: selectedEarlyStopUrl,
          responseStatus: adzunaResolverDebug.handoffResponseStatus ?? null,
        });
        console.info("[AUTO_APPLY_ROUTE] Adzuna rate limit stop persisted", {
          applicationId: application.id,
          status: earlyStop.status,
          stoppedAtUrl: selectedEarlyStopUrl,
          responseStatus: adzunaResolverDebug.handoffResponseStatus ?? null,
          pageTitle:
            earlyStop.stoppedAtTitle ??
            adzunaResolverDebug.handoffPageTitle ??
            null,
          source: "adzuna",
          provider: adzunaResolverDebug.remoteBrowserProvider ?? "scrapfly",
          scrapflySessionId: earlyStop.scrapflySessionId ?? null,
        });
      }

      if (body.background) {
        const applySession = createSession(
          application.id,
          {
            status: earlyStop.status,
            lastUrl: selectedEarlyStopUrl,
            error: message ?? undefined,
            message: message ?? earlyStop.message,
            errorCode:
              normalizeApplyAutomationErrorCode(earlyStop.errorCode ?? null) ??
              undefined,
            remoteSessionId: earlyStop.scrapflySessionId,
            submissionStatus: "NOT_SUBMITTED",
            emailStatus: "SKIPPED",
            debug: stopDebug,
          },
          {
            caller: "POST /api/applications/[id]/apply",
            sourcePath: "app/api/applications/[id]/apply/route.ts",
            phase: "background",
          },
        );

        return NextResponse.json({
          ok: true,
          applySessionId: applySession.id,
          status: earlyStop.status,
          message: message ?? earlyStop.message,
          reason:
            earlyStop.stopClassification.reason === "adzuna_rate_limited"
              ? "Adzuna rate limited the handoff before Hirexa could reach the employer posting."
              : undefined,
          errorCode:
            normalizeApplyAutomationErrorCode(earlyStop.errorCode ?? null) ??
            undefined,
          scrapflyAttempted,
          stopClassification: earlyStop.stopClassification,
          pageType:
            adzunaResolverDebug.adzunaLoginContinueGateDetected === true
              ? "adzuna_login_continue_gate"
              : adzunaResolverDebug.adzunaSuspiciousBehaviorGateDetected === true
                ? "adzuna_suspicious_behavior_gate"
              : earlyStop.stopClassification.pageType,
          suggestedAction: earlyStop.suggestedAction,
          source: "adzuna",
          provider: adzunaResolverDebug.remoteBrowserProvider ?? "scrapfly",
          originalSourceUrl: urlResolution.originalUrl ?? null,
          finalUrl: selectedEarlyStopUrl,
          currentUrl: selectedEarlyStopUrl,
          lastAction: stopDebug.lastAction,
          stopReason: stopDebug.stopReason,
          responseStatus: adzunaResolverDebug.handoffResponseStatus ?? null,
          pageTitle:
            earlyStop.stoppedAtTitle ??
            adzunaResolverDebug.handoffPageTitle ??
            null,
          stoppedAtUrl: selectedEarlyStopUrl,
          stoppedAtTitle: earlyStop.stoppedAtTitle ?? null,
          scrapflySessionId: earlyStop.scrapflySessionId ?? null,
          handoffClickAttempted:
            adzunaResolverDebug.handoffClickAttempted ?? null,
          handoffClickMethod:
            adzunaResolverDebug.handoffClickMethod ?? null,
          handoffClickUrl:
            adzunaResolverDebug.handoffClickUrl ?? null,
          continuationAttempted:
            adzunaResolverDebug.continuationAttempted ?? null,
          directGotoFallbackAttempted:
            adzunaResolverDebug.directGotoFallbackAttempted ?? null,
          directGotoFallbackReason:
            adzunaResolverDebug.directGotoFallbackReason ?? null,
          directGotoResponseUrl:
            adzunaResolverDebug.directGotoResponseUrl ?? null,
          directGotoStatus:
            adzunaResolverDebug.directGotoStatus ?? null,
          handoffFinalUrl:
            adzunaResolverDebug.handoffFinalUrl ?? null,
          handoffLeftAdzunaDomain:
            adzunaResolverDebug.handoffLeftAdzunaDomain ?? null,
          handoffResponseStatus:
            adzunaResolverDebug.handoffResponseStatus ?? null,
          handoffPageTitle:
            adzunaResolverDebug.handoffPageTitle ?? null,
          adzunaErrorCode:
            adzunaResolverDebug.errorCode ?? null,
          adzunaHandoffAccessDenied:
            adzunaResolverDebug.adzunaHandoffAccessDenied ?? null,
          adzunaLoginContinueGateDetected:
            adzunaResolverDebug.adzunaLoginContinueGateDetected ?? null,
          adzunaSuspiciousBehaviorGateDetected:
            adzunaResolverDebug.adzunaSuspiciousBehaviorGateDetected ?? null,
          adzunaLoginToContinueAvailable:
            adzunaResolverDebug.adzunaLoginToContinueAvailable ?? null,
          adzunaAuthenticateUrl:
            adzunaResolverDebug.adzunaAuthenticateUrl ?? null,
          adzunaLoginToContinueClicked:
            adzunaResolverDebug.adzunaLoginToContinueClicked ?? null,
          adzunaLoginPageDetected:
            adzunaResolverDebug.adzunaLoginPageDetected ?? null,
          adzunaCredentialAvailable:
            adzunaResolverDebug.adzunaCredentialAvailable ?? null,
          adzunaLoginAttempted:
            adzunaResolverDebug.adzunaLoginAttempted ?? null,
          adzunaLoginSucceeded:
            adzunaResolverDebug.adzunaLoginSucceeded ?? null,
          adzunaLoginFailedReason:
            adzunaResolverDebug.adzunaLoginFailedReason ?? null,
          adzunaPostLoginHandoffRetried:
            adzunaResolverDebug.adzunaPostLoginHandoffRetried ?? null,
          adzunaPostLoginResolvedDirectUrl:
            adzunaResolverDebug.adzunaPostLoginResolvedDirectUrl ?? null,
          manualContinuationRequired:
            adzunaResolverDebug.manualContinuationRequired ?? null,
          suggestedActionDetail:
            adzunaResolverDebug.suggestedAction ?? null,
          unresolvedReason:
            adzunaResolverDebug.unresolvedReason ?? null,
          ...buildUrlDecisionFields({
            ...urlResolution.debug,
            originalJobUrl: urlResolution.originalUrl ?? undefined,
            resolvedDirectUrl: effectiveResolvedDirectUrl ?? undefined,
            usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
            targetUrl: effectiveTargetUrl ?? selectedEarlyStopUrl,
          }),
        });
      }

      return NextResponse.json(
        {
          ok: false,
          status: earlyStop.status,
          error: message ?? earlyStop.message,
          message: message ?? earlyStop.message,
          reason:
            earlyStop.stopClassification.reason === "adzuna_rate_limited"
              ? "Adzuna rate limited the handoff before Hirexa could reach the employer posting."
              : undefined,
          errorCode:
            normalizeApplyAutomationErrorCode(earlyStop.errorCode ?? null) ??
            undefined,
          scrapflyAttempted,
          stopClassification: earlyStop.stopClassification,
          pageType:
            adzunaResolverDebug.adzunaLoginContinueGateDetected === true
              ? "adzuna_login_continue_gate"
              : adzunaResolverDebug.adzunaSuspiciousBehaviorGateDetected === true
                ? "adzuna_suspicious_behavior_gate"
              : earlyStop.stopClassification.pageType,
          suggestedAction: earlyStop.suggestedAction,
          source: "adzuna",
          provider: adzunaResolverDebug.remoteBrowserProvider ?? "scrapfly",
          originalSourceUrl: urlResolution.originalUrl ?? null,
          finalUrl: selectedEarlyStopUrl,
          currentUrl: selectedEarlyStopUrl,
          lastAction: stopDebug.lastAction,
          stopReason: stopDebug.stopReason,
          responseStatus: adzunaResolverDebug.handoffResponseStatus ?? null,
          pageTitle:
            earlyStop.stoppedAtTitle ??
            adzunaResolverDebug.handoffPageTitle ??
            null,
          stoppedAtUrl: selectedEarlyStopUrl,
          stoppedAtTitle: earlyStop.stoppedAtTitle ?? null,
          scrapflySessionId: earlyStop.scrapflySessionId ?? null,
          handoffClickAttempted:
            adzunaResolverDebug.handoffClickAttempted ?? null,
          handoffClickMethod:
            adzunaResolverDebug.handoffClickMethod ?? null,
          handoffClickUrl:
            adzunaResolverDebug.handoffClickUrl ?? null,
          continuationAttempted:
            adzunaResolverDebug.continuationAttempted ?? null,
          directGotoFallbackAttempted:
            adzunaResolverDebug.directGotoFallbackAttempted ?? null,
          directGotoFallbackReason:
            adzunaResolverDebug.directGotoFallbackReason ?? null,
          directGotoResponseUrl:
            adzunaResolverDebug.directGotoResponseUrl ?? null,
          directGotoStatus:
            adzunaResolverDebug.directGotoStatus ?? null,
          handoffFinalUrl:
            adzunaResolverDebug.handoffFinalUrl ?? null,
          handoffLeftAdzunaDomain:
            adzunaResolverDebug.handoffLeftAdzunaDomain ?? null,
          handoffResponseStatus:
            adzunaResolverDebug.handoffResponseStatus ?? null,
          handoffPageTitle:
            adzunaResolverDebug.handoffPageTitle ?? null,
          adzunaErrorCode:
            adzunaResolverDebug.errorCode ?? null,
          adzunaHandoffAccessDenied:
            adzunaResolverDebug.adzunaHandoffAccessDenied ?? null,
          adzunaLoginContinueGateDetected:
            adzunaResolverDebug.adzunaLoginContinueGateDetected ?? null,
          adzunaSuspiciousBehaviorGateDetected:
            adzunaResolverDebug.adzunaSuspiciousBehaviorGateDetected ?? null,
          adzunaLoginToContinueAvailable:
            adzunaResolverDebug.adzunaLoginToContinueAvailable ?? null,
          adzunaAuthenticateUrl:
            adzunaResolverDebug.adzunaAuthenticateUrl ?? null,
          adzunaLoginToContinueClicked:
            adzunaResolverDebug.adzunaLoginToContinueClicked ?? null,
          adzunaLoginPageDetected:
            adzunaResolverDebug.adzunaLoginPageDetected ?? null,
          adzunaCredentialAvailable:
            adzunaResolverDebug.adzunaCredentialAvailable ?? null,
          adzunaLoginAttempted:
            adzunaResolverDebug.adzunaLoginAttempted ?? null,
          adzunaLoginSucceeded:
            adzunaResolverDebug.adzunaLoginSucceeded ?? null,
          adzunaLoginFailedReason:
            adzunaResolverDebug.adzunaLoginFailedReason ?? null,
          adzunaPostLoginHandoffRetried:
            adzunaResolverDebug.adzunaPostLoginHandoffRetried ?? null,
          adzunaPostLoginResolvedDirectUrl:
            adzunaResolverDebug.adzunaPostLoginResolvedDirectUrl ?? null,
          manualContinuationRequired:
            adzunaResolverDebug.manualContinuationRequired ?? null,
          suggestedActionDetail:
            adzunaResolverDebug.suggestedAction ?? null,
          unresolvedReason:
            adzunaResolverDebug.unresolvedReason ?? null,
          ...buildUrlDecisionFields({
            ...urlResolution.debug,
            originalJobUrl: urlResolution.originalUrl ?? undefined,
            resolvedDirectUrl: effectiveResolvedDirectUrl ?? undefined,
            usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
            targetUrl: effectiveTargetUrl ?? selectedEarlyStopUrl,
          }),
        },
        { status: 409 },
      );
    }

    if (prepared.missingRequired.length > 0) {
      const message = "Missing required profile fields.";

      await persistPreparationFailure({
        application,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        missingRequired: prepared.missingRequired,
        message,
        finalReason: "missing_required_fields",
      });

      return NextResponse.json(
        {
          ok: false,
          error: message,
          missingRequired: prepared.missingRequired,
        },
        { status: 409 },
      );
    }

    const tempResume = await writeResumeToTemp(application.userProfileId);

    console.log("[AUTO_APPLY_ROUTE] temp resume lookup", {
      applicationId: application.id,
      userProfileId: application.userProfileId,
      sessionUserId: userId,
      sessionEmail,
      hasResumePath: Boolean(tempResume.path),
      resumeFileName: tempResume.filename ?? null,
      resumeSource: tempResume.source,
      resumeRecordFound: tempResume.debug.resumeRecordFound,
      resumeFilesRecordExists: tempResume.debug.resumeFileFound,
      sourceResumeFile: tempResume.debug.sourceResumeFile,
      sourceResumeRecord: tempResume.debug.sourceResumeRecord,
      resolvedPath: tempResume.debug.resolvedPath,
      fileExistsOnDisk: tempResume.debug.fileExistsOnDisk,
      generationSucceeded: tempResume.debug.generationSucceeded,
      generationReason: tempResume.debug.generationReason,
      resumeIssue: tempResume.debug.resumeIssue,
      resumeIssueDetail: tempResume.debug.resumeIssueDetail,
    });

    if (!tempResume.path) {
      const resumeFailure = describeResumeFailure(tempResume);

      await persistPreparationFailure({
        application,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        missingRequired: resumeFailure.missingRequired,
        message: resumeFailure.message,
        finalReason: resumeFailure.finalReason,
      });

      return NextResponse.json(
        {
          ok: false,
          status: "FAILED",
          error: resumeFailure.message,
          errorCode: resumeFailure.errorCode,
          resumeIssue: tempResume.debug.resumeIssue,
          resumeIssueDetail: tempResume.debug.resumeIssueDetail,
          missingRequired: resumeFailure.missingRequired,
        },
        { status: resumeFailure.httpStatus },
      );
    }

    if (body.background) {
      const applySession = createSession(application.id, {
        status: "STARTING",
        lastUrl: effectiveTargetUrl,
        message: "Starting Playwright automation.",
      }, {
        caller: "POST /api/applications/[id]/apply",
        sourcePath: "app/api/applications/[id]/apply/route.ts",
        phase: "background",
      });

      console.info("[AUTO_APPLY_ROUTE] returned session id", {
        sessionId: applySession.id,
        applicationId: application.id,
        status: applySession.status,
        found: true,
        storageBackendUsed: getApplySessionStorageBackend(),
        caller: "POST /api/applications/[id]/apply",
        sourcePath: "app/api/applications/[id]/apply/route.ts",
        phase: "background",
      });

      void runBackgroundApply({
        application,
        applySessionId: applySession.id,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        targetUrl: effectiveTargetUrl,
        resolvedDirectUrl: effectiveResolvedDirectUrl,
        selectedStartSource,
        adzunaResolverDebug,
        resumePath: tempResume.path,
        urlResolution,
        strategyGuidance: matchedStrategyGuidance,
      });

      return NextResponse.json({
        ok: true,
        applySessionId: applySession.id,
        status: "STARTING",
        submissionStatus: "PENDING",
        emailStatus: "PENDING",
        message: "Starting Playwright automation.",
        ...buildUrlDecisionFields({
          ...urlResolution.debug,
          originalJobUrl: urlResolution.originalUrl ?? undefined,
          resolvedDirectUrl: effectiveResolvedDirectUrl ?? undefined,
          usedResolvedDirectUrl: effectiveUsedResolvedDirectUrl,
          targetUrl: effectiveTargetUrl,
        }),
      });
    }

    try {
      let result = applyRouteLevelSubmissionGuard({
        rawResult: await applyWithPlaywright({
          jobUrl: application.jobUrl ?? "",
          form: effectiveTargetUrl ? { embedUrl: effectiveTargetUrl } : undefined,
          metadata: {
            applicationId: application.id,
            applySessionId: null,
            originalUrl: urlResolution.originalUrl,
            resolvedUrl: effectiveResolvedDirectUrl,
            source: application.source,
            title: application.title ?? application.jobTitle,
            company: application.company,
            location: application.location,
            strategy: matchedStrategyGuidance
              ? {
                  id: matchedStrategyGuidance.strategy.id ?? null,
                  sourceHost:
                    matchedStrategyGuidance.strategy.sourceHost ?? null,
                  destinationHost:
                    matchedStrategyGuidance.strategy.destinationHost ?? null,
                  strategyType:
                    matchedStrategyGuidance.strategy.strategyType ?? null,
                  pageType: matchedStrategyGuidance.strategy.pageType ?? null,
                  derivedInstruction:
                    matchedStrategyGuidance.derivedInstruction ?? null,
                  automationPrompt:
                    matchedStrategyGuidance.automationPrompt ?? null,
                  startUrl: matchedStrategyGuidance.startUrl ?? null,
                  steps: matchedStrategyGuidance.sanitizedSteps,
                }
              : undefined,
            directJobResolution: {
              attempted:
                urlResolution.debug.directJobResolutionAttempted === true,
              confidence:
                urlResolution.debug.directJobResolutionConfidence,
              provider:
                urlResolution.debug.directJobResolutionProvider,
              matchReason:
                urlResolution.debug.directJobResolutionMatchReason,
              error: urlResolution.debug.directJobResolutionError,
              candidates:
                urlResolution.debug.directJobResolutionCandidates,
            },
          },
          values: prepared.finalValuesToSubmit,
          resumePath: tempResume.path,
          freshSession: true,
        }),
        applicationId: application.id,
        phase: "foreground",
      });
      const foregroundDomainMismatch = detectStopUrlDomainMismatch({
        application,
        result,
        originalJobUrl: urlResolution.originalUrl,
        resolvedDirectUrl: effectiveResolvedDirectUrl,
        targetUrl: effectiveTargetUrl,
      });
      if (foregroundDomainMismatch) {
        console.warn("[AUTO_APPLY_STOP_URL_DOMAIN_MISMATCH]", {
          applicationId: application.id,
          applySessionId: null,
          sourceJobId: application.sourceJobId ?? null,
          company: application.company ?? null,
          jobTitle: application.title ?? application.jobTitle ?? null,
          originalJobUrl: urlResolution.originalUrl ?? null,
          resolvedDirectUrl: effectiveResolvedDirectUrl,
          targetUrl: effectiveTargetUrl ?? result.debug.targetUrl ?? null,
          finalUrl: foregroundDomainMismatch.finalUrl,
          stoppedAtUrl: foregroundDomainMismatch.stoppedAtUrl,
          selectedStartSource,
          strategyId: matchedStrategyGuidance?.strategy.id ?? null,
          strategyDomain:
            matchedStrategyGuidance?.strategy.destinationHost ??
            matchedStrategyGuidance?.strategy.sourceHost ??
            null,
          currentBrowserUrl: foregroundDomainMismatch.currentBrowserUrl,
          expectedEmployerHost: foregroundDomainMismatch.expectedEmployerHost,
          finalHost: foregroundDomainMismatch.finalHost,
          mismatchReason: foregroundDomainMismatch.reason,
        });
        result = forceApplyNotStartedForDomainMismatch({
          result,
          mismatch: foregroundDomainMismatch,
        });
      }
      if (Object.keys(adzunaResolverDebug).length > 0) {
        result = {
          ...result,
          debug: {
            ...result.debug,
            ...adzunaResolverDebug,
          },
        };
      }

      console.log("[AUTO_APPLY_ROUTE] foreground apply completed", {
        applicationId: application.id,
        status: result.status,
        finalUrl: result.finalUrl ?? null,
        submissionConfirmed: result.ok,
      });

      const persistedOutcome = await persistAutomationOutcome({
        application,
        previousStatus: application.status,
        applyProvider: prepared.applyProvider,
        answers: prepared.answers,
        finalValuesToSubmit: prepared.finalValuesToSubmit,
        result,
        phase: "foreground",
      });
      await recordMatchedStrategyOutcome({
        application,
        strategyGuidance: matchedStrategyGuidance,
        result: persistedOutcome.result,
        phase: "foreground",
        applicationId: application.id,
      });
      const finalResult = persistedOutcome.result;

      if (finalResult.ok) {
        return NextResponse.json({
          ok: true,
          status: "SENT",
          finalUrl: finalResult.finalUrl,
          ...buildUrlDecisionFields(finalResult.debug),
          submissionStatus: persistedOutcome.submissionStatus,
          emailStatus: persistedOutcome.emailStatus,
          message: persistedOutcome.message,
        });
      }

      if (
        finalResult.status === VERIFICATION_REQUIRED_STATUS ||
        isVerificationExecutionResult(finalResult)
      ) {
        return NextResponse.json(
          {
            ok: false,
            status: VERIFICATION_REQUIRED_STATUS,
            error: persistedOutcome.message ?? VERIFICATION_REQUIRED_MESSAGE,
            message: persistedOutcome.message ?? VERIFICATION_REQUIRED_MESSAGE,
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.needsHuman) {
        const errorCode = inferExecutionErrorCode({
          result: finalResult,
        });
        const message = buildErrorMessageWithCode({
          errorCode,
          message: finalResult.message ?? "Human intervention required.",
        });

        return NextResponse.json(
          {
            ok: false,
            status: finalResult.status,
            error: message ?? "Human intervention required.",
            message: message ?? "Human intervention required.",
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.status === "APPLY_NOT_STARTED") {
        const realPostingNotFound = isRealPostingNotFoundResult(finalResult);
        const errorCode =
          inferExecutionErrorCode({
            result: finalResult,
          }) ?? (realPostingNotFound ? "REAL_POSTING_NOT_FOUND" : null);
        const message = buildErrorMessageWithCode({
          errorCode,
          message: realPostingNotFound
            ? "Real posting not found."
            : finalResult.message ??
              "Opened job page but could not start application.",
        });

        return NextResponse.json(
          {
            ok: false,
            status: finalResult.status,
            error: message ?? "Opened job page but could not start application.",
            message: message ?? "Opened job page but could not start application.",
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.status === "UNCONFIRMED") {
        const errorCode = inferExecutionErrorCode({
          result: finalResult,
        });
        const message = buildErrorMessageWithCode({
          errorCode,
          message:
            finalResult.message ?? "Application submission not confirmed.",
        });

        return NextResponse.json(
          {
            ok: false,
            status: finalResult.status,
            error: message ?? "Application submission not confirmed.",
            message: message ?? "Application submission not confirmed.",
            errorCode: errorCode ?? undefined,
            finalUrl: finalResult.finalUrl,
            ...buildUrlDecisionFields(finalResult.debug),
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      if (finalResult.unavailable) {
        const errorCode = inferExecutionErrorCode({
          result: finalResult,
        });
        const message = buildErrorMessageWithCode({
          errorCode,
          message:
            finalResult.message ??
            "Auto apply is not available for this job application.",
        });

        return NextResponse.json(
          {
            ok: false,
            status: "AUTO_APPLY_UNAVAILABLE",
            error: message ?? "Auto apply is not available for this job application.",
            message: message ?? "Auto apply is not available for this job application.",
            ...buildStopResponseFields(finalResult),
            ...buildUrlDecisionFields(finalResult.debug),
            submissionStatus: persistedOutcome.submissionStatus,
            emailStatus: persistedOutcome.emailStatus,
          },
          { status: 409 },
        );
      }

      const errorCode = inferExecutionErrorCode({
        result: finalResult,
      });
      const message = buildErrorMessageWithCode({
        errorCode,
        message: finalResult.message ?? "Playwright automation failed.",
      });

      return NextResponse.json(
        {
          ok: false,
          status: finalResult.status,
          error: message ?? "Playwright automation failed.",
          message: message ?? "Playwright automation failed.",
          ...buildStopResponseFields(finalResult),
          ...buildUrlDecisionFields(finalResult.debug),
          submissionStatus: persistedOutcome.submissionStatus,
          emailStatus: persistedOutcome.emailStatus,
        },
        { status: 502 },
      );
    } finally {
      await unlink(tempResume.path).catch(() => undefined);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    const errorCode = inferApplyAutomationErrorCode({
      status: "FAILED",
      message,
      finalReason: message,
    });
    const normalizedMessage =
      buildErrorMessageWithCode({
        errorCode,
        message,
      }) ?? message;

    console.error("[AUTO_APPLY_PLAYWRIGHT] request failed", {
      error: normalizedMessage,
    });

    return NextResponse.json(
      {
        ok: false,
        error: normalizedMessage,
        message: normalizedMessage,
        errorCode: errorCode ?? undefined,
      },
      { status: 500 },
    );
  }
}
