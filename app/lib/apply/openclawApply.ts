import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ApplySessionClickRecord,
  ApplySessionDebug,
} from "@/app/lib/apply/applySessionStore";
import type { ApplySessionStatus } from "@/app/lib/apply/sessionStatus";
import {
  startOpenClawRun,
  waitForOpenClawRun,
  type OpenClawRunSnapshot,
} from "@/app/lib/apply/providers/openclaw";
import { describeRemoteBrowserRuntime } from "@/app/lib/apply/remoteBrowser";

export type OpenClawApplyResult = {
  ok: boolean;
  status: ApplySessionStatus;
  finalUrl?: string;
  message?: string;
  unavailable?: boolean;
  verificationDetected?: boolean;
  debug: ApplySessionDebug;
};

type StatusUpdate = {
  status: ApplySessionStatus;
  lastUrl?: string;
  error?: string;
  message?: string;
  debug?: ApplySessionDebug;
};

const APPLY_CTA_PATTERNS = [
  "Apply",
  "Apply Now",
  "Continue to Application",
  "Continue",
  "Start Application",
  "Submit Application",
  "Easy Apply",
  "Apply on company site",
  "Visit Site to Apply",
  "Next",
] as const;

const VERIFICATION_PATTERNS = [
  "verify you are human",
  "human verification",
  "captcha",
  "recaptcha",
  "turnstile",
  "cloudflare",
  "security check",
  "security verification",
  "verification required",
  "email verification",
  "verify your email",
  "check your email",
  "verification code",
  "one-time passcode",
  "one time passcode",
  "one-time code",
  "one time code",
  "otp",
] as const;

const CONFIRMATION_PATTERNS = [
  "application submitted",
  "thank you",
  "thanks for applying",
  "we have received your application",
  "your application has been submitted",
  "successfully applied",
  "application received",
] as const;

const ACCOUNT_CREATION_PATTERNS = [
  "create account",
  "create your account",
  "sign up",
  "register",
  "finish creating your account",
  "set your password",
  "confirm your email",
];

function normalizeStatus(status: string | undefined, snapshot: OpenClawRunSnapshot) {
  const normalized = String(status ?? "").trim().toUpperCase();

  switch (normalized) {
    case "STARTING":
      return "STARTING";
    case "FINDING_APPLY":
    case "CRAWLING":
      return "FINDING_APPLY";
    case "OPENING_FORM":
      return "OPENING_FORM";
    case "FILLING_FORM":
      return "FILLING_FORM";
    case "SUBMITTING":
      return "SUBMITTING";
    case "WAITING_CONFIRMATION":
      return "WAITING_CONFIRMATION";
    case "SUBMITTED":
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETED":
    case "DONE":
      return "SUBMITTED";
    case "VERIFICATION_BLOCKED":
    case "HUMAN_REQUIRED":
    case "AUTO_APPLY_UNAVAILABLE":
    case "UNAVAILABLE":
      return "AUTO_APPLY_UNAVAILABLE";
    case "FAILED":
    case "ERROR":
      return "FAILED";
    default:
      if (snapshot.verificationDetected) return "AUTO_APPLY_UNAVAILABLE";
      if (snapshot.confirmationDetected) return "SUBMITTED";
      if (snapshot.formDetected) return "OPENING_FORM";
      return "FAILED";
  }
}

function toClickRecord(value: Record<string, unknown>, index: number): ApplySessionClickRecord {
  return {
    hop:
      typeof value.hop === "number" && Number.isFinite(value.hop)
        ? value.hop
        : index + 1,
    fromUrl: typeof value.fromUrl === "string" ? value.fromUrl : "",
    toUrl: typeof value.toUrl === "string" ? value.toUrl : undefined,
    selector: typeof value.selector === "string" ? value.selector : "",
    text: typeof value.text === "string" ? value.text : undefined,
    navigation:
      value.navigation === "popup" ||
      value.navigation === "new-page" ||
      value.navigation === "same-tab"
        ? value.navigation
        : "same-tab",
  };
}

function buildDebug(snapshot: OpenClawRunSnapshot): ApplySessionDebug {
  return {
    hopCount: snapshot.hopCount ?? snapshot.clicks?.length ?? 0,
    urlsVisited: snapshot.urlsVisited ?? [],
    clicks: (snapshot.clicks ?? []).map(toClickRecord),
    formDetected: snapshot.formDetected,
    confirmationDetected: snapshot.confirmationDetected,
    verificationDetected: snapshot.verificationDetected,
    finalReason: snapshot.finalReason ?? snapshot.message,
  };
}

function buildMessage(snapshot: OpenClawRunSnapshot, status: ApplySessionStatus) {
  if (snapshot.message) return snapshot.message;

  switch (status) {
    case "FINDING_APPLY":
      return "Finding the application path.";
    case "OPENING_FORM":
      return "Opening the application form.";
    case "FILLING_FORM":
      return "Filling the application form.";
    case "SUBMITTING":
    case "WAITING_CONFIRMATION":
      return "Submitting the application.";
    case "AUTO_APPLY_UNAVAILABLE":
      return "Auto apply is not available for this job application.";
    case "SUBMITTED":
      return "Application submitted.";
    default:
      return undefined;
  }
}

