import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApplyStopClassification } from "@/app/lib/apply/stopClassification";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";

export type ApplySessionClickRecord = {
  hop: number;
  fromUrl: string;
  toUrl?: string;
  selector: string;
  text?: string;
  navigation: "same-tab" | "popup" | "new-page";
};

export type ApplySessionCtaAttemptRecord = {
  phase: "entry" | "handoff" | "cookie";
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
  entryUrl?: string;
  initialLoadedUrl?: string;
  finalUrl?: string;
  domain?: string;
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
  formDetected?: boolean;
  submitButtonFound?: boolean;
  submitButtonClicked?: boolean;
  confirmationDetected?: boolean;
  confirmationTextFound?: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched?: boolean;
  verificationDetected?: boolean;
  submissionConfirmed?: boolean;
  stopReason?: "HUMAN_INTERVENTION_REQUIRED";
  lastAction?: "no_apply_cta" | "login_required" | "verification_required";
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
  resolvedHandoffClickAttempted?: boolean;
  resolvedHandoffClickSucceeded?: boolean;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
};

export type ApplySubmissionStatus = "PENDING" | "SUBMITTED" | "NOT_SUBMITTED";

export type ApplyEmailStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export type ApplySession = {
  id: string;
  applicationId: string;
  status: ApplySessionStatus;
  startedAt: number;
  updatedAt: number;
  submissionStatus?: ApplySubmissionStatus;
  emailStatus?: ApplyEmailStatus;
  lastUrl?: string;
  error?: string;
  message?: string;
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
    startedAt: now,
    updatedAt: now,
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

  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
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
