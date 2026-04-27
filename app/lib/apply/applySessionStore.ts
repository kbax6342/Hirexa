import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobSearchFallbackCandidate } from "@/app/lib/apply/jobSearchFallback";
import type { ApplyAutomationErrorCode } from "@/app/lib/apply/errorCodes";
import type {
  ApplyStopClassification,
  VerificationEvidence,
} from "@/app/lib/apply/stopClassification";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";
import type { AtsJobUrlIdentity } from "@/app/lib/apply/atsUrlIdentity";
import type {
  JobIdentityMismatch,
  JobIdentitySnapshot,
} from "@/app/lib/jobs/jobIdentity";

export type ApplySessionClickRecord = {
  hop: number;
  fromUrl: string;
  toUrl?: string;
  selector: string;
  text?: string;
  navigation: "same-tab" | "popup" | "new-page";
};

export type ApplySessionCtaAttemptRecord = {
  phase: "entry" | "handoff" | "cookie" | "universal";
  action?: "scan" | "click";
  selector: string;
  text: string;
  matchedText: string;
  locatorStrategy?: string;
  candidateFound?: boolean;
  dismissesBlocker?: boolean;
  success: boolean;
  urlBefore: string;
  urlAfter?: string;
  applyCtaFoundAfter?: boolean;
};