async function maybeReadResume(resumePath: string | null | undefined) {
  if (!resumePath) return null;

  const buffer = await readFile(resumePath);
  return {
    fileName: path.basename(resumePath),
    contentBase64: buffer.toString("base64"),
  };
}

function toStatusUpdate(snapshot: OpenClawRunSnapshot): StatusUpdate {
  const status = normalizeStatus(snapshot.status, snapshot);
  const debug = buildDebug(snapshot);
  const lastUrl = snapshot.finalUrl ?? snapshot.lastUrl ?? debug.urlsVisited?.at(-1);

  return {
    status,
    lastUrl,
    error: status === "FAILED" ? snapshot.message ?? snapshot.finalReason : undefined,
    message: buildMessage(snapshot, status),
    debug,
  };
}

export async function applyWithOpenClaw(args: {
  applicationId: string;
  applySessionId?: string;
  jobUrl: string;
  embedUrl?: string;
  values: Record<string, string | string[]>;
  resumePath?: string | null;
  onStatus?: (update: StatusUpdate) => Promise<void> | void;
}): Promise<OpenClawApplyResult> {
  const targetUrl = args.embedUrl ?? args.jobUrl;
  const runtime = describeRemoteBrowserRuntime();
  const resume = await maybeReadResume(args.resumePath);

  console.log("[OPENCLAW_APPLY] starting automation", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    jobUrl: args.jobUrl,
    targetUrl,
    hasResume: Boolean(resume),
    fieldCount: Object.keys(args.values).length,
    runtime,
  });

  await args.onStatus?.({
    status: "STARTING",
    lastUrl: targetUrl,
    message: "Starting OpenClaw automation.",
  });
  await args.onStatus?.({
    status: "FINDING_APPLY",
    lastUrl: targetUrl,
    message: "Finding the application path.",
  });

  const initial = await startOpenClawRun({
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    engine: "openclaw",
    mode: "AUTO_APPLY",
    browser: {
      provider: "openclaw",
      managed: true,
      isolatedProfile: true,
      headless: true,
      attachToUserBrowser: false,
      exposeViewer: false,
    },
    target: {
      jobUrl: args.jobUrl,
      startUrl: targetUrl,
      sourceHost: (() => {
        try {
          return new URL(args.jobUrl).hostname;
        } catch {
          return null;
        }
      })(),
    },
    crawl: {
      maxHops: 7,
      sameTab: true,
      popupSupport: true,
      settleDelayMs: 1200,
      ctaPatterns: [...APPLY_CTA_PATTERNS],
      stopWhen: [
        "form_detected",
        "confirmation_detected",
        "verification_detected",
        "no_usable_apply_button",
      ],
    },
    detection: {
      verificationPatterns: [...VERIFICATION_PATTERNS],
      confirmationPatterns: [...CONFIRMATION_PATTERNS],
      accountCreationPatterns: [...ACCOUNT_CREATION_PATTERNS],
      formSelectors: [
        "form input:not([type='hidden'])",
        "form textarea",
        "form select",
        "input[type='file']",
      ],
    },
    policy: {
      verificationAction: "AUTO_APPLY_UNAVAILABLE",
      allowSyntheticAccounts: false,
      allowSharedBurnerCredentials: false,
      allowUserBrowserAttach: false,
      requireRealEmailOrRelay: true,
    },
    application: {
      answers: args.values,
      resume,
    },
    observability: {
      logPrefix: "[OPENCLAW_CRAWL]",
      captureVisitedUrls: true,
      captureClickedSelectors: true,
    },
  });

  const finalSnapshot = await waitForOpenClawRun({
    initial,
    onUpdate: (snapshot) => {
      const update = toStatusUpdate(snapshot);

      console.log("[OPENCLAW_STATUS] update", {
        applicationId: args.applicationId,
        applySessionId: args.applySessionId ?? null,
        status: update.status,
        hopCount: update.debug?.hopCount ?? 0,
        lastUrl: update.lastUrl ?? null,
      });

      return args.onStatus?.(update);
    },
  });

  const finalStatus = normalizeStatus(finalSnapshot.status, finalSnapshot);
  const debug = buildDebug(finalSnapshot);
  const finalUrl =
    finalSnapshot.finalUrl ??
    finalSnapshot.lastUrl ??
    finalSnapshot.urlsVisited?.at(-1);

  console.log("[OPENCLAW_APPLY] completed automation", {
    applicationId: args.applicationId,
    applySessionId: args.applySessionId ?? null,
    status: finalStatus,
    hopCount: debug.hopCount ?? 0,
    urlsVisited: debug.urlsVisited ?? [],
    formDetected: Boolean(debug.formDetected),
    confirmationDetected: Boolean(debug.confirmationDetected),
    verificationDetected: Boolean(debug.verificationDetected),
    finalReason: debug.finalReason ?? null,
  });

  return {
    ok: finalStatus === "SUBMITTED",
    status: finalStatus,
    finalUrl,
    message: buildMessage(finalSnapshot, finalStatus),
    unavailable: finalStatus === "AUTO_APPLY_UNAVAILABLE",
    verificationDetected: Boolean(finalSnapshot.verificationDetected),
    debug,
  };
}