export type ApplySessionDebug = {
  expectedJobIdentity?: JobIdentitySnapshot;
  applicationJobIdentity?: JobIdentitySnapshot;
  resolvedUrlIdentity?: AtsJobUrlIdentity;
  identityMismatches?: JobIdentityMismatch[];
  identityBlockedBeforeBrowserLaunch?: boolean;
  entryUrl?: string;
  initialLoadedUrl?: string;
  finalUrl?: string;
  originalSourceUrl?: string;
  originalJobUrl?: string;
  resolvedDirectUrl?: string;
  applySource?: string;
  googleFirstResolutionTriggered?: boolean;
  usedResolvedDirectUrl?: boolean;
  directJobResolutionAttempted?: boolean;
  directJobResolutionQueries?: string[];
  directJobResolutionNormalizedLocation?: string;
  directJobResolutionSearchProvider?: string;
  directJobResolutionConfidence?: number;
  directJobResolutionProvider?: string;
  directJobResolutionMatchReason?: string;
  directJobResolutionError?: string;
  directJobResolutionFailureReason?: string;
  directJobResolutionCandidates?: Array<{
    url: string;
    title?: string;
    provider?: string;
    source?: string;
    domain?: string;
    score?: number;
    confidence: number;
    confidenceLabel?: "low" | "medium" | "high";
    reason: string;
    matchedSignals?: string[];
    rejectedReason?: string;
  }>;
  adzunaStrategyReplaySkipped?: boolean;
  searchFallbackTriggered?: boolean;
  searchFallbackQueries?: string[];
  searchFallbackCandidates?: JobSearchFallbackCandidate[];
  searchFallbackChosenCandidate?: string;
  searchFallbackAttemptCount?: number;
  searchFallbackSuccess?: boolean;
  searchFallbackFailureReason?: string;
  remoteBrowserProvider?: string;
  scrapflyAttempted?: boolean;
  scrapflySessionId?: string;
  adzunaScrapflyResolutionAttempted?: boolean;
  adzunaScrapflyResolutionSucceeded?: boolean;
  adzunaScrapflyResolvedUrl?: string;
  adzunaScrapflyResolutionMethod?: string;
  adzunaHandoffAttempted?: boolean;
  handoffClickAttempted?: boolean;
  handoffClickMethod?: "element_click" | "continuation_click" | "direct_goto";
  handoffClickUrl?: string;
  handoffClickText?: string;
  handoffBeforeUrl?: string;
  handoffAfterUrl?: string;
  continuationAttempted?: boolean;
  continuationText?: string;
  continuationHref?: string;
  directGotoFallbackAttempted?: boolean;
  directGotoFallbackReason?: string;
  directGotoResponseUrl?: string;
  directGotoStatus?: number;
  handoffPopupUrl?: string;
  handoffFinalUrl?: string;
  handoffLeftAdzunaDomain?: boolean;
  handoffResponseStatus?: number;
  handoffPageTitle?: string;
  errorCode?: string;
  adzunaHandoffAccessDenied?: boolean;
  adzunaLoginContinueGateDetected?: boolean;
  adzunaSuspiciousBehaviorGateDetected?: boolean;
  adzunaLoginToContinueAvailable?: boolean;
  adzunaAuthenticateUrl?: string;
  adzunaLoginToContinueClicked?: boolean;
  adzunaLoginPageDetected?: boolean;
  adzunaCredentialAvailable?: boolean;
  adzunaLoginAttempted?: boolean;
  adzunaLoginSucceeded?: boolean;
  adzunaLoginFailedReason?: string;
  adzunaPostLoginHandoffRetried?: boolean;
  adzunaPostLoginResolvedDirectUrl?: string;
  manualContinuationRequired?: boolean;
  suggestedAction?: string;
  downstreamCandidateCount?: number;
  rejectedTrackingCandidateCount?: number;
  rejectedFinalCandidateReasons?: string[];
  unresolvedReason?: string;
  adzunaScrapflyCandidates?: Array<{
    url: string;
    source: string;
    score: number;
    reason: string;
  }>;
  adzunaScrapflyUrlsVisited?: string[];
  selectedStopSource?:
    | "scrapfly_resolved_url"
    | "search_url"
    | "low_confidence_candidate"
    | "verification_required"
    | "original_source_url"
    | "current_url";
  startingUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
  finalChosenUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
  domain?: string;
  latestUrl?: string;
  responseStatus?: number;
  pageTitle?: string;
  stoppedAtUrl?: string;
  stoppedAtTitle?: string;
  lastActionText?: string;
  lastActionSelector?: string;
  hopCount?: number;
  urlsVisited?: string[];
  clicks?: ApplySessionClickRecord[];
  ctaAttempts?: ApplySessionCtaAttemptRecord[];
  entryCtaFound?: boolean;
  entryCtaClicked?: boolean;
  entryCtaClickedText?: string;
  entryCtaClickedSelector?: string;
  entryDismissedBlocker?: boolean;
  handoffPageDetected?: boolean;
  handoffUrl?: string;
  handoffContinuationAttempted?: boolean;
  handoffContinuationSucceeded?: boolean;
  handoffCtaFound?: boolean;
  handoffCtaClicked?: boolean;
  handoffCtaClickedText?: string;
  handoffCtaClickedSelector?: string;
  handoffAttempts?: ApplySessionCtaAttemptRecord[];
  cookiePromptDetected?: boolean;
  cookiePromptClicked?: boolean;
  cookiePromptClickedText?: string;
  cookiePromptSelector?: string;
  cookiePromptAttempts?: ApplySessionCtaAttemptRecord[];
  postCookieWaitAttempted?: boolean;
  postCookieUrlBefore?: string;
  postCookieUrlAfter?: string;
  postCookieUrlChanged?: boolean;
  postCookieProgressDetected?: boolean;
  postCookieTitleAfter?: string;
  applyCtaClickedText?: string;
  applyCtaClickedSelector?: string;
  applyHrefExtracted?: string;
  applyNavigationForced?: boolean;
  applyNavigationUrl?: string;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  dismissedBlocker?: boolean;
  attemptedSelectors?: string[];
  applyCtaFound?: boolean;
  applyCtaClicked?: boolean;
  targetUrl?: string;
  urlBeforeClick?: string;
  urlAfterClick?: string;
  currentUrl?: string;
  providerDetected?: string;
  formContextUrl?: string;
  formDetected?: boolean;
  visibleFieldCount?: number;
  fillableFieldCount?: number;
  filledFieldCount?: number;
  requiredFieldCount?: number;
  missingRequiredFields?: string[];
  unsupportedRequiredFields?: string[];
  formScanAttempted?: boolean;
  formFound?: boolean;
  formFillAttempted?: boolean;
  resumeUploadAttempted?: boolean;
  resumeUploadSucceeded?: boolean;
  submitOrContinueAttempted?: boolean;
  submitOrContinueClicked?: boolean;
  aiFormAnswerEngineRan?: boolean;
  aiFormAnswersGenerated?: boolean;
  aiFormAutofillCompleted?: boolean;
  aiFormFieldCount?: number;
  aiFormRequiredFieldCount?: number;
  aiFormAnsweredCount?: number;
  aiFormBlockedCount?: number;
  aiFormFilledCount?: number;
  aiFormRemainingRequiredFields?: string[];
  aiFormBlockedFields?: Array<{
    fieldId: string;
    label: string;
    reason: string;
    category: string;
    answerDraft?: string | null;
    options?: string[];
    sensitive?: boolean;
  }>;
  missingQuestions?: Array<{
    fieldId: string;
    label: string;
    type?: string;
    options?: string[];
    classification?: string;
    reason?: string;
    aiDraft?: string | null;
    sensitive?: boolean;
  }>;
  userProvidedAnswers?: Record<string, string>;
  userProvidedAnswersReadyToResume?: boolean;
  recoveredFromStaleSession?: boolean;
  staleReason?: string;
  verificationOverriddenByVisibleForm?: boolean;
  needsHuman?: boolean;
  submitButtonFound?: boolean;
  submitButtonEnabled?: boolean;
  submitButtonClicked?: boolean;
  finalRequiredCheckPassed?: boolean;
  allRequiredFieldsFilled?: boolean;
  finalRecheckPassed?: boolean;
  readyToSubmit?: boolean;
  submitAttempted?: boolean;
  lastFormRecheckAt?: number;
  visibleValidationErrors?: string[];
  fileUploadPending?: boolean;
  verificationChallengeVisible?: boolean;
  reviewBeforeSubmit?: boolean;
  actionLabel?: string;
  submittedAt?: string;
  confirmationDetected?: boolean;
  confirmationTextFound?: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched?: boolean;
  confirmationMatchedBy?: "url" | "text" | "popup" | "context-page";
  confirmationFinalUrl?: string;
  verificationDetected?: boolean;
  verificationEvidence?: VerificationEvidence;
  verificationSignals?: string[];
  submissionConfirmed?: boolean;
  stopReason?: "HUMAN_INTERVENTION_REQUIRED";
  lastAction?:
    | "no_apply_cta"
    | "login_required"
    | "verification_required"
    | "missing_required_fields"
    | "missing_required_answers_after_ai"
    | "user_review_required_for_form_fields"
    | "adzuna_handoff_rate_limited";
  stopClassification?: ApplyStopClassification;
  finalReason?: string;
  resolverAttemptedLinks?: string[];
  resolverCandidates?: Array<{
    href: string;
    hostname: string;
    text: string;
    score: number;
    reasons: string[];
  }>;
  resolverRejectedCandidates?: Array<{
    href: string;
    hostname: string;
    text: string;
    reason: string;
  }>;
  resolverSelectedLink?: string;
  resolverSuccess?: boolean;
  resolverNewUrl?: string;
  adzunaHandoffFailureReasons?: string[];
  adzunaExternalLinkCandidates?: string[];
  adzunaBodyTextPreview?: string;
  adzunaTokenizedInterstitialDetected?: boolean;
  adzunaTokenizedParamsPresent?: string[];
  adzunaDownstreamCandidates?: string[];
  adzunaScriptRedirectCandidates?: string[];
  adzunaNetworkRedirectCandidates?: string[];
  adzunaFinalFailureReason?: string;
  adzunaHandoffPageTitle?: string;
  adzunaHandoffVisibleCtas?: string[];
  adzunaOverlayDetected?: boolean;
  adzunaOverlayDismissed?: boolean;
  adzunaOverlayType?: string;
  adzunaOverlaySelectorsTried?: string[];
  adzunaHandoffPopupOccurred?: boolean;
  adzunaHandoffUsedPopup?: boolean;
  adzunaDownstreamConfirmed?: boolean;
  adzunaAuthPageDetected?: boolean;
  adzunaForgotPasswordDetected?: boolean;
  blockedResolvedHandoffCandidates?: Array<{
    href: string;
    hostname: string;
    text: string;
    reason: string;
  }>;
  selectedResolvedHandoffCandidate?: string;
  resolvedHandoffClickAttempted?: boolean;
  resolvedHandoffClickSucceeded?: boolean;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
  playwrightLaunchStrategy?: "remote" | "local_ephemeral" | "local_persistent";
  playwrightPersistentContext?: boolean;
  playwrightUserDataDir?: string;
  rtxFlowAttempted?: boolean;
  rtxFlowCompleted?: boolean;
  rtxProgressMarkers?: string[];
  rtxFailureReason?: string;
  rtxJobId?: string;
};

export type ApplySubmissionStatus = "PENDING" | "SUBMITTED" | "NOT_SUBMITTED";

export type ApplyEmailStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export type ApplySession = {
  id: string;
  applicationId: string;
  status: ApplySessionStatus;
  createdAt?: number;
  startedAt: number;
  updatedAt: number;
  lastHeartbeatAt?: number;
  lastProgressAt?: number;
  fillingFormStartedAt?: number;
  lastRunnerHeartbeatAt?: number;
  lastRunnerProgressAt?: number;
  lastMeaningfulFormProgressAt?: number;
  lastFormRecheckAt?: number;
  lastStatusChangeAt?: number;
  lastKnownUrl?: string;
  lastKnownStatus?: ApplySessionStatus;
  runnerActive?: boolean;
  progressVersion?: number;
  recoveredFromStaleSession?: boolean;
  staleReason?: string;
  submissionStatus?: ApplySubmissionStatus;
  emailStatus?: ApplyEmailStatus;
  lastUrl?: string;
  error?: string;
  message?: string;
  errorCode?: ApplyAutomationErrorCode;
  remoteSessionId?: string;
  debug?: ApplySessionDebug;
};

type ApplySessionStore = Map<string, ApplySession>;
type ApplySessionCreateData = Partial<
  Omit<ApplySession, "id" | "applicationId" | "startedAt" | "updatedAt">
>;
type ApplySessionPhase = "background" | "foreground" | "poll" | "confirm";
type ApplySessionLogContext = {
  caller?: string;
  sourcePath?: string;
  phase?: ApplySessionPhase;
};

const APPLY_SESSION_STORAGE_BACKEND = "memory+file:tmpdir";
const APPLY_SESSION_STORAGE_DIR = path.join(tmpdir(), "hirexa-apply-sessions");

declare global {
  var __hirexaApplySessions: ApplySessionStore | undefined;
}

function getApplySessionStore() {
  if (!globalThis.__hirexaApplySessions) {
    globalThis.__hirexaApplySessions = new Map<string, ApplySession>();
  }

  return globalThis.__hirexaApplySessions;
}

const sessions = getApplySessionStore();
const SUPERSEDABLE_APPLY_SESSION_STATUSES = new Set<ApplySessionStatus>([
  "STARTING",
  "FINDING_APPLY",
  "OPENING_FORM",
  "FILLING_FORM",
  "SUBMITTING",
  "SUBMITTING_APPLICATION",
  "WAITING_CONFIRMATION",
  "WAITING_FOR_CONFIRMATION",
  "RUNNING",
]);

function makeId() {
  return `apply_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getApplySessionFilePath(id: string) {
  return path.join(APPLY_SESSION_STORAGE_DIR, `${id}.json`);
}

function buildLogContext(context?: ApplySessionLogContext) {
  return {
    caller: context?.caller ?? null,
    sourcePath: context?.sourcePath ?? null,
    phase: context?.phase ?? null,
  };
}

function persistSessionToDisk(session: ApplySession) {
  try {
    mkdirSync(APPLY_SESSION_STORAGE_DIR, { recursive: true });
    writeFileSync(
      getApplySessionFilePath(session.id),
      JSON.stringify(session),
      "utf8",
    );
  } catch (error) {
    console.error("[APPLY_SESSION] persist failed", {
      sessionId: session.id,
      applicationId: session.applicationId,
      status: session.status,
      found: true,
      storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function pickKnownUrl(session: Partial<ApplySession>) {
  return (
    session.lastUrl ??
    session.debug?.latestUrl ??
    session.debug?.currentUrl ??
    session.debug?.stoppedAtUrl ??
    session.debug?.finalUrl ??
    undefined
  );
}

function readSessionFromDisk(id: string): ApplySession | undefined {
  try {
    const raw = readFileSync(getApplySessionFilePath(id), "utf8");
    const parsed = JSON.parse(raw) as Partial<ApplySession> | null;
    if (!parsed || typeof parsed !== "object") return undefined;
    if (typeof parsed.id !== "string" || parsed.id !== id) return undefined;
    if (typeof parsed.applicationId !== "string") return undefined;
    if (typeof parsed.status !== "string") return undefined;
    if (typeof parsed.startedAt !== "number") return undefined;
    if (typeof parsed.updatedAt !== "number") return undefined;

    return parsed as ApplySession;
  } catch {
    return undefined;
  }
}

function readPersistedSessionsForApplication(applicationId: string) {
  const found: ApplySession[] = [];
  try {
    for (const entry of readdirSync(APPLY_SESSION_STORAGE_DIR)) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.replace(/\.json$/i, "");
      const session = sessions.get(id) ?? readSessionFromDisk(id);
      if (session?.applicationId === applicationId) {
        found.push(session);
      }
    }
  } catch {
    // The tmpdir store may not exist yet.
  }
  return found;
}

function supersedeOlderSessionsForApplication(args: {
  applicationId: string;
  newSessionId: string;
}) {
  const candidates = new Map<string, ApplySession>();
  for (const session of sessions.values()) {
    if (session.applicationId === args.applicationId) {
      candidates.set(session.id, session);
    }
  }
  for (const session of readPersistedSessionsForApplication(args.applicationId)) {
    candidates.set(session.id, session);
  }

  const now = Date.now();
  for (const session of candidates.values()) {
    if (session.id === args.newSessionId) continue;
    if (!SUPERSEDABLE_APPLY_SESSION_STATUSES.has(session.status)) continue;

    const next: ApplySession = {
      ...session,
      status: "READY_TO_RETRY",
      updatedAt: now,
      lastStatusChangeAt: now,
      lastKnownStatus: "READY_TO_RETRY",
      runnerActive: false,
      recoveredFromStaleSession: true,
      staleReason: "A newer Auto Apply session was started for this application.",
      message: "A newer Auto Apply session was started for this application.",
      debug: {
        ...(session.debug ?? {}),
        recoveredFromStaleSession: true,
        staleReason: "A newer Auto Apply session was started for this application.",
        suggestedAction: "Follow the latest Auto Apply session.",
        finalReason: "This apply session was superseded by a newer session.",
      },
    };
    sessions.set(next.id, next);
    persistSessionToDisk(next);
    console.warn("[APPLY_SESSION_SUPERSEDED_BY_NEWER_SESSION]", {
      oldSessionId: session.id,
      newSessionId: args.newSessionId,
      applicationId: args.applicationId,
      oldStatus: session.status,
      newStatus: next.status,
    });
  }
}

export function getApplySessionStorageBackend() {
  return APPLY_SESSION_STORAGE_BACKEND;
}

export function createSession(
  applicationId: string,
  initial?: ApplySessionCreateData,
  context?: ApplySessionLogContext,
): ApplySession {
  const now = Date.now();
  const session: ApplySession = {
    id: makeId(),
    applicationId,
    status: "STARTING",
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    lastHeartbeatAt: now,
    lastProgressAt: now,
    lastStatusChangeAt: now,
    lastKnownStatus: "STARTING",
    runnerActive: false,
    progressVersion: 0,
    submissionStatus: "PENDING",
    emailStatus: "PENDING",
    ...initial,
  };

  console.info("[APPLY_SESSION] create", {
    sessionId: session.id,
    applicationId: session.applicationId,
    status: session.status,
    found: false,
    storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
    ...buildLogContext(context),
  });

  supersedeOlderSessionsForApplication({
    applicationId: session.applicationId,
    newSessionId: session.id,
  });

  sessions.set(session.id, session);
  persistSessionToDisk(session);

  console.info("[APPLY_SESSION] persist", {
    sessionId: session.id,
    applicationId: session.applicationId,
    status: session.status,
    found: true,
    storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
    ...buildLogContext(context),
  });

  return session;
}

export function updateSession(
  id: string,
  patch: Partial<ApplySession>,
  context?: ApplySessionLogContext,
) {
  const current = sessions.get(id) ?? readSessionFromDisk(id);
  if (!current) {
    console.warn("[APPLY_SESSION] missing", {
      sessionId: id,
      applicationId: null,
      status: patch.status ?? null,
      found: false,
      storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
      ...buildLogContext(context),
    });
    return undefined;
  }

  console.info("[APPLY_SESSION] update", {
    sessionId: current.id,
    applicationId: current.applicationId,
    status: patch.status ?? current.status,
    found: true,
    storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
    ...buildLogContext(context),
  });

  const now = Date.now();
  const nextStatus = patch.status ?? current.status;
  const nextKnownUrl = pickKnownUrl({ ...current, ...patch });
  const statusChanged = nextStatus !== current.status;
  const urlChanged = Boolean(nextKnownUrl && nextKnownUrl !== current.lastKnownUrl);
  const runnerHeartbeatAt = patch.lastRunnerHeartbeatAt ?? patch.lastHeartbeatAt;
  const formProgress =
    context?.phase !== "poll" &&
    (nextStatus === "FILLING_FORM" ||
      patch.debug?.formDetected === true ||
      patch.debug?.formFound === true ||
      patch.debug?.formFillAttempted === true ||
      patch.debug?.resumeUploadSucceeded === true ||
      patch.debug?.aiFormAnswersGenerated === true ||
      patch.debug?.aiFormAutofillCompleted === true ||
      patch.debug?.finalRequiredCheckPassed !== undefined ||
      patch.debug?.allRequiredFieldsFilled !== undefined ||
      patch.debug?.finalRecheckPassed !== undefined ||
      patch.debug?.readyToSubmit !== undefined ||
      patch.debug?.submitAttempted === true ||
      patch.debug?.submitButtonClicked === true ||
      patch.debug?.submissionConfirmed === true);
  const backgroundProgress =
    context?.phase !== "poll" &&
    (statusChanged ||
      urlChanged ||
      patch.submissionStatus !== undefined ||
      patch.emailStatus !== undefined ||
      patch.error !== undefined ||
      patch.message !== undefined ||
      (patch.debug?.formDetected === true && current.debug?.formDetected !== true) ||
      (patch.debug?.formFound === true && current.debug?.formFound !== true) ||
      patch.debug?.formFillAttempted === true ||
      patch.debug?.finalRequiredCheckPassed === true ||
      patch.debug?.allRequiredFieldsFilled === true ||
      patch.debug?.finalRecheckPassed === true ||
      patch.debug?.readyToSubmit === true ||
      patch.debug?.submitAttempted === true ||
      patch.debug?.submitButtonClicked === true ||
      patch.debug?.submissionConfirmed === true);
  const nextFillingFormStartedAt =
    nextStatus === "FILLING_FORM"
      ? current.fillingFormStartedAt ?? now
      : patch.fillingFormStartedAt ?? current.fillingFormStartedAt;
  const nextLastFormRecheckAt =
    patch.lastFormRecheckAt ??
    patch.debug?.lastFormRecheckAt ??
    (patch.debug?.finalRecheckPassed !== undefined ? now : current.lastFormRecheckAt);
  const next = {
    ...current,
    ...patch,
    updatedAt: now,
    createdAt: current.createdAt ?? current.startedAt,
    fillingFormStartedAt: nextFillingFormStartedAt,
    lastRunnerHeartbeatAt:
      runnerHeartbeatAt ?? current.lastRunnerHeartbeatAt,
    lastRunnerProgressAt: backgroundProgress
      ? now
      : patch.lastRunnerProgressAt ?? current.lastRunnerProgressAt,
    lastMeaningfulFormProgressAt: formProgress
      ? now
      : patch.lastMeaningfulFormProgressAt ?? current.lastMeaningfulFormProgressAt,
    lastFormRecheckAt: nextLastFormRecheckAt,
    lastStatusChangeAt: statusChanged
      ? now
      : current.lastStatusChangeAt ?? current.updatedAt,
    lastKnownStatus: nextStatus,
    lastKnownUrl: nextKnownUrl ?? current.lastKnownUrl,
    lastProgressAt: backgroundProgress
      ? now
      : current.lastProgressAt ?? current.updatedAt,
    progressVersion: backgroundProgress
      ? (current.progressVersion ?? 0) + 1
      : current.progressVersion ?? 0,
  } satisfies ApplySession;

  if (patch.lastHeartbeatAt !== undefined) {
    console.info("[APPLY_SESSION_HEARTBEAT]", {
      sessionId: current.id,
      applicationId: current.applicationId,
      status: nextStatus,
      lastHeartbeatAt: patch.lastHeartbeatAt,
      runnerActive: patch.runnerActive ?? next.runnerActive ?? null,
      ...buildLogContext(context),
    });
  }
  if (runnerHeartbeatAt !== undefined && context?.phase !== "poll") {
    console.info("[APPLY_SESSION_RUNNER_HEARTBEAT]", {
      sessionId: current.id,
      applicationId: current.applicationId,
      status: nextStatus,
      lastRunnerHeartbeatAt: runnerHeartbeatAt,
      runnerActive: patch.runnerActive ?? next.runnerActive ?? null,
      ...buildLogContext(context),
    });
  }
  if (formProgress) {
    console.info("[APPLY_SESSION_FORM_PROGRESS]", {
      sessionId: current.id,
      applicationId: current.applicationId,
      status: nextStatus,
      lastMeaningfulFormProgressAt: next.lastMeaningfulFormProgressAt ?? null,
      lastFormRecheckAt: next.lastFormRecheckAt ?? null,
      progressVersion: next.progressVersion,
      ...buildLogContext(context),
    });
  }
  if (backgroundProgress) {
    console.info("[APPLY_SESSION_PROGRESS]", {
      sessionId: current.id,
      applicationId: current.applicationId,
      status: nextStatus,
      statusChanged,
      urlChanged,
      lastKnownUrl: next.lastKnownUrl ?? null,
      progressVersion: next.progressVersion,
      ...buildLogContext(context),
    });
  }
  sessions.set(id, next);
  persistSessionToDisk(next);

  console.info("[APPLY_SESSION] persist", {
    sessionId: next.id,
    applicationId: next.applicationId,
    status: next.status,
    found: true,
    storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
    ...buildLogContext(context),
  });

  return next;
}

export function getSession(id: string, context?: ApplySessionLogContext) {
  const inMemory = sessions.get(id);
  if (inMemory) {
    console.info("[APPLY_SESSION] fetch", {
      sessionId: inMemory.id,
      applicationId: inMemory.applicationId,
      status: inMemory.status,
      found: true,
      storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
      ...buildLogContext(context),
    });
    return inMemory;
  }

  const persisted = readSessionFromDisk(id);
  if (persisted) {
    sessions.set(id, persisted);
    console.info("[APPLY_SESSION] fetch", {
      sessionId: persisted.id,
      applicationId: persisted.applicationId,
      status: persisted.status,
      found: true,
      storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
      ...buildLogContext(context),
    });
    return persisted;
  }

  console.warn("[APPLY_SESSION] missing", {
    sessionId: id,
    applicationId: null,
    status: null,
    found: false,
    storageBackendUsed: APPLY_SESSION_STORAGE_BACKEND,
    ...buildLogContext(context),
  });
  return undefined;
}

export function deleteSession(id: string) {
  sessions.delete(id);
  try {
    rmSync(getApplySessionFilePath(id), { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}
