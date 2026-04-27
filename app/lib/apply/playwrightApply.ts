import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  chromium as playwrightChromium,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from "playwright-core";
import {
  closeRemoteSession,
  createRemoteSession,
  shouldUseRemoteBrowser,
} from "@/app/lib/apply/remoteBrowser";
import {
  connectScrapflyBrowserSession,
  disconnectScrapflyBrowserSession,
} from "@/app/lib/apply/scrapfly-browser";
import {
  classifyAdzunaHandoffUrl,
  extractAdzunaHandoffSignals,
  isAdzunaLandAdUrl,
  isAdzunaUnresolvedHandoffUrl,
  isAdzunaUrl,
  isLikelyDownstreamApplicationUrl,
} from "@/app/lib/apply/adzunaHandoff";
import {
  readBrowserRuntimeDiagnostics,
  type BrowserRuntimeDiagnostics,
} from "@/app/lib/apply/browserRuntimeDiagnostics";
import {
  findMatchingLocator,
  extractLocatorText,
} from "@/app/lib/apply/formFieldLocators";
import {
  detectGreenhouseApplicationForm,
  fillGreenhouseApplicationForm,
  isGreenhouseUrl,
  type FillGreenhouseApplicationFormResult,
} from "@/app/lib/apply/providers/greenhouse";
import { generateFormAnswers } from "@/app/lib/apply/formIntelligence/aiFormAnswerGenerator";
import { fillGeneratedAnswers } from "@/app/lib/apply/formIntelligence/playwrightFormFiller";
import { scanCurrentForm } from "@/app/lib/apply/formIntelligence/formScanner";
import { classifyRequiredApplicationField } from "@/app/lib/apply/form-field-classifier";
import { fillApplicationFormIteratively } from "@/app/lib/apply/iterativeFormFiller";
import type {
  FillGeneratedAnswersResult,
  FormFieldDescriptor,
  GeneratedFormAnswer,
} from "@/app/lib/apply/formIntelligence/types";
import { getResolvedUrlCompatibility } from "@/app/lib/apply/resolvedUrlCompatibility";
import { cssEscape } from "@/app/lib/apply/cssEscape";
import {
  chaseApplyPath,
  type CtaChaseResult,
} from "@/app/lib/apply/playwrightCrawl";
import {
  JOB_SEARCH_FALLBACK_MAX_CANDIDATE_VISITS,
  discoverJobSearchFallbackCandidates,
  inspectJobSearchFallbackPage,
  confirmJobSearchFallbackProgress,
  type JobSearchFallbackCandidate,
} from "@/app/lib/apply/jobSearchFallback";
import {
  REAL_POSTING_NOT_FOUND_CODE,
  resolveRealPostingViaEcosia,
  selectInitialAutomationTarget,
} from "@/app/lib/apply/jobSourceResolution";
import {
  APPLY_SETTLE_DELAY_MS,
  detectPageSignals,
  waitForMeaningfulFormControls,
  waitForDomAndSettle,
  type PageSignals,
} from "@/app/lib/apply/playwrightSignals";
import {
  deriveStopClassification,
  shouldAllowVerificationRequired,
  type ApplyStopClassification,
  type VerificationEvidence,
} from "@/app/lib/apply/stopClassification";
import type { DirectJobResolution } from "@/app/lib/apply/directJobResolver";
import type { ApplySiteStrategyStep } from "@/app/lib/apply/playwrightStrategyTypes";
import type {
  ApplySubmissionStatus,
  ApplySessionCtaAttemptRecord,
  ApplySessionClickRecord,
  ApplySessionDebug,
} from "@/app/lib/apply/applySessionStore";
import {
  APPLY_VERIFICATION_REQUIRED_USER_MESSAGE,
  type ApplySessionStatus,
} from "@/app/lib/apply/sessionStatus";
import {
  isKnownAggregatorHostname,
  validateAutomationStartUrl,
} from "@/app/lib/apply/urlValidation";
import { classifyJobUrlKind, normalizeJobUrl } from "@/app/lib/jobSources";
import { compareAtsJobIdentityFromUrls } from "@/app/lib/apply/atsUrlIdentity";
import {
  extractGreenhouseValidationErrors,
  type GreenhouseValidationExtractionResult,
} from "@/app/lib/apply/greenhouseValidationErrors";
import {
  detectGreenhouseSubmissionConfirmation,
  detectSubmissionConfirmationAcrossPages,
  isSubmissionConfirmationUrl,
  submitAndDetectGreenhouseConfirmation,
  type SubmissionConfirmationMatch,
} from "@/app/lib/apply/confirmationDetector";

export {
  detectSubmissionConfirmationAcrossPages,
  isSubmissionConfirmationText,
  isSubmissionConfirmationUrl,
} from "@/app/lib/apply/confirmationDetector";

export type PlaywrightApplyResult = {
  ok: boolean;
  status: ApplySessionStatus;
  finalUrl?: string;
  needsHuman?: boolean;
  unavailable?: boolean;
  openUrl?: string;
  viewerUrl?: string;
  message?: string;
  debug?: {
    attemptedSelectors: string[];
    missingNames: string[];
    entryUrl?: string;
    initialLoadedUrl?: string;
    finalUrl?: string;
    originalJobUrl?: string;
    resolvedDirectUrl?: string;
    applySource?: string;
    usedResolvedDirectUrl?: boolean;
    directJobResolutionAttempted?: boolean;
    directJobResolutionConfidence?: number;
    directJobResolutionProvider?: string;
    directJobResolutionMatchReason?: string;
    directJobResolutionError?: string;
    directJobResolutionCandidates?: DirectJobResolution["candidates"];
    searchFallbackTriggered?: boolean;
    searchFallbackQueries?: string[];
    searchFallbackCandidates?: JobSearchFallbackCandidate[];
    searchFallbackChosenCandidate?: string;
    searchFallbackAttemptCount?: number;
    searchFallbackSuccess?: boolean;
    searchFallbackFailureReason?: string;
    startingUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
    finalChosenUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
    domain?: string;
    stoppedAtUrl?: string;
    stoppedAtTitle?: string;
    lastActionText?: string;
    lastActionSelector?: string;
    submitSelectorUsed?: string | null;
    verificationSignals: string[];
    confirmationSignals: string[];
    pageText?: string;
    pageHtml?: string;
    sessionId?: string;
    viewerUrl?: string;
    targetUrl?: string;
    applyCtaFound: boolean;
    applyCtaClicked: boolean;
    urlBeforeClick?: string;
    urlAfterClick?: string;
    currentUrl?: string;
    providerDetected?: string;
    formContextUrl?: string;
    submitButtonFound: boolean;
    submitButtonEnabled?: boolean;
    submitButtonClicked: boolean;
    confirmationTextFound: boolean;
    confirmationTextSnippet?: string | null;
    successUrlPatternMatched: boolean;
    confirmationMatchedBy?: "url" | "text" | "popup" | "context-page";
    confirmationFinalUrl?: string;
    confirmationUrl?: string;
    confirmationSource?: string | null;
    popupUrl?: string | null;
    sameTabUrl?: string | null;
    submissionConfirmed: boolean;
    finalRequiredCheckPassed?: boolean;
    allRequiredFieldsFilled?: boolean;
    lastFormRecheckAt?: number;
    finalRecheckPassed?: boolean;
    readyToSubmit?: boolean;
    submitAttempted?: boolean;
    visibleValidationErrors?: string[];
    postSubmitValidationErrorCount?: number;
    postSubmitValidationErrors?: GreenhouseValidationExtractionResult["errors"];
    postSubmitValidationRepairAttempted?: boolean;
    postSubmitValidationRepairSucceeded?: boolean;
    fileUploadPending?: boolean;
    verificationChallengeVisible?: boolean;
    reviewBeforeSubmit?: boolean;
    actionLabel?: string;
    submittedAt?: string;
    finalStatus: ApplySessionStatus;
    success: boolean;
    needsHuman: boolean;
    unavailable: boolean;
    hopCount: number;
    urlsVisited: string[];
    clicks: ApplySessionClickRecord[];
    ctaAttempts?: ApplySessionCtaAttemptRecord[];
    entryCtaFound?: boolean;
    entryCtaClicked?: boolean;
    entryCtaClickedText?: string;
    entryCtaClickedSelector?: string;
    entryDismissedBlocker?: boolean;
    adzunaApplyCaptureDetected?: boolean;
    adzunaApplyCaptureSkipClicked?: boolean;
    adzunaApplyCaptureSkipText?: string;
    adzunaApplyCaptureSkipSelector?: string;
    adzunaPostApplyProgressionAttempted?: boolean;
    adzunaPostApplyProgressionSucceeded?: boolean;
    adzunaPostApplyUrlAfter?: string;
    adzunaPostApplyPopupDetected?: boolean;
    adzunaPostApplyNewPageDetected?: boolean;
    adzunaPostApplyFallbackAttempted?: boolean;
    applyHrefExtracted?: string;
    applyNavigationForced?: boolean;
    applyNavigationUrl?: string;
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
    formDetected: boolean;
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
    missingQuestions?: ApplySessionDebug["missingQuestions"];
    verificationEvidence?: VerificationEvidence;
    verificationOverriddenByVisibleForm?: boolean;
    confirmationDetected: boolean;
    verificationDetected: boolean;
    finalReason?: string;
    stopClassification?: ApplyStopClassification;
    resolverAttemptedLinks?: string[];
    resolverCandidates?: ApplySourceCandidate[];
    resolverRejectedCandidates?: ApplySourceRejectedCandidate[];
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
    adzunaLoginAttempted?: boolean;
    adzunaLoginSucceeded?: boolean;
    adzunaLoginFailedReason?: string;
    blockedResolvedHandoffCandidates?: ApplySourceRejectedCandidate[];
    selectedResolvedHandoffCandidate?: string;
    resolvedHandoffClickAttempted?: boolean;
    resolvedHandoffClickSucceeded?: boolean;
    resolvedHandoffElementFound?: boolean;
    resolvedHandoffLocatorStrategy?: string;
    resolvedHandoffDirectNavAttempted?: boolean;
    resolvedHandoffDirectNavSucceeded?: boolean;
    resolvedHandoffDirectNavUrl?: string;
    resolvedHandoffDirectNavUrlAfter?: string;
    adzunaFallbackLinkFound?: boolean;
    adzunaFallbackLinkClicked?: boolean;
    adzunaFallbackLinkText?: string;
    adzunaFallbackLocatorStrategy?: string;
    adzunaFallbackElementFound?: boolean;
    adzunaFallbackClickSucceeded?: boolean;
    adzunaFallbackHref?: string;
    adzunaFallbackHost?: string;
    adzunaFallbackDirectNavAttempted?: boolean;
    adzunaFallbackDirectNavSucceeded?: boolean;
    adzunaExtractedRedirectUrl?: string;
    adzunaExtractedRedirectSource?:
      | "meta_refresh"
      | "inline_script"
      | "fallback_anchor"
      | "appcast_href"
      | "tokenized_dom_candidate";
    adzunaExtractedRedirectHtmlRead?: boolean;
    adzunaExtractedRedirectFailureReason?: string[];
    adzunaExtractedRedirectNavAttempted?: boolean;
    adzunaExtractedRedirectNavSucceeded?: boolean;
    adzunaFallbackUrlAfter?: string;
    adzunaInterstitialRecognized?: boolean;
    appcastHopDetected?: boolean;
    diceDestinationDetected?: boolean;
    handoffResolvedViaKnownChain?: boolean;
    knownChainClassificationGuardApplied?: boolean;
    knownChainContinuationExhausted?: boolean;
    knownChainAllowedToFail?: boolean;
    resolvedHandoffClickedHref?: string;
    resolvedHandoffClickedText?: string;
    resolvedHandoffUrlBefore?: string;
    resolvedHandoffUrlAfter?: string;
    strategyMatched?: boolean;
    strategyId?: string;
    strategySourceHost?: string;
    strategyDestinationHost?: string;
    strategyType?: string;
    strategyPageType?: string;
    strategyDerivedInstruction?: string;
    strategyAutomationPrompt?: string;
    strategyStartUrl?: string;
    strategySanitizedStepCount?: number;
    playwrightLaunchStrategy?: "remote" | "local_ephemeral" | "local_persistent";
    playwrightPersistentContext?: boolean;
    playwrightUserDataDir?: string;
    rtxFlowAttempted?: boolean;
    rtxFlowCompleted?: boolean;
    rtxProgressMarkers?: string[];
    rtxFailureReason?: string;
    rtxJobId?: string;
  };
};

type AnswerValue = string | string[];
type ApplyStatusUpdate = {
  status: ApplySessionStatus;
  lastUrl?: string;
  error?: string;
  message?: string;
  viewerUrl?: string;
  openUrl?: string;
  remoteSessionId?: string;
  submissionStatus?: ApplySubmissionStatus;
  debug?: Partial<ApplySessionDebug>;
};

function asArray(value: AnswerValue) {
  return Array.isArray(value)
    ? value.map((item) => String(item))
    : [String(value ?? "")];
}

function shouldAllowChoiceControls(
  fieldName: string,
  rawValue: AnswerValue,
) {
  const normalized = fieldName.toLowerCase();
  const namedChoiceField = /(consent|agree|terms|authorization|authorisation|authorized|authorised|veteran|disability|gender|race|ethnicity|sponsor|work[-_\\s]?authorization|eeo|opt[-_\\s]?in|subscribe|newsletter|checkbox|radio)/i.test(
    normalized,
  );

  if (namedChoiceField) return true;
  if (!Array.isArray(rawValue)) return false;

  return /(consent|terms|authorization|authorisation|veteran|disability|gender|race|ethnicity|eeo)/i.test(
    normalized,
  );
}

function parseBooleanEnv(value: string | undefined) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return null;
}

type ApplyChromiumRuntime = typeof playwrightChromium & {
  use?: (plugin: unknown) => void;
};

type ApplyBrowserAutomationLibrary = "playwright" | "playwright-extra";

type ApplyBrowserRuntimeResolution = {
  chromium: ApplyChromiumRuntime;
  browserAutomationLibrary: ApplyBrowserAutomationLibrary;
  stealthRequested: boolean;
  playwrightExtraAvailable: boolean;
  puppeteerExtraAvailable: boolean;
  stealthDependencyInstalled: boolean;
  stealthRuntimeEnabled: boolean;
  stealthPluginRegistered: boolean;
};

let applyStealthPluginRegistered = false;

function buildDefaultApplyBrowserRuntimeResolution(): ApplyBrowserRuntimeResolution {
  return {
    chromium: playwrightChromium,
    browserAutomationLibrary: "playwright",
    stealthRequested: false,
    playwrightExtraAvailable: false,
    puppeteerExtraAvailable: false,
    stealthDependencyInstalled: false,
    stealthRuntimeEnabled: false,
    stealthPluginRegistered: false,
  };
}

function resolveStealthPluginFactory(
  moduleValue: unknown,
): (() => unknown) | null {
  if (!moduleValue) return null;

  const fromDefault =
    typeof (moduleValue as { default?: unknown }).default === "function"
      ? ((moduleValue as { default: () => unknown }).default as () => unknown)
      : null;

  if (fromDefault) {
    return fromDefault;
  }

  return typeof moduleValue === "function" ? (moduleValue as () => unknown) : null;
}

async function optionalRuntimeImport(specifier: string): Promise<unknown | null> {
  try {
    return await import(/* webpackIgnore: true */ specifier);
  } catch {
    return null;
  }
}

async function resolveApplyBrowserRuntime(): Promise<ApplyBrowserRuntimeResolution> {
  const fallback = buildDefaultApplyBrowserRuntimeResolution();
  const stealthRequested =
    parseBooleanEnv(process.env.APPLY_STEALTH_ENABLED) === true;

  if (!stealthRequested) {
    return {
      ...fallback,
      stealthRequested,
    };
  }

  let playwrightExtraAvailable = false;
  let puppeteerExtraAvailable = false;
  let stealthDependencyInstalled = false;

  try {
    const [playwrightExtraModule, puppeteerExtraModule, stealthPluginModule] =
      await Promise.all([
        optionalRuntimeImport("playwright-extra"),
        optionalRuntimeImport("puppeteer-extra"),
        optionalRuntimeImport("puppeteer-extra-plugin-stealth"),
      ]);

    playwrightExtraAvailable = Boolean(playwrightExtraModule);
    puppeteerExtraAvailable = Boolean(puppeteerExtraModule);
    stealthDependencyInstalled = Boolean(stealthPluginModule);

    const runtimeChromium =
      (playwrightExtraModule as { chromium?: ApplyChromiumRuntime } | null)
        ?.chromium ?? null;
    const stealthPluginFactory = resolveStealthPluginFactory(stealthPluginModule);

    if (
      !runtimeChromium ||
      typeof runtimeChromium.launch !== "function" ||
      typeof runtimeChromium.use !== "function" ||
      !stealthPluginFactory
    ) {
      return {
        ...fallback,
        stealthRequested,
        playwrightExtraAvailable,
        puppeteerExtraAvailable,
        stealthDependencyInstalled,
      };
    }

    if (!applyStealthPluginRegistered) {
      runtimeChromium.use(stealthPluginFactory());
      applyStealthPluginRegistered = true;
    }

    return {
      chromium: runtimeChromium,
      browserAutomationLibrary: "playwright-extra",
      stealthRequested,
      playwrightExtraAvailable,
      puppeteerExtraAvailable,
      stealthDependencyInstalled,
      stealthRuntimeEnabled: true,
      stealthPluginRegistered: applyStealthPluginRegistered,
    };
  } catch (error) {
    console.warn("[AUTO_APPLY_BROWSER_RUNTIME] stealth runtime initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...fallback,
      stealthRequested,
      playwrightExtraAvailable,
      puppeteerExtraAvailable,
      stealthDependencyInstalled,
    };
  }
}

function resolveLocalHeadless(mode: "AUTO" | "HUMAN_ASSIST" | undefined) {
  const requested = parseBooleanEnv(process.env.PLAYWRIGHT_HEADLESS);

  if (requested === false && process.env.NODE_ENV === "production") {
    console.warn(
      "[AUTO_APPLY_PLAYWRIGHT] ignoring PLAYWRIGHT_HEADLESS=false in production; forcing headless mode",
    );
    return true;
  }

  if (requested !== null) {
    return requested;
  }

  return mode === "HUMAN_ASSIST" ? false : true;
}

function sanitizeEnvString(value: string | undefined) {
  if (!value) return undefined;

  const trimmed = value.trim().replace(/^['"]|['"]$/g, "").trim();
  return trimmed || undefined;
}

function buildPersistentUserDataDir(baseDir: string) {
  return path.join(
    baseDir,
    `apply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
}

function resolveLocalLaunchOptions(
  mode: "AUTO" | "HUMAN_ASSIST" | undefined,
  freshSession: boolean,
): LocalPlaywrightLaunchOptions {
  const headedDebug =
    parseBooleanEnv(process.env.PLAYWRIGHT_HEADED_DEBUG) === true;
  const requestedPersistent =
    parseBooleanEnv(process.env.PLAYWRIGHT_PERSISTENT_CONTEXT) === true;
  const headless = headedDebug ? false : resolveLocalHeadless(mode);

  if (freshSession || !requestedPersistent) {
    return {
      strategy: "local_ephemeral",
      headless,
      persistentContext: false,
      headedDebug,
    };
  }

  const baseDir =
    sanitizeEnvString(process.env.PLAYWRIGHT_USER_DATA_DIR) ??
    path.join(tmpdir(), "hirexa-playwright-profiles");
  const userDataDir = buildPersistentUserDataDir(baseDir);

  return {
    strategy: "local_persistent",
    headless,
    persistentContext: true,
    userDataDir,
    headedDebug,
  };
}

function resolveUrlOrigin(value: string | null | undefined) {
  const normalized = normalizeJobUrl(value ?? "");
  if (!normalized) return null;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

async function resetRuntimeSessionState(args: {
  context: BrowserContext;
  page: Page;
  targetUrl?: string;
}) {
  await args.context.clearCookies().catch(() => undefined);
  await args.context
    .addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore blocked localStorage access.
      }
      try {
        window.sessionStorage.clear();
      } catch {
        // Ignore blocked sessionStorage access.
      }
    })
    .catch(() => undefined);

  const origin = resolveUrlOrigin(args.targetUrl);
  if (!origin) return;

  const cdpSession = await args.context.newCDPSession(args.page).catch(() => null);
  if (cdpSession) {
    await cdpSession
      .send("Storage.clearDataForOrigin", {
        origin,
        storageTypes:
          "appcache,cookies,file_systems,indexeddb,local_storage,service_workers,websql,cache_storage",
      })
      .catch(() => undefined);
    await cdpSession.detach().catch(() => undefined);
  }

  await args.page.goto(origin, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await args.page
    .evaluate(() => {
      try {
        window.localStorage.clear();
      } catch {
        // Ignore blocked localStorage access.
      }
      try {
        window.sessionStorage.clear();
      } catch {
        // Ignore blocked sessionStorage access.
      }
    })
    .catch(() => undefined);
}

function shouldUseCdp(connectUrl: string) {
  return connectUrl.startsWith("http://") || connectUrl.startsWith("https://");
}

type PlaywrightEvidence = {
  attemptedSelectors: string[];
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  urlBeforeClick?: string;
  urlAfterClick?: string;
  currentUrl: string;
  hopCount: number;
  submitButtonFound: boolean;
  submitButtonEnabled?: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  finalStatus: ApplySessionStatus;
  submissionConfirmed: boolean;
  formScanAttempted?: boolean;
  formFound?: boolean;
  formFillAttempted?: boolean;
  filledFieldCount?: number;
  requiredFieldCount?: number;
  missingRequiredFields?: string[];
  verificationDetected?: boolean;
  verificationEvidence?: VerificationEvidence;
};

type JobSearchFallbackDebugState = {
  triggered: boolean;
  queries: string[];
  candidates: JobSearchFallbackCandidate[];
  chosenCandidate?: string;
  attemptCount: number;
  success: boolean;
  failureReason?: string;
};

type JobSearchFallbackRunResult =
  | ({
      ok: true;
      page: Page;
      chase: CtaChaseResult;
    } & JobSearchFallbackDebugState)
  | ({
      ok: false;
    } & JobSearchFallbackDebugState);

type LocalPlaywrightLaunchOptions = {
  strategy: "local_ephemeral" | "local_persistent";
  headless: boolean;
  persistentContext: boolean;
  userDataDir?: string;
  headedDebug: boolean;
};

type KnownApplyDomain = "adzuna" | "dice" | "greenhouse" | "generic";

type EntryCtaConfig = {
  text: string;
  match: "exact" | "contains";
  dismissesBlocker?: boolean;
  preferredRole?: "button" | "link" | "any";
};

type EntryCtaCandidate = {
  selector: string;
  text: string;
  matchedText: string;
  dismissesBlocker: boolean;
};

type EntryCtaPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  ctaFound: boolean;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  dismissedBlocker: boolean;
};

type AdzunaDetailsApplyPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  applyClicks: ApplySessionClickRecord[];
  handled: boolean;
  applyClicked: boolean;
  applyClickedText?: string;
  applyClickedSelector?: string;
  applyCaptureDetected: boolean;
  applyCaptureSkipClicked: boolean;
  applyCaptureSkipText?: string;
  applyCaptureSkipSelector?: string;
  postApplyProgressionAttempted: boolean;
  postApplyProgressionSucceeded: boolean;
  postApplyUrlAfter?: string;
  postApplyPopupDetected: boolean;
  postApplyNewPageDetected: boolean;
  postApplyFallbackAttempted: boolean;
  applyHrefExtracted?: string;
  applyNavigationForced?: boolean;
  applyNavigationUrl?: string;
  latestActionText?: string;
  latestActionSelector?: string;
};

type HandoffContinuationResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  discoveredResolverCandidates: ApplySourceCandidate[];
  discoveredResolverRejectedCandidates: ApplySourceRejectedCandidate[];
  handoffPageDetected: boolean;
  handoffUrl?: string;
  continuationAttempted: boolean;
  continuationSucceeded: boolean;
  ctaFound: boolean;
  ctaClicked: boolean;
  ctaClickedText?: string;
  ctaClickedSelector?: string;
  resolvedHandoffClickAttempted: boolean;
  resolvedHandoffClickSucceeded: boolean;
  resolvedHandoffElementFound: boolean;
  resolvedHandoffLocatorStrategy?: string;
  resolvedHandoffDirectNavAttempted: boolean;
  resolvedHandoffDirectNavSucceeded: boolean;
  resolvedHandoffDirectNavUrl?: string;
  resolvedHandoffDirectNavUrlAfter?: string;
  adzunaFallbackLinkFound: boolean;
  adzunaFallbackLinkClicked: boolean;
  adzunaFallbackLinkText?: string;
  adzunaFallbackLocatorStrategy?: string;
  adzunaFallbackElementFound: boolean;
  adzunaFallbackClickSucceeded: boolean;
  adzunaFallbackHref?: string;
  adzunaFallbackHost?: string;
  adzunaFallbackDirectNavAttempted: boolean;
  adzunaFallbackDirectNavSucceeded: boolean;
  adzunaExtractedRedirectUrl?: string;
  adzunaExtractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate";
  adzunaExtractedRedirectHtmlRead: boolean;
  adzunaExtractedRedirectFailureReason?: string[];
  adzunaExtractedRedirectNavAttempted: boolean;
  adzunaExtractedRedirectNavSucceeded: boolean;
  adzunaFallbackUrlAfter?: string;
  adzunaInterstitialRecognized: boolean;
  appcastHopDetected: boolean;
  diceDestinationDetected: boolean;
  handoffResolvedViaKnownChain: boolean;
  adzunaTokenizedInterstitialDetected: boolean;
  adzunaTokenizedParamsPresent: string[];
  adzunaDownstreamCandidates: string[];
  adzunaScriptRedirectCandidates: string[];
  adzunaNetworkRedirectCandidates: string[];
  adzunaHandoffPageTitle?: string;
  adzunaHandoffVisibleCtas: string[];
  adzunaOverlayDetected: boolean;
  adzunaOverlayDismissed: boolean;
  adzunaOverlayType?: string;
  adzunaOverlaySelectorsTried: string[];
  adzunaHandoffPopupOccurred: boolean;
  adzunaHandoffUsedPopup: boolean;
  adzunaDownstreamConfirmed: boolean;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
  blockedResolvedHandoffCandidates: ApplySourceRejectedCandidate[];
  selectedResolvedHandoffCandidate?: string;
};

type CookieConsentPhaseResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  detected: boolean;
  clicked: boolean;
  clickedText?: string;
  clickedSelector?: string;
  postCookieWaitAttempted: boolean;
  postCookieUrlBefore?: string;
  postCookieUrlAfter?: string;
  postCookieUrlChanged?: boolean;
  postCookieProgressDetected?: boolean;
  postCookieTitleAfter?: string;
};

type PostClickProgressResult = {
  page: Page;
  attempted: boolean;
  urlBefore: string;
  urlAfter: string;
  titleAfter?: string;
  urlChanged: boolean;
  progressDetected: boolean;
};

type ResolvedHandoffClickTarget = EntryCtaCandidate & {
  href?: string;
  locatorStrategy: string;
  locator: Locator;
};

type ResolvedHandoffClickResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  attempted: boolean;
  targetFound: boolean;
  succeeded: boolean;
  locatorStrategy?: string;
  directNavAttempted: boolean;
  directNavSucceeded: boolean;
  directNavUrl?: string;
  directNavUrlAfter?: string;
  clickedHref?: string;
  clickedText?: string;
  clickedSelector?: string;
  urlBefore?: string;
  urlAfter?: string;
  blockedCandidates: ApplySourceRejectedCandidate[];
  selectedCandidate?: string;
  popupOccurred?: boolean;
  usedPopup?: boolean;
  downstreamConfirmed?: boolean;
};

type AdzunaAuthPageState = {
  isAuthPage: boolean;
  isLoginPage: boolean;
  isForgotPasswordPage: boolean;
  normalizedLoginUrl?: string;
};

type LocatorPlan = {
  locator: Locator;
  selector: string;
};

type AdzunaAuthHandlingResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  authPageDetected: boolean;
  forgotPasswordDetected: boolean;
  loginAttempted: boolean;
  loginSucceeded: boolean;
  loginFailedReason?: string;
};

type AdzunaFallbackLinkTarget = {
  locator: Locator;
  selector: string;
  text: string;
  matchedText: string;
  locatorStrategy: string;
  href?: string;
};

type AdzunaFallbackLinkResult = {
  page: Page;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  attempts: ApplySessionCtaAttemptRecord[];
  found: boolean;
  clicked: boolean;
  text?: string;
  selector?: string;
  locatorStrategy?: string;
  elementFound: boolean;
  clickSucceeded: boolean;
  href?: string;
  host?: string;
  directNavAttempted: boolean;
  directNavSucceeded: boolean;
  extractedRedirectUrl?: string;
  extractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate";
  extractedRedirectHtmlRead: boolean;
  extractedRedirectFailureReason?: string[];
  extractedRedirectNavAttempted: boolean;
  extractedRedirectNavSucceeded: boolean;
  urlAfter?: string;
  tokenizedInterstitialDetected: boolean;
  tokenizedParamsPresent: string[];
  downstreamCandidates: string[];
  scriptRedirectCandidates: string[];
  adzunaInterstitialRecognized: boolean;
  appcastHopDetected: boolean;
  diceDestinationDetected: boolean;
  handoffResolvedViaKnownChain: boolean;
};

type AdzunaExtractedRedirectResult = {
  extractedUrl?: string;
  extractionSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate";
  extractionSucceeded: boolean;
  htmlRead: boolean;
  failureReason?: string[];
  fallbackText?: string;
  tokenizedInterstitialDetected?: boolean;
  tokenizedParamsPresent?: string[];
  downstreamCandidates?: string[];
  scriptRedirectCandidates?: string[];
};

type ApplySourceCandidate = {
  href: string;
  hostname: string;
  text: string;
  score: number;
  reasons: string[];
};

type ApplySourceRejectedCandidate = {
  href: string;
  hostname: string;
  text: string;
  reason: string;
};

type ApplySourceAnchorSnapshot = {
  href: string;
  hostname: string;
  pathname: string;
  search: string;
  text: string;
  inMainContent: boolean;
  inHeaderOrFooter: boolean;
  visible: boolean;
};

type ApplySourceResolverResult = {
  attemptedLinks: string[];
  candidates: ApplySourceCandidate[];
  rejectedCandidates: ApplySourceRejectedCandidate[];
  selectedLink?: string;
  success: boolean;
  newUrl?: string;
};

type AdzunaLandPageState = {
  isLandPage: boolean;
  isTokenizedInterstitial: boolean;
  tokenizedParamsPresent: string[];
};

type AdzunaOverlayInspectionResult = {
  overlayDetected: boolean;
  overlayDismissed: boolean;
  overlayType?: string;
  overlaySelectorsTried: string[];
};

type AdzunaDomCandidateSnapshot = {
  url: string;
  text: string;
  source: string;
};

type AdzunaDownstreamCandidateSignal = {
  url: string;
  text?: string;
  source?: string;
};

const APPLY_SOURCE_RESOLVER_KEYWORDS = [
  "apply",
  "apply now",
  "apply-now",
  "application",
  "job",
  "jobs",
  "vacancy",
  "posting",
  "career",
  "careers",
  "external",
] as const;

const APPLY_CTA_DETECTION_PATTERNS = [
  "apply now",
  "continue to application",
  "start application",
  "submit application",
  "easy apply",
  "apply on company site",
  "visit site to apply",
  "go to job",
  "view job",
  "apply",
  "continue",
  "next",
] as const;

const ENTRY_CTA_MAX_STEPS = 4;
const HANDOFF_CTA_MAX_STEPS = 3;
const COOKIE_CTA_MAX_STEPS = 2;

const ENTRY_CTA_IGNORE_PATTERNS = [
  "job alert",
  "job alerts",
  "email alert",
  "create alert",
  "get alerts",
  "save job",
  "saved jobs",
  "similar jobs",
  "recommended jobs",
  "share job",
  "share this job",
];

const HANDOFF_CTA_IGNORE_PATTERNS = [
  ...ENTRY_CTA_IGNORE_PATTERNS,
  "sign in",
  "log in",
  "login",
  "sign up",
  "signup",
  "register",
  "create account",
];

const COOKIE_CTA_IGNORE_PATTERNS = [
  "save",
  "share",
  "sign in",
  "log in",
  "login",
  "sign up",
  "signup",
  "register",
  "create account",
  "subscribe",
  "job alert",
  "alerts",
] as const;

const COOKIE_CONTEXT_PATTERNS = [
  "cookie",
  "cookies",
  "consent",
  "privacy",
  "tracking",
  "preferences",
] as const;

const BLOCKER_SURFACE_SELECTORS = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-testid*="modal"]',
  '[data-testid*="banner"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[class*="drawer"]',
  '[class*="banner"]',
  ".modal",
  ".overlay",
  ".drawer",
  ".banner",
] as const;

const FORCED_ENTRY_CTA_HOST_PATTERNS = [
  "adzuna.com",
  "adzuna.co.uk",
  "dice.com",
] as const;

const REAL_APPLY_HOST_PATTERNS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workable.com",
  "myworkdayjobs.com",
  "workdayjobs.com",
  "icims.com",
  "jazzhr.com",
] as const;

const KNOWN_ATS_HOST_PATTERNS = [
  ...REAL_APPLY_HOST_PATTERNS,
  "myworkdaysite.com",
  "smartrecruiters.com",
  "jobvite.com",
  "bamboohr.com",
  "recruitee.com",
] as const;

const REAL_APPLY_URL_PATTERNS = [
  "/apply",
  "/application",
  "job_app",
  "jobapp",
  "candidate",
  "resume",
  "questionnaire",
  "question",
] as const;

const RTX_HOST_PATTERNS = [
  "rtx.com",
  "careers.rtx.com",
] as const;

const RTX_WORKDAY_HOST_PATTERNS = [
  "myworkdayjobs.com",
  "workdayjobs.com",
  "myworkdaysite.com",
] as const;

const RTX_CAREERS_ENTRY_URL = "https://careers.rtx.com/global/en/search-results";

const LOW_VALUE_RESOLVER_TEXT_PATTERNS = [
  "job alert",
  "job alerts",
  "create alert",
  "email alert",
  "sign up",
  "signup",
  "subscribe",
  "save job",
  "saved jobs",
  "share job",
  "share this job",
  "similar jobs",
  "recommended jobs",
] as const;

const ADZUNA_AUTH_BLOCKED_LINK_PATTERNS = [
  "forgot password",
  "forgot your password",
  "forgot-password",
  "reset password",
  "reset-password",
  "sign up",
  "signup",
  "register",
  "create account",
  "create your account",
] as const;

const LOW_VALUE_AGGREGATOR_PATHS = new Set([
  "/",
  "/jobs",
  "/jobs/",
  "/jobs/careers",
  "/jobs/careers/",
  "/careers",
  "/careers/",
  "/job-search",
  "/job-search/",
  "/jobsearch",
  "/jobsearch/",
  "/browse",
  "/browse/",
  "/browse-jobs",
  "/browse-jobs/",
  "/search",
  "/search/",
  "/find-jobs",
  "/find-jobs/",
]);

const LOW_VALUE_AGGREGATOR_SEGMENTS = new Set([
  "jobs",
  "careers",
  "career",
  "job-search",
  "jobsearch",
  "browse",
  "browse-jobs",
  "search",
  "find-jobs",
  "alerts",
  "job-alerts",
]);

function buildDebugPayload(args: {
  attemptedSelectors: string[];
  missingNames: string[];
  entryUrl?: string;
  initialLoadedUrl?: string;
  finalUrl?: string;
  originalJobUrl?: string;
  resolvedDirectUrl?: string;
  applySource?: string;
  usedResolvedDirectUrl?: boolean;
  directJobResolutionAttempted?: boolean;
  directJobResolutionConfidence?: number;
  directJobResolutionProvider?: string;
  directJobResolutionMatchReason?: string;
  directJobResolutionError?: string;
  directJobResolutionCandidates?: DirectJobResolution["candidates"];
  searchFallbackTriggered?: boolean;
  searchFallbackQueries?: string[];
  searchFallbackCandidates?: JobSearchFallbackCandidate[];
  searchFallbackChosenCandidate?: string;
  searchFallbackAttemptCount?: number;
  searchFallbackSuccess?: boolean;
  searchFallbackFailureReason?: string;
  startingUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
  finalChosenUrlKind?: "aggregator_handoff" | "direct_ats" | "company_careers" | "unknown";
  domain?: string;
  stoppedAtUrl?: string;
  stoppedAtTitle?: string;
  lastActionText?: string;
  lastActionSelector?: string;
  submitSelectorUsed?: string | null;
  verificationSignals?: string[];
  confirmationSignals?: string[];
  pageText?: string;
  pageHtml?: string;
  sessionId?: string;
  viewerUrl?: string;
  targetUrl?: string;
  applyCtaFound: boolean;
  applyCtaClicked: boolean;
  urlBeforeClick?: string;
  urlAfterClick?: string;
  currentUrl?: string;
  providerDetected?: string;
  formContextUrl?: string;
  submitButtonFound: boolean;
  submitButtonEnabled?: boolean;
  submitButtonClicked: boolean;
  confirmationTextFound: boolean;
  confirmationTextSnippet?: string | null;
  successUrlPatternMatched: boolean;
  confirmationMatchedBy?: "url" | "text" | "popup" | "context-page";
  confirmationFinalUrl?: string;
  confirmationUrl?: string;
  confirmationSource?: string | null;
  popupUrl?: string | null;
  sameTabUrl?: string | null;
  submissionConfirmed: boolean;
  finalRequiredCheckPassed?: boolean;
  allRequiredFieldsFilled?: boolean;
  lastFormRecheckAt?: number;
  finalRecheckPassed?: boolean;
  readyToSubmit?: boolean;
  submitAttempted?: boolean;
  visibleValidationErrors?: string[];
  postSubmitValidationErrorCount?: number;
  postSubmitValidationErrors?: GreenhouseValidationExtractionResult["errors"];
  postSubmitValidationRepairAttempted?: boolean;
  postSubmitValidationRepairSucceeded?: boolean;
  fileUploadPending?: boolean;
  verificationChallengeVisible?: boolean;
  reviewBeforeSubmit?: boolean;
  actionLabel?: string;
  submittedAt?: string;
  finalStatus: ApplySessionStatus;
  success: boolean;
  needsHuman: boolean;
  unavailable: boolean;
  hopCount: number;
  urlsVisited: string[];
  clicks: ApplySessionClickRecord[];
  ctaAttempts?: ApplySessionCtaAttemptRecord[];
  entryCtaFound?: boolean;
  entryCtaClicked?: boolean;
  entryCtaClickedText?: string;
  entryCtaClickedSelector?: string;
  entryDismissedBlocker?: boolean;
  adzunaApplyCaptureDetected?: boolean;
  adzunaApplyCaptureSkipClicked?: boolean;
  adzunaApplyCaptureSkipText?: string;
  adzunaApplyCaptureSkipSelector?: string;
  adzunaPostApplyProgressionAttempted?: boolean;
  adzunaPostApplyProgressionSucceeded?: boolean;
  adzunaPostApplyUrlAfter?: string;
  adzunaPostApplyPopupDetected?: boolean;
  adzunaPostApplyNewPageDetected?: boolean;
  adzunaPostApplyFallbackAttempted?: boolean;
  applyHrefExtracted?: string;
  applyNavigationForced?: boolean;
  applyNavigationUrl?: string;
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
  formDetected: boolean;
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
  }>;
  verificationEvidence?: VerificationEvidence;
  verificationOverriddenByVisibleForm?: boolean;
  confirmationDetected: boolean;
  verificationDetected: boolean;
  finalReason?: string;
  stopClassification?: ApplyStopClassification;
  resolverAttemptedLinks?: string[];
  resolverCandidates?: ApplySourceCandidate[];
  resolverRejectedCandidates?: ApplySourceRejectedCandidate[];
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
  adzunaLoginAttempted?: boolean;
  adzunaLoginSucceeded?: boolean;
  adzunaLoginFailedReason?: string;
  blockedResolvedHandoffCandidates?: ApplySourceRejectedCandidate[];
  selectedResolvedHandoffCandidate?: string;
  resolvedHandoffClickAttempted?: boolean;
  resolvedHandoffClickSucceeded?: boolean;
  resolvedHandoffElementFound?: boolean;
  resolvedHandoffLocatorStrategy?: string;
  resolvedHandoffDirectNavAttempted?: boolean;
  resolvedHandoffDirectNavSucceeded?: boolean;
  resolvedHandoffDirectNavUrl?: string;
  resolvedHandoffDirectNavUrlAfter?: string;
  adzunaFallbackLinkFound?: boolean;
  adzunaFallbackLinkClicked?: boolean;
  adzunaFallbackLinkText?: string;
  adzunaFallbackLocatorStrategy?: string;
  adzunaFallbackElementFound?: boolean;
  adzunaFallbackClickSucceeded?: boolean;
  adzunaFallbackHref?: string;
  adzunaFallbackHost?: string;
  adzunaFallbackDirectNavAttempted?: boolean;
  adzunaFallbackDirectNavSucceeded?: boolean;
  adzunaExtractedRedirectUrl?: string;
  adzunaExtractedRedirectSource?:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate";
  adzunaExtractedRedirectHtmlRead?: boolean;
  adzunaExtractedRedirectFailureReason?: string[];
  adzunaExtractedRedirectNavAttempted?: boolean;
  adzunaExtractedRedirectNavSucceeded?: boolean;
  adzunaFallbackUrlAfter?: string;
  adzunaInterstitialRecognized?: boolean;
  appcastHopDetected?: boolean;
  diceDestinationDetected?: boolean;
  handoffResolvedViaKnownChain?: boolean;
  knownChainClassificationGuardApplied?: boolean;
  knownChainContinuationExhausted?: boolean;
  knownChainAllowedToFail?: boolean;
  resolvedHandoffClickedHref?: string;
  resolvedHandoffClickedText?: string;
  resolvedHandoffUrlBefore?: string;
  resolvedHandoffUrlAfter?: string;
  strategyMatched?: boolean;
  strategyId?: string;
  strategySourceHost?: string;
  strategyDestinationHost?: string;
  strategyType?: string;
  strategyPageType?: string;
  strategyDerivedInstruction?: string;
  strategyAutomationPrompt?: string;
  strategyStartUrl?: string;
  strategySanitizedStepCount?: number;
  playwrightLaunchStrategy?: "remote" | "local_ephemeral" | "local_persistent";
  playwrightPersistentContext?: boolean;
  playwrightUserDataDir?: string;
  rtxFlowAttempted?: boolean;
  rtxFlowCompleted?: boolean;
  rtxProgressMarkers?: string[];
  rtxFailureReason?: string;
  rtxJobId?: string;
}) {
  return {
    attemptedSelectors: args.attemptedSelectors,
    missingNames: args.missingNames,
    entryUrl: args.entryUrl,
    initialLoadedUrl: args.initialLoadedUrl,
    finalUrl: args.finalUrl,
    originalJobUrl: args.originalJobUrl,
    resolvedDirectUrl: args.resolvedDirectUrl,
    applySource: args.applySource,
    usedResolvedDirectUrl: args.usedResolvedDirectUrl ?? false,
    directJobResolutionAttempted:
      args.directJobResolutionAttempted ?? false,
    directJobResolutionConfidence: args.directJobResolutionConfidence,
    directJobResolutionProvider: args.directJobResolutionProvider,
    directJobResolutionMatchReason: args.directJobResolutionMatchReason,
    directJobResolutionError: args.directJobResolutionError,
    directJobResolutionCandidates:
      args.directJobResolutionCandidates ?? [],
    searchFallbackTriggered: args.searchFallbackTriggered ?? false,
    searchFallbackQueries: args.searchFallbackQueries ?? [],
    searchFallbackCandidates: args.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate: args.searchFallbackChosenCandidate,
    searchFallbackAttemptCount: args.searchFallbackAttemptCount ?? 0,
    searchFallbackSuccess: args.searchFallbackSuccess ?? false,
    searchFallbackFailureReason: args.searchFallbackFailureReason,
    startingUrlKind: args.startingUrlKind ?? "unknown",
    finalChosenUrlKind: args.finalChosenUrlKind ?? "unknown",
    domain: args.domain,
    stoppedAtUrl: args.stoppedAtUrl,
    stoppedAtTitle: args.stoppedAtTitle,
    lastActionText: args.lastActionText,
    lastActionSelector: args.lastActionSelector,
    submitSelectorUsed: args.submitSelectorUsed ?? null,
    verificationSignals: args.verificationSignals ?? [],
    confirmationSignals: args.confirmationSignals ?? [],
    pageText: args.pageText,
    pageHtml: args.pageHtml,
    sessionId: args.sessionId,
    viewerUrl: args.viewerUrl,
    targetUrl: args.targetUrl,
    applyCtaFound: args.applyCtaFound,
    applyCtaClicked: args.applyCtaClicked,
    urlBeforeClick: args.urlBeforeClick,
    urlAfterClick: args.urlAfterClick,
    currentUrl: args.currentUrl,
    providerDetected: args.providerDetected,
    formContextUrl: args.formContextUrl,
    submitButtonFound: args.submitButtonFound,
    submitButtonEnabled: args.submitButtonEnabled,
    submitButtonClicked: args.submitButtonClicked,
    confirmationTextFound: args.confirmationTextFound,
    confirmationTextSnippet: args.confirmationTextSnippet ?? null,
    successUrlPatternMatched: args.successUrlPatternMatched,
    confirmationMatchedBy: args.confirmationMatchedBy,
    confirmationFinalUrl: args.confirmationFinalUrl,
    confirmationUrl: args.confirmationUrl,
    confirmationSource: args.confirmationSource,
    popupUrl: args.popupUrl,
    submissionConfirmed: args.submissionConfirmed,
    finalRequiredCheckPassed: args.finalRequiredCheckPassed,
    allRequiredFieldsFilled: args.allRequiredFieldsFilled,
    lastFormRecheckAt: args.lastFormRecheckAt,
    finalRecheckPassed: args.finalRecheckPassed,
    readyToSubmit: args.readyToSubmit,
    submitAttempted: args.submitAttempted,
    visibleValidationErrors: args.visibleValidationErrors ?? [],
    fileUploadPending: args.fileUploadPending,
    verificationChallengeVisible: args.verificationChallengeVisible,
    reviewBeforeSubmit: args.reviewBeforeSubmit,
    actionLabel: args.actionLabel,
    submittedAt: args.submittedAt,
    finalStatus: args.finalStatus,
    success: args.success,
    needsHuman: args.needsHuman,
    unavailable: args.unavailable,
    hopCount: args.hopCount,
    urlsVisited: args.urlsVisited,
    clicks: args.clicks,
    ctaAttempts: args.ctaAttempts ?? [],
    entryCtaFound: args.entryCtaFound ?? false,
    entryCtaClicked: args.entryCtaClicked ?? false,
    entryCtaClickedText: args.entryCtaClickedText,
    entryCtaClickedSelector: args.entryCtaClickedSelector,
    entryDismissedBlocker: args.entryDismissedBlocker ?? false,
    adzunaApplyCaptureDetected: args.adzunaApplyCaptureDetected ?? false,
    adzunaApplyCaptureSkipClicked:
      args.adzunaApplyCaptureSkipClicked ?? false,
    adzunaApplyCaptureSkipText: args.adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector: args.adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted:
      args.adzunaPostApplyProgressionAttempted ?? false,
    adzunaPostApplyProgressionSucceeded:
      args.adzunaPostApplyProgressionSucceeded ?? false,
    adzunaPostApplyUrlAfter: args.adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected:
      args.adzunaPostApplyPopupDetected ?? false,
    adzunaPostApplyNewPageDetected:
      args.adzunaPostApplyNewPageDetected ?? false,
    adzunaPostApplyFallbackAttempted:
      args.adzunaPostApplyFallbackAttempted ?? false,
    applyHrefExtracted: args.applyHrefExtracted,
    applyNavigationForced: args.applyNavigationForced ?? false,
    applyNavigationUrl: args.applyNavigationUrl,
    handoffPageDetected: args.handoffPageDetected ?? false,
    handoffUrl: args.handoffUrl,
    handoffContinuationAttempted:
      args.handoffContinuationAttempted ?? false,
    handoffContinuationSucceeded:
      args.handoffContinuationSucceeded ?? false,
    handoffCtaFound: args.handoffCtaFound ?? false,
    handoffCtaClicked: args.handoffCtaClicked ?? false,
    handoffCtaClickedText: args.handoffCtaClickedText,
    handoffCtaClickedSelector: args.handoffCtaClickedSelector,
    handoffAttempts: args.handoffAttempts ?? [],
    cookiePromptDetected: args.cookiePromptDetected ?? false,
    cookiePromptClicked: args.cookiePromptClicked ?? false,
    cookiePromptClickedText: args.cookiePromptClickedText,
    cookiePromptSelector: args.cookiePromptSelector,
    cookiePromptAttempts: args.cookiePromptAttempts ?? [],
    postCookieWaitAttempted: args.postCookieWaitAttempted ?? false,
    postCookieUrlBefore: args.postCookieUrlBefore,
    postCookieUrlAfter: args.postCookieUrlAfter,
    postCookieUrlChanged: args.postCookieUrlChanged ?? false,
    postCookieProgressDetected:
      args.postCookieProgressDetected ?? false,
    postCookieTitleAfter: args.postCookieTitleAfter,
    applyCtaClickedText: args.applyCtaClickedText,
    applyCtaClickedSelector: args.applyCtaClickedSelector,
    ctaClickedText: args.ctaClickedText,
    ctaClickedSelector: args.ctaClickedSelector,
    dismissedBlocker: args.dismissedBlocker ?? false,
    formDetected: args.formDetected,
    visibleFieldCount: args.visibleFieldCount ?? 0,
    fillableFieldCount: args.fillableFieldCount ?? 0,
    filledFieldCount: args.filledFieldCount ?? 0,
    requiredFieldCount: args.requiredFieldCount ?? 0,
    missingRequiredFields: args.missingRequiredFields ?? [],
    unsupportedRequiredFields: args.unsupportedRequiredFields ?? [],
    formScanAttempted: args.formScanAttempted ?? false,
    formFound: args.formFound ?? args.formDetected,
    formFillAttempted: args.formFillAttempted ?? false,
    resumeUploadAttempted: args.resumeUploadAttempted ?? false,
    resumeUploadSucceeded: args.resumeUploadSucceeded ?? false,
    submitOrContinueAttempted: args.submitOrContinueAttempted ?? false,
    submitOrContinueClicked: args.submitOrContinueClicked ?? false,
    aiFormAnswerEngineRan: args.aiFormAnswerEngineRan ?? false,
    aiFormAnswersGenerated: args.aiFormAnswersGenerated ?? false,
    aiFormAutofillCompleted: args.aiFormAutofillCompleted ?? false,
    aiFormFieldCount: args.aiFormFieldCount ?? 0,
    aiFormRequiredFieldCount: args.aiFormRequiredFieldCount ?? 0,
    aiFormAnsweredCount: args.aiFormAnsweredCount ?? 0,
    aiFormBlockedCount: args.aiFormBlockedCount ?? 0,
    aiFormFilledCount: args.aiFormFilledCount ?? 0,
    aiFormRemainingRequiredFields: args.aiFormRemainingRequiredFields ?? [],
    aiFormBlockedFields: args.aiFormBlockedFields ?? [],
    verificationEvidence:
      args.verificationEvidence ?? { detected: args.verificationDetected },
    verificationOverriddenByVisibleForm:
      args.verificationOverriddenByVisibleForm ?? false,
    confirmationDetected: args.confirmationDetected,
    verificationDetected: args.verificationDetected,
    finalReason: args.finalReason,
    stopClassification: args.stopClassification,
    resolverAttemptedLinks: args.resolverAttemptedLinks ?? [],
    resolverCandidates: args.resolverCandidates ?? [],
    resolverRejectedCandidates: args.resolverRejectedCandidates ?? [],
    resolverSelectedLink: args.resolverSelectedLink,
    resolverSuccess: args.resolverSuccess,
    resolverNewUrl: args.resolverNewUrl,
    adzunaHandoffFailureReasons:
      args.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      args.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview: args.adzunaBodyTextPreview,
    adzunaTokenizedInterstitialDetected:
      args.adzunaTokenizedInterstitialDetected ?? false,
    adzunaTokenizedParamsPresent:
      args.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      args.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      args.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      args.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason: args.adzunaFinalFailureReason,
    adzunaHandoffPageTitle: args.adzunaHandoffPageTitle,
    adzunaHandoffVisibleCtas: args.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected: args.adzunaOverlayDetected ?? false,
    adzunaOverlayDismissed: args.adzunaOverlayDismissed ?? false,
    adzunaOverlayType: args.adzunaOverlayType,
    adzunaOverlaySelectorsTried:
      args.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      args.adzunaHandoffPopupOccurred ?? false,
    adzunaHandoffUsedPopup: args.adzunaHandoffUsedPopup ?? false,
    adzunaDownstreamConfirmed: args.adzunaDownstreamConfirmed ?? false,
    adzunaAuthPageDetected: args.adzunaAuthPageDetected ?? false,
    adzunaForgotPasswordDetected:
      args.adzunaForgotPasswordDetected ?? false,
    adzunaLoginAttempted: args.adzunaLoginAttempted ?? false,
    adzunaLoginSucceeded: args.adzunaLoginSucceeded ?? false,
    adzunaLoginFailedReason: args.adzunaLoginFailedReason,
    blockedResolvedHandoffCandidates:
      args.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      args.selectedResolvedHandoffCandidate,
    resolvedHandoffClickAttempted:
      args.resolvedHandoffClickAttempted ?? false,
    resolvedHandoffClickSucceeded:
      args.resolvedHandoffClickSucceeded ?? false,
    resolvedHandoffElementFound:
      args.resolvedHandoffElementFound ?? false,
    resolvedHandoffLocatorStrategy: args.resolvedHandoffLocatorStrategy,
    resolvedHandoffDirectNavAttempted:
      args.resolvedHandoffDirectNavAttempted ?? false,
    resolvedHandoffDirectNavSucceeded:
      args.resolvedHandoffDirectNavSucceeded ?? false,
    resolvedHandoffDirectNavUrl: args.resolvedHandoffDirectNavUrl,
    resolvedHandoffDirectNavUrlAfter: args.resolvedHandoffDirectNavUrlAfter,
    adzunaFallbackLinkFound: args.adzunaFallbackLinkFound ?? false,
    adzunaFallbackLinkClicked: args.adzunaFallbackLinkClicked ?? false,
    adzunaFallbackLinkText: args.adzunaFallbackLinkText,
    adzunaFallbackLocatorStrategy: args.adzunaFallbackLocatorStrategy,
    adzunaFallbackElementFound:
      args.adzunaFallbackElementFound ?? false,
    adzunaFallbackClickSucceeded:
      args.adzunaFallbackClickSucceeded ?? false,
    adzunaFallbackHref: args.adzunaFallbackHref,
    adzunaFallbackHost: args.adzunaFallbackHost,
    adzunaFallbackDirectNavAttempted:
      args.adzunaFallbackDirectNavAttempted ?? false,
    adzunaFallbackDirectNavSucceeded:
      args.adzunaFallbackDirectNavSucceeded ?? false,
    adzunaExtractedRedirectUrl: args.adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource:
      args.adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead:
      args.adzunaExtractedRedirectHtmlRead ?? false,
    adzunaExtractedRedirectFailureReason:
      args.adzunaExtractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      args.adzunaExtractedRedirectNavAttempted ?? false,
    adzunaExtractedRedirectNavSucceeded:
      args.adzunaExtractedRedirectNavSucceeded ?? false,
    adzunaFallbackUrlAfter: args.adzunaFallbackUrlAfter,
    adzunaInterstitialRecognized:
      args.adzunaInterstitialRecognized ?? false,
    appcastHopDetected: args.appcastHopDetected ?? false,
    diceDestinationDetected: args.diceDestinationDetected ?? false,
    handoffResolvedViaKnownChain:
      args.handoffResolvedViaKnownChain ?? false,
    knownChainClassificationGuardApplied:
      args.knownChainClassificationGuardApplied ?? false,
    knownChainContinuationExhausted:
      args.knownChainContinuationExhausted ?? false,
    knownChainAllowedToFail: args.knownChainAllowedToFail ?? true,
    resolvedHandoffClickedHref: args.resolvedHandoffClickedHref,
    resolvedHandoffClickedText: args.resolvedHandoffClickedText,
    resolvedHandoffUrlBefore: args.resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter: args.resolvedHandoffUrlAfter,
    strategyMatched: args.strategyMatched ?? false,
    strategyId: args.strategyId,
    strategySourceHost: args.strategySourceHost,
    strategyDestinationHost: args.strategyDestinationHost,
    strategyType: args.strategyType,
    strategyPageType: args.strategyPageType,
    strategyDerivedInstruction: args.strategyDerivedInstruction,
    strategyAutomationPrompt: args.strategyAutomationPrompt,
    strategyStartUrl: args.strategyStartUrl,
    strategySanitizedStepCount: args.strategySanitizedStepCount ?? 0,
    playwrightLaunchStrategy: args.playwrightLaunchStrategy,
    playwrightPersistentContext: args.playwrightPersistentContext ?? false,
    playwrightUserDataDir: args.playwrightUserDataDir,
    rtxFlowAttempted: args.rtxFlowAttempted ?? false,
    rtxFlowCompleted: args.rtxFlowCompleted ?? false,
    rtxProgressMarkers: args.rtxProgressMarkers ?? [],
    rtxFailureReason: args.rtxFailureReason,
    rtxJobId: args.rtxJobId,
  };
}

function buildCtaEvidence(
  chase: CtaChaseResult,
  currentUrl: string,
  preludeApplyClicks: ApplySessionClickRecord[] = [],
) {
  const effectiveClicks = [...preludeApplyClicks, ...chase.clicks];
  return {
    applyCtaFound: chase.ctaFound || effectiveClicks.length > 0,
    applyCtaClicked: effectiveClicks.length > 0,
    urlBeforeClick: effectiveClicks[0]?.fromUrl,
    urlAfterClick: effectiveClicks.at(-1)?.toUrl ?? currentUrl,
    currentUrl,
    hopCount: preludeApplyClicks.length + chase.hopCount,
  };
}

function collectStrategyPreferredCtaTexts(
  steps: ApplySiteStrategyStep[] | null | undefined,
) {
  const results = new Set<string>();

  for (const step of steps ?? []) {
    if (step.type !== "click") continue;

    for (const value of [step.label, step.text]) {
      const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
      if (!normalized) continue;

      const lower = normalized.toLowerCase();
      if (
        lower.includes("apply") ||
        lower.includes("continue") ||
        lower.includes("submit") ||
        lower.includes("start") ||
        lower.includes("next") ||
        lower.includes("application")
      ) {
        results.add(normalized);
      }
    }
  }

  return Array.from(results).slice(0, 12);
}

function collectStrategyPreferredSelectors(
  steps: ApplySiteStrategyStep[] | null | undefined,
) {
  const results = new Set<string>();

  for (const step of steps ?? []) {
    if (step.type !== "click") continue;
    const selector = String(step.selector ?? "").trim();
    if (!selector) continue;
    results.add(selector);
  }

  return Array.from(results).slice(0, 12);
}

const GREENHOUSE_APPLY_SELECTORS = [
  'button[aria-label="Apply"]',
  '#link-apply',
  'a[href*="job_app"]',
  'a[href*="embed/job_app"]',
  'button:has-text("Apply")',
  'a:has-text("Apply")',
];

function mergePreferredCtaSelectors(args: {
  strategySelectors: string[];
  greenhouseProviderDetected: boolean;
}) {
  return [
    ...new Set([
      ...args.strategySelectors,
      ...(args.greenhouseProviderDetected ? GREENHOUSE_APPLY_SELECTORS : []),
    ]),
  ].slice(0, 24);
}

function parseGreenhouseUrlParts(value: string | null | undefined) {
  const normalized = normalizeJobUrl(String(value ?? ""));
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (
      host !== "boards.greenhouse.io" &&
      host !== "job-boards.greenhouse.io" &&
      host !== "job-boards.eu.greenhouse.io"
    ) {
      return null;
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const token =
      parsed.searchParams.get("token") ??
      (pathParts.includes("jobs")
        ? pathParts[pathParts.indexOf("jobs") + 1]
        : undefined);
    const board =
      parsed.searchParams.get("for") ??
      (pathParts[0] === "embed" ? undefined : pathParts[0]);

    return {
      host,
      board: board?.toLowerCase(),
      token: token?.toLowerCase(),
    };
  } catch {
    return null;
  }
}

function buildSafeGreenhouseEmbedUrl(args: {
  currentUrl: string;
  targetUrl: string;
  candidateUrl?: string | null;
}) {
  const currentParts =
    parseGreenhouseUrlParts(args.currentUrl) ?? parseGreenhouseUrlParts(args.targetUrl);
  if (!currentParts?.board || !currentParts.token) {
    return { allowed: false, reason: "missing_current_board_or_token" };
  }

  const candidate = normalizeJobUrl(args.candidateUrl ?? "");
  if (candidate) {
    const candidateParts = parseGreenhouseUrlParts(candidate);
    if (!candidateParts) {
      return { allowed: false, reason: "candidate_not_greenhouse_board_url" };
    }
    if (candidateParts.board && candidateParts.board !== currentParts.board) {
      return { allowed: false, reason: "candidate_board_mismatch" };
    }
    if (candidateParts.token && candidateParts.token !== currentParts.token) {
      return { allowed: false, reason: "candidate_token_mismatch" };
    }
    return { allowed: true, url: candidate, reason: "safe_candidate_embed" };
  }

  return {
    allowed: true,
    url: `https://boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(
      currentParts.board,
    )}&token=${encodeURIComponent(currentParts.token)}`,
    reason: "constructed_from_current_job_url",
  };
}

async function discoverGreenhouseEmbedCandidate(page: Page) {
  return page
    .evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        if (/\/embed\/job_app|job_app/i.test(href)) {
          return href;
        }
      }
      return null;
    })
    .catch(() => null);
}

type VisibleFormState = {
  formDetected: boolean;
  visibleFieldCount: number;
  fillableFieldCount: number;
  filledFieldCount: number;
  requiredFieldCount: number;
  missingRequiredFields: string[];
  missingRequiredFieldDetails?: Array<{
    label: string;
    fieldType?: string;
    reason: string;
  }>;
  fileInputFound: boolean;
};

type FinalRequiredFieldRecheckResult = {
  ok: boolean;
  formFound: boolean;
  requiredFieldCount: number;
  filledRequiredFieldCount: number;
  missingRequiredFields: string[];
  missingRequiredFieldDetails: Array<{
    label: string;
    fieldType?: string;
    reason: string;
  }>;
  visibleValidationErrors: string[];
  blockedCount: number;
  submitButtonFound: boolean;
  submitButtonEnabled: boolean;
  submitSelector: string | null;
  submitButtonLabel?: string;
  submitSelectorType?: string;
  submitInsideForm?: boolean;
  fileUploadPending: boolean;
  verificationChallengeVisible: boolean;
};

const FINAL_SUBMIT_SELECTORS = [
  'form button[type="submit"]',
  'form input[type="submit"]',
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Submit Application")',
  'button:has-text("Submit application")',
  'button:has-text("Submit")',
  'button:has-text("Apply")',
  'button:has-text("Apply now")',
  'button:has-text("Send application")',
  'button:has-text("Send")',
  'button:has-text("Finish")',
  'button:has-text("Review")',
  'button:has-text("Save and continue")',
  'button:has-text("Save & continue")',
  'button:has-text("Continue to Application")',
  'button:has-text("Continue application")',
  'button:has-text("Continue")',
  'button:has-text("Next")',
];

async function inspectVisibleFormState(page: Page | Frame): Promise<VisibleFormState> {
  return page
    .evaluate(() => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function resolveLabel(element: Element) {
        if (!(element instanceof HTMLElement)) return "";
        const ariaLabel = element.getAttribute("aria-label") ?? "";
        if (ariaLabel.trim()) return ariaLabel.trim();

        const id = element.getAttribute("id");
        if (id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (forLabel?.textContent?.trim()) {
            return forLabel.textContent.replace(/\s+/g, " ").trim();
          }
        }

        const wrappingLabel = element.closest("label");
        if (wrappingLabel?.textContent?.trim()) {
          return wrappingLabel.textContent.replace(/\s+/g, " ").trim();
        }

        const labelledBy = element.getAttribute("aria-labelledby") ?? "";
        if (labelledBy.trim()) {
          const labelText = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (labelText) return labelText;
        }

        const describedBy = element.getAttribute("aria-describedby") ?? "";
        if (describedBy.trim()) {
          const describedText = describedBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (describedText) return describedText;
        }

        const fieldContainer = element.closest(
          ".field, .form-field, .application-question, [data-qa*='question'], [class*='question'], [class*='field']",
        );
        if (fieldContainer?.textContent?.trim()) {
          const ownText = fieldContainer.textContent
            .replace(/\s+/g, " ")
            .trim();
          if (ownText && ownText.length <= 220) return ownText;
        }

        const placeholder =
          element.getAttribute("placeholder") ??
          element.getAttribute("name") ??
          element.getAttribute("id") ??
          "";
        return placeholder.trim();
      }

      function isSecurityToken(element: Element) {
        const values = [
          element.getAttribute("name"),
          element.getAttribute("id"),
          element.getAttribute("aria-label"),
          element.getAttribute("placeholder"),
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");
        return /g-recaptcha-response|recaptcha|captcha|turnstile|hcaptcha|security[-_\s]?token/.test(
          values,
        );
      }

      const controls = Array.from(
        document.querySelectorAll("input, textarea, select"),
      ).filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        if (!isVisible(element)) return false;
        if (isSecurityToken(element)) return false;
        if (element.hasAttribute("disabled")) return false;
        if (element.getAttribute("aria-disabled") === "true") return false;
        if (element.closest("header, nav, footer, [role='navigation']")) return false;
        if (element instanceof HTMLInputElement) {
          const type = (element.type || "text").toLowerCase();
          if (type === "hidden" || type === "submit" || type === "button" || type === "reset") {
            return false;
          }
        }
        return true;
      });

      const missingRequiredFields: string[] = [];
      const missingRequiredFieldDetails: Array<{
        label: string;
        fieldType?: string;
        reason: string;
      }> = [];
      let filledFieldCount = 0;
      let requiredFieldCount = 0;
      let fileInputFound = false;

      for (const control of controls) {
        const required =
          control.hasAttribute("required") ||
          control.getAttribute("aria-required") === "true";
        const label = resolveLabel(control);
        let filled = false;

        if (control instanceof HTMLInputElement) {
          const type = (control.type || "text").toLowerCase();
          if (type === "file") {
            fileInputFound = true;
            filled = (control.files?.length ?? 0) > 0;
          } else if (type === "checkbox" || type === "radio") {
            filled = control.checked;
          } else {
            filled = Boolean(control.value?.trim());
          }
        } else if (control instanceof HTMLTextAreaElement) {
          filled = Boolean(control.value?.trim());
        } else if (control instanceof HTMLSelectElement) {
          filled = Boolean(control.value?.trim());
        }

        if (filled) {
          filledFieldCount += 1;
        }

        if (required) {
          requiredFieldCount += 1;
          if (!filled) {
            const fieldLabel = label || "Required field";
            const fieldType =
              control instanceof HTMLInputElement
                ? (control.type || "text").toLowerCase()
                : control instanceof HTMLTextAreaElement
                  ? "textarea"
                  : control instanceof HTMLSelectElement
                    ? "select"
                    : "unknown";
            missingRequiredFields.push(fieldLabel);
            missingRequiredFieldDetails.push({
              label: fieldLabel,
              fieldType,
              reason: "Required visible field is empty.",
            });
          }
        }
      }

      return {
        formDetected: controls.length > 0,
        visibleFieldCount: controls.length,
        fillableFieldCount: controls.length,
        filledFieldCount,
        requiredFieldCount,
        missingRequiredFields: Array.from(new Set(missingRequiredFields)),
        missingRequiredFieldDetails,
        fileInputFound,
      };
    })
    .catch(() => ({
      formDetected: false,
      visibleFieldCount: 0,
      fillableFieldCount: 0,
      filledFieldCount: 0,
      requiredFieldCount: 0,
      missingRequiredFields: [],
      missingRequiredFieldDetails: [],
      fileInputFound: false,
    }));
}

async function collectVisibleValidationErrors(page: Page | Frame): Promise<string[]> {
  return page
    .evaluate(() => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      const selectors = [
        "[role='alert']",
        "[aria-live='assertive']",
        "[aria-live='polite']",
        ".error",
        ".field-error",
        ".validation-error",
        ".invalid-feedback",
        "[class*='error']",
        "[id*='error']",
      ];
      const seen = new Set<string>();
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(element)) continue;
          const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!text || text.length < 3) continue;
          seen.add(text.slice(0, 180));
        }
      }
      return Array.from(seen).slice(0, 20);
    })
    .catch(() => []);
}

function formatPostSubmitValidationError(error: GreenhouseValidationExtractionResult["errors"][number]) {
  return error.fieldLabel ? `${error.text} — ${error.fieldLabel}` : error.text;
}

function hasPostSubmitSecurityValidation(validation: GreenhouseValidationExtractionResult) {
  return validation.errors.some((error) => error.category === "recaptcha_or_security");
}

function hasRepairablePostSubmitValidation(validation: GreenhouseValidationExtractionResult) {
  return validation.errors.some((error) => error.repairable);
}

async function runFinalRequiredFieldRecheck(args: {
  page: Page;
  submitRoot: Page | Frame;
  formFound: boolean;
  missingRequiredFields: string[];
  blockedCount: number;
  fileUploadPending: boolean;
  verificationChallengeVisible: boolean;
}): Promise<FinalRequiredFieldRecheckResult> {
  const liveFormState = await inspectVisibleFormState(args.submitRoot);
  const visibleValidationErrors = await collectVisibleValidationErrors(args.submitRoot);
  const missingRequiredFields = liveFormState.formDetected
    ? liveFormState.missingRequiredFields
    : args.missingRequiredFields;
  let submitButtonFound = false;
  let submitButtonEnabled = false;
  let submitSelector: string | null = null;
  let submitButtonLabel: string | undefined;
  let submitSelectorType: string | undefined;
  let submitInsideForm = false;

  for (const selector of FINAL_SUBMIT_SELECTORS) {
    const button = args.submitRoot.locator(selector).first();
    if ((await button.count()) === 0) continue;
    if (!(await button.isVisible().catch(() => false))) continue;
    submitButtonFound = true;
    submitSelector = selector;
    submitSelectorType = selector.includes('[type="submit"]')
      ? "type_submit"
      : selector.includes(":has-text")
        ? "text_match"
        : "selector";
    submitButtonLabel = await button
      .evaluate((element) => {
        const input = element as HTMLInputElement;
        return (
          element.textContent?.replace(/\s+/g, " ").trim() ||
          element.getAttribute("aria-label") ||
          input.value ||
          element.getAttribute("title") ||
          ""
        );
      })
      .catch(() => "");
    submitInsideForm = await button
      .evaluate((element) => Boolean(element.closest("form")))
      .catch(() => selector.startsWith("form "));
    submitButtonEnabled = await button.isEnabled().catch(() => false);
    if (submitButtonEnabled) break;
  }

  const missingRequiredFieldDetails =
    liveFormState.missingRequiredFieldDetails ??
    missingRequiredFields.map((label) => ({
      label,
      reason: "Required visible field is empty.",
    }));
  const ok =
    (args.formFound || liveFormState.formDetected) &&
    missingRequiredFields.length === 0 &&
    visibleValidationErrors.length === 0 &&
    args.blockedCount === 0 &&
    submitButtonFound &&
    submitButtonEnabled !== false &&
    !args.fileUploadPending &&
    !args.verificationChallengeVisible;

  return {
    ok,
    formFound: args.formFound || liveFormState.formDetected,
    requiredFieldCount: liveFormState.requiredFieldCount,
    filledRequiredFieldCount: Math.max(
      0,
      liveFormState.requiredFieldCount - missingRequiredFields.length,
    ),
    missingRequiredFields: Array.from(new Set(missingRequiredFields.filter(Boolean))),
    missingRequiredFieldDetails,
    visibleValidationErrors,
    blockedCount: args.blockedCount,
    submitButtonFound,
    submitButtonEnabled,
    submitSelector,
    submitButtonLabel,
    submitSelectorType,
    submitInsideForm,
    fileUploadPending: args.fileUploadPending,
    verificationChallengeVisible: args.verificationChallengeVisible,
  };
}

function isNoInteractionOnTarget(args: {
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string;
  targetUrl: string;
}) {
  return (
    !args.applyCtaClicked &&
    args.hopCount === 0 &&
    args.currentUrl === args.targetUrl
  );
}

function resolveSubmissionConfirmed(args: {
  confirmationTextFound: boolean;
  successUrlPatternMatched: boolean;
  submitButtonClicked: boolean;
  applyCtaClicked: boolean;
  hopCount: number;
  currentUrl: string;
  targetUrl: string;
}) {
  if (
    !args.submitButtonClicked &&
    isNoInteractionOnTarget({
      applyCtaClicked: args.applyCtaClicked,
      hopCount: args.hopCount,
      currentUrl: args.currentUrl,
      targetUrl: args.targetUrl,
    })
  ) {
    return false;
  }

  if (args.confirmationTextFound) {
    return true;
  }

  if (args.submitButtonClicked && args.successUrlPatternMatched) {
    return true;
  }

  return false;
}

function logPlaywrightEvidence(evidence: PlaywrightEvidence) {
  console.log("[AUTO_APPLY_PLAYWRIGHT] evidence", evidence);
}

function logGreenhouseFormState(args: {
  currentUrl: string;
  stoppedAtUrl?: string | null;
  formState:
    | FillGreenhouseApplicationFormResult
    | {
        providerDetected: "greenhouse";
        formContextUrl: string;
        usedFrame: boolean;
        formDetected: boolean;
        visibleFieldCount: number;
        fillableFieldCount: number;
        requiredFieldCount: number;
        submitButtonFound: boolean;
      };
  filledFieldCount?: number;
  missingRequiredFields?: string[];
  verificationSignals?: string[];
  verificationOverriddenByVisibleForm?: boolean;
  submitButtonClicked: boolean;
  submissionConfirmed: boolean;
}) {
  console.info("[AUTO_APPLY_GREENHOUSE]", {
    providerDetected: "greenhouse",
    currentUrl: args.currentUrl,
    stoppedAtUrl: args.stoppedAtUrl ?? null,
    formContextUrl: args.formState.formContextUrl,
    usedFrame: args.formState.usedFrame,
    formDetected: args.formState.formDetected,
    visibleFieldCount: args.formState.visibleFieldCount,
    fillableFieldCount: args.formState.fillableFieldCount,
    filledFieldCount: args.filledFieldCount ?? 0,
    requiredFieldCount: args.formState.requiredFieldCount,
    missingRequiredFields: args.missingRequiredFields ?? [],
    verificationSignals: args.verificationSignals ?? [],
    verificationOverriddenByVisibleForm:
      args.verificationOverriddenByVisibleForm ?? false,
    submitButtonFound: args.formState.submitButtonFound,
    submitButtonClicked: args.submitButtonClicked,
    submissionConfirmed: args.submissionConfirmed,
  });
}

function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function parseHostnameOrHost(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^wss?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./, "")
      .trim()
      .toLowerCase();
  }
}

function hostsEquivalentOrSubdomain(left: string, right: string) {
  if (!left || !right) return false;
  return (
    left === right ||
    left.endsWith(`.${right}`) ||
    right.endsWith(`.${left}`)
  );
}

function isKnownAtsHost(hostname: string) {
  if (!hostname) return false;
  return hostnameMatches(hostname, KNOWN_ATS_HOST_PATTERNS);
}

function isAggregatorLikeHost(hostname: string) {
  if (!hostname) return false;
  return (
    isKnownAggregatorHostname(hostname) ||
    hostname.includes("adzuna.") ||
    hostname.includes("appcast.") ||
    hostname.includes("dice.")
  );
}

function resolveExpectedEmployerHost(args: {
  resolvedDirectUrl?: string;
  originalJobUrl?: string;
  entryUrl: string;
}) {
  const candidates = [
    args.resolvedDirectUrl,
    args.originalJobUrl,
    args.entryUrl,
  ];

  for (const candidate of candidates) {
    const host = parseHostname(candidate);
    if (!host) continue;
    if (isAggregatorLikeHost(host)) continue;
    return host;
  }

  return "";
}

type PreLaunchValidationFailure = {
  reason: "real_posting_not_found" | "wrong_employer_domain";
  message: string;
  targetHost: string;
  expectedEmployerHost: string;
  validationReason?: string;
  strategySourceHost?: string;
  strategyDestinationHost?: string;
};

function validatePreLaunchTarget(args: {
  targetUrl: string;
  entryUrl: string;
  originalJobUrl?: string;
  resolvedDirectUrl?: string;
  companyName?: string;
  jobTitle?: string;
  strategySourceHost?: string;
  strategyDestinationHost?: string;
}) {
  const targetValidation = validateAutomationStartUrl(args.targetUrl, {
    rejectAggregator: true,
    rejectSearchEngine: true,
  });
  const targetHost = parseHostname(targetValidation.normalizedUrl);
  const expectedEmployerHost = resolveExpectedEmployerHost({
    resolvedDirectUrl: args.resolvedDirectUrl,
    originalJobUrl: args.originalJobUrl,
    entryUrl: args.entryUrl,
  });
  const strategySourceHost = parseHostnameOrHost(args.strategySourceHost);
  const strategyDestinationHost = parseHostnameOrHost(
    args.strategyDestinationHost,
  );
  const compatibility = getResolvedUrlCompatibility({
    url: targetValidation.normalizedUrl,
    companyName: args.companyName,
    jobTitle: args.jobTitle,
    sourceUrl: args.originalJobUrl ?? args.entryUrl,
  });

  if (!targetValidation.isValid) {
    return {
      reason: "real_posting_not_found",
      message:
        "Selected target URL is not a valid employer job posting. Open the original job listing and retry.",
      targetHost,
      expectedEmployerHost,
      validationReason: targetValidation.reason,
      strategySourceHost,
      strategyDestinationHost,
    } satisfies PreLaunchValidationFailure;
  }

  if (!compatibility.compatible) {
    return {
      reason: "wrong_employer_domain",
      message:
        compatibility.mismatchFamily === "rtx"
          ? "Resolved URL appears to belong to RTX, but this job is for another employer. Resolver stopped before navigating."
          : "Resolved URL appears to belong to a different employer. Resolver stopped before navigating.",
      targetHost,
      expectedEmployerHost,
      validationReason:
        compatibility.mismatchFamily === "rtx"
          ? "REAL_POSTING_COMPANY_MISMATCH"
          : compatibility.reason,
      strategySourceHost,
      strategyDestinationHost,
    } satisfies PreLaunchValidationFailure;
  }

  const hasExpectedHost = Boolean(expectedEmployerHost);
  const hasTargetHost = Boolean(targetHost);
  const expectedHostMismatched =
    hasExpectedHost &&
    hasTargetHost &&
    !hostsEquivalentOrSubdomain(targetHost, expectedEmployerHost) &&
    !isKnownAtsHost(targetHost) &&
    !isKnownAtsHost(expectedEmployerHost);

  if (expectedHostMismatched) {
    return {
      reason: "wrong_employer_domain",
      message:
        "Selected target URL does not match this employer. Open the original job listing and retry.",
      targetHost,
      expectedEmployerHost,
      validationReason: "target_host_mismatch",
      strategySourceHost,
      strategyDestinationHost,
    } satisfies PreLaunchValidationFailure;
  }

  const strategyHostCandidates = [
    strategySourceHost,
    strategyDestinationHost,
  ].filter(Boolean);
  const strategyHostMismatch = strategyHostCandidates.some((strategyHost) => {
    if (!strategyHost) return false;
    if (hasTargetHost && hostsEquivalentOrSubdomain(strategyHost, targetHost)) {
      return false;
    }
    if (
      hasExpectedHost &&
      hostsEquivalentOrSubdomain(strategyHost, expectedEmployerHost)
    ) {
      return false;
    }
    if (isKnownAtsHost(strategyHost)) return false;
    if (hasExpectedHost && isKnownAtsHost(expectedEmployerHost)) return false;
    return true;
  });

  if (strategyHostMismatch) {
    return {
      reason: "wrong_employer_domain",
      message:
        "Selected target URL appears to come from another employer strategy. Open the original job listing and retry.",
      targetHost,
      expectedEmployerHost,
      validationReason: "strategy_host_mismatch",
      strategySourceHost,
      strategyDestinationHost,
    } satisfies PreLaunchValidationFailure;
  }

  return null;
}

function hostnameMatches(hostname: string, patterns: readonly string[]) {
  return patterns.some(
    (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`),
  );
}

function dedupeUrls(urls: string[]) {
  return [...new Set(urls.filter((url) => Boolean(url)))];
}

function shouldForceEntryCtaPhase(hostname: string, currentUrl: string) {
  return (
    hostnameMatches(hostname, FORCED_ENTRY_CTA_HOST_PATTERNS) ||
    hostnameMatches(parseHostname(currentUrl), FORCED_ENTRY_CTA_HOST_PATTERNS)
  );
}

function isImmediateApplyDestinationPage(args: {
  hostname: string;
  currentUrl: string;
  signals: PageSignals;
}) {
  if (shouldForceEntryCtaPhase(args.hostname, args.currentUrl)) {
    return false;
  }

  if (args.signals.confirmationDetected || args.signals.needsHuman) {
    return true;
  }

  if (args.signals.formDetected) {
    return true;
  }

  if (hostnameMatches(args.hostname, REAL_APPLY_HOST_PATTERNS)) {
    return true;
  }

  const lowerUrl = args.currentUrl.toLowerCase();
  return REAL_APPLY_URL_PATTERNS.some((pattern) => lowerUrl.includes(pattern));
}

function detectApplyDomainFromHostname(hostname: string): KnownApplyDomain {
  const normalized = hostname.toLowerCase();
  if (normalized.includes("adzuna")) return "adzuna";
  if (normalized.includes("dice")) return "dice";
  if (normalized.includes("greenhouse")) return "greenhouse";
  return "generic";
}

function detectApplyDomain(url: string): KnownApplyDomain {
  const hostname = parseHostname(url);
  return detectApplyDomainFromHostname(hostname);
}

function isRtxHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return hostnameMatches(normalized, RTX_HOST_PATTERNS);
}

function isRtxCompanyName(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("rtx") ||
    normalized.includes("raytheon") ||
    normalized.includes("raytheon technologies") ||
    normalized.includes("collins aerospace") ||
    normalized.includes("pratt & whitney") ||
    normalized.includes("pratt and whitney")
  );
}

function isRtxWorkdayUrl(rawUrl: string) {
  const hostname = parseHostname(rawUrl);
  return hostnameMatches(hostname, RTX_WORKDAY_HOST_PATTERNS);
}

function looksLikeRtxRedirectOrPrivacyPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (!isRtxHostname(hostname)) return false;
    return (
      pathname.includes("/404") ||
      pathname.includes("/privacy") ||
      pathname.includes("/not-found") ||
      pathname.includes("/error")
    );
  } catch {
    return false;
  }
}

function extractRtxJobId(args: {
  targetUrl?: string;
  originalJobUrl?: string;
  resolvedDirectUrl?: string;
  title?: string;
}) {
  const combined = [
    args.targetUrl,
    args.originalJobUrl,
    args.resolvedDirectUrl,
    args.title,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  const match = combined.match(/\b0?\d{8}\b/);
  return match?.[0] ?? undefined;
}

function normalizeWhitespace(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildRtxTitleQuery(title: string | undefined) {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return "";
  const words = normalized.split(" ").slice(0, 6);
  return words.join(" ");
}

async function clickLocatorPlanWithNavigation(args: {
  page: Page;
  context: BrowserContext;
  plan: LocatorPlan;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 6_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 6_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 })
    .catch(() => null);

  await args.plan.locator
    .click({ timeout: 8_000 })
    .catch(() => args.plan.locator.click({ force: true, timeout: 8_000 }));

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);
  let nextPage = args.page;

  if (popupPage) {
    nextPage = popupPage;
  } else if (contextPage && contextPage !== args.page) {
    nextPage = contextPage;
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);
  return nextPage;
}

function classifyAdzunaLandPage(rawUrl: string): AdzunaLandPageState {
  const state = classifyAdzunaHandoffUrl(rawUrl);
  return {
    isLandPage: state.isLandAdUrl,
    isTokenizedInterstitial: state.isTokenizedInterstitial,
    tokenizedParamsPresent: state.tokenizedParamsPresent,
  };
}

function isAppcastTrackingPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === "click.appcast.io" || hostname.endsWith(".appcast.io");
  } catch {
    return false;
  }
}

function isAdzunaLandRedirectPage(rawUrl: string) {
  return isAdzunaLandAdUrl(rawUrl);
}

function isAdzunaTokenizedInterstitialPage(rawUrl: string) {
  return classifyAdzunaLandPage(rawUrl).isTokenizedInterstitial;
}

function isKnownHandoffChainPage(rawUrl: string) {
  return (
    isAdzunaLandRedirectPage(rawUrl) || isAppcastTrackingPage(rawUrl)
  );
}

function buildKnownHandoffStopClassification(
  rawUrl: string,
): ApplyStopClassification | undefined {
  if (!isKnownHandoffChainPage(rawUrl)) {
    return undefined;
  }

  return {
    reason: "external_redirect_needed",
    pageType: "aggregator",
    suggestedAction: "open_original_job_site",
  } satisfies ApplyStopClassification;
}

function isDiceJobDetailPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);
    return hostname.includes("dice.com") && pathname.includes("/job-detail/");
  } catch {
    return false;
  }
}

function isAdzunaDetailsPage(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);
    return hostname.includes("adzuna") && pathname.includes("/details/");
  } catch {
    return false;
  }
}

function classifyAdzunaAuthPage(rawUrl: string): AdzunaAuthPageState {
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.includes("adzuna")) {
      return {
        isAuthPage: false,
        isLoginPage: false,
        isForgotPasswordPage: false,
      };
    }

    const pathname = normalizeResolverPathname(parsed.pathname);
    const isForgotPasswordPage = pathname.includes(
      "/authenticate/forgot-password",
    );
    const isAuthPage =
      pathname === "/authenticate" ||
      pathname.startsWith("/authenticate/") ||
      pathname.includes("/authenticate?");

    if (!isAuthPage) {
      return {
        isAuthPage: false,
        isLoginPage: false,
        isForgotPasswordPage: false,
      };
    }

    const normalizedLoginUrl = new URL(parsed.toString());
    normalizedLoginUrl.pathname = "/authenticate";

    return {
      isAuthPage: true,
      isLoginPage: !isForgotPasswordPage,
      isForgotPasswordPage,
      normalizedLoginUrl: normalizedLoginUrl.toString(),
    };
  } catch {
    return {
      isAuthPage: false,
      isLoginPage: false,
      isForgotPasswordPage: false,
    };
  }
}

function sanitizeCredentialEnv(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.replace(/^['"`]+|['"`]+$/g, "").trim();
}

function readAdzunaLoginCredentials() {
  const email = sanitizeCredentialEnv(process.env.ADZUNA_LOGIN_EMAIL);
  const password = sanitizeCredentialEnv(process.env.ADZUNA_LOGIN_PASSWORD);

  return {
    email,
    password,
    ready: Boolean(email && password),
  };
}

function getBlockedAdzunaAuthContinuationReason(args: {
  currentUrl: string;
  href: string;
  text: string;
}) {
  const authState = classifyAdzunaAuthPage(args.currentUrl);
  const signalText = `${args.href} ${args.text}`.toLowerCase();
  const candidateAuthState = classifyAdzunaAuthPage(args.href);

  if (
    signalText.includes("forgot password") ||
    signalText.includes("forgot-password") ||
    signalText.includes("reset password") ||
    candidateAuthState.isForgotPasswordPage
  ) {
    return "adzuna_auth_password_recovery_link";
  }

  if (
    ADZUNA_AUTH_BLOCKED_LINK_PATTERNS.some((pattern) =>
      signalText.includes(pattern),
    )
  ) {
    return "adzuna_auth_non_login_account_link";
  }

  if (authState.isAuthPage && candidateAuthState.isAuthPage) {
    return "adzuna_auth_page_requires_form_login";
  }

  return null;
}

function resolveAbsoluteNavigationTarget(
  rawHref: string | null | undefined,
  currentUrl: string,
) {
  const value = String(rawHref ?? "").trim();
  if (!value) return undefined;
  if (value.startsWith("#")) return undefined;
  if (/^javascript:/i.test(value)) return undefined;

  try {
    const resolved = new URL(value, currentUrl).toString();
    return /^https?:\/\//i.test(resolved) ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAdzunaHandoffCandidateUrl(
  rawValue: string | null | undefined,
  baseUrl: string,
) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;

  const decoded = value
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u0026/gi, "&")
    .replace(/\\x2F/gi, "/")
    .replace(/\\x3A/gi, ":")
    .replace(/\\x26/gi, "&")
    .replace(/\\\//g, "/")
    .trim();

  if (!decoded || /^javascript:/i.test(decoded)) {
    return null;
  }

  if (!/^https?:\/\//i.test(decoded) && !decoded.startsWith("/")) {
    const embeddedHttpMatch = decoded.match(/https?:\/\/[^\s"'<>]+/i);
    if (embeddedHttpMatch?.[0]) {
      return normalizeAdzunaHandoffCandidateUrl(
        embeddedHttpMatch[0],
        baseUrl,
      );
    }
  }

  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return null;
  }
}

function looksLikeBlockedAdzunaContinuationSignal(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("forgot password") ||
    normalized.includes("forgot-password") ||
    normalized.includes("reset password") ||
    normalized.includes("reset-password") ||
    ADZUNA_AUTH_BLOCKED_LINK_PATTERNS.some((pattern) =>
      normalized.includes(pattern),
    )
  );
}

function isLikelyAdzunaDownstreamCandidate(args: {
  url: string;
  currentUrl: string;
  text?: string;
  source?: string;
}) {
  const normalizedUrl = normalizeAdzunaHandoffCandidateUrl(
    args.url,
    args.currentUrl,
  );
  if (!normalizedUrl || normalizedUrl === args.currentUrl) {
    return false;
  }

  const signalText = `${normalizedUrl} ${args.text ?? ""} ${
    args.source ?? ""
  }`.toLowerCase();
  if (
    looksLikeBlockedAdzunaContinuationSignal(signalText) ||
    looksLikeLowValueResolverText(signalText)
  ) {
    return false;
  }

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);

    if (
      /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|json|woff2?|ttf|map)$/i.test(
        pathname,
      )
    ) {
      return false;
    }

    if (isAdzunaLandRedirectPage(normalizedUrl)) {
      return false;
    }

    if (isAppcastTrackingPage(normalizedUrl) || isDiceJobDetailPage(normalizedUrl)) {
      return true;
    }

    const authState = classifyAdzunaAuthPage(normalizedUrl);
    if (authState.isForgotPasswordPage) {
      return false;
    }
    if (authState.isLoginPage) {
      return true;
    }

    if (hostnameMatches(hostname, REAL_APPLY_HOST_PATTERNS)) {
      return true;
    }

    if (!hostname.includes("adzuna")) {
      return true;
    }

    return (
      pathname.includes("/apply") ||
      pathname.includes("/application") ||
      pathname.includes("/job-detail/")
    );
  } catch {
    return false;
  }
}

function scoreAdzunaDownstreamCandidate(args: {
  url: string;
  currentUrl: string;
  text?: string;
  source?: string;
}) {
  const normalizedUrl = normalizeAdzunaHandoffCandidateUrl(
    args.url,
    args.currentUrl,
  );
  if (!normalizedUrl) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const signalText = `${normalizedUrl} ${args.text ?? ""} ${
    args.source ?? ""
  }`.toLowerCase();

  if (isAppcastTrackingPage(normalizedUrl)) score += 500;
  if (isDiceJobDetailPage(normalizedUrl)) score += 420;

  const authState = classifyAdzunaAuthPage(normalizedUrl);
  if (authState.isLoginPage) score += 360;

  try {
    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = normalizeResolverPathname(parsed.pathname);

    if (hostnameMatches(hostname, REAL_APPLY_HOST_PATTERNS)) score += 320;
    if (!hostname.includes("adzuna")) score += 260;
    if (
      pathname.includes("/apply") ||
      pathname.includes("/application") ||
      pathname.includes("/job-detail/")
    ) {
      score += 120;
    }
  } catch {
    return Number.NEGATIVE_INFINITY;
  }

  if (
    signalText.includes("apply") ||
    signalText.includes("application") ||
    signalText.includes("continue") ||
    signalText.includes("employer")
  ) {
    score += 80;
  }

  if ((args.source ?? "").includes("meta")) score += 60;
  if ((args.source ?? "").includes("script")) score += 50;
  if ((args.source ?? "").includes("network")) score += 40;
  if ((args.source ?? "").includes("dom")) score += 30;

  return score;
}

function preferBestAdzunaDownstreamCandidate(
  candidates: AdzunaDownstreamCandidateSignal[],
  currentUrl: string,
) {
  const normalized = candidates
    .map((candidate) => {
      const normalizedUrl = normalizeAdzunaHandoffCandidateUrl(
        candidate.url,
        currentUrl,
      );
      if (!normalizedUrl) return null;

      return {
        ...candidate,
        url: normalizedUrl,
        score: scoreAdzunaDownstreamCandidate({
          url: normalizedUrl,
          currentUrl,
          text: candidate.text,
          source: candidate.source,
        }),
      };
    })
    .filter(
      (
        candidate,
      ): candidate is AdzunaDownstreamCandidateSignal & { score: number } => {
        if (!candidate) {
          return false;
        }

        return isLikelyAdzunaDownstreamCandidate({
          url: candidate.url,
          currentUrl,
          text: candidate.text,
          source: candidate.source,
        });
      },
    )
    .sort((left, right) => right.score - left.score);

  return normalized[0] ?? null;
}

function summarizeAdzunaCandidateSignals(
  candidates: AdzunaDownstreamCandidateSignal[],
) {
  const seen = new Set<string>();
  const summaries: string[] = [];

  for (const candidate of candidates) {
    const url = candidate.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const prefix = [candidate.source, candidate.text?.trim()]
      .filter(Boolean)
      .join(": ")
      .slice(0, 140);
    summaries.push(prefix ? `${prefix} -> ${url}` : url);

    if (summaries.length >= 10) {
      break;
    }
  }

  return summaries;
}

async function collectAdzunaTokenizedDomCandidates(page: Page) {
  const currentUrl = page.url();
  const snapshots = await page
    .evaluate(({ currentUrl }) => {
      const results: AdzunaDomCandidateSnapshot[] = [];
      const seen = new Set<string>();
      const selector = [
        "a[href]",
        "button",
        "[role='button']",
        "[data-href]",
        "[data-url]",
        "[data-redirect]",
        "[data-target]",
        "[data-target-url]",
        "[data-apply-url]",
        "[data-apply-href]",
      ].join(",");

      const absolutize = (rawValue: string | null | undefined) => {
        const value = String(rawValue ?? "").trim();
        if (!value || value.startsWith("#") || /^javascript:/i.test(value)) {
          return "";
        }

        try {
          return new URL(value, currentUrl).toString();
        } catch {
          return "";
        }
      };

      const extractUrls = (rawValue: string | null | undefined) => {
        const value = String(rawValue ?? "");
        return Array.from(
          value.matchAll(
            /https?:\/\/[^\s"'<>\\]+|\/[A-Za-z0-9][^\s"'<>\\)]*/g,
          ),
          (match) => match[0],
        );
      };

      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements) {
        const text = [
          element.textContent ?? "",
          element.getAttribute("aria-label") ?? "",
          element.getAttribute("title") ?? "",
        ]
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);

        const push = (
          rawValue: string | null | undefined,
          source: string,
        ) => {
          const absoluteUrl = absolutize(rawValue);
          if (!absoluteUrl) return;

          const key = `${source}:${absoluteUrl}`;
          if (seen.has(key)) return;
          seen.add(key);
          results.push({
            url: absoluteUrl,
            text,
            source,
          });
        };

        if (element instanceof HTMLAnchorElement) {
          push(element.getAttribute("href"), "dom:anchor");
        }

        const attributeNames = element.getAttributeNames();
        for (const name of attributeNames) {
          const lowerName = name.toLowerCase();
          const rawValue = element.getAttribute(name);
          if (!rawValue) continue;

          if (
            lowerName === "onclick" ||
            lowerName.includes("href") ||
            lowerName.includes("url") ||
            lowerName.includes("redirect") ||
            lowerName.includes("target") ||
            lowerName.includes("apply")
          ) {
            push(rawValue, `dom:${lowerName}`);
            for (const extractedUrl of extractUrls(rawValue)) {
              push(extractedUrl, `dom:${lowerName}`);
            }
          }
        }
      }

      return results.slice(0, 40);
    }, { currentUrl })
    .catch(() => [] as AdzunaDomCandidateSnapshot[]);

  return snapshots
    .filter((candidate) =>
      isLikelyAdzunaDownstreamCandidate({
        url: candidate.url,
        currentUrl,
        text: candidate.text,
        source: candidate.source,
      }),
    )
    .map((candidate) => ({
      url: normalizeAdzunaHandoffCandidateUrl(candidate.url, currentUrl) ?? candidate.url,
      text: candidate.text,
      source: candidate.source,
    }));
}

function extractAdzunaScriptRedirectCandidatesFromHtml(
  html: string,
  baseUrl: string,
) {
  const candidates = [
    ...Array.from(
      html.matchAll(
        /window\.location\.replace\s*\(\s*(["'`])([\s\S]*?)\1\s*\)/gi,
      ),
      (match) => ({
        url: match[2],
        source: "script:location.replace",
      }),
    ),
    ...Array.from(
      html.matchAll(
        /(?:window\.)?location(?:\.href)?\s*=\s*(["'`])([\s\S]*?)\1/gi,
      ),
      (match) => ({
        url: match[2],
        source: "script:location.href",
      }),
    ),
    ...Array.from(
      html.matchAll(/window\.open\s*\(\s*(["'`])([\s\S]*?)\1/gi),
      (match) => ({
        url: match[2],
        source: "script:window.open",
      }),
    ),
    ...Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
      .flatMap((match) =>
        Array.from(
          match[1].matchAll(/https?:\/\/[^\s"'<>\\]+/gi),
          (urlMatch) => ({
            url: urlMatch[0],
            source: "script:absolute_url",
          }),
        ),
      ),
  ]
    .map((candidate) => ({
      ...candidate,
      url:
        normalizeAdzunaHandoffCandidateUrl(candidate.url, baseUrl) ??
        candidate.url,
    }))
    .filter((candidate) =>
      isLikelyAdzunaDownstreamCandidate({
        url: candidate.url,
        currentUrl: baseUrl,
        source: candidate.source,
      }),
    );

  return candidates.slice(0, 20);
}

function startAdzunaNetworkRedirectCapture(page: Page) {
  const baseUrl = page.url();
  const seen = new Set<string>();
  const candidates: AdzunaDownstreamCandidateSignal[] = [];
  let stopped = false;

  const record = (rawUrl: string, source: string, resourceType?: string) => {
    if (stopped) return;
    if (
      resourceType &&
      ["image", "stylesheet", "font", "media"].includes(resourceType)
    ) {
      return;
    }

    const normalizedUrl = normalizeAdzunaHandoffCandidateUrl(rawUrl, baseUrl);
    if (
      !normalizedUrl ||
      !isLikelyAdzunaDownstreamCandidate({
        url: normalizedUrl,
        currentUrl: baseUrl,
        source,
      })
    ) {
      return;
    }

    const key = `${source}:${normalizedUrl}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      url: normalizedUrl,
      source,
    });
  };

  const onRequest = (request: {
    url(): string;
    resourceType(): string;
  }) => {
    record(request.url(), "network:request", request.resourceType());
  };

  const onResponse = (response: {
    url(): string;
    request(): { resourceType(): string };
  }) => {
    record(
      response.url(),
      "network:response",
      response.request().resourceType(),
    );
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  const stop = () => {
    if (stopped) {
      return summarizeAdzunaCandidateSignals(candidates);
    }

    stopped = true;
    page.off("request", onRequest);
    page.off("response", onResponse);
    return summarizeAdzunaCandidateSignals(candidates);
  };

  return {
    snapshot: () => summarizeAdzunaCandidateSignals(candidates),
    stop,
  };
}

function isStrongResolvedHandoffCandidate(candidate: ApplySourceCandidate) {
  const signalText = `${candidate.href} ${candidate.text}`.toLowerCase();

  if (candidate.score >= 140) {
    return true;
  }

  if (
    candidate.reasons.some(
      (reason) =>
        reason === "apply_path" ||
        reason === "redirect_handoff" ||
        reason === "known_apply_host" ||
        reason === "job_specific_path" ||
        reason.startsWith("keyword:apply") ||
        reason.startsWith("keyword:application"),
    )
  ) {
    return true;
  }

  return [
    "apply for this job",
    "apply now",
    "continue to application",
    "visit employer site",
    "go to application",
    "open job site",
    "/land/ad/",
    "apply",
    "application",
  ].some((pattern) => signalText.includes(pattern));
}

function pickResolvedHandoffCandidate(args: {
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
}) {
  const selectedCandidate = args.resolverSelectedLink
    ? args.resolverCandidates.find(
        (candidate) => candidate.href === args.resolverSelectedLink,
      )
    : undefined;

  const preferred =
    selectedCandidate ??
    (args.resolverSelectedLink
      ? ({
          href: args.resolverSelectedLink,
          hostname: parseHostname(args.resolverSelectedLink),
          text: args.resolverCandidates[0]?.text ?? "",
          score: args.resolverCandidates[0]?.score ?? 0,
          reasons: ["selected_link_fallback"],
        } satisfies ApplySourceCandidate)
      : undefined) ??
    args.resolverCandidates[0];

  if (!preferred) {
    return null;
  }

  return isStrongResolvedHandoffCandidate(preferred) ? preferred : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildResolvedHandoffHrefFragments(rawHref: string) {
  const fragments = new Set<string>();

  try {
    const parsed = new URL(rawHref);
    const pathAndSearch = `${parsed.pathname}${parsed.search}`;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const tailFragment = segments.slice(-2).join("/");

    fragments.add(rawHref);
    if (pathAndSearch) fragments.add(pathAndSearch);
    if (parsed.pathname) fragments.add(parsed.pathname);
    if (tailFragment) fragments.add(tailFragment);
    if (parsed.pathname.includes("/land/ad/")) {
      fragments.add("land/ad");
    }
  } catch {
    if (rawHref) {
      fragments.add(rawHref);
    }
  }

  return [...fragments].filter(Boolean);
}

async function findFirstVisibleEnabledLocator(
  locator: Locator,
): Promise<Locator | null> {
  const count = await locator.count().catch(() => 0);
  const max = Math.min(count, 8);

  for (let index = 0; index < max; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;

    const enabled = await candidate.isEnabled().catch(() => true);
    const ariaDisabled = await candidate
      .getAttribute("aria-disabled")
      .catch(() => null);

    if (!enabled || ariaDisabled === "true") {
      continue;
    }

    return candidate;
  }

  return null;
}

async function isInteractableChoiceLocator(locator: Locator) {
  return locator
    .evaluate((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return false;
      }
      if (
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true"
      ) {
        return false;
      }

      const cookieContainer = element.closest(
        '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], [aria-label*="cookie"], [aria-label*="consent"], [data-testid*="cookie"], [data-testid*="consent"]',
      );
      if (cookieContainer) {
        const text = (cookieContainer.textContent ?? "").toLowerCase();
        if (
          text.includes("cookie") ||
          text.includes("consent") ||
          text.includes("privacy")
        ) {
          return false;
        }
      }

      return true;
    })
    .catch(() => false);
}

async function findFirstMatchingLocatorPlan(
  plans: LocatorPlan[],
): Promise<LocatorPlan | null> {
  for (const plan of plans) {
    const matchedLocator = await findFirstVisibleEnabledLocator(plan.locator);
    if (matchedLocator) {
      return {
        locator: matchedLocator,
        selector: plan.selector,
      };
    }
  }

  return null;
}

async function isVisibleLocator(locator: Locator) {
  const count = await locator.count().catch(() => 0);
  if (count === 0) return false;
  return locator.first().isVisible().catch(() => false);
}

async function findNearestVisibleClickableFromTextLocator(
  locator: Locator,
): Promise<Locator | null> {
  const selfOrAncestorClickable = await findFirstVisibleEnabledLocator(
    locator.locator(
      "xpath=ancestor-or-self::*[self::a[@href] or self::button or @role='button'][1]",
    ),
  );
  if (selfOrAncestorClickable) {
    return selfOrAncestorClickable;
  }

  const containerLocator = locator.locator(
    "xpath=ancestor::*[self::p or self::div or self::span or self::section or self::article or self::main][1]",
  );
  const containerClickable = await findFirstVisibleEnabledLocator(
    containerLocator.locator("a[href], button, [role='button']"),
  );
  if (containerClickable) {
    return containerClickable;
  }

  const parentContainerClickable = await findFirstVisibleEnabledLocator(
    locator
      .locator(
        "xpath=ancestor::*[self::p or self::div or self::span or self::section or self::article or self::main][2]",
      )
      .locator("a[href], button, [role='button']"),
  );

  return parentContainerClickable;
}

async function buildAdzunaFallbackTargetFromLocator(args: {
  locator: Locator;
  strategy: string;
  selector: string;
  matchedText: string;
  nearestClickable?: boolean;
}): Promise<AdzunaFallbackLinkTarget | null> {
  const matchedLocator = args.nearestClickable
    ? await findNearestVisibleClickableFromTextLocator(args.locator)
    : await findFirstVisibleEnabledLocator(args.locator);
  if (!matchedLocator) {
    return null;
  }

  const href =
    (await matchedLocator.getAttribute("href").catch(() => null)) ?? undefined;
  const text = (await extractLocatorText(matchedLocator)).trim();

  return {
    locator: matchedLocator,
    selector: args.selector,
    text: text.slice(0, 160) || args.matchedText,
    matchedText: args.matchedText,
    locatorStrategy: args.strategy,
    href,
  } satisfies AdzunaFallbackLinkTarget;
}

async function navigateResolvedHandoffCandidateDirectly(args: {
  page: Page;
  context: BrowserContext;
  candidate: ApplySourceCandidate;
  resolverSelectedLink?: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const directNavUrl = args.resolverSelectedLink ?? args.candidate.href;
  const urlBefore = args.page.url();

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV] attempting", {
    resolvedHandoffDirectNavAttempted: true,
    resolvedHandoffDirectNavUrl: directNavUrl,
    currentUrl: urlBefore,
    candidateScore: args.candidate.score,
  });

  try {
    await args.page.goto(directNavUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(args.page);
    await args.onPageReady?.(args.page, args.context);
  } catch {
    const failedResult = {
      page: args.page,
      attempted: true,
      succeeded: false,
      url: directNavUrl,
      urlAfter: args.page.url(),
    };

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV]", {
      resolvedHandoffDirectNavAttempted: failedResult.attempted,
      resolvedHandoffDirectNavSucceeded: failedResult.succeeded,
      resolvedHandoffDirectNavUrl: failedResult.url,
      resolvedHandoffDirectNavUrlAfter: failedResult.urlAfter,
      currentUrl: args.page.url(),
    });

    return failedResult;
  }

  const progress = await waitForPostClickProgress({
    page: args.page,
    context: args.context,
    urlBefore,
    onPageReady: args.onPageReady,
  });

  const directNavUrlAfter = progress.page.url();
  const directNavSucceeded =
    progress.urlChanged ||
    !isAdzunaLandRedirectPage(directNavUrlAfter) ||
    (await hasReachedPostHandoffDestination(progress.page));

  const result = {
    page: progress.page,
    attempted: true,
    succeeded: directNavSucceeded,
    url: directNavUrl,
    urlAfter: directNavUrlAfter,
  };

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_NAV]", {
    resolvedHandoffDirectNavAttempted: result.attempted,
    resolvedHandoffDirectNavSucceeded: result.succeeded,
    resolvedHandoffDirectNavUrl: result.url,
    resolvedHandoffDirectNavUrlAfter: result.urlAfter,
    currentUrl: progress.page.url(),
  });

  return result;
}

async function waitForTrackedHandoffRedirects(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const currentUrl = activePage.url();
    if (
      !isAdzunaLandRedirectPage(currentUrl) &&
      !isAppcastTrackingPage(currentUrl)
    ) {
      break;
    }

    const progress = await waitForPostClickProgress({
      page: activePage,
      context: args.context,
      urlBefore: currentUrl,
      onPageReady: args.onPageReady,
    });

    activePage = progress.page;
    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (!progress.progressDetected) {
      if (isAppcastTrackingPage(activePage.url()) && attempt < 3) {
        await activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 500).catch(
          () => null,
        );
        await waitForDomAndSettle(activePage).catch(() => null);
        if (!urlsVisited.includes(activePage.url())) {
          urlsVisited.push(activePage.url());
        }
        continue;
      }
      break;
    }
  }

  if (isAppcastTrackingPage(activePage.url())) {
    console.log("[AUTO_APPLY_APPCAST_HOP]", {
      currentUrl: activePage.url(),
      urlsVisited,
    });
  }

  if (isDiceJobDetailPage(activePage.url())) {
    console.log("[AUTO_APPLY_DICE_DESTINATION]", {
      currentUrl: activePage.url(),
      urlsVisited,
    });
  }

  return {
    page: activePage,
    urlsVisited,
  };
}

async function findAdzunaAuthEmailLocator(
  page: Page,
  attemptedSelectors: string[],
) {
  const namedLocator = await findMatchingLocator(
    page,
    "email",
    attemptedSelectors,
  );

  if (namedLocator) {
    const visibleLocator = await findFirstVisibleEnabledLocator(namedLocator);
    if (visibleLocator) {
      return {
        locator: visibleLocator,
        selector: "matched:email",
      } satisfies LocatorPlan;
    }
  }

  const fallback = await findFirstMatchingLocatorPlan([
    {
      locator: page.locator(
        [
          'input[type="email"]',
          'input[name*="email" i]',
          'input[id*="email" i]',
          'input[autocomplete="email"]',
          'input[autocomplete="username"]',
          'input[placeholder*="email" i]',
        ].join(", "),
      ),
      selector: "input[type=email|email aliases]",
    },
    {
      locator: page.getByLabel(/email|e-mail/i),
      selector: "label=/email|e-mail/i",
    },
  ]);

  if (fallback) {
    attemptedSelectors.push(fallback.selector);
  }

  return fallback;
}

async function findAdzunaAuthPasswordLocator(
  page: Page,
  attemptedSelectors: string[],
) {
  const fallback = await findFirstMatchingLocatorPlan([
    {
      locator: page.locator(
        [
          'input[type="password"]',
          'input[name*="password" i]',
          'input[id*="password" i]',
          'input[autocomplete="current-password"]',
          'input[autocomplete="password"]',
          'input[placeholder*="password" i]',
        ].join(", "),
      ),
      selector: "input[type=password|password aliases]",
    },
    {
      locator: page.getByLabel(/password/i),
      selector: "label=/password/i",
    },
  ]);

  if (fallback) {
    attemptedSelectors.push(fallback.selector);
  }

  return fallback;
}

async function findAdzunaAuthSubmitLocator(page: Page) {
  return findFirstMatchingLocatorPlan([
    {
      locator: page.locator('button[type="submit"], input[type="submit"]'),
      selector: 'button[type="submit"], input[type="submit"]',
    },
    {
      locator: page.getByRole("button", {
        name: /sign in|log in|login|continue/i,
      }),
      selector: "role=button[name=/sign in|log in|login|continue/i]",
    },
    {
      locator: page.getByRole("link", {
        name: /sign in|log in|login|continue/i,
      }),
      selector: "role=link[name=/sign in|log in|login|continue/i]",
    },
  ]);
}

async function recoverFromAdzunaForgotPasswordPage(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const authState = classifyAdzunaAuthPage(activePage.url());
  const loginUrl = authState.normalizedLoginUrl;

  const recoveryTarget = await findFirstMatchingLocatorPlan([
    {
      locator: activePage.getByRole("link", {
        name: /back to login|back|cancel|sign in|log in|login/i,
      }),
      selector:
        "role=link[name=/back to login|back|cancel|sign in|log in|login/i]",
    },
    {
      locator: activePage.getByRole("button", {
        name: /back to login|back|cancel|sign in|log in|login/i,
      }),
      selector:
        "role=button[name=/back to login|back|cancel|sign in|log in|login/i]",
    },
  ]);

  if (recoveryTarget) {
    const recoveryText = (await extractLocatorText(recoveryTarget.locator))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const fromUrl = activePage.url();
    const navigationPromise = activePage
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 10_000,
      })
      .catch(() => null);

    attempts.push({
      phase: "handoff",
      action: "click",
      selector: recoveryTarget.selector,
      text: recoveryText,
      matchedText: "adzuna_auth_recovery",
      locatorStrategy: "adzuna_auth_recovery_control",
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: fromUrl,
      urlAfter: fromUrl,
    } satisfies ApplySessionCtaAttemptRecord);

    try {
      await recoveryTarget.locator
        .click({ timeout: 6_000 })
        .catch(() =>
          recoveryTarget.locator.click({ force: true, timeout: 6_000 }),
        );
      await navigationPromise;
      await waitForDomAndSettle(activePage);
      await args.onPageReady?.(activePage, args.context);

      clicks.push({
        hop: 1,
        fromUrl,
        toUrl: activePage.url(),
        selector: recoveryTarget.selector,
        text: recoveryText,
        navigation: "same-tab",
      } satisfies ApplySessionClickRecord);

      attempts[attempts.length - 1] = {
        ...attempts[attempts.length - 1],
        success: true,
        urlAfter: activePage.url(),
      };

      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
    } catch {
      attempts[attempts.length - 1] = {
        ...attempts[attempts.length - 1],
        success: false,
        urlAfter: activePage.url(),
      };
    }
  }

  if (classifyAdzunaAuthPage(activePage.url()).isLoginPage) {
    console.info("[AUTO_APPLY_ADZUNA_AUTH_RECOVERY]", {
      recoveryTriggered: true,
      recoverySucceeded: true,
      currentUrl: activePage.url(),
    });

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      succeeded: true,
    };
  }

  if (!loginUrl) {
    console.info("[AUTO_APPLY_ADZUNA_AUTH_RECOVERY]", {
      recoveryTriggered: true,
      recoverySucceeded: false,
      currentUrl: activePage.url(),
      reason: "missing_login_url",
    });

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      succeeded: false,
      failureReason: "missing_login_url",
    };
  }

  try {
    const fromUrl = activePage.url();
    await activePage.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(activePage);
    await args.onPageReady?.(activePage, args.context);

    clicks.push({
      hop: clicks.length + 1,
      fromUrl,
      toUrl: activePage.url(),
      selector: "page.goto(normalized_login_url)",
      text: "Back to login",
      navigation: "same-tab",
    } satisfies ApplySessionClickRecord);

    attempts.push({
      phase: "handoff",
      action: "click",
      selector: "page.goto(normalized_login_url)",
      text: "Back to login",
      matchedText: "adzuna_auth_recovery",
      locatorStrategy: "adzuna_auth_url_normalization",
      candidateFound: true,
      dismissesBlocker: false,
      success: classifyAdzunaAuthPage(activePage.url()).isLoginPage,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }
  } catch {
    attempts.push({
      phase: "handoff",
      action: "click",
      selector: "page.goto(normalized_login_url)",
      text: "Back to login",
      matchedText: "adzuna_auth_recovery",
      locatorStrategy: "adzuna_auth_url_normalization",
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: activePage.url(),
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);
  }

  const succeeded = classifyAdzunaAuthPage(activePage.url()).isLoginPage;

  console.info("[AUTO_APPLY_ADZUNA_AUTH_RECOVERY]", {
    recoveryTriggered: true,
    recoverySucceeded: succeeded,
    currentUrl: activePage.url(),
    loginUrl,
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    succeeded,
    failureReason: succeeded
      ? undefined
      : "forgot_password_recovery_failed",
  };
}

async function loginThroughAdzunaAuthenticatePage(args: {
  page: Page;
  context: BrowserContext;
  attemptedSelectors: string[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const credentials = readAdzunaLoginCredentials();

  if (!credentials.ready) {
    console.info("[AUTO_APPLY_ADZUNA_LOGIN]", {
      adzunaLoginAttempted: false,
      adzunaLoginSucceeded: false,
      adzunaLoginFailedReason: "missing_adzuna_login_credentials",
      currentUrl: activePage.url(),
    });

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: false,
      succeeded: false,
      failureReason: "missing_adzuna_login_credentials",
    };
  }

  const emailTarget = await findAdzunaAuthEmailLocator(
    activePage,
    args.attemptedSelectors,
  );
  if (!emailTarget) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: false,
      succeeded: false,
      failureReason: "missing_adzuna_email_field",
    };
  }

  const passwordTarget = await findAdzunaAuthPasswordLocator(
    activePage,
    args.attemptedSelectors,
  );
  if (!passwordTarget) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: false,
      succeeded: false,
      failureReason: "missing_adzuna_password_field",
    };
  }

  await emailTarget.locator.fill(credentials.email);
  await passwordTarget.locator.fill(credentials.password);

  const submitTarget = await findAdzunaAuthSubmitLocator(activePage);
  const submitText = submitTarget
    ? (await extractLocatorText(submitTarget.locator))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160)
    : "Enter";
  const submitSelector =
    submitTarget?.selector ?? "password_field:press(Enter)";
  const submitAttempt = {
    phase: "handoff",
    action: "click",
    selector: submitSelector,
    text: submitText,
    matchedText: "adzuna_login_submit",
    locatorStrategy: submitTarget
      ? "adzuna_login_submit_control"
      : "adzuna_login_press_enter",
    candidateFound: true,
    dismissesBlocker: false,
    success: false,
    urlBefore: activePage.url(),
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord;
  attempts.push(submitAttempt);

  const fromUrl = activePage.url();
  const navigationPromise = activePage
    .waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: 12_000,
    })
    .catch(() => null);

  try {
    if (submitTarget) {
      await submitTarget.locator
        .click({ timeout: 6_000 })
        .catch(() =>
          submitTarget.locator.click({ force: true, timeout: 6_000 }),
        );
    } else {
      await passwordTarget.locator.press("Enter");
    }
    await navigationPromise;
  } catch {
    attempts[attempts.length - 1] = {
      ...attempts[attempts.length - 1],
      success: false,
      urlAfter: activePage.url(),
    };

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: true,
      succeeded: false,
      failureReason: "adzuna_login_submit_failed",
    };
  }

  clicks.push({
    hop: 1,
    fromUrl,
    toUrl: activePage.url(),
    selector: submitSelector,
    text: submitText,
    navigation: "same-tab",
  } satisfies ApplySessionClickRecord);

  const progress = await waitForPostClickProgress({
    page: activePage,
    context: args.context,
    urlBefore: fromUrl,
    onPageReady: args.onPageReady,
  });

  activePage = progress.page;
  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  const authStateAfter = classifyAdzunaAuthPage(activePage.url());
  const succeeded = !authStateAfter.isAuthPage;
  const failureReason = succeeded
    ? undefined
    : progress.urlChanged
      ? "adzuna_login_still_on_auth_page_after_submit"
      : "adzuna_login_submit_no_progress";

  attempts[attempts.length - 1] = {
    ...attempts[attempts.length - 1],
    success: succeeded,
    urlAfter: activePage.url(),
  };

  console.info("[AUTO_APPLY_ADZUNA_LOGIN]", {
    adzunaLoginAttempted: true,
    adzunaLoginSucceeded: succeeded,
    adzunaLoginFailedReason: failureReason ?? null,
    currentUrl: activePage.url(),
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    attempted: true,
    succeeded,
    failureReason,
  };
}

async function handleAdzunaAuthGateIfPresent(args: {
  page: Page;
  context: BrowserContext;
  attemptedSelectors: string[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<AdzunaAuthHandlingResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const initialState = classifyAdzunaAuthPage(activePage.url());

  if (!initialState.isAuthPage) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      authPageDetected: false,
      forgotPasswordDetected: false,
      loginAttempted: false,
      loginSucceeded: false,
    };
  }

  let loginAttempted = false;
  let loginSucceeded = false;
  let loginFailedReason: string | undefined = undefined;

  console.info("[AUTO_APPLY_ADZUNA_AUTH]", {
    currentUrl: activePage.url(),
    adzunaAuthPageDetected: true,
    adzunaForgotPasswordDetected: initialState.isForgotPasswordPage,
  });

  if (initialState.isForgotPasswordPage) {
    const recovery = await recoverFromAdzunaForgotPasswordPage({
      page: activePage,
      context: args.context,
      onPageReady: args.onPageReady,
    });
    activePage = recovery.page;

    for (const url of recovery.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }
    clicks.push(...recovery.clicks);
    attempts.push(...recovery.attempts);

    if (!recovery.succeeded) {
      return {
        page: activePage,
        urlsVisited,
        clicks,
        attempts,
        authPageDetected: true,
        forgotPasswordDetected: true,
        loginAttempted: false,
        loginSucceeded: false,
        loginFailedReason:
          recovery.failureReason ?? "forgot_password_recovery_failed",
      };
    }
  }

  if (!classifyAdzunaAuthPage(activePage.url()).isLoginPage) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      authPageDetected: true,
      forgotPasswordDetected: initialState.isForgotPasswordPage,
      loginAttempted: false,
      loginSucceeded: false,
      loginFailedReason: "adzuna_login_page_not_reached",
    };
  }

  const loginResult = await loginThroughAdzunaAuthenticatePage({
    page: activePage,
    context: args.context,
    attemptedSelectors: args.attemptedSelectors,
    onPageReady: args.onPageReady,
  });

  activePage = loginResult.page;
  loginAttempted = loginResult.attempted;
  loginSucceeded = loginResult.succeeded;
  loginFailedReason = loginResult.failureReason;

  for (const url of loginResult.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }
  clicks.push(...loginResult.clicks);
  attempts.push(...loginResult.attempts);

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    authPageDetected: true,
    forgotPasswordDetected: initialState.isForgotPasswordPage,
    loginAttempted,
    loginSucceeded,
    loginFailedReason,
  };
}

async function navigateAdzunaFallbackHrefDirectly(args: {
  page: Page;
  context: BrowserContext;
  href: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const urlBefore = args.page.url();
  const fallbackHost = parseHostname(args.href);

  console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK] attempting", {
    adzunaFallbackDirectNavAttempted: true,
    adzunaFallbackHref: args.href,
    adzunaFallbackHost: fallbackHost || null,
    currentUrl: urlBefore,
  });

  try {
    await args.page.goto(args.href, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(args.page);
    await args.onPageReady?.(args.page, args.context);
  } catch {
    const failedResult = {
      page: args.page,
      attempted: true,
      succeeded: false,
      href: args.href,
      host: fallbackHost,
      urlAfter: args.page.url(),
      urlsVisited: [urlBefore, args.page.url()].filter(
        (value, index, all) => Boolean(value) && all.indexOf(value) === index,
      ),
    };

    console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK]", {
      adzunaFallbackDirectNavAttempted: failedResult.attempted,
      adzunaFallbackDirectNavSucceeded: failedResult.succeeded,
      adzunaFallbackHref: failedResult.href,
      adzunaFallbackHost: failedResult.host || null,
      adzunaFallbackUrlAfter: failedResult.urlAfter,
      currentUrl: args.page.url(),
    });

    return failedResult;
  }

  const chainedProgress = await waitForTrackedHandoffRedirects({
    page: args.page,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  const finalPage = chainedProgress.page;
  const finalUrl = finalPage.url();
  const succeeded =
    finalUrl !== urlBefore && !isAdzunaLandRedirectPage(finalUrl);

  const result = {
    page: finalPage,
    attempted: true,
    succeeded,
    href: args.href,
    host: fallbackHost,
    urlAfter: finalUrl,
    urlsVisited: [urlBefore, ...chainedProgress.urlsVisited].filter(
      (value, index, all) => Boolean(value) && all.indexOf(value) === index,
    ),
  };

  console.log("[AUTO_APPLY_ADZUNA_APPCAST_FALLBACK]", {
    adzunaFallbackDirectNavAttempted: result.attempted,
    adzunaFallbackDirectNavSucceeded: result.succeeded,
    adzunaFallbackHref: result.href,
    adzunaFallbackHost: result.host || null,
    adzunaFallbackUrlAfter: result.urlAfter,
    currentUrl: finalPage.url(),
  });

  return result;
}

async function extractAdzunaInterstitialRedirectTarget(
  page: Page,
): Promise<AdzunaExtractedRedirectResult> {
  const landState = classifyAdzunaLandPage(page.url());
  if (!landState.isLandPage) {
    return {
      extractionSucceeded: false,
      htmlRead: false,
      tokenizedInterstitialDetected: false,
      tokenizedParamsPresent: [],
      downstreamCandidates: [],
      scriptRedirectCandidates: [],
    } satisfies AdzunaExtractedRedirectResult;
  }

  const html = await page.content().catch(() => "");
  if (!html.trim()) {
    return {
      extractionSucceeded: false,
      htmlRead: false,
      failureReason: ["html_read_failed"],
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: [],
      scriptRedirectCandidates: [],
    } satisfies AdzunaExtractedRedirectResult;
  }

  const baseUrl = page.url();
  const scriptRedirectCandidates =
    extractAdzunaScriptRedirectCandidatesFromHtml(html, baseUrl);
  const summarizedScriptRedirectCandidates =
    summarizeAdzunaCandidateSignals(scriptRedirectCandidates);
  const inlineScriptCandidate = preferBestAdzunaDownstreamCandidate(
    scriptRedirectCandidates,
    baseUrl,
  );

  if (inlineScriptCandidate) {
    return {
      extractedUrl: inlineScriptCandidate.url,
      extractionSource: "inline_script",
      extractionSucceeded: true,
      htmlRead: true,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: [],
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const metaRefreshCandidates = Array.from(
    html.matchAll(/<meta\b[^>]*>/gi),
    (match) => match[0],
  )
    .filter((tag) => /http-equiv\s*=\s*(?:(["'])refresh\1|refresh)\b/i.test(tag))
    .map((tag) => {
      const contentMatch =
        tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i) ??
        tag.match(/content\s*=\s*([^\s>]+)/i);
      const content = contentMatch?.[2] ?? contentMatch?.[1] ?? "";
      const urlMatch = content.match(/(?:^|;)\s*url\s*=\s*(.+)$/i);
      return {
        url: urlMatch?.[1]?.trim() ?? "",
        source: "meta_refresh",
      } satisfies AdzunaDownstreamCandidateSignal;
    });

  const metaRefreshCandidate = preferBestAdzunaDownstreamCandidate(
    metaRefreshCandidates,
    baseUrl,
  );
  if (metaRefreshCandidate) {
    return {
      extractedUrl: metaRefreshCandidate.url,
      extractionSource: "meta_refresh",
      extractionSucceeded: true,
      htmlRead: true,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: [],
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const fallbackAnchorCandidates = Array.from(
    html.matchAll(
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  )
    .map((match) => ({
      url: match[2],
      text: match[3]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
      source: "fallback_anchor",
    }))
    .filter((candidate) =>
      ["view ad here", "view job here", "open ad here"].some((pattern) =>
        candidate.text.toLowerCase().includes(pattern),
      ),
    );

  const fallbackAnchorCandidate = preferBestAdzunaDownstreamCandidate(
    fallbackAnchorCandidates,
    baseUrl,
  );
  if (fallbackAnchorCandidate) {
    const fallbackMatch = fallbackAnchorCandidates.find(
      (candidate) =>
        normalizeAdzunaHandoffCandidateUrl(candidate.url, baseUrl) ===
        fallbackAnchorCandidate.url,
    );

    return {
      extractedUrl: fallbackAnchorCandidate.url,
      extractionSource: "fallback_anchor",
      extractionSucceeded: true,
      htmlRead: true,
      fallbackText: fallbackMatch?.text.slice(0, 160) || undefined,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: [],
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const appcastHrefCandidates = [
    ...Array.from(
      html.matchAll(
        /href\s*=\s*(["'])(https?:\/\/click\.appcast\.io\/t\/[\s\S]*?)\1/gi,
      ),
      (match) =>
        ({
          url: match[2],
          source: "appcast_href",
        } satisfies AdzunaDownstreamCandidateSignal),
    ),
    ...Array.from(
      html.matchAll(/https?:\/\/click\.appcast\.io\/t\/[^\s"'<>]+/gi),
      (match) =>
        ({
          url: match[0],
          source: "appcast_href",
        } satisfies AdzunaDownstreamCandidateSignal),
    ),
  ];

  const appcastHrefCandidate = preferBestAdzunaDownstreamCandidate(
    appcastHrefCandidates,
    baseUrl,
  );
  if (appcastHrefCandidate) {
    return {
      extractedUrl: appcastHrefCandidate.url,
      extractionSource: "appcast_href",
      extractionSucceeded: true,
      htmlRead: true,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: [],
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  const tokenizedDomCandidates = landState.isTokenizedInterstitial
    ? await collectAdzunaTokenizedDomCandidates(page)
    : [];

  const visibleExternalCandidates =
    await collectApplySourceCandidates(page).catch(() => ({
      candidates: [] as ApplySourceCandidate[],
      rejectedCandidates: [] as ApplySourceRejectedCandidate[],
    }));
  const visibleCandidateSignals = visibleExternalCandidates.candidates.map(
    (candidate) =>
      ({
        url: candidate.href,
        text: candidate.text,
        source: "visible_external_anchor",
      } satisfies AdzunaDownstreamCandidateSignal),
  );
  const preferredVisibleExternalCandidate =
    visibleExternalCandidates.candidates.find((candidate) =>
      isStrongResolvedHandoffCandidate(candidate),
    ) ?? visibleExternalCandidates.candidates[0];
  const preferredTokenizedDomCandidate = preferBestAdzunaDownstreamCandidate(
    tokenizedDomCandidates,
    baseUrl,
  );
  const summarizedDownstreamCandidates = summarizeAdzunaCandidateSignals([
    ...tokenizedDomCandidates,
    ...visibleCandidateSignals,
    ...fallbackAnchorCandidates,
  ]);

  if (preferredTokenizedDomCandidate) {
    return {
      extractedUrl: preferredTokenizedDomCandidate.url,
      extractionSource: "tokenized_dom_candidate",
      extractionSucceeded: true,
      htmlRead: true,
      fallbackText:
        preferredTokenizedDomCandidate.text?.slice(0, 160) || undefined,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: summarizedDownstreamCandidates,
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  if (preferredVisibleExternalCandidate) {
    return {
      extractedUrl: preferredVisibleExternalCandidate.href,
      extractionSource: "fallback_anchor",
      extractionSucceeded: true,
      htmlRead: true,
      fallbackText:
        preferredVisibleExternalCandidate.text.slice(0, 160) || undefined,
      tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
      tokenizedParamsPresent: landState.tokenizedParamsPresent,
      downstreamCandidates: summarizedDownstreamCandidates,
      scriptRedirectCandidates: summarizedScriptRedirectCandidates,
    } satisfies AdzunaExtractedRedirectResult;
  }

  return {
    extractionSucceeded: false,
    htmlRead: true,
    failureReason: [
      "no_meta_refresh_match",
      "no_location_replace_match",
      summarizedScriptRedirectCandidates.length > 0
        ? "script_redirect_candidate_unusable"
        : "no_embedded_script_url_match",
      "no_fallback_anchor_match",
      "no_appcast_href_match",
      landState.isTokenizedInterstitial &&
      summarizedDownstreamCandidates.length === 0
        ? "no_tokenized_downstream_candidate"
        : "no_visible_external_anchor_match",
    ],
    tokenizedInterstitialDetected: landState.isTokenizedInterstitial,
    tokenizedParamsPresent: landState.tokenizedParamsPresent,
    downstreamCandidates: summarizedDownstreamCandidates,
    scriptRedirectCandidates: summarizedScriptRedirectCandidates,
  } satisfies AdzunaExtractedRedirectResult;
}

async function navigateAdzunaExtractedRedirectDirectly(args: {
  page: Page;
  context: BrowserContext;
  extractedUrl: string;
  extractionSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate";
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT] attempting", {
    adzunaExtractedRedirectUrl: args.extractedUrl,
    adzunaExtractedRedirectSource: args.extractionSource,
    currentUrl: args.page.url(),
  });

  const result = await navigateAdzunaFallbackHrefDirectly({
    page: args.page,
    context: args.context,
    href: args.extractedUrl,
    onPageReady: args.onPageReady,
  });

  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT]", {
    adzunaExtractedRedirectUrl: args.extractedUrl,
    adzunaExtractedRedirectSource: args.extractionSource,
    adzunaExtractedRedirectNavAttempted: result.attempted,
    adzunaExtractedRedirectNavSucceeded: result.succeeded,
    adzunaFallbackUrlAfter: result.urlAfter,
    currentUrl: result.page.url(),
  });

  return result;
}

async function findAdzunaFallbackLinkTarget(
  page: Page,
): Promise<AdzunaFallbackLinkTarget | null> {
  const textPatterns = [
    "view ad here",
    "view job here",
    "open ad here",
  ] as const;
  const redirectSentencePattern =
    /if\s+you\s+are\s+not\s+redirected(?:\s+within\s+\d+\s+seconds?)?/i;
  const locatorPlans: Array<{
    locator: Locator;
    strategy: string;
    selector: string;
    matchedText: string;
    nearestClickable?: boolean;
  }> = [];

  for (const pattern of textPatterns) {
    const containsPattern = new RegExp(
      pattern
        .split(/\s+/)
        .map((token) => escapeRegExp(token))
        .join("\\s+"),
      "i",
    );

    locatorPlans.push({
      locator: page.locator("a[href]").filter({ hasText: containsPattern }),
      strategy: "adzuna_fallback_anchor_text_contains",
      selector: `a[href]:has-text(${pattern})`,
      matchedText: pattern,
    });
    locatorPlans.push({
      locator: page
        .locator("button, [role='button']")
        .filter({ hasText: containsPattern }),
      strategy: "adzuna_fallback_button_text_contains",
      selector: `button:has-text(${pattern})`,
      matchedText: pattern,
    });
    locatorPlans.push({
      locator: page.getByText(containsPattern),
      strategy: "adzuna_fallback_text_nearest_clickable",
      selector: `text=${pattern} -> nearest_clickable`,
      matchedText: pattern,
      nearestClickable: true,
    });
  }

  locatorPlans.push({
    locator: page.getByText(redirectSentencePattern),
    strategy: "adzuna_fallback_redirect_sentence_container_link",
    selector: "text=/if you are not redirected/i -> nearest_clickable",
    matchedText: "if you are not redirected",
    nearestClickable: true,
  });

  for (const plan of locatorPlans) {
    const target = await buildAdzunaFallbackTargetFromLocator({
      locator: plan.locator,
      strategy: plan.strategy,
      selector: plan.selector,
      matchedText: plan.matchedText,
      nearestClickable: plan.nearestClickable,
    });
    if (!target) continue;

    return target;
  }

  return null;
}

async function clickAdzunaFallbackLinkIfStuck(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<AdzunaFallbackLinkResult> {
  let activePage = args.page;
  const fromUrl = activePage.url();
  const urlsVisited = [fromUrl];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  let directNavAttempted = false;
  let directNavSucceeded = false;
  let extractedRedirectUrl: string | undefined = undefined;
  let extractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate"
    | undefined = undefined;
  let extractedRedirectHtmlRead = false;
  let extractedRedirectFailureReason: string[] | undefined = undefined;
  let extractedRedirectNavAttempted = false;
  let extractedRedirectNavSucceeded = false;
  let tokenizedInterstitialDetected = false;
  let tokenizedParamsPresent: string[] = [];
  let downstreamCandidates: string[] = [];
  let scriptRedirectCandidates: string[] = [];
  const getKnownChainState = () => {
    const knownUrls = dedupeUrls([fromUrl, ...urlsVisited, activePage.url()]);
    const adzunaInterstitialRecognized = knownUrls.some((url) =>
      isAdzunaLandRedirectPage(url),
    );
    const appcastHopDetected = knownUrls.some((url) =>
      isAppcastTrackingPage(url),
    );
    const diceDestinationDetected = knownUrls.some((url) =>
      isDiceJobDetailPage(url),
    );

    return {
      adzunaInterstitialRecognized,
      appcastHopDetected,
      diceDestinationDetected,
      handoffResolvedViaKnownChain:
        adzunaInterstitialRecognized &&
        appcastHopDetected &&
        diceDestinationDetected,
    };
  };

  if (!isAdzunaLandRedirectPage(fromUrl)) {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: false,
      clicked: false,
      elementFound: false,
      clickSucceeded: false,
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
      tokenizedInterstitialDetected,
      tokenizedParamsPresent,
      downstreamCandidates,
      scriptRedirectCandidates,
      ...getKnownChainState(),
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: result.found,
      adzunaFallbackLinkClicked: result.clicked,
      adzunaFallbackLinkText: null,
      adzunaFallbackLocatorStrategy: null,
      adzunaFallbackElementFound: result.elementFound,
      adzunaFallbackClickSucceeded: result.clickSucceeded,
      adzunaFallbackHref: null,
      adzunaFallbackHost: null,
      adzunaFallbackDirectNavAttempted: result.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
      adzunaExtractedRedirectUrl: null,
      adzunaExtractedRedirectSource: null,
      adzunaExtractedRedirectHtmlRead: result.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.extractedRedirectNavSucceeded,
      adzunaTokenizedInterstitialDetected:
        result.tokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent: result.tokenizedParamsPresent,
      adzunaDownstreamCandidates: result.downstreamCandidates,
      adzunaScriptRedirectCandidates:
        result.scriptRedirectCandidates,
      adzunaInterstitialRecognized:
        result.adzunaInterstitialRecognized,
      appcastHopDetected: result.appcastHopDetected,
      diceDestinationDetected: result.diceDestinationDetected,
      handoffResolvedViaKnownChain:
        result.handoffResolvedViaKnownChain,
      adzunaFallbackUrlAfter: fromUrl,
      currentUrl: fromUrl,
    });

    return result;
  }

  await activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 400).catch(() => null);
  await waitForDomAndSettle(activePage).catch(() => null);

  const extractedRedirect =
    await extractAdzunaInterstitialRedirectTarget(activePage);
  extractedRedirectUrl = extractedRedirect.extractedUrl;
  extractedRedirectSource = extractedRedirect.extractionSource;
  extractedRedirectHtmlRead = extractedRedirect.htmlRead;
  extractedRedirectFailureReason = extractedRedirect.failureReason;
  tokenizedInterstitialDetected =
    extractedRedirect.tokenizedInterstitialDetected === true;
  tokenizedParamsPresent = extractedRedirect.tokenizedParamsPresent ?? [];
  downstreamCandidates = extractedRedirect.downstreamCandidates ?? [];
  scriptRedirectCandidates =
    extractedRedirect.scriptRedirectCandidates ?? [];

  console.log("[AUTO_APPLY_ADZUNA_EXTRACTED_REDIRECT]", {
    adzunaExtractedRedirectUrl: extractedRedirectUrl ?? null,
    adzunaExtractedRedirectSource: extractedRedirectSource ?? null,
    adzunaExtractedRedirectHtmlRead: extractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      extractedRedirectFailureReason ?? [],
    adzunaTokenizedInterstitialDetected:
      tokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent: tokenizedParamsPresent,
    adzunaDownstreamCandidates: downstreamCandidates,
    adzunaScriptRedirectCandidates: scriptRedirectCandidates,
    extractionSucceeded: extractedRedirect.extractionSucceeded,
    currentUrl: activePage.url(),
  });

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector: extractedRedirectSource
      ? `source:${extractedRedirectSource}`
      : "adzuna_interstitial_source_extract",
    text: extractedRedirectUrl ?? "",
    matchedText:
      extractedRedirect.fallbackText ??
      extractedRedirectSource ??
      "extracted_redirect",
    locatorStrategy: "adzuna_interstitial_source_extract",
    candidateFound: extractedRedirect.extractionSucceeded,
    dismissesBlocker: false,
    success: extractedRedirect.extractionSucceeded,
    urlBefore: fromUrl,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (
    extractedRedirect.extractionSucceeded &&
    extractedRedirectUrl &&
    extractedRedirectSource
  ) {
    const extractedRedirectNav =
      await navigateAdzunaExtractedRedirectDirectly({
        page: activePage,
        context: args.context,
        extractedUrl: extractedRedirectUrl,
        extractionSource: extractedRedirectSource,
        onPageReady: args.onPageReady,
      });

    activePage = extractedRedirectNav.page;
    extractedRedirectNavAttempted = extractedRedirectNav.attempted;
    extractedRedirectNavSucceeded = extractedRedirectNav.succeeded;
    directNavAttempted = extractedRedirectNav.attempted;
    directNavSucceeded = extractedRedirectNav.succeeded;

    for (const url of extractedRedirectNav.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }

    if (extractedRedirectNavSucceeded) {
      const extractedResult = {
        page: activePage,
        urlsVisited,
        clicks,
        attempts,
        found: extractedRedirectSource === "fallback_anchor",
        clicked: true,
        text:
          extractedRedirect.fallbackText ??
          (extractedRedirectSource === "fallback_anchor"
            ? "view ad here"
            : undefined),
        selector:
          extractedRedirectSource === "fallback_anchor"
            ? "source:fallback_anchor"
            : undefined,
        locatorStrategy: `adzuna_extracted_redirect_${extractedRedirectSource}`,
        elementFound: extractedRedirectSource === "fallback_anchor",
        clickSucceeded: true,
        href: extractedRedirectUrl,
        host: parseHostname(extractedRedirectUrl),
        directNavAttempted,
        directNavSucceeded,
        extractedRedirectUrl,
        extractedRedirectSource,
        extractedRedirectHtmlRead,
        extractedRedirectFailureReason,
        extractedRedirectNavAttempted,
        extractedRedirectNavSucceeded,
        urlAfter: activePage.url(),
        tokenizedInterstitialDetected,
        tokenizedParamsPresent,
        downstreamCandidates,
        scriptRedirectCandidates,
        ...getKnownChainState(),
      } satisfies AdzunaFallbackLinkResult;

      console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
        adzunaFallbackLinkFound: extractedResult.found,
        adzunaFallbackLinkClicked: extractedResult.clicked,
        adzunaFallbackLinkText: extractedResult.text ?? null,
        adzunaFallbackLocatorStrategy:
          extractedResult.locatorStrategy ?? null,
        adzunaFallbackElementFound: extractedResult.elementFound,
        adzunaFallbackClickSucceeded: extractedResult.clickSucceeded,
        adzunaFallbackHref: extractedResult.href ?? null,
        adzunaFallbackHost: extractedResult.host ?? null,
        adzunaFallbackDirectNavAttempted:
          extractedResult.directNavAttempted,
        adzunaFallbackDirectNavSucceeded:
          extractedResult.directNavSucceeded,
        adzunaExtractedRedirectUrl:
          extractedResult.extractedRedirectUrl ?? null,
        adzunaExtractedRedirectSource:
          extractedResult.extractedRedirectSource ?? null,
        adzunaExtractedRedirectHtmlRead:
          extractedResult.extractedRedirectHtmlRead,
        adzunaExtractedRedirectFailureReason:
          extractedResult.extractedRedirectFailureReason ?? [],
        adzunaExtractedRedirectNavAttempted:
          extractedResult.extractedRedirectNavAttempted,
        adzunaExtractedRedirectNavSucceeded:
          extractedResult.extractedRedirectNavSucceeded,
        adzunaTokenizedInterstitialDetected:
          extractedResult.tokenizedInterstitialDetected,
        adzunaTokenizedParamsPresent:
          extractedResult.tokenizedParamsPresent,
        adzunaDownstreamCandidates:
          extractedResult.downstreamCandidates,
        adzunaScriptRedirectCandidates:
          extractedResult.scriptRedirectCandidates,
        adzunaInterstitialRecognized:
          extractedResult.adzunaInterstitialRecognized,
        appcastHopDetected: extractedResult.appcastHopDetected,
        diceDestinationDetected:
          extractedResult.diceDestinationDetected,
        handoffResolvedViaKnownChain:
          extractedResult.handoffResolvedViaKnownChain,
        adzunaFallbackUrlAfter: extractedResult.urlAfter ?? null,
        currentUrl: activePage.url(),
      });

      return extractedResult;
    }
  }

  const target = await findAdzunaFallbackLinkTarget(activePage);

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK_LOCATOR]", {
    adzunaFallbackElementFound: Boolean(target),
    adzunaFallbackLocatorStrategy: target?.locatorStrategy ?? null,
    adzunaFallbackSelector: target?.selector ?? null,
    adzunaFallbackText: target?.text ?? null,
    adzunaFallbackHref: target?.href ?? null,
    adzunaFallbackHost: parseHostname(target?.href) || null,
    currentUrl: activePage.url(),
  });

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector: target?.selector ?? "a[href]:has-text(view ad here)",
    text: target?.text ?? "",
    matchedText: target?.matchedText ?? "view ad here",
    locatorStrategy:
      target?.locatorStrategy ?? "adzuna_fallback_locator_search",
    candidateFound: Boolean(target),
    dismissesBlocker: false,
    success: Boolean(target),
    urlBefore: fromUrl,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!target) {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: false,
      clicked: false,
      locatorStrategy: undefined,
      elementFound: false,
      clickSucceeded: false,
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectUrl,
      extractedRedirectSource,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
      urlAfter: activePage.url(),
      tokenizedInterstitialDetected,
      tokenizedParamsPresent,
      downstreamCandidates,
      scriptRedirectCandidates,
      ...getKnownChainState(),
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: result.found,
      adzunaFallbackLinkClicked: result.clicked,
      adzunaFallbackLinkText: null,
      adzunaFallbackLocatorStrategy: null,
      adzunaFallbackElementFound: result.elementFound,
      adzunaFallbackClickSucceeded: result.clickSucceeded,
      adzunaFallbackHref: null,
      adzunaFallbackHost: null,
      adzunaFallbackDirectNavAttempted: result.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
      adzunaExtractedRedirectUrl: result.extractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        result.extractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        result.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.extractedRedirectNavSucceeded,
      adzunaTokenizedInterstitialDetected:
        result.tokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent: result.tokenizedParamsPresent,
      adzunaDownstreamCandidates: result.downstreamCandidates,
      adzunaScriptRedirectCandidates:
        result.scriptRedirectCandidates,
      adzunaInterstitialRecognized:
        result.adzunaInterstitialRecognized,
      appcastHopDetected: result.appcastHopDetected,
      diceDestinationDetected: result.diceDestinationDetected,
      handoffResolvedViaKnownChain:
        result.handoffResolvedViaKnownChain,
      adzunaFallbackUrlAfter: result.urlAfter ?? null,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const popupPromise = activePage
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK] attempting", {
    selector: target.selector,
    text: target.text,
    locatorStrategy: target.locatorStrategy,
    adzunaFallbackHref: target.href ?? null,
    adzunaFallbackHost: parseHostname(target.href) || null,
    currentUrl: fromUrl,
  });

  try {
    await target.locator
      .click({ timeout: 6_000 })
      .catch(() => target.locator.click({ force: true, timeout: 6_000 }));
  } catch {
    if (target.href) {
      const directNavResult = await navigateAdzunaFallbackHrefDirectly({
        page: activePage,
        context: args.context,
        href: target.href,
        onPageReady: args.onPageReady,
      });

      activePage = directNavResult.page;
      directNavAttempted = directNavResult.attempted;
      directNavSucceeded = directNavResult.succeeded;

      for (const url of directNavResult.urlsVisited) {
        if (!urlsVisited.includes(url)) {
          urlsVisited.push(url);
        }
      }
    }

    attempts.push({
      phase: "handoff",
      action: "click",
      selector: target.selector,
      text: target.text,
      matchedText: target.matchedText,
      locatorStrategy: target.locatorStrategy,
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    const failedResult = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      found: true,
      clicked: directNavSucceeded,
      text: target.text,
      selector: target.selector,
      locatorStrategy: target.locatorStrategy,
      elementFound: true,
      clickSucceeded: directNavSucceeded,
      href: target.href,
      host: parseHostname(target.href),
      directNavAttempted,
      directNavSucceeded,
      extractedRedirectUrl,
      extractedRedirectSource,
      extractedRedirectHtmlRead,
      extractedRedirectFailureReason,
      extractedRedirectNavAttempted,
      extractedRedirectNavSucceeded,
      urlAfter: activePage.url(),
      tokenizedInterstitialDetected,
      tokenizedParamsPresent,
      downstreamCandidates,
      scriptRedirectCandidates,
      ...getKnownChainState(),
    } satisfies AdzunaFallbackLinkResult;

    console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
      adzunaFallbackLinkFound: failedResult.found,
      adzunaFallbackLinkClicked: failedResult.clicked,
      adzunaFallbackLinkText: failedResult.text ?? null,
      adzunaFallbackLocatorStrategy: failedResult.locatorStrategy ?? null,
      adzunaFallbackElementFound: failedResult.elementFound,
      adzunaFallbackClickSucceeded: failedResult.clickSucceeded,
      adzunaFallbackHref: failedResult.href ?? null,
      adzunaFallbackHost: failedResult.host ?? null,
      adzunaFallbackDirectNavAttempted: failedResult.directNavAttempted,
      adzunaFallbackDirectNavSucceeded: failedResult.directNavSucceeded,
      adzunaExtractedRedirectUrl:
        failedResult.extractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        failedResult.extractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        failedResult.extractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        failedResult.extractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        failedResult.extractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        failedResult.extractedRedirectNavSucceeded,
      adzunaTokenizedInterstitialDetected:
        failedResult.tokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent:
        failedResult.tokenizedParamsPresent,
      adzunaDownstreamCandidates:
        failedResult.downstreamCandidates,
      adzunaScriptRedirectCandidates:
        failedResult.scriptRedirectCandidates,
      adzunaInterstitialRecognized:
        failedResult.adzunaInterstitialRecognized,
      appcastHopDetected: failedResult.appcastHopDetected,
      diceDestinationDetected: failedResult.diceDestinationDetected,
      handoffResolvedViaKnownChain:
        failedResult.handoffResolvedViaKnownChain,
      adzunaFallbackUrlAfter: failedResult.urlAfter ?? null,
      currentUrl: activePage.url(),
    });

    return failedResult;
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = activePage;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== activePage) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  clicks.push({
    hop: 1,
    fromUrl,
    toUrl: nextPage.url(),
    selector: target.selector,
    text: target.text,
    navigation,
  } satisfies ApplySessionClickRecord);

  attempts.push({
    phase: "handoff",
    action: "click",
    selector: target.selector,
    text: target.text,
    matchedText: target.matchedText,
    locatorStrategy: target.locatorStrategy,
    candidateFound: true,
    dismissesBlocker: false,
    success: true,
    urlBefore: fromUrl,
    urlAfter: nextPage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  const progress = await waitForPostClickProgress({
    page: nextPage,
    context: args.context,
    urlBefore: fromUrl,
    onPageReady: args.onPageReady,
  });

  activePage = progress.page;
  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  const chainedProgress = await waitForTrackedHandoffRedirects({
    page: activePage,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  activePage = chainedProgress.page;
  for (const url of chainedProgress.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  let fallbackProgressed =
    progress.urlChanged ||
    (!isAdzunaLandRedirectPage(activePage.url()) &&
      !isAppcastTrackingPage(activePage.url())) ||
    (await hasReachedPostHandoffDestination(activePage));

  if (
    !fallbackProgressed &&
    target.href &&
    isAdzunaLandRedirectPage(activePage.url())
  ) {
    const directNavResult = await navigateAdzunaFallbackHrefDirectly({
      page: activePage,
      context: args.context,
      href: target.href,
      onPageReady: args.onPageReady,
    });

    activePage = directNavResult.page;
    directNavAttempted = directNavResult.attempted;
    directNavSucceeded = directNavResult.succeeded;

    for (const url of directNavResult.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }

    fallbackProgressed =
      fallbackProgressed ||
      directNavSucceeded ||
      (await hasReachedPostHandoffDestination(activePage));
  }

  const result = {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    found: true,
    clicked: fallbackProgressed,
    text: target.text,
    selector: target.selector,
    locatorStrategy: target.locatorStrategy,
    elementFound: true,
    clickSucceeded: fallbackProgressed,
    href: target.href,
    host: parseHostname(target.href),
    directNavAttempted,
    directNavSucceeded,
    extractedRedirectUrl,
    extractedRedirectSource,
    extractedRedirectHtmlRead,
    extractedRedirectFailureReason,
    extractedRedirectNavAttempted,
    extractedRedirectNavSucceeded,
    urlAfter: activePage.url(),
    tokenizedInterstitialDetected,
    tokenizedParamsPresent,
    downstreamCandidates,
    scriptRedirectCandidates,
    ...getKnownChainState(),
  } satisfies AdzunaFallbackLinkResult;

  console.log("[AUTO_APPLY_ADZUNA_FALLBACK]", {
    adzunaFallbackLinkFound: result.found,
    adzunaFallbackLinkClicked: result.clicked,
    adzunaFallbackLinkText: result.text ?? null,
    adzunaFallbackLocatorStrategy: result.locatorStrategy ?? null,
    adzunaFallbackElementFound: result.elementFound,
    adzunaFallbackClickSucceeded: result.clickSucceeded,
    adzunaFallbackHref: result.href ?? null,
    adzunaFallbackHost: result.host ?? null,
    adzunaFallbackDirectNavAttempted: result.directNavAttempted,
    adzunaFallbackDirectNavSucceeded: result.directNavSucceeded,
    adzunaExtractedRedirectUrl: result.extractedRedirectUrl ?? null,
    adzunaExtractedRedirectSource:
      result.extractedRedirectSource ?? null,
    adzunaExtractedRedirectHtmlRead:
      result.extractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      result.extractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      result.extractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded:
      result.extractedRedirectNavSucceeded,
    adzunaTokenizedInterstitialDetected:
      result.tokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent: result.tokenizedParamsPresent,
    adzunaDownstreamCandidates: result.downstreamCandidates,
    adzunaScriptRedirectCandidates:
      result.scriptRedirectCandidates,
    adzunaInterstitialRecognized:
      result.adzunaInterstitialRecognized,
    appcastHopDetected: result.appcastHopDetected,
    diceDestinationDetected: result.diceDestinationDetected,
    handoffResolvedViaKnownChain:
      result.handoffResolvedViaKnownChain,
    adzunaFallbackUrlAfter: result.urlAfter ?? null,
    currentUrl: activePage.url(),
  });

  return result;
}

function normalizeResolverPathname(pathname: string) {
  const normalized = pathname.trim().toLowerCase().replace(/\/{2,}/g, "/");
  if (!normalized) return "/";
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function looksLikeLowValueResolverText(value: string) {
  const normalized = value.toLowerCase();
  return LOW_VALUE_RESOLVER_TEXT_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function looksLikeJobSpecificDestination(pathname: string) {
  const normalized = normalizeResolverPathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  if (
    ["/apply", "/application"].includes(normalized) ||
    normalized.includes("/apply/") ||
    normalized.includes("/application/")
  ) {
    return true;
  }

  if (
    normalized.includes("/job/") ||
    normalized.includes("/vacancy/") ||
    normalized.includes("/posting/")
  ) {
    return true;
  }

  if (segments.some((segment) => /^\d{5,}$/.test(segment))) {
    return true;
  }

  if (normalized.includes("/jobs/")) {
    const lastSegment = segments.at(-1) ?? "";
    return !LOW_VALUE_AGGREGATOR_SEGMENTS.has(lastSegment);
  }

  return false;
}

function isLowValueAggregatorLink(args: {
  currentUrl: string;
  currentHostname: string;
  href: string;
  hostname: string;
  pathname: string;
  search: string;
  text: string;
  inHeaderOrFooter: boolean;
  inMainContent: boolean;
}) {
  const currentDomain = detectApplyDomainFromHostname(args.currentHostname);
  const candidateDomain = detectApplyDomainFromHostname(args.hostname);
  const sameAggregatorFamily =
    currentDomain !== "generic" && currentDomain === candidateDomain;
  const normalizedPath = normalizeResolverPathname(args.pathname);
  const lowerHref = args.href.toLowerCase();
  const lowerText = args.text.toLowerCase();
  const lowerSearch = args.search.toLowerCase();
  const segments = normalizedPath.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";

  if (!args.href.startsWith("http://") && !args.href.startsWith("https://")) {
    return "unsupported_link_scheme";
  }

  if (args.href === args.currentUrl) {
    return "current_page";
  }

  if (
    looksLikeLowValueResolverText(`${lowerHref} ${lowerText}`) ||
    lowerHref.includes("job-alert") ||
    lowerHref.includes("create-alert") ||
    lowerHref.includes("save-job") ||
    lowerHref.includes("share")
  ) {
    return "alert_share_or_save_link";
  }

  const blockedAdzunaAuthReason = getBlockedAdzunaAuthContinuationReason({
    currentUrl: args.currentUrl,
    href: args.href,
    text: args.text,
  });
  if (blockedAdzunaAuthReason) {
    return blockedAdzunaAuthReason;
  }

  if (sameAggregatorFamily && args.inHeaderOrFooter && !args.inMainContent) {
    return "aggregator_navigation_link";
  }

  if (sameAggregatorFamily && LOW_VALUE_AGGREGATOR_PATHS.has(normalizedPath)) {
    return "generic_aggregator_page";
  }

  if (
    sameAggregatorFamily &&
    segments.length <= 2 &&
    segments.some((segment) => LOW_VALUE_AGGREGATOR_SEGMENTS.has(segment))
  ) {
    return "generic_aggregator_listing_path";
  }

  if (
    sameAggregatorFamily &&
    (lowerSearch.includes("q=") ||
      lowerSearch.includes("search=") ||
      lowerSearch.includes("keyword=") ||
      lowerSearch.includes("page="))
  ) {
    return "aggregator_search_results";
  }

  if (
    sameAggregatorFamily &&
    (lastSegment === "index" || lastSegment === "home")
  ) {
    return "aggregator_home_or_index";
  }

  if (
    sameAggregatorFamily &&
    !(
      lowerHref.includes("redirect") ||
      lowerHref.includes("outbound") ||
      lowerHref.includes("external") ||
      lowerSearch.includes("url=")
    ) &&
    !looksLikeJobSpecificDestination(normalizedPath) &&
    !lowerHref.includes("apply") &&
    !lowerHref.includes("application")
  ) {
    return "same_aggregator_non_job_destination";
  }

  return null;
}

function rankApplySourceCandidate(args: {
  currentHostname: string;
  href: string;
  hostname: string;
  pathname: string;
  text: string;
  inMainContent: boolean;
  inHeaderOrFooter: boolean;
  visible: boolean;
}) {
  const currentDomain = detectApplyDomainFromHostname(args.currentHostname);
  const candidateDomain = detectApplyDomainFromHostname(args.hostname);
  const sameAggregatorFamily =
    currentDomain !== "generic" && currentDomain === candidateDomain;
  const signalText = `${args.href} ${args.text}`.toLowerCase();
  const normalizedPath = normalizeResolverPathname(args.pathname);
  const reasons: string[] = [];
  let score = 0;

  if (args.visible) {
    score += 20;
    reasons.push("visible");
  }

  if (args.inMainContent) {
    score += 70;
    reasons.push("main_content");
  }

  if (args.inHeaderOrFooter) {
    score -= 80;
    reasons.push("header_or_footer");
  }

  if (!sameAggregatorFamily) {
    score += 220;
    reasons.push("leaves_aggregator_family");
  } else {
    score -= 120;
    reasons.push("same_aggregator_family");
  }

  if (
    signalText.includes("redirect") ||
    signalText.includes("outbound") ||
    signalText.includes("external") ||
    signalText.includes("url=")
  ) {
    score += 120;
    reasons.push("redirect_handoff");
  }

  if (hostnameMatches(args.hostname, REAL_APPLY_HOST_PATTERNS)) {
    score += 160;
    reasons.push("known_apply_host");
  }

  for (const keyword of APPLY_SOURCE_RESOLVER_KEYWORDS) {
    if (!signalText.includes(keyword)) continue;

    if (keyword === "apply" || keyword === "apply now" || keyword === "application") {
      score += 120;
      reasons.push(`keyword:${keyword}`);
    } else if (keyword === "external") {
      score += 60;
      reasons.push(`keyword:${keyword}`);
    } else {
      score += 30;
      reasons.push(`keyword:${keyword}`);
    }
  }

  if (
    normalizedPath.includes("/apply") ||
    normalizedPath.includes("/application") ||
    normalizedPath.includes("apply-now")
  ) {
    score += 160;
    reasons.push("apply_path");
  }

  if (looksLikeJobSpecificDestination(normalizedPath)) {
    score += 90;
    reasons.push("job_specific_path");
  }

  if (signalText.includes("company site")) {
    score += 80;
    reasons.push("company_site_text");
  }

  return {
    href: args.href,
    hostname: args.hostname,
    text: args.text,
    score,
    reasons,
  } satisfies ApplySourceCandidate;
}

function buildEntryCtaConfigs(domain: KnownApplyDomain): EntryCtaConfig[] {
  const generic: EntryCtaConfig[] = [
    { text: "Continue to application", match: "exact", preferredRole: "button" },
    { text: "Apply now", match: "exact", preferredRole: "button" },
    { text: "Apply", match: "exact", preferredRole: "button" },
    { text: "Continue", match: "exact", preferredRole: "button" },
    { text: "Go to job", match: "exact", preferredRole: "link" },
    { text: "View job", match: "exact", preferredRole: "link" },
    { text: "Skip", match: "exact", dismissesBlocker: true },
    { text: "Dismiss", match: "exact", dismissesBlocker: true },
    { text: "Close", match: "exact", dismissesBlocker: true },
  ];

  if (domain === "adzuna") {
    // Adzuna commonly gates the outbound posting behind dismiss / continue prompts.
    return [
      {
        text: "No thanks, take me to the job",
        match: "exact",
        dismissesBlocker: true,
      },
      { text: "No, thanks", match: "exact", dismissesBlocker: true },
      { text: "No thanks", match: "exact", dismissesBlocker: true },
      { text: "take me to the job", match: "contains", dismissesBlocker: true },
      ...generic,
    ];
  }

  if (domain === "dice") {
    // Dice typically exposes the real application handoff via a visible Apply Now CTA.
    return [
      { text: "Apply Now", match: "exact", preferredRole: "button" },
      { text: "Apply now", match: "exact", preferredRole: "button" },
      ...generic,
    ];
  }

  if (domain === "greenhouse") {
    return [
      {
        text: "Apply for this job",
        match: "exact",
        preferredRole: "link",
      },
      {
        text: "Apply for this job",
        match: "exact",
        preferredRole: "button",
      },
      { text: "Apply now", match: "exact", preferredRole: "link" },
      { text: "Apply now", match: "exact", preferredRole: "button" },
      { text: "Apply", match: "exact", preferredRole: "link" },
      { text: "Apply", match: "exact", preferredRole: "button" },
      ...generic,
    ];
  }

  return generic;
}

function buildHandoffCtaConfigs(): EntryCtaConfig[] {
  return [
    { text: "View Ad", match: "exact", preferredRole: "link" },
    { text: "View Job", match: "exact", preferredRole: "link" },
    {
      text: "Apply for this job",
      match: "exact",
      preferredRole: "button",
    },
    { text: "Apply", match: "exact", preferredRole: "button" },
    { text: "Apply", match: "exact", preferredRole: "link" },
    { text: "Apply now", match: "exact", preferredRole: "button" },
    { text: "Apply now", match: "exact", preferredRole: "link" },
    { text: "Continue to application", match: "exact", preferredRole: "button" },
    { text: "Continue to application", match: "exact", preferredRole: "link" },
    { text: "Visit employer site", match: "exact", preferredRole: "link" },
    { text: "Go to company site", match: "exact", preferredRole: "link" },
    { text: "Go to application", match: "exact", preferredRole: "button" },
    { text: "Open job site", match: "exact", preferredRole: "link" },
    { text: "Continue", match: "exact", preferredRole: "button" },
    { text: "Continue", match: "exact", preferredRole: "link" },
    { text: "Proceed", match: "exact", preferredRole: "button" },
    { text: "Next", match: "exact", preferredRole: "button" },
  ];
}

function buildCookieCtaConfigs(): EntryCtaConfig[] {
  return [
    { text: "Accept all", match: "exact", preferredRole: "button" },
    { text: "Allow all", match: "exact", preferredRole: "button" },
    { text: "Accept", match: "exact", preferredRole: "button" },
    { text: "I agree", match: "exact", preferredRole: "button" },
    { text: "Got it", match: "exact", preferredRole: "button" },
    { text: "OK", match: "exact", preferredRole: "button" },
  ];
}

async function scanCookiePromptConfigs(
  page: Page,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildCookieCtaConfigs().map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        function getConsentContext(element: Element) {
          const container =
            element.closest(
              [
                '[id*="cookie"]',
                '[class*="cookie"]',
                '[data-testid*="cookie"]',
                '[data-testid*="consent"]',
                '[id*="consent"]',
                '[class*="consent"]',
                '[aria-label*="cookie"]',
                '[aria-label*="consent"]',
                "footer",
                '[role="dialog"]',
                '[aria-modal="true"]',
              ].join(","),
            ) ?? element.parentElement;

          const text = [
            container?.textContent ?? "",
            container?.getAttribute?.("aria-label") ?? "",
            container?.getAttribute?.("data-testid") ?? "",
            container?.getAttribute?.("id") ?? "",
            container?.getAttribute?.("class") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          const hasConsentContext = args.contextPatterns.some((pattern) =>
            text.includes(pattern),
          );

          return {
            text,
            hasConsentContext,
          };
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            const context = getConsentContext(element);
            if (!context.hasConsentContext) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "cookie",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: true,
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        contextPatterns: [...COOKIE_CONTEXT_PATTERNS],
        ignorePatterns: [...COOKIE_CTA_IGNORE_PATTERNS],
      },
    )
    .then(
      (attempts) => attempts as ApplySessionCtaAttemptRecord[],
    )
    .catch(
      (): ApplySessionCtaAttemptRecord[] => [],
    );
}

async function findCookiePromptCandidate(
  page: Page,
): Promise<EntryCtaCandidate | null> {
  const configs = buildCookieCtaConfigs().map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        function getConsentContext(element: Element) {
          const container =
            element.closest(
              [
                '[id*="cookie"]',
                '[class*="cookie"]',
                '[data-testid*="cookie"]',
                '[data-testid*="consent"]',
                '[id*="consent"]',
                '[class*="consent"]',
                '[aria-label*="cookie"]',
                '[aria-label*="consent"]',
                "footer",
                '[role="dialog"]',
                '[aria-modal="true"]',
              ].join(","),
            ) ?? element.parentElement;

          const text = [
            container?.textContent ?? "",
            container?.getAttribute?.("aria-label") ?? "",
            container?.getAttribute?.("data-testid") ?? "",
            container?.getAttribute?.("id") ?? "",
            container?.getAttribute?.("class") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          return {
            text,
            hasConsentContext: args.contextPatterns.some((pattern) =>
              text.includes(pattern),
            ),
            inBlocker: args.blockerSelectors.some((selector) =>
              element.closest(selector),
            ),
          };
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        );

        const candidates = nodes
          .filter(isVisible)
          .map((element) => {
            const rawText = getText(element).replace(/\s+/g, " ").trim();
            const lowerText = rawText.toLowerCase();
            if (!lowerText) return null;
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const context = getConsentContext(element);
            if (!context.hasConsentContext) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 30;
              if (config.match === "exact") score += 140;
              if (semanticRole === config.preferredRole) score += 70;
              if (semanticRole === "button") score += 20;
              if (context.inBlocker) score += 60;
              if (context.text.includes("cookie")) score += 90;
              if (context.text.includes("consent")) score += 70;
              if (context.text.includes("privacy")) score += 40;

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: true,
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        configs,
        blockerSelectors: [...BLOCKER_SURFACE_SELECTORS],
        contextPatterns: [...COOKIE_CONTEXT_PATTERNS],
        ignorePatterns: [...COOKIE_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => null);
}

async function clickCookiePromptCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_COOKIE] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
  });

  try {
    await locator
      .click({ timeout: 5_000 })
      .catch(() => locator.click({ force: true, timeout: 5_000 }));
  } catch {
    return {
      page: args.page,
      click: null,
      attempt: {
        phase: "cookie",
        action: "click",
        selector: args.candidate.selector,
        text: args.candidate.text,
        matchedText: args.candidate.matchedText,
        locatorStrategy: "visible_text_ranked",
        candidateFound: true,
        dismissesBlocker: true,
        success: false,
        urlBefore: fromUrl,
        urlAfter: args.page.url(),
      } satisfies ApplySessionCtaAttemptRecord,
    };
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = args.page;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== args.page) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  return {
    page: nextPage,
    click: {
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    attempt: {
      phase: "cookie",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: true,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function waitForPostClickProgress(args: {
  page: Page;
  context: BrowserContext;
  urlBefore: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<PostClickProgressResult> {
  const page = args.page;
  const titleBefore = await page.title().catch(() => "");

  const settledSignal = await Promise.race([
    page
      .waitForURL((url) => url.toString() !== args.urlBefore, {
        timeout: 5_000,
      })
      .then(() => "url_changed")
      .catch(() => null),
    page
      .waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 5_000,
      })
      .then(() => "navigation")
      .catch(() => null),
    page
      .waitForLoadState("networkidle", {
        timeout: 4_000,
      })
      .then(() => "networkidle")
      .catch(() => null),
    page
      .waitForTimeout(APPLY_SETTLE_DELAY_MS + 800)
      .then(() => "timeout"),
  ]);

  await waitForDomAndSettle(page);
  await args.onPageReady?.(page, args.context);

  const urlAfter = page.url();
  const titleAfter = (await page.title().catch(() => "")).trim();
  const urlChanged = urlAfter !== args.urlBefore;
  const progressDetected =
    urlChanged ||
    titleBefore.trim() !== titleAfter ||
    (settledSignal !== null && settledSignal !== "timeout");

  const result = {
    page,
    attempted: true,
    urlBefore: args.urlBefore,
    urlAfter,
    titleAfter: titleAfter || undefined,
    urlChanged,
    progressDetected,
  } satisfies PostClickProgressResult;

  console.log("[AUTO_APPLY_POST_COOKIE]", {
    postCookieUrlBefore: result.urlBefore,
    postCookieUrlAfter: result.urlAfter,
    postCookieUrlChanged: result.urlChanged,
    postCookieProgressDetected: result.progressDetected,
    postCookieTitleAfter: result.titleAfter ?? null,
    currentUrl: page.url(),
  });

  return result;
}

async function dismissCookieConsentIfPresent(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<CookieConsentPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let detected = false;
  let clicked = false;
  let clickedText: string | undefined;
  let clickedSelector: string | undefined;
  let postCookieWaitAttempted = false;
  let postCookieUrlBefore: string | undefined;
  let postCookieUrlAfter: string | undefined;
  let postCookieUrlChanged = false;
  let postCookieProgressDetected = false;
  let postCookieTitleAfter: string | undefined;

  for (let step = 1; step <= COOKIE_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanCookiePromptConfigs(activePage);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        detected = true;
      }
    }

    const candidate = await findCookiePromptCandidate(activePage);
    if (!candidate) {
      break;
    }
    detected = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickCookiePromptCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;
    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (result.click) {
      clicks.push(result.click);
      clicked = true;
      clickedText = candidate.text;
      clickedSelector = candidate.selector;

      const progress = await waitForPostClickProgress({
        page: activePage,
        context: args.context,
        urlBefore: result.attempt.urlAfter ?? result.attempt.urlBefore,
        onPageReady: args.onPageReady,
      });

      activePage = progress.page;
      postCookieWaitAttempted = progress.attempted;
      postCookieUrlBefore = progress.urlBefore;
      postCookieUrlAfter = progress.urlAfter;
      postCookieUrlChanged = progress.urlChanged;
      postCookieProgressDetected = progress.progressDetected;
      postCookieTitleAfter = progress.titleAfter;

      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
    }
  }

  console.log("[AUTO_APPLY_COOKIE]", {
    currentUrl: activePage.url(),
    cookiePromptDetected: detected,
    cookiePromptClicked: clicked,
    cookiePromptClickedText: clickedText ?? null,
    cookiePromptSelector: clickedSelector ?? null,
    cookiePromptAttempts: attempts,
    postCookieWaitAttempted,
    postCookieUrlBefore: postCookieUrlBefore ?? null,
    postCookieUrlAfter: postCookieUrlAfter ?? null,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter: postCookieTitleAfter ?? null,
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    detected,
    clicked,
    clickedText,
    clickedSelector,
    postCookieWaitAttempted,
    postCookieUrlBefore,
    postCookieUrlAfter,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter,
  };
}

async function inspectAdzunaHandoffOverlay(args: {
  page: Page;
  selector?: string;
}): Promise<AdzunaOverlayInspectionResult> {
  const overlaySelectorsTried = [...BLOCKER_SURFACE_SELECTORS];

  const inspection = await args.page
    .evaluate(
      ({ selector, blockerSelectors }) => {
        function isVisible(element: Element | null) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        }

        function describeOverlay(element: Element | null) {
          if (!element) return undefined;
          return [
            element.getAttribute("aria-label") ?? "",
            element.getAttribute("data-testid") ?? "",
            element.getAttribute("id") ?? "",
            element.getAttribute("class") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160);
        }

        const overlaySelector = blockerSelectors.join(",");
        const overlays = Array.from(document.querySelectorAll(overlaySelector))
          .filter(isVisible)
          .slice(0, 5);
        const target = selector
          ? (document.querySelector(selector) as HTMLElement | null)
          : null;

        if (!target || !isVisible(target)) {
          const overlay = overlays[0] ?? null;
          return {
            overlayDetected: Boolean(overlay),
            overlayType: describeOverlay(overlay),
          };
        }

        const rect = target.getBoundingClientRect();
        const centerX = Math.min(
          Math.max(rect.left + rect.width / 2, 0),
          window.innerWidth - 1,
        );
        const centerY = Math.min(
          Math.max(rect.top + rect.height / 2, 0),
          window.innerHeight - 1,
        );
        const topElement = document.elementFromPoint(centerX, centerY);
        const overlayElement =
          topElement?.closest(overlaySelector) ??
          overlays.find((overlay) => {
            const overlayRect = overlay.getBoundingClientRect();
            return (
              centerX >= overlayRect.left &&
              centerX <= overlayRect.right &&
              centerY >= overlayRect.top &&
              centerY <= overlayRect.bottom
            );
          }) ??
          null;

        const overlayDetected = Boolean(
          overlayElement &&
            overlayElement !== target &&
            !overlayElement.contains(target) &&
            !target.contains(overlayElement),
        );

        return {
          overlayDetected,
          overlayType: describeOverlay(overlayElement),
        };
      },
      {
        selector: args.selector,
        blockerSelectors: overlaySelectorsTried,
      },
    )
    .catch(
      () =>
        ({
          overlayDetected: false,
          overlayType: undefined,
        }) as { overlayDetected: boolean; overlayType?: string },
    );

  return {
    overlayDetected: inspection.overlayDetected,
    overlayDismissed: false,
    overlayType: inspection.overlayType,
    overlaySelectorsTried,
  };
}

async function runAdzunaDetailsApplyPhase(args: {
  page: Page;
  context: BrowserContext;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<AdzunaDetailsApplyPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const applyClicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  let applyClicked = false;
  let applyClickedText: string | undefined;
  let applyClickedSelector: string | undefined;
  let applyCaptureDetected = false;
  let applyCaptureSkipClicked = false;
  let applyCaptureSkipText: string | undefined = undefined;
  let applyCaptureSkipSelector: string | undefined = undefined;
  let postApplyProgressionAttempted = false;
  let postApplyProgressionSucceeded = false;
  let postApplyUrlAfter: string | undefined;
  let postApplyPopupDetected = false;
  let postApplyNewPageDetected = false;
  let postApplyFallbackAttempted = false;
  let applyHrefExtracted: string | undefined = undefined;
  let applyNavigationForced = false;
  let applyNavigationUrl: string | undefined;
  let latestActionText: string | undefined;
  let latestActionSelector: string | undefined;

  if (!isAdzunaDetailsPage(activePage.url())) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: false,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      applyHrefExtracted,
      applyNavigationForced,
      applyNavigationUrl,
      latestActionText,
      latestActionSelector,
    };
  }

  const applySelector = 'a[data-js="apply"]';
  const applyLocator = await findFirstVisibleEnabledLocator(
    activePage.locator(applySelector),
  );

  attempts.push({
    phase: "entry",
    action: "scan",
    selector: applySelector,
    text: applySelector,
    matchedText: "Apply for this job",
    locatorStrategy: "css_data_js",
    candidateFound: Boolean(applyLocator),
    dismissesBlocker: false,
    success: Boolean(applyLocator),
    urlBefore: activePage.url(),
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!applyLocator) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: false,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      applyHrefExtracted,
      applyNavigationForced,
      applyNavigationUrl,
      latestActionText,
      latestActionSelector,
    };
  }

  const fromUrl = activePage.url();
  const applyText =
    (await extractLocatorText(applyLocator).catch(() => "")) ||
    "Apply for this job";
  const applyHref = resolveAbsoluteNavigationTarget(
    await applyLocator.getAttribute("href").catch(() => null),
    fromUrl,
  );
  applyHrefExtracted = applyHref ?? undefined;
  const applyCaptureFormSelector = 'div[data-js="apply-capture-form"]';
  const applyCaptureSkipSelectorRaw = 'a[data-js="apply-capture-skip"]';
  const applyCaptureFormLocator = activePage.locator(applyCaptureFormSelector);
  const applyCaptureSkipLocator = activePage.locator(
    applyCaptureSkipSelectorRaw,
  );

  console.log("[AUTO_APPLY_ADZUNA_DETAILS_APPLY] attempting", {
    fromUrl,
    selector: applySelector,
    text: applyText,
    href: applyHref ?? null,
  });

  const applyPopupPromise = activePage
    .waitForEvent("popup", { timeout: 7_500 })
    .catch(() => null);
  const applyContextPagePromise = args.context
    .waitForEvent("page", { timeout: 7_500 })
    .catch(() => null);
  const applyNavigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 7_500 })
    .catch(() => null);
  let clickAttemptSucceeded = false;

  try {
    await applyLocator
      .click({ timeout: 6_000 })
      .catch(() => applyLocator.click({ force: true, timeout: 6_000 }));
    clickAttemptSucceeded = true;
  } catch {
    attempts.push({
      phase: "entry",
      action: "click",
      selector: applySelector,
      text: applyText,
      matchedText: "Apply for this job",
      locatorStrategy: "css_data_js",
      candidateFound: true,
      dismissesBlocker: false,
      success: false,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);
  }

  postApplyProgressionAttempted = true;
  if (clickAttemptSucceeded) {
    await Promise.race([
      applyNavigationPromise,
      activePage
        .waitForURL((url) => url.toString() !== fromUrl, {
          timeout: 7_500,
        })
        .catch(() => null),
      applyCaptureSkipLocator
        .first()
        .waitFor({ state: "visible", timeout: 6_500 })
        .catch(() => null),
      applyCaptureFormLocator
        .first()
        .waitFor({ state: "visible", timeout: 6_500 })
        .catch(() => null),
      activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 2_000),
    ]);
    const [popupPage, contextPage] = await Promise.all([
      applyPopupPromise,
      applyContextPagePromise,
    ]);

    if (popupPage) {
      activePage = popupPage;
      postApplyNewPageDetected = true;
    } else if (contextPage && contextPage !== activePage) {
      activePage = contextPage;
      postApplyNewPageDetected = true;
    }

    await waitForDomAndSettle(activePage);
    await args.onPageReady?.(activePage, args.context);
  }

  if (
    activePage.url() === fromUrl &&
    applyHref &&
    applyHref !== fromUrl
  ) {
    applyNavigationForced = true;
    applyNavigationUrl = applyHref;

    console.log("[AUTO_APPLY_FORCE_NAV]", {
      fromUrl,
      currentUrl: activePage.url(),
      applyHrefExtracted: applyHref ?? null,
      applyNavigationForced,
      applyNavigationUrl: applyNavigationUrl ?? null,
    });

    try {
      await activePage.goto(applyHref, { waitUntil: "domcontentloaded" });
      await waitForDomAndSettle(activePage);
      await args.onPageReady?.(activePage, args.context);
    } catch {
      // Leave the existing fallback path to handle any remaining recovery.
    }

    attempts.push({
      phase: "entry",
      action: "click",
      selector: `href:${applyHref}`,
      text: applyText,
      matchedText: "Apply for this job",
      locatorStrategy: "forced_apply_href_navigation",
      candidateFound: true,
      dismissesBlocker: false,
      success: activePage.url() !== fromUrl,
      urlBefore: fromUrl,
      urlAfter: activePage.url(),
      applyCtaFoundAfter: activePage.url() !== fromUrl,
    } satisfies ApplySessionCtaAttemptRecord);

    console.log("[AUTO_APPLY_FORCE_NAV]", {
      fromUrl,
      currentUrl: activePage.url(),
      applyHrefExtracted: applyHref ?? null,
      applyNavigationForced,
      applyNavigationUrl: applyNavigationUrl ?? null,
      success: activePage.url() !== fromUrl,
    });
  }

  const applyToUrl = activePage.url();
  postApplyUrlAfter = applyToUrl;
  applyClicked = clickAttemptSucceeded || applyNavigationForced;

  if (applyClicked) {
    const applyClick = {
      hop: 1,
      fromUrl,
      toUrl: applyToUrl,
      selector: applySelector,
      text: applyText,
      navigation: "same-tab",
    } satisfies ApplySessionClickRecord;

    clicks.push(applyClick);
    applyClicks.push(applyClick);
    applyClickedText = applyText;
    applyClickedSelector = applySelector;
    latestActionText = applyText;
    latestActionSelector = applySelector;

    attempts.push({
      phase: "entry",
      action: "click",
      selector: applySelector,
      text: applyText,
      matchedText: "Apply for this job",
      locatorStrategy: "css_data_js",
      candidateFound: true,
      dismissesBlocker: false,
      success: true,
      urlBefore: fromUrl,
      urlAfter: applyToUrl,
      applyCtaFoundAfter: true,
    } satisfies ApplySessionCtaAttemptRecord);
  }

  if (!urlsVisited.includes(applyToUrl)) {
    urlsVisited.push(applyToUrl);
  }

  applyCaptureDetected =
    (await isVisibleLocator(applyCaptureFormLocator)) ||
    (await isVisibleLocator(applyCaptureSkipLocator));
  postApplyPopupDetected = applyCaptureDetected;
  postApplyProgressionSucceeded =
    postApplyNewPageDetected ||
    applyCaptureDetected ||
    isAdzunaLandRedirectPage(applyToUrl) ||
    applyToUrl !== fromUrl;

  console.log("[AUTO_APPLY_ADZUNA_POST_APPLY]", {
    fromUrl,
    currentUrl: applyToUrl,
    selector: applySelector,
    text: applyText,
    href: applyHref ?? null,
    adzunaPostApplyProgressionAttempted: postApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter: postApplyUrlAfter ?? null,
    adzunaPostApplyPopupDetected: postApplyPopupDetected,
    adzunaPostApplyNewPageDetected: postApplyNewPageDetected,
    applyHrefExtracted: applyHrefExtracted ?? null,
    applyNavigationForced,
    applyNavigationUrl: applyNavigationUrl ?? null,
    handoffPageDetected: isAdzunaLandRedirectPage(applyToUrl),
  });

  if (!postApplyProgressionSucceeded) {
    postApplyFallbackAttempted = true;
    console.log("[AUTO_APPLY_ADZUNA_POST_APPLY_FALLBACK] attempting", {
      currentUrl: activePage.url(),
      href: applyHref ?? null,
      selector: applySelector,
    });

    let fallbackSucceeded = false;

    if (applyHref && applyHref !== activePage.url() && !applyNavigationForced) {
      try {
        await activePage.goto(applyHref, { waitUntil: "domcontentloaded" });
        await waitForDomAndSettle(activePage);
        await args.onPageReady?.(activePage, args.context);
        fallbackSucceeded = activePage.url() !== fromUrl;
      } catch {
        fallbackSucceeded = false;
      }

      attempts.push({
        phase: "entry",
        action: "click",
        selector: `href:${applyHref}`,
        text: applyText,
        matchedText: "Apply for this job",
        locatorStrategy: "direct_href_navigation",
        candidateFound: true,
        dismissesBlocker: false,
        success: fallbackSucceeded,
        urlBefore: fromUrl,
        urlAfter: activePage.url(),
      } satisfies ApplySessionCtaAttemptRecord);
    } else {
      const refreshedApplyLocator = await findFirstVisibleEnabledLocator(
        activePage.locator(applySelector),
      );

      if (refreshedApplyLocator) {
        await refreshedApplyLocator.scrollIntoViewIfNeeded().catch(() => undefined);
        const retryPopupPromise = activePage
          .waitForEvent("popup", { timeout: 5_500 })
          .catch(() => null);
        const retryContextPagePromise = args.context
          .waitForEvent("page", { timeout: 5_500 })
          .catch(() => null);
        const retryNavigationPromise = activePage
          .waitForNavigation({
            waitUntil: "domcontentloaded",
            timeout: 5_500,
          })
          .catch(() => null);

        try {
          await refreshedApplyLocator
            .click({ force: true, timeout: 6_000 })
            .catch(() =>
              refreshedApplyLocator.evaluate((element) => {
                if (element instanceof HTMLElement) {
                  element.click();
                }
              }),
            );
        } catch {
          // Ignore and let the fallback evidence show failure.
        }

        await Promise.race([
          retryNavigationPromise,
          activePage
            .waitForURL((url) => url.toString() !== fromUrl, {
              timeout: 5_500,
            })
            .catch(() => null),
          applyCaptureSkipLocator
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .catch(() => null),
          applyCaptureFormLocator
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .catch(() => null),
          activePage.waitForTimeout(APPLY_SETTLE_DELAY_MS + 1_400),
        ]);

        const [retryPopupPage, retryContextPage] = await Promise.all([
          retryPopupPromise,
          retryContextPagePromise,
        ]);

        if (retryPopupPage) {
          activePage = retryPopupPage;
          postApplyNewPageDetected = true;
        } else if (retryContextPage && retryContextPage !== activePage) {
          activePage = retryContextPage;
          postApplyNewPageDetected = true;
        }

        await waitForDomAndSettle(activePage);
        await args.onPageReady?.(activePage, args.context);

        fallbackSucceeded = activePage.url() !== fromUrl;
        attempts.push({
          phase: "entry",
          action: "click",
          selector: applySelector,
          text: applyText,
          matchedText: "Apply for this job",
          locatorStrategy: "css_data_js_force_retry",
          candidateFound: true,
          dismissesBlocker: false,
          success: fallbackSucceeded,
          urlBefore: fromUrl,
          urlAfter: activePage.url(),
        } satisfies ApplySessionCtaAttemptRecord);
      }
    }

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    applyCaptureDetected =
      (await isVisibleLocator(applyCaptureFormLocator)) ||
      (await isVisibleLocator(applyCaptureSkipLocator));
    postApplyPopupDetected = applyCaptureDetected;
    postApplyUrlAfter = activePage.url();
    postApplyProgressionSucceeded =
      fallbackSucceeded ||
      postApplyNewPageDetected ||
      applyCaptureDetected ||
      isAdzunaLandRedirectPage(activePage.url()) ||
      activePage.url() !== fromUrl;

    console.log("[AUTO_APPLY_ADZUNA_POST_APPLY_FALLBACK]", {
      href: applyHref ?? null,
      currentUrl: activePage.url(),
      adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
      adzunaPostApplyPopupDetected: postApplyPopupDetected,
      adzunaPostApplyNewPageDetected: postApplyNewPageDetected,
      applyHrefExtracted: applyHrefExtracted ?? null,
      applyNavigationForced,
      applyNavigationUrl: applyNavigationUrl ?? null,
    });
  }

  if (!applyClicked && postApplyProgressionSucceeded) {
    const finalApplyUrl = activePage.url();
    const applyClick = {
      hop: 1,
      fromUrl,
      toUrl: finalApplyUrl,
      selector: applySelector,
      text: applyText,
      navigation: "same-tab",
    } satisfies ApplySessionClickRecord;

    clicks.push(applyClick);
    applyClicks.push(applyClick);
    applyClicked = true;
    applyClickedText = applyText;
    applyClickedSelector = applySelector;
    latestActionText = applyText;
    latestActionSelector = applySelector;

    attempts.push({
      phase: "entry",
      action: "click",
      selector: applySelector,
      text: applyText,
      matchedText: "Apply for this job",
      locatorStrategy: applyNavigationForced
        ? "forced_apply_href_navigation"
        : "adzuna_post_apply_progression",
      candidateFound: true,
      dismissesBlocker: false,
      success: true,
      urlBefore: fromUrl,
      urlAfter: finalApplyUrl,
      applyCtaFoundAfter: true,
    } satisfies ApplySessionCtaAttemptRecord);
  }

  console.log("[AUTO_APPLY_ADZUNA_DETAILS_APPLY]", {
    fromUrl,
    toUrl: activePage.url(),
    selector: applySelector,
    text: applyText,
    applyHrefExtracted: applyHrefExtracted ?? null,
    applyNavigationForced,
    applyNavigationUrl: applyNavigationUrl ?? null,
    applyCaptureVisible: applyCaptureDetected,
    adzunaPostApplyProgressionSucceeded: postApplyProgressionSucceeded,
  });

  const skipSelector = applyCaptureSkipSelectorRaw;
  const visibleSkipLocator = await findFirstVisibleEnabledLocator(
    applyCaptureSkipLocator,
  );

  attempts.push({
    phase: "entry",
    action: "scan",
    selector: skipSelector,
    text: skipSelector,
    matchedText: "No thanks, take me to the job",
    locatorStrategy: "css_data_js",
    candidateFound: Boolean(visibleSkipLocator),
    dismissesBlocker: true,
    success: Boolean(visibleSkipLocator),
    urlBefore: activePage.url(),
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!visibleSkipLocator) {
    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: true,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      applyHrefExtracted,
      applyNavigationForced,
      applyNavigationUrl,
      latestActionText,
      latestActionSelector,
    };
  }

  const skipFromUrl = activePage.url();
  const skipText =
    (await extractLocatorText(visibleSkipLocator).catch(() => "")) ||
    "No thanks, take me to the job";

  console.log("[AUTO_APPLY_ADZUNA_APPLY_CAPTURE_SKIP] attempting", {
    fromUrl: skipFromUrl,
    selector: skipSelector,
    text: skipText,
  });

  try {
    await visibleSkipLocator
      .click({ timeout: 6_000 })
      .catch(() =>
        visibleSkipLocator.click({ force: true, timeout: 6_000 }),
      );
  } catch {
    attempts.push({
      phase: "entry",
      action: "click",
      selector: skipSelector,
      text: skipText,
      matchedText: "No thanks, take me to the job",
      locatorStrategy: "css_data_js",
      candidateFound: true,
      dismissesBlocker: true,
      success: false,
      urlBefore: skipFromUrl,
      urlAfter: activePage.url(),
    } satisfies ApplySessionCtaAttemptRecord);

    return {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      applyClicks,
      handled: true,
      applyClicked,
      applyClickedText,
      applyClickedSelector,
      applyCaptureDetected,
      applyCaptureSkipClicked,
      applyCaptureSkipText,
      applyCaptureSkipSelector,
      postApplyProgressionAttempted,
      postApplyProgressionSucceeded,
      postApplyUrlAfter,
      postApplyPopupDetected,
      postApplyNewPageDetected,
      postApplyFallbackAttempted,
      applyHrefExtracted,
      applyNavigationForced,
      applyNavigationUrl,
      latestActionText,
      latestActionSelector,
    };
  }

  const skipProgress = await waitForPostClickProgress({
    page: activePage,
    context: args.context,
    urlBefore: skipFromUrl,
    onPageReady: args.onPageReady,
  });

  activePage = skipProgress.page;
  const skipToUrl = activePage.url();
  applyCaptureSkipClicked = true;
  applyCaptureSkipText = skipText;
  applyCaptureSkipSelector = skipSelector;
  latestActionText = skipText;
  latestActionSelector = skipSelector;

  attempts.push({
    phase: "entry",
    action: "click",
    selector: skipSelector,
    text: skipText,
    matchedText: "No thanks, take me to the job",
    locatorStrategy: "css_data_js",
    candidateFound: true,
    dismissesBlocker: true,
    success: true,
    urlBefore: skipFromUrl,
    urlAfter: skipToUrl,
    applyCtaFoundAfter: await hasVisibleApplyCue(activePage),
  } satisfies ApplySessionCtaAttemptRecord);

  clicks.push({
    hop: 2,
    fromUrl: skipFromUrl,
    toUrl: skipToUrl,
    selector: skipSelector,
    text: skipText,
    navigation: "same-tab",
  } satisfies ApplySessionClickRecord);

  if (!urlsVisited.includes(skipToUrl)) {
    urlsVisited.push(skipToUrl);
  }

  console.log("[AUTO_APPLY_ADZUNA_APPLY_CAPTURE_SKIP]", {
    fromUrl: skipFromUrl,
    toUrl: skipToUrl,
    selector: skipSelector,
    text: skipText,
  });

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    applyClicks,
    handled: true,
    applyClicked,
    applyClickedText,
    applyClickedSelector,
    applyCaptureDetected,
    applyCaptureSkipClicked,
    applyCaptureSkipText,
    applyCaptureSkipSelector,
    postApplyProgressionAttempted,
    postApplyProgressionSucceeded,
    postApplyUrlAfter,
    postApplyPopupDetected,
    postApplyNewPageDetected,
    postApplyFallbackAttempted,
    applyHrefExtracted,
    applyNavigationForced,
    applyNavigationUrl,
    latestActionText,
    latestActionSelector,
  };
}

async function hasVisibleApplyCue(page: Page): Promise<boolean> {
  return page
    .evaluate((patterns) => {
      function isVisible(element: Element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-disabled") !== "true"
        );
      }

      function getText(element: Element) {
        if (
          element instanceof HTMLInputElement &&
          (element.type === "submit" || element.type === "button")
        ) {
          return element.value ?? "";
        }

        return (
          element.textContent ??
          element.getAttribute("aria-label") ??
          element.getAttribute("title") ??
          ""
        );
      }

      const nodes = Array.from(
        document.querySelectorAll(
          "a, button, input[type='submit'], input[type='button'], [role='button']",
        ),
      );

      return nodes
        .filter(isVisible)
        .some((element) =>
          patterns.some((pattern) =>
            getText(element)
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase()
              .includes(pattern),
          ),
        );
    }, [...APPLY_CTA_DETECTION_PATTERNS])
    .catch(() => false);
}

type RtxPreludeResult = {
  page: Page;
  attempted: boolean;
  reachedWorkday: boolean;
  markers: string[];
  failureReason?: string;
  verificationBlocked?: boolean;
  verificationSignals?: string[];
  verificationSignal?: string;
  verificationEvidence?: string;
  lastActionText?: string;
  lastActionSelector?: string;
};

async function runRtxManualApplyPrelude(args: {
  page: Page;
  context: BrowserContext;
  targetUrl: string;
  originalJobUrl?: string;
  resolvedDirectUrl?: string;
  title?: string;
  company?: string;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
  onStatus?: (update: ApplyStatusUpdate) => Promise<void> | void;
  viewerUrl?: string;
  remoteSessionId?: string;
}): Promise<RtxPreludeResult> {
  let activePage = args.page;
  const markers: string[] = [];
  let lastActionText: string | undefined;
  let lastActionSelector: string | undefined;
  let verificationSignals: string[] = [];
  let verificationSignal: string | undefined;
  let verificationEvidence: string | undefined;
  const targetHost = parseHostname(args.targetUrl);
  const originalHost = parseHostname(args.originalJobUrl);
  const resolvedHost = parseHostname(args.resolvedDirectUrl);
  const currentHost = parseHostname(activePage.url());
  const companyLooksRtx = isRtxCompanyName(args.company);
  const targetHostIsRtxRoot =
    targetHost === "rtx.com" ||
    targetHost === "careers.rtx.com" ||
    targetHost.endsWith(".rtx.com");
  const strictRtxContextDetected =
    targetHostIsRtxRoot &&
    isRtxHostname(targetHost) &&
    companyLooksRtx;
  const hasAnyRtxSignal =
    isRtxHostname(targetHost) ||
    isRtxHostname(originalHost) ||
    isRtxHostname(resolvedHost) ||
    isRtxHostname(currentHost) ||
    companyLooksRtx;

  if (!strictRtxContextDetected) {
    if (hasAnyRtxSignal) {
      console.info("[AUTO_APPLY_RTX_FLOW_SKIPPED_DOMAIN_MISMATCH]", {
        targetUrl: args.targetUrl,
        targetHost: targetHost || null,
        originalHost: originalHost || null,
        resolvedHost: resolvedHost || null,
        currentHost: currentHost || null,
        company: normalizeWhitespace(args.company),
        reason: "strict_rtx_guard_failed",
      });
    }
    return {
      page: activePage,
      attempted: false,
      reachedWorkday: false,
      markers,
      lastActionText,
      lastActionSelector,
    };
  }

  const emit = async (marker: string, detail?: Record<string, unknown>) => {
    markers.push(marker);
    console.info("[AUTO_APPLY_RTX_PROGRESS]", {
      marker,
      currentUrl: activePage.url(),
      ...detail,
    });
    await args.onStatus?.({
      status: "STARTING",
      message: marker,
      lastUrl: activePage.url(),
      openUrl: activePage.url(),
      viewerUrl: args.viewerUrl,
      remoteSessionId: args.remoteSessionId,
    });
  };

  const rememberLastAction = (text: string, selector: string) => {
    lastActionText = text;
    lastActionSelector = selector;
  };

  const buildVerificationBlockedResult = (): RtxPreludeResult => ({
    page: activePage,
    attempted: true,
    reachedWorkday: false,
    markers,
    failureReason: "RTX_VERIFICATION_REQUIRED",
    verificationBlocked: true,
    verificationSignals,
    verificationSignal,
    verificationEvidence,
    lastActionText,
    lastActionSelector,
  });

  const detectVerificationBlocker = async (stage: string) => {
    const signals = await detectPageSignals(activePage);
    const title = normalizeWhitespace(
      await activePage.title().catch(() => ""),
    );
    const rawSignalText = [activePage.url(), title, signals.pageText]
      .join("\n")
      .toLowerCase();
    const humanInterventionTokenDetected = rawSignalText.includes(
      "human_intervention_required",
    );
    if (
      signals.verificationSignals.length === 0 &&
      !humanInterventionTokenDetected
    ) {
      return false;
    }

    verificationSignals = [
      ...new Set([
        ...signals.verificationSignals,
        ...(humanInterventionTokenDetected
          ? ["human_intervention_required"]
          : []),
      ]),
    ];
    verificationSignal = verificationSignals[0];
    verificationEvidence = title || verificationSignal || "verification required";

    await emit("RTX_VERIFICATION_REQUIRED", {
      stage,
      signal: verificationSignal ?? null,
      title: title || null,
    });
    return true;
  };

  try {
    await emit("RTX_STEP_START");
    if (await detectVerificationBlocker("entry")) {
      return buildVerificationBlockedResult();
    }

    if (isRtxWorkdayUrl(activePage.url())) {
      await emit("RTX_WORKDAY_REACHED");
      return {
        page: activePage,
        attempted: true,
        reachedWorkday: true,
        markers,
        lastActionText,
        lastActionSelector,
      };
    }

    if (
      looksLikeRtxRedirectOrPrivacyPage(activePage.url()) ||
      (!isRtxWorkdayUrl(activePage.url()) &&
        !parseHostname(activePage.url()).includes("careers.rtx.com"))
    ) {
      await activePage.goto(RTX_CAREERS_ENTRY_URL, {
        waitUntil: "domcontentloaded",
      });
      await waitForDomAndSettle(activePage);
      await args.onPageReady?.(activePage, args.context);
      await emit("RTX_RECOVER_FROM_REDIRECT");
      if (await detectVerificationBlocker("post_redirect_recovery")) {
        return buildVerificationBlockedResult();
      }
    }

    const cookiePlans: LocatorPlan[] = [
      {
        locator: activePage.getByRole("button", {
          name: /accept(?: all| cookies)?|allow all|agree|cookie preferences|recommended settings/i,
        }),
        selector: "role=button[cookie-accept]",
      },
      {
        locator: activePage.getByRole("link", {
          name: /accept(?: all| cookies)?|allow all|agree|cookie preferences|recommended settings/i,
        }),
        selector: "role=link[cookie-accept]",
      },
    ];
    const cookiePlan = await findFirstMatchingLocatorPlan(cookiePlans);
    if (cookiePlan) {
      rememberLastAction("Accept Cookies", cookiePlan.selector);
      await cookiePlan.locator.click({ timeout: 4_000 }).catch(() => undefined);
      await waitForDomAndSettle(activePage);
      await emit("RTX_COOKIE_HANDLED");
      if (await detectVerificationBlocker("post_cookie")) {
        return buildVerificationBlockedResult();
      }
    }

    if (!parseHostname(activePage.url()).includes("careers.rtx.com")) {
      const careersPlan = await findFirstMatchingLocatorPlan([
        {
          locator: activePage.getByRole("link", { name: /careers/i }),
          selector: "role=link[name=careers]",
        },
        {
          locator: activePage.getByRole("button", { name: /careers/i }),
          selector: "role=button[name=careers]",
        },
      ]);
      if (careersPlan) {
        rememberLastAction("Careers", careersPlan.selector);
        activePage = await clickLocatorPlanWithNavigation({
          page: activePage,
          context: args.context,
          plan: careersPlan,
          onPageReady: args.onPageReady,
        });
        await emit("RTX_CAREERS_OPENED");
        if (await detectVerificationBlocker("post_careers_open")) {
          return buildVerificationBlockedResult();
        }
      }
    }

    const allowModalPlan = await findFirstMatchingLocatorPlan([
      {
        locator: activePage.getByRole("button", { name: /^allow$/i }),
        selector: "role=button[name=allow]",
      },
      {
        locator: activePage.getByRole("button", {
          name: /allow cookies|allow all|allow essential/i,
        }),
        selector: "role=button[name*=allow]",
      },
      {
        locator: activePage.getByRole("button", {
          name: /continue(?: to application)?/i,
        }),
        selector: "role=button[name*=continue]",
      },
    ]);
    if (allowModalPlan) {
      rememberLastAction("Allow", allowModalPlan.selector);
      await allowModalPlan.locator.click({ timeout: 4_000 }).catch(() => undefined);
      await waitForDomAndSettle(activePage);
      if (await detectVerificationBlocker("post_allow")) {
        return buildVerificationBlockedResult();
      }
    }

    const jobId = extractRtxJobId({
      targetUrl: args.targetUrl,
      originalJobUrl: args.originalJobUrl,
      resolvedDirectUrl: args.resolvedDirectUrl,
      title: args.title,
    });
    const searchQuery = jobId ?? buildRtxTitleQuery(args.title);
    const searchPlan = await findFirstMatchingLocatorPlan([
      {
        locator: activePage.locator("#typehead"),
        selector: "#typehead",
      },
      {
        locator: activePage.getByRole("textbox", { name: /search/i }),
        selector: "role=textbox[name=search]",
      },
      {
        locator: activePage.getByPlaceholder(/search/i),
        selector: "placeholder*=search",
      },
    ]);

    if (searchPlan && searchQuery) {
      await searchPlan.locator.fill(searchQuery).catch(() => undefined);
      await searchPlan.locator.press("Enter").catch(() => undefined);
      await waitForDomAndSettle(activePage);
      await emit("RTX_SEARCH_FILLED", {
        query: searchQuery,
        jobId: jobId ?? null,
      });

      const resultPlans: LocatorPlan[] = [];
      if (jobId) {
        const jobIdPattern = new RegExp(escapeRegExp(jobId), "i");
        resultPlans.push(
          {
            locator: activePage.getByRole("link", { name: jobIdPattern }),
            selector: `role=link[name*=${jobId}]`,
          },
          {
            locator: activePage.getByRole("button", { name: jobIdPattern }),
            selector: `role=button[name*=${jobId}]`,
          },
          {
            locator: activePage.locator(`a:has-text("${jobId}")`),
            selector: `a:has-text(${jobId})`,
          },
        );
      }

      if (resultPlans.length === 0 && searchQuery) {
        const fallbackPattern = new RegExp(escapeRegExp(searchQuery), "i");
        resultPlans.push(
          {
            locator: activePage.getByRole("link", { name: fallbackPattern }),
            selector: `role=link[name*=${searchQuery}]`,
          },
          {
            locator: activePage.locator(`a:has-text("${searchQuery}")`),
            selector: `a:has-text(${searchQuery})`,
          },
        );
      }

      const resultPlan = await findFirstMatchingLocatorPlan(resultPlans);
      if (resultPlan) {
        rememberLastAction(searchQuery || "Open job result", resultPlan.selector);
        activePage = await clickLocatorPlanWithNavigation({
          page: activePage,
          context: args.context,
          plan: resultPlan,
          onPageReady: args.onPageReady,
        });
        await emit("RTX_RESULT_SELECTED");
        if (await detectVerificationBlocker("post_result_open")) {
          return buildVerificationBlockedResult();
        }
      }
    }

    if (!isRtxWorkdayUrl(activePage.url())) {
      const applyPlan = await findFirstMatchingLocatorPlan([
        {
          locator: activePage.getByRole("button", {
            name: /^apply( now)?$/i,
          }),
          selector: "role=button[name=apply]",
        },
        {
          locator: activePage.getByRole("link", {
            name: /^apply( now)?$/i,
          }),
          selector: "role=link[name=apply]",
        },
      ]);
      if (applyPlan) {
        rememberLastAction("Apply Now", applyPlan.selector);
        activePage = await clickLocatorPlanWithNavigation({
          page: activePage,
          context: args.context,
          plan: applyPlan,
          onPageReady: args.onPageReady,
        });
        await emit("RTX_APPLY_CLICKED");
        if (await detectVerificationBlocker("post_apply_click")) {
          return buildVerificationBlockedResult();
        }
      }
    }

    if (!isRtxWorkdayUrl(activePage.url())) {
      const applyManuallyPlan = await findFirstMatchingLocatorPlan([
        {
          locator: activePage.getByRole("button", { name: /apply manually/i }),
          selector: "role=button[name*=apply manually]",
        },
        {
          locator: activePage.getByRole("link", { name: /apply manually/i }),
          selector: "role=link[name*=apply manually]",
        },
      ]);
      if (applyManuallyPlan) {
        rememberLastAction("Apply Manually", applyManuallyPlan.selector);
        activePage = await clickLocatorPlanWithNavigation({
          page: activePage,
          context: args.context,
          plan: applyManuallyPlan,
          onPageReady: args.onPageReady,
        });
        await emit("RTX_APPLY_MANUALLY_CLICKED");
        if (await detectVerificationBlocker("post_apply_manually_click")) {
          return buildVerificationBlockedResult();
        }
      }
    }

    if (!isRtxWorkdayUrl(activePage.url())) {
      const continuePlan = await findFirstMatchingLocatorPlan([
        {
          locator: activePage.getByRole("button", {
            name: /continue(?: to application)?/i,
          }),
          selector: "role=button[name*=continue]",
        },
        {
          locator: activePage.getByRole("link", {
            name: /continue(?: to application)?/i,
          }),
          selector: "role=link[name*=continue]",
        },
      ]);
      if (continuePlan) {
        rememberLastAction("Continue", continuePlan.selector);
        activePage = await clickLocatorPlanWithNavigation({
          page: activePage,
          context: args.context,
          plan: continuePlan,
          onPageReady: args.onPageReady,
        });
        await emit("RTX_CONTINUE_CLICKED");
        if (await detectVerificationBlocker("post_continue_click")) {
          return buildVerificationBlockedResult();
        }
      }
    }

    if (isRtxWorkdayUrl(activePage.url())) {
      await emit("RTX_WORKDAY_REACHED");
      return {
        page: activePage,
        attempted: true,
        reachedWorkday: true,
        markers,
        lastActionText,
        lastActionSelector,
      };
    }

    if (await detectVerificationBlocker("final_prelude_check")) {
      return buildVerificationBlockedResult();
    }

    return {
      page: activePage,
      attempted: true,
      reachedWorkday: false,
      markers,
      failureReason: "RTX_WORKDAY_NOT_REACHED",
      verificationBlocked: false,
      verificationSignals,
      verificationSignal,
      verificationEvidence,
      lastActionText,
      lastActionSelector,
    };
  } catch (error) {
    return {
      page: activePage,
      attempted: true,
      reachedWorkday: false,
      markers,
      failureReason:
        error instanceof Error ? `RTX_PRELUDE_ERROR:${error.message}` : "RTX_PRELUDE_ERROR",
      verificationBlocked: false,
      verificationSignals,
      verificationSignal,
      verificationEvidence,
      lastActionText,
      lastActionSelector,
    };
  }
}

async function scanEntryCtaConfigs(
  page: Page,
  domain: KnownApplyDomain,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildEntryCtaConfigs(domain).map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "entry",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: Boolean(config.dismissesBlocker),
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        ignorePatterns: [...ENTRY_CTA_IGNORE_PATTERNS],
      },
    )
    .then(
      (attempts) => attempts as ApplySessionCtaAttemptRecord[],
    )
    .catch(
      (): ApplySessionCtaAttemptRecord[] => [],
    );
}

async function findEntryCtaCandidate(
  page: Page,
  domain: KnownApplyDomain,
): Promise<EntryCtaCandidate | null> {
  const currentUrl = page.url();
  const configs = buildEntryCtaConfigs(domain).map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        );

        const candidates = nodes
          .filter(isVisible)
          .map((element) => {
            const rawText = getText(element).replace(/\s+/g, " ").trim();
            const lowerText = rawText.toLowerCase();
            if (!lowerText) return null;
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";
            const inBlocker = args.blockerSelectors.some((selector) =>
              element.closest(selector),
            );
            const inMainContent = Boolean(
              element.closest(
                "main, article, [role='main'], #content, .content, .job, .job-content, .job-header",
              ),
            );

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 25;
              if (config.match === "exact") score += 120;
              if (semanticRole === config.preferredRole) score += 50;
              if (semanticRole === "button") score += 20;
              if (semanticRole === "link") score += 10;
              if (inBlocker && config.dismissesBlocker) score += 90;
              if (inBlocker && !config.dismissesBlocker) score -= 15;
              if (inMainContent) score += 25;
              if (args.domain === "dice" && lowerText === "apply now") {
                score += 40;
              }

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: Boolean(config.dismissesBlocker),
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        domain,
        configs,
        blockerSelectors: [...BLOCKER_SURFACE_SELECTORS],
        ignorePatterns: [...ENTRY_CTA_IGNORE_PATTERNS],
        currentUrl,
      },
    )
    .catch(() => null);
}

async function clickEntryCtaCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_ENTRY_CTA] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
    dismissesBlocker: args.candidate.dismissesBlocker,
  });

  try {
    await locator
      .click({ timeout: 6_000 })
      .catch(() => locator.click({ force: true, timeout: 6_000 }));
  } catch {
    return {
      page: args.page,
      click: null,
      attempt: {
        phase: "entry",
        action: "click",
        selector: args.candidate.selector,
        text: args.candidate.text,
        matchedText: args.candidate.matchedText,
        locatorStrategy: "visible_text_ranked",
        candidateFound: true,
        dismissesBlocker: args.candidate.dismissesBlocker,
        success: false,
        urlBefore: fromUrl,
        urlAfter: args.page.url(),
        applyCtaFoundAfter: await hasVisibleApplyCue(args.page),
      } satisfies ApplySessionCtaAttemptRecord,
    };
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = args.page;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== args.page) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  const applyCtaFoundAfter = await hasVisibleApplyCue(nextPage);

  return {
    page: nextPage,
    click: {
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    attempt: {
      phase: "entry",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: args.candidate.dismissesBlocker,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
      applyCtaFoundAfter,
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function runEntryCtaPhase(args: {
  page: Page;
  context: BrowserContext;
  domain: KnownApplyDomain;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<EntryCtaPhaseResult> {
  let activePage = args.page;
  const urlsVisited = [activePage.url()];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let dismissedBlocker = false;
  let ctaFound = false;
  let ctaClickedText: string | undefined;
  let ctaClickedSelector: string | undefined;

  for (let step = 1; step <= ENTRY_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanEntryCtaConfigs(activePage, args.domain);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        ctaFound = true;
      }
    }

    const candidate = await findEntryCtaCandidate(activePage, args.domain);
    if (!candidate) break;
    ctaFound = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickEntryCtaCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;

    if (!urlsVisited.includes(activePage.url())) {
      urlsVisited.push(activePage.url());
    }

    if (result.click) {
      clicks.push(result.click);
      ctaClickedText = candidate.text;
      ctaClickedSelector = candidate.selector;
      if (candidate.dismissesBlocker) {
        dismissedBlocker = true;
      }
    }

    const signals = await detectPageSignals(activePage);
    console.log("[AUTO_APPLY_ENTRY_CTA] landed", {
      step,
      domain: args.domain,
      currentUrl: activePage.url(),
      clickedText: candidate.text,
      clickedSelector: candidate.selector,
      dismissedBlocker,
      applyCtaFoundAfter: result.attempt.applyCtaFoundAfter ?? false,
      formDetected: signals.formDetected,
      verificationDetected: signals.needsHuman,
      confirmationDetected: signals.confirmationDetected,
    });

    if (
      signals.formDetected ||
      signals.needsHuman ||
      signals.confirmationDetected
    ) {
      break;
    }
  }

  return {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    ctaFound,
    ctaClickedText,
    ctaClickedSelector,
    dismissedBlocker,
  };
}

async function scanHandoffCtaConfigs(
  page: Page,
): Promise<ApplySessionCtaAttemptRecord[]> {
  const currentUrl = page.url();
  const configs = buildHandoffCtaConfigs().map((config) => ({
    ...config,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        ).filter(isVisible);

        return args.configs.map((config) => {
          const match = nodes.find((element) => {
            const text = getText(element).replace(/\s+/g, " ").trim().toLowerCase();
            if (!text) return false;
            if (args.ignorePatterns.some((pattern) => text.includes(pattern))) {
              return false;
            }

            return config.match === "exact"
              ? text === config.textLower
              : text.includes(config.textLower);
          });

          const matchedText = match
            ? getText(match).replace(/\s+/g, " ").trim().slice(0, 160)
            : "";

          return {
            phase: "handoff",
            action: "scan",
            selector: match ? buildCssPath(match) : `text=${config.text}`,
            text: matchedText,
            matchedText: config.text,
            locatorStrategy: `visible_text_${config.match}`,
            candidateFound: Boolean(match),
            dismissesBlocker: false,
            success: Boolean(match),
            urlBefore: args.currentUrl,
            urlAfter: args.currentUrl,
          };
        });
      },
      {
        configs,
        currentUrl,
        ignorePatterns: [...HANDOFF_CTA_IGNORE_PATTERNS],
      },
    )
    .then(
      (attempts) => attempts as ApplySessionCtaAttemptRecord[],
    )
    .catch(
      (): ApplySessionCtaAttemptRecord[] => [],
    );
}

async function findHandoffCtaCandidate(
  page: Page,
): Promise<EntryCtaCandidate | null> {
  const configs = buildHandoffCtaConfigs().map((config, index) => ({
    ...config,
    priority: index,
    textLower: config.text.toLowerCase(),
  }));

  return page
    .evaluate(
      (args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !element.hasAttribute("disabled") &&
            element.getAttribute("aria-disabled") !== "true"
          );
        }

        function buildCssPath(element: Element) {
          if (element.id) {
            return `#${CSS.escape(element.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            const tagName = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (!parent) {
              segments.unshift(tagName);
              break;
            }

            const siblings = Array.from(parent.children).filter(
              (child) => (child as Element).tagName === current?.tagName,
            );
            const index = siblings.indexOf(current) + 1;
            segments.unshift(`${tagName}:nth-of-type(${index})`);
            current = parent;
          }

          return segments.join(" > ");
        }

        function getText(element: Element) {
          if (
            element instanceof HTMLInputElement &&
            (element.type === "submit" || element.type === "button")
          ) {
            return element.value ?? "";
          }

          return (
            element.textContent ??
            element.getAttribute("aria-label") ??
            element.getAttribute("title") ??
            ""
          );
        }

        const nodes = Array.from(
          document.querySelectorAll(
            "a, button, input[type='submit'], input[type='button'], [role='button']",
          ),
        );

        const candidates = nodes
          .filter(isVisible)
          .map((element) => {
            const rawText = getText(element).replace(/\s+/g, " ").trim();
            const lowerText = rawText.toLowerCase();
            if (!lowerText) return null;
            if (
              args.ignorePatterns.some((pattern) => lowerText.includes(pattern))
            ) {
              return null;
            }

            const tagName = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role")?.toLowerCase() ?? "";
            const semanticRole =
              tagName === "a"
                ? "link"
                : tagName === "button" ||
                    tagName === "input" ||
                    roleAttr === "button"
                  ? "button"
                  : "any";
            const inMainContent = Boolean(
              element.closest(
                "main, article, [role='main'], .job, .job-content, .job-header, .job-apply, .job-actions",
              ),
            );
            const inHeaderOrFooter = Boolean(
              element.closest("header, footer, nav, [role='navigation']"),
            );
            const attrs = [
              element.id ?? "",
              element.className ?? "",
              element.getAttribute("data-testid") ?? "",
              element.getAttribute("aria-label") ?? "",
            ]
              .join(" ")
              .toLowerCase();

            let bestMatch:
              | (EntryCtaCandidate & { score: number; priority: number })
              | null = null;

            for (const config of args.configs) {
              const matches =
                config.match === "exact"
                  ? lowerText === config.textLower
                  : lowerText.includes(config.textLower);
              if (!matches) continue;

              let score = 1000 - config.priority * 25;
              if (config.match === "exact") score += 120;
              if (semanticRole === config.preferredRole) score += 70;
              if (semanticRole === "button") score += 20;
              if (semanticRole === "link") score += 10;
              if (inMainContent) score += 60;
              if (inHeaderOrFooter) score -= 140;
              if (
                attrs.includes("primary") ||
                attrs.includes("cta") ||
                attrs.includes("apply")
              ) {
                score += 45;
              }

              const candidate = {
                selector: buildCssPath(element),
                text: rawText.slice(0, 160),
                matchedText: config.text,
                dismissesBlocker: false,
                score,
                priority: config.priority,
              };

              if (!bestMatch || candidate.score > bestMatch.score) {
                bestMatch = candidate;
              }
            }

            return bestMatch;
          })
          .filter(
            (
              candidate,
            ): candidate is EntryCtaCandidate & { score: number; priority: number } =>
              candidate !== null,
          );

        candidates.sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.priority - right.priority;
        });

        return (candidates[0] as EntryCtaCandidate | undefined) ?? null;
      },
      {
        configs,
        ignorePatterns: [...HANDOFF_CTA_IGNORE_PATTERNS],
      },
    )
    .catch(() => null);
}

async function findResolvedHandoffClickTarget(args: {
  page: Page;
  candidate: ApplySourceCandidate;
}): Promise<{
  target: ResolvedHandoffClickTarget | null;
  blockedCandidates: ApplySourceRejectedCandidate[];
}> {
  const hrefFragments = buildResolvedHandoffHrefFragments(args.candidate.href);
  const candidateText = args.candidate.text.trim();
  const textPatterns = [
    candidateText,
    "Apply for this job",
    "Apply now",
    "Continue to application",
  ].filter(Boolean);

  const locatorPlans: Array<{
    locator: Locator;
    strategy: string;
    selector: string;
  }> = [];
  const blockedCandidates: ApplySourceRejectedCandidate[] = [];

  if (hrefFragments[0]) {
    const exactSelector = `a[href="${cssEscape(hrefFragments[0])}"]`;
    locatorPlans.push({
      locator: args.page.locator(exactSelector),
      strategy: "resolved_handoff_href_exact",
      selector: exactSelector,
    });
  }

  for (const fragment of hrefFragments.slice(1)) {
    const partialSelector = `a[href*="${cssEscape(fragment)}"]`;
    locatorPlans.push({
      locator: args.page.locator(partialSelector),
      strategy: "resolved_handoff_href_partial",
      selector: partialSelector,
    });
  }

  for (const pattern of textPatterns) {
    const exactPattern = new RegExp(`^\\s*${escapeRegExp(pattern)}\\s*$`, "i");
    const containsPattern = new RegExp(escapeRegExp(pattern), "i");

    locatorPlans.push({
      locator: args.page.getByRole("link", { name: exactPattern }),
      strategy: "resolved_handoff_role_link_text_exact",
      selector: `role=link[name=${pattern}]`,
    });
    locatorPlans.push({
      locator: args.page.getByRole("button", { name: exactPattern }),
      strategy: "resolved_handoff_role_button_text_exact",
      selector: `role=button[name=${pattern}]`,
    });
    locatorPlans.push({
      locator: args.page.getByRole("link", { name: containsPattern }),
      strategy: "resolved_handoff_role_link_text_contains",
      selector: `role=link[name*=${pattern}]`,
    });
  }

  for (const plan of locatorPlans) {
    const matchedLocator = await findFirstVisibleEnabledLocator(plan.locator);
    if (!matchedLocator) {
      continue;
    }

    const resolvedHref =
      (await matchedLocator.getAttribute("href").catch(() => null)) ?? undefined;
    const text = (await extractLocatorText(matchedLocator)).trim();
    const blockedReason = getBlockedAdzunaAuthContinuationReason({
      currentUrl: args.page.url(),
      href: resolvedHref ?? args.candidate.href,
      text,
    });

    if (blockedReason) {
      blockedCandidates.push({
        href: resolvedHref ?? args.candidate.href,
        hostname:
          parseHostname(resolvedHref ?? args.candidate.href) ||
          args.candidate.hostname,
        text: text.slice(0, 160) || args.candidate.text,
        reason: blockedReason,
      });
      continue;
    }

    return {
      target: {
        selector: plan.selector,
        text: text.slice(0, 160) || candidateText || args.candidate.href,
        matchedText: candidateText || args.candidate.href,
        dismissesBlocker: false,
        href: resolvedHref ?? args.candidate.href,
        locatorStrategy: plan.strategy,
        locator: matchedLocator,
      } satisfies ResolvedHandoffClickTarget,
      blockedCandidates,
    };
  }

  return {
    target: null,
    blockedCandidates,
  };
}

async function clickResolvedHandoffCandidateIfStuck(args: {
  page: Page;
  context: BrowserContext;
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<ResolvedHandoffClickResult> {
  let activePage = args.page;
  const candidate = pickResolvedHandoffCandidate({
    resolverSelectedLink: args.resolverSelectedLink,
    resolverCandidates: args.resolverCandidates,
  });

  if (!candidate) {
    const result = {
      page: activePage,
      urlsVisited: [activePage.url()],
      clicks: [],
      attempts: [],
      attempted: false,
      targetFound: false,
      succeeded: false,
      directNavAttempted: false,
      directNavSucceeded: false,
      blockedCandidates: [],
      selectedCandidate: undefined,
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffClickSucceeded: result.succeeded,
      resolvedHandoffClickedHref: null,
      resolvedHandoffClickedText: null,
      resolvedHandoffUrlBefore: activePage.url(),
      resolvedHandoffUrlAfter: activePage.url(),
      currentUrl: activePage.url(),
    });

    return result;
  }

  const urlBefore = activePage.url();
  const urlsVisited = [urlBefore];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const clicks: ApplySessionClickRecord[] = [];
  const selectedCandidate = candidate.text?.trim()
    ? `${candidate.text.trim().slice(0, 160)} -> ${candidate.href}`
    : candidate.href;
  const blockedCandidates: ApplySourceRejectedCandidate[] = [];
  const currentAuthState = classifyAdzunaAuthPage(activePage.url());

  if (currentAuthState.isAuthPage) {
    blockedCandidates.push({
      href: candidate.href,
      hostname: candidate.hostname,
      text: candidate.text,
      reason: "adzuna_auth_page_requires_form_login",
    });

    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: false,
      targetFound: false,
      succeeded: false,
      directNavAttempted: false,
      directNavSucceeded: false,
      blockedCandidates,
      selectedCandidate,
      locatorStrategy: "adzuna_auth_page_requires_form_login",
      urlBefore,
      urlAfter: activePage.url(),
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffElementFound: result.targetFound,
      resolvedHandoffLocatorStrategy: result.locatorStrategy,
      resolvedHandoffClickSucceeded: result.succeeded,
      selectedResolvedHandoffCandidate: selectedCandidate,
      blockedResolvedHandoffCandidates: blockedCandidates,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const targetSearch = await findResolvedHandoffClickTarget({
    page: activePage,
    candidate,
  });
  const target = targetSearch.target;
  blockedCandidates.push(...targetSearch.blockedCandidates);

  attempts.push({
    phase: "handoff",
    action: "scan",
    selector:
      target?.selector ??
      `a[href="${cssEscape(args.resolverSelectedLink ?? candidate.href)}"]`,
    text: target?.text ?? "",
    matchedText: candidate.text || candidate.href,
    locatorStrategy:
      target?.locatorStrategy ?? "resolved_handoff_locator_search",
    candidateFound: Boolean(target),
    dismissesBlocker: false,
    success: Boolean(target),
    urlBefore,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  if (!target) {
    let directNavAttempted = false;
    let directNavSucceeded = false;
    let directNavUrl: string | undefined;
    let directNavUrlAfter: string | undefined;

    if (
      isAdzunaLandRedirectPage(activePage.url()) &&
      candidate.score > 100
    ) {
      const directNavResult = await navigateResolvedHandoffCandidateDirectly({
        page: activePage,
        context: args.context,
        candidate,
        resolverSelectedLink: args.resolverSelectedLink,
        onPageReady: args.onPageReady,
      });

      activePage = directNavResult.page;
      if (!urlsVisited.includes(activePage.url())) {
        urlsVisited.push(activePage.url());
      }
      directNavAttempted = directNavResult.attempted;
      directNavSucceeded = directNavResult.succeeded;
      directNavUrl = directNavResult.url;
      directNavUrlAfter = directNavResult.urlAfter;
    }

    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      attempted: true,
      targetFound: false,
      succeeded: directNavSucceeded,
      locatorStrategy: "resolved_handoff_locator_search",
      directNavAttempted,
      directNavSucceeded,
      directNavUrl,
      directNavUrlAfter,
      blockedCandidates,
      selectedCandidate,
      urlBefore,
      urlAfter: activePage.url(),
    } satisfies ResolvedHandoffClickResult;

    console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
      resolvedHandoffClickAttempted: result.attempted,
      resolvedHandoffElementFound: result.targetFound,
      resolvedHandoffLocatorStrategy: result.locatorStrategy,
      resolvedHandoffClickSucceeded: result.succeeded,
      resolvedHandoffDirectNavAttempted: result.directNavAttempted,
      resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
      resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
      resolvedHandoffClickedHref: candidate.href,
      resolvedHandoffClickedText: candidate.text || null,
      selectedResolvedHandoffCandidate: selectedCandidate,
      blockedResolvedHandoffCandidates: blockedCandidates,
      resolvedHandoffUrlBefore: result.urlBefore,
      resolvedHandoffUrlAfter: result.urlAfter,
      currentUrl: activePage.url(),
    });

    return result;
  }

  const popupPromise = activePage
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = activePage
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK] attempting", {
    resolvedHandoffClickAttempted: true,
    resolvedHandoffElementFound: true,
    resolvedHandoffLocatorStrategy: target.locatorStrategy,
    resolvedHandoffClickedHref: target.href ?? candidate.href,
    resolvedHandoffClickedText: target.text || candidate.text || null,
    selector: target.selector,
    locatorStrategy: target.locatorStrategy,
    currentUrl: urlBefore,
  });

  let clickSucceeded = false;
  const overlayInspection = isAdzunaLandRedirectPage(urlBefore)
    ? await inspectAdzunaHandoffOverlay({
        page: activePage,
        selector: target.selector,
      })
    : {
        overlayDetected: false,
        overlayDismissed: false,
        overlayType: undefined,
        overlaySelectorsTried: [...BLOCKER_SURFACE_SELECTORS],
      };

  try {
    await target.locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await target.locator.click({ timeout: 6_000 });
    clickSucceeded = true;
  } catch {
    if (overlayInspection.overlayDetected) {
      try {
        await target.locator.click({ force: true, timeout: 6_000 });
        clickSucceeded = true;
      } catch {
        clickSucceeded = false;
      }
    }

    if (!clickSucceeded) {
      let directNavAttempted = false;
      let directNavSucceeded = false;
      let directNavUrl: string | undefined;
      let directNavUrlAfter: string | undefined;

      if (
        isAdzunaLandRedirectPage(activePage.url()) &&
        candidate.score > 100
      ) {
        const directNavResult = await navigateResolvedHandoffCandidateDirectly({
          page: activePage,
          context: args.context,
          candidate,
          resolverSelectedLink: args.resolverSelectedLink,
          onPageReady: args.onPageReady,
        });

        activePage = directNavResult.page;
        if (!urlsVisited.includes(activePage.url())) {
          urlsVisited.push(activePage.url());
        }
        directNavAttempted = directNavResult.attempted;
        directNavSucceeded = directNavResult.succeeded;
        directNavUrl = directNavResult.url;
        directNavUrlAfter = directNavResult.urlAfter;
      }

      attempts.push({
        phase: "handoff",
        action: "click",
        selector: target.selector,
        text: target.text,
        matchedText: candidate.text || candidate.href,
        locatorStrategy: target.locatorStrategy,
        candidateFound: true,
        dismissesBlocker: false,
        success: false,
        urlBefore,
        urlAfter: activePage.url(),
      } satisfies ApplySessionCtaAttemptRecord);

      const result = {
        page: activePage,
        urlsVisited,
        clicks,
        attempts,
        attempted: true,
        targetFound: true,
        succeeded: directNavSucceeded,
        locatorStrategy: target.locatorStrategy,
        directNavAttempted,
        directNavSucceeded,
        directNavUrl,
        directNavUrlAfter,
        clickedHref: target.href ?? candidate.href,
        clickedText: target.text || candidate.text,
        clickedSelector: target.selector,
        blockedCandidates,
        selectedCandidate,
        urlBefore,
        urlAfter: activePage.url(),
        popupOccurred: false,
        usedPopup: false,
        downstreamConfirmed: directNavSucceeded,
      } satisfies ResolvedHandoffClickResult;

      console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
        resolvedHandoffClickAttempted: result.attempted,
        resolvedHandoffElementFound: result.targetFound,
        resolvedHandoffLocatorStrategy: result.locatorStrategy,
        resolvedHandoffClickSucceeded: result.succeeded,
        resolvedHandoffDirectNavAttempted: result.directNavAttempted,
        resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
        resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
        resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
        resolvedHandoffClickedHref: result.clickedHref ?? null,
        resolvedHandoffClickedText: result.clickedText ?? null,
        selectedResolvedHandoffCandidate: selectedCandidate,
        blockedResolvedHandoffCandidates: blockedCandidates,
        resolvedHandoffUrlBefore: result.urlBefore,
        resolvedHandoffUrlAfter: result.urlAfter,
        currentUrl: activePage.url(),
      });

      return result;
    }
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = activePage;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== activePage) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  const clickRecord = {
    hop: 1,
    fromUrl: urlBefore,
    toUrl: nextPage.url(),
    selector: target.selector,
    text: target.text,
    navigation,
  } satisfies ApplySessionClickRecord;
  clicks.push(clickRecord);
  activePage = nextPage;

  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  attempts.push({
    phase: "handoff",
    action: "click",
    selector: target.selector,
    text: target.text,
    matchedText: candidate.text || candidate.href,
    locatorStrategy: target.locatorStrategy,
    candidateFound: true,
    dismissesBlocker: false,
    success: clickSucceeded,
    urlBefore,
    urlAfter: activePage.url(),
  } satisfies ApplySessionCtaAttemptRecord);

  const postClickUrl = activePage.url();

  const progress = await waitForPostClickProgress({
    page: activePage,
    context: args.context,
    urlBefore: postClickUrl,
    onPageReady: args.onPageReady,
  });

  activePage = progress.page;
  if (!urlsVisited.includes(activePage.url())) {
    urlsVisited.push(activePage.url());
  }

  const resolvedHandoffUrlAfter = activePage.url();
  const resolvedHandoffClickSucceeded =
    progress.urlChanged ||
    !isAdzunaLandRedirectPage(resolvedHandoffUrlAfter) ||
    (await hasReachedPostHandoffDestination(activePage));
  const popupOccurred = Boolean(
    popupPage || (contextPage && contextPage !== args.page),
  );

  const result = {
    page: activePage,
    urlsVisited,
    clicks,
    attempts,
    attempted: true,
    targetFound: true,
    succeeded: resolvedHandoffClickSucceeded,
    locatorStrategy: target.locatorStrategy,
    directNavAttempted: false,
    directNavSucceeded: false,
    directNavUrl: undefined,
    directNavUrlAfter: undefined,
    clickedHref: target.href ?? candidate.href,
    clickedText: target.text || candidate.text,
    clickedSelector: target.selector,
    blockedCandidates,
    selectedCandidate,
    urlBefore,
    urlAfter: resolvedHandoffUrlAfter,
    popupOccurred,
    usedPopup: navigation === "popup" || navigation === "new-page",
    downstreamConfirmed: resolvedHandoffClickSucceeded,
  } satisfies ResolvedHandoffClickResult;

  console.log("[AUTO_APPLY_RESOLVED_HANDOFF_CLICK]", {
    resolvedHandoffClickAttempted: result.attempted,
    resolvedHandoffElementFound: result.targetFound,
    resolvedHandoffLocatorStrategy: result.locatorStrategy,
    resolvedHandoffClickSucceeded: result.succeeded,
    resolvedHandoffDirectNavAttempted: result.directNavAttempted,
    resolvedHandoffDirectNavSucceeded: result.directNavSucceeded,
    resolvedHandoffDirectNavUrl: result.directNavUrl ?? null,
    resolvedHandoffDirectNavUrlAfter: result.directNavUrlAfter ?? null,
    resolvedHandoffClickedHref: result.clickedHref ?? null,
    resolvedHandoffClickedText: result.clickedText ?? null,
    selectedResolvedHandoffCandidate: selectedCandidate,
    blockedResolvedHandoffCandidates: blockedCandidates,
    resolvedHandoffUrlBefore: result.urlBefore,
    resolvedHandoffUrlAfter: result.urlAfter,
    currentUrl: activePage.url(),
  });

  return result;
}

async function clickHandoffCtaCandidate(args: {
  page: Page;
  context: BrowserContext;
  candidate: EntryCtaCandidate;
  step: number;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}) {
  const fromUrl = args.page.url();
  const locator = args.page.locator(args.candidate.selector).first();
  const overlayInspection = isAdzunaLandRedirectPage(fromUrl)
    ? await inspectAdzunaHandoffOverlay({
        page: args.page,
        selector: args.candidate.selector,
      })
    : {
        overlayDetected: false,
        overlayDismissed: false,
        overlayType: undefined,
        overlaySelectorsTried: [...BLOCKER_SURFACE_SELECTORS],
      };
  const popupPromise = args.page
    .waitForEvent("popup", { timeout: 4_000 })
    .catch(() => null);
  const contextPagePromise = args.context
    .waitForEvent("page", { timeout: 4_000 })
    .catch(() => null);
  const navigationPromise = args.page
    .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 12_000 })
    .catch(() => null);

  console.log("[AUTO_APPLY_HANDOFF] attempting", {
    step: args.step,
    fromUrl,
    selector: args.candidate.selector,
    text: args.candidate.text,
    matchedText: args.candidate.matchedText,
    overlayDetected: overlayInspection.overlayDetected,
    overlayType: overlayInspection.overlayType ?? null,
  });

  try {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.click({ timeout: 6_000 });
  } catch {
    if (overlayInspection.overlayDetected) {
      try {
        await locator.click({ force: true, timeout: 6_000 });
      } catch {
        return {
          page: args.page,
          click: null,
          popupOccurred: false,
          usedPopup: false,
          downstreamConfirmed: false,
          overlayDetected: overlayInspection.overlayDetected,
          overlayDismissed: overlayInspection.overlayDismissed,
          overlayType: overlayInspection.overlayType,
          overlaySelectorsTried: overlayInspection.overlaySelectorsTried,
          attempt: {
            phase: "handoff",
            action: "click",
            selector: args.candidate.selector,
            text: args.candidate.text,
            matchedText: args.candidate.matchedText,
            locatorStrategy: "visible_text_ranked",
            candidateFound: true,
            dismissesBlocker: false,
            success: false,
            urlBefore: fromUrl,
            urlAfter: args.page.url(),
          } satisfies ApplySessionCtaAttemptRecord,
        };
      }
    } else {
      return {
        page: args.page,
        click: null,
        popupOccurred: false,
        usedPopup: false,
        downstreamConfirmed: false,
        overlayDetected: overlayInspection.overlayDetected,
        overlayDismissed: overlayInspection.overlayDismissed,
        overlayType: overlayInspection.overlayType,
        overlaySelectorsTried: overlayInspection.overlaySelectorsTried,
        attempt: {
          phase: "handoff",
          action: "click",
          selector: args.candidate.selector,
          text: args.candidate.text,
          matchedText: args.candidate.matchedText,
          locatorStrategy: "visible_text_ranked",
          candidateFound: true,
          dismissesBlocker: false,
          success: false,
          urlBefore: fromUrl,
          urlAfter: args.page.url(),
        } satisfies ApplySessionCtaAttemptRecord,
      };
    }

    // If we made it here, a forced retry succeeded.
  }

  const [popupPage, contextPage] = await Promise.all([
    popupPromise,
    contextPagePromise,
  ]);

  let nextPage = args.page;
  let navigation: ApplySessionClickRecord["navigation"] = "same-tab";

  if (popupPage) {
    nextPage = popupPage;
    navigation = "popup";
  } else if (contextPage && contextPage !== args.page) {
    nextPage = contextPage;
    navigation = "new-page";
  } else {
    await navigationPromise;
  }

  await waitForDomAndSettle(nextPage);
  await args.onPageReady?.(nextPage, args.context);

  const popupOccurred = Boolean(popupPage || (contextPage && contextPage !== args.page));
  const downstreamConfirmed = await hasReachedPostHandoffDestination(nextPage);

  return {
    page: nextPage,
    click: {
      hop: args.step,
      fromUrl,
      toUrl: nextPage.url(),
      selector: args.candidate.selector,
      text: args.candidate.text,
      navigation,
    } satisfies ApplySessionClickRecord,
    popupOccurred,
    usedPopup: navigation === "popup" || navigation === "new-page",
    downstreamConfirmed,
    overlayDetected: overlayInspection.overlayDetected,
    overlayDismissed: overlayInspection.overlayDismissed,
    overlayType: overlayInspection.overlayType,
    overlaySelectorsTried: overlayInspection.overlaySelectorsTried,
    attempt: {
      phase: "handoff",
      action: "click",
      selector: args.candidate.selector,
      text: args.candidate.text,
      matchedText: args.candidate.matchedText,
      locatorStrategy: "visible_text_ranked",
      candidateFound: true,
      dismissesBlocker: false,
      success: true,
      urlBefore: fromUrl,
      urlAfter: nextPage.url(),
    } satisfies ApplySessionCtaAttemptRecord,
  };
}

async function waitForHandoffAutoRedirect(page: Page, fromUrl: string) {
  await page
    .waitForURL((url) => url.toString() !== fromUrl, {
      timeout: 6_500,
    })
    .catch(() => null);
  await waitForDomAndSettle(page);
  return page.url() !== fromUrl;
}

async function hasReachedPostHandoffDestination(page: Page) {
  const currentUrl = page.url();
  if (isDiceJobDetailPage(currentUrl)) {
    return true;
  }

  if (isAdzunaLandRedirectPage(currentUrl) || isAppcastTrackingPage(currentUrl)) {
    return false;
  }

  if (isLikelyDownstreamApplicationUrl(currentUrl)) {
    return true;
  }

  const hostname = parseHostname(currentUrl);
  if (hostname && !isAdzunaUrl(currentUrl)) {
    return true;
  }

  const signals = await detectPageSignals(page);
  return isImmediateApplyDestinationPage({
    hostname,
    currentUrl,
    signals,
  });
}

async function runHandoffContinuationPhase(args: {
  page: Page;
  context: BrowserContext;
  resolverSelectedLink?: string;
  resolverCandidates: ApplySourceCandidate[];
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
}): Promise<HandoffContinuationResult> {
  let activePage = args.page;
  const initialUrl = activePage.url();
  const initialLandState = classifyAdzunaLandPage(initialUrl);
  const urlsVisited = [initialUrl];
  const clicks: ApplySessionClickRecord[] = [];
  const attempts: ApplySessionCtaAttemptRecord[] = [];
  const seenCandidates = new Set<string>();
  const seenScanAttempts = new Set<string>();
  let discoveredResolverCandidates =
    args.resolverCandidates.slice();
  let discoveredResolverRejectedCandidates:
    ApplySourceRejectedCandidate[] = [];
  let ctaFound = false;
  let ctaClicked = false;
  let ctaClickedText: string | undefined;
  let ctaClickedSelector: string | undefined;
  let resolvedHandoffClickAttempted = false;
  let resolvedHandoffClickSucceeded = false;
  let resolvedHandoffElementFound = false;
  let resolvedHandoffLocatorStrategy: string | undefined = undefined;
  let resolvedHandoffDirectNavAttempted = false;
  let resolvedHandoffDirectNavSucceeded = false;
  let resolvedHandoffDirectNavUrl: string | undefined = undefined;
  let resolvedHandoffDirectNavUrlAfter: string | undefined = undefined;
  let adzunaFallbackLinkFound = false;
  let adzunaFallbackLinkClicked = false;
  let adzunaFallbackLinkText: string | undefined = undefined;
  let adzunaFallbackLocatorStrategy: string | undefined = undefined;
  let adzunaFallbackElementFound = false;
  let adzunaFallbackClickSucceeded = false;
  let adzunaFallbackHref: string | undefined = undefined;
  let adzunaFallbackHost: string | undefined = undefined;
  let adzunaFallbackDirectNavAttempted = false;
  let adzunaFallbackDirectNavSucceeded = false;
  let adzunaExtractedRedirectUrl: string | undefined = undefined;
  let adzunaExtractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate"
    | undefined = undefined;
  let adzunaExtractedRedirectHtmlRead = false;
  let adzunaExtractedRedirectFailureReason: string[] | undefined = undefined;
  let adzunaExtractedRedirectNavAttempted = false;
  let adzunaExtractedRedirectNavSucceeded = false;
  let adzunaFallbackUrlAfter: string | undefined = undefined;
  let resolvedHandoffClickedHref: string | undefined = undefined;
  let resolvedHandoffClickedText: string | undefined = undefined;
  let resolvedHandoffUrlBefore: string | undefined = undefined;
  let resolvedHandoffUrlAfter: string | undefined = undefined;
  let blockedResolvedHandoffCandidates:
    ApplySourceRejectedCandidate[] = [];
  let selectedResolvedHandoffCandidate: string | undefined = undefined;
  let adzunaTokenizedInterstitialDetected =
    initialLandState.isTokenizedInterstitial;
  let adzunaTokenizedParamsPresent =
    initialLandState.tokenizedParamsPresent.slice();
  let adzunaDownstreamCandidates: string[] = [];
  let adzunaScriptRedirectCandidates: string[] = [];
  let adzunaHandoffPageTitle: string | undefined;
  let adzunaHandoffVisibleCtas: string[] = [];
  let adzunaOverlayDetected = false;
  let adzunaOverlayDismissed = false;
  let adzunaOverlayType: string | undefined;
  let adzunaOverlaySelectorsTried: string[] = [];
  let adzunaHandoffPopupOccurred = false;
  let adzunaHandoffUsedPopup = false;
  let adzunaDownstreamConfirmed = false;
  const networkCapture = adzunaTokenizedInterstitialDetected
    ? startAdzunaNetworkRedirectCapture(activePage)
    : null;
  let cachedNetworkRedirectCandidates: string[] | undefined;
  const getNetworkRedirectCandidates = () => {
    cachedNetworkRedirectCandidates =
      cachedNetworkRedirectCandidates ??
      networkCapture?.stop() ??
      [];
    return cachedNetworkRedirectCandidates;
  };

  const handoffPageDetected = isAdzunaLandRedirectPage(initialUrl);
  const handoffUrl = handoffPageDetected ? initialUrl : undefined;
  const recordUrl = () => {
    const current = activePage.url();
    if (!urlsVisited.includes(current)) {
      urlsVisited.push(current);
    }
    return current;
  };
  const getKnownChainState = () => {
    const knownUrls = dedupeUrls([initialUrl, ...urlsVisited, activePage.url()]);
    const adzunaInterstitialRecognized = knownUrls.some((url) =>
      isAdzunaLandRedirectPage(url),
    );
    const appcastHopDetected = knownUrls.some((url) =>
      isAppcastTrackingPage(url),
    );
    const diceDestinationDetected = knownUrls.some((url) =>
      isDiceJobDetailPage(url),
    );

    return {
      adzunaInterstitialRecognized,
      appcastHopDetected,
      diceDestinationDetected,
      handoffResolvedViaKnownChain:
        adzunaInterstitialRecognized &&
        appcastHopDetected &&
        diceDestinationDetected,
    };
  };
  const continueKnownHandoffChain = async (stage: string) => {
    const startingState = getKnownChainState();

    console.log("[AUTO_APPLY_ADZUNA_KNOWN_CHAIN]", {
      stage,
      currentUrl: activePage.url(),
      ...startingState,
      urlsVisited,
    });

    if (isAppcastTrackingPage(activePage.url())) {
      console.log("[AUTO_APPLY_APPCAST_HOP]", {
        stage,
        currentUrl: activePage.url(),
        urlsVisited,
      });

      const chainedProgress = await waitForTrackedHandoffRedirects({
        page: activePage,
        context: args.context,
        onPageReady: args.onPageReady,
      });

      activePage = chainedProgress.page;
      for (const url of chainedProgress.urlsVisited) {
        if (!urlsVisited.includes(url)) {
          urlsVisited.push(url);
        }
      }
      recordUrl();
    }

    const endingState = getKnownChainState();
    if (endingState.diceDestinationDetected) {
      console.log("[AUTO_APPLY_DICE_DESTINATION]", {
        stage,
        currentUrl: activePage.url(),
        urlsVisited,
        ...endingState,
      });
    }

    return (
      endingState.diceDestinationDetected ||
      (await hasReachedPostHandoffDestination(activePage))
    );
  };
  const finalize = (continuationSucceeded: boolean) => {
    const result = {
      page: activePage,
      urlsVisited,
      clicks,
      attempts,
      discoveredResolverCandidates,
      discoveredResolverRejectedCandidates,
      handoffPageDetected,
      handoffUrl,
      continuationAttempted: handoffPageDetected,
      continuationSucceeded,
      ctaFound,
      ctaClicked,
      ctaClickedText,
      ctaClickedSelector,
      resolvedHandoffClickAttempted,
      resolvedHandoffClickSucceeded,
      resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy,
      resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl,
      resolvedHandoffDirectNavUrlAfter,
      adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked,
      adzunaFallbackLinkText,
      adzunaFallbackLocatorStrategy,
      adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded,
      adzunaFallbackHref,
      adzunaFallbackHost,
      adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl,
      adzunaExtractedRedirectSource,
      adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason,
      adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter,
      adzunaTokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent,
      adzunaDownstreamCandidates,
      adzunaScriptRedirectCandidates,
      adzunaNetworkRedirectCandidates: getNetworkRedirectCandidates(),
      adzunaHandoffPageTitle,
      adzunaHandoffVisibleCtas,
      adzunaOverlayDetected,
      adzunaOverlayDismissed,
      adzunaOverlayType,
      adzunaOverlaySelectorsTried,
      adzunaHandoffPopupOccurred,
      adzunaHandoffUsedPopup,
      adzunaDownstreamConfirmed,
      ...getKnownChainState(),
      resolvedHandoffClickedHref,
      resolvedHandoffClickedText,
      resolvedHandoffUrlBefore,
      resolvedHandoffUrlAfter,
      blockedResolvedHandoffCandidates,
      selectedResolvedHandoffCandidate,
    } satisfies HandoffContinuationResult;

    console.log("[AUTO_APPLY_HANDOFF]", {
      handoffUrl,
      handoffContinuationAttempted: result.continuationAttempted,
      handoffContinuationSucceeded: result.continuationSucceeded,
      handoffCtaFound: result.ctaFound,
      handoffCtaClicked: result.ctaClicked,
      handoffCtaClickedText: result.ctaClickedText ?? null,
      handoffCtaClickedSelector: result.ctaClickedSelector ?? null,
      handoffAttempts: result.attempts,
      resolvedHandoffClickAttempted: result.resolvedHandoffClickAttempted,
      resolvedHandoffClickSucceeded: result.resolvedHandoffClickSucceeded,
      resolvedHandoffElementFound: result.resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy:
        result.resolvedHandoffLocatorStrategy ?? null,
      resolvedHandoffDirectNavAttempted:
        result.resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded:
        result.resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl:
        result.resolvedHandoffDirectNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter:
        result.resolvedHandoffDirectNavUrlAfter ?? null,
      adzunaFallbackLinkFound: result.adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked: result.adzunaFallbackLinkClicked,
      adzunaFallbackLinkText: result.adzunaFallbackLinkText ?? null,
      adzunaFallbackLocatorStrategy:
        result.adzunaFallbackLocatorStrategy ?? null,
      adzunaFallbackElementFound: result.adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded: result.adzunaFallbackClickSucceeded,
      adzunaFallbackHref: result.adzunaFallbackHref ?? null,
      adzunaFallbackHost: result.adzunaFallbackHost ?? null,
      adzunaFallbackDirectNavAttempted:
        result.adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded:
        result.adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl:
        result.adzunaExtractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        result.adzunaExtractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead:
        result.adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        result.adzunaExtractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted:
        result.adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded:
        result.adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: result.adzunaFallbackUrlAfter ?? null,
      adzunaTokenizedInterstitialDetected:
        result.adzunaTokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent:
        result.adzunaTokenizedParamsPresent,
      adzunaDownstreamCandidates: result.adzunaDownstreamCandidates,
      adzunaScriptRedirectCandidates:
        result.adzunaScriptRedirectCandidates,
      adzunaNetworkRedirectCandidates:
        result.adzunaNetworkRedirectCandidates,
      adzunaHandoffPageTitle: result.adzunaHandoffPageTitle ?? null,
      adzunaHandoffVisibleCtas: result.adzunaHandoffVisibleCtas,
      adzunaOverlayDetected: result.adzunaOverlayDetected,
      adzunaOverlayDismissed: result.adzunaOverlayDismissed,
      adzunaOverlayType: result.adzunaOverlayType ?? null,
      adzunaOverlaySelectorsTried: result.adzunaOverlaySelectorsTried,
      adzunaHandoffPopupOccurred: result.adzunaHandoffPopupOccurred,
      adzunaHandoffUsedPopup: result.adzunaHandoffUsedPopup,
      adzunaDownstreamConfirmed: result.adzunaDownstreamConfirmed,
      adzunaInterstitialRecognized:
        result.adzunaInterstitialRecognized,
      appcastHopDetected: result.appcastHopDetected,
      diceDestinationDetected: result.diceDestinationDetected,
      handoffResolvedViaKnownChain:
        result.handoffResolvedViaKnownChain,
      resolvedHandoffClickedHref: result.resolvedHandoffClickedHref ?? null,
      resolvedHandoffClickedText: result.resolvedHandoffClickedText ?? null,
      resolvedHandoffUrlBefore: result.resolvedHandoffUrlBefore ?? null,
      resolvedHandoffUrlAfter: result.resolvedHandoffUrlAfter ?? null,
      blockedResolvedHandoffCandidates:
        result.blockedResolvedHandoffCandidates,
      selectedResolvedHandoffCandidate:
        result.selectedResolvedHandoffCandidate ?? null,
      currentUrl: activePage.url(),
    });

    return result;
  };

  if (!handoffPageDetected) {
    return finalize(false);
  }

  console.log("[AUTO_APPLY_ADZUNA_INTERSTITIAL_CONTINUE]", {
    handoffUrl,
    currentUrl: activePage.url(),
    stage: "start",
    adzunaTokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent,
  });

  const autoRedirected = await waitForHandoffAutoRedirect(activePage, initialUrl);
  recordUrl();

  console.log("[AUTO_APPLY_ADZUNA_INTERSTITIAL_CONTINUE]", {
    handoffUrl,
    currentUrl: activePage.url(),
    stage: "after_auto_redirect_wait",
    autoRedirected,
  });

  if (
    autoRedirected &&
    (await continueKnownHandoffChain("auto_redirect_wait"))
  ) {
    adzunaDownstreamConfirmed = true;
    return finalize(true);
  }

  const startingSignals = await extractAdzunaHandoffSignals(activePage).catch(
    () => undefined,
  );
  if (startingSignals) {
    adzunaHandoffPageTitle = startingSignals.pageTitle;
    adzunaHandoffVisibleCtas = startingSignals.likelyCtas;
  }

  const initialOverlayInspection = await inspectAdzunaHandoffOverlay({
    page: activePage,
  });
  adzunaOverlayDetected =
    adzunaOverlayDetected || initialOverlayInspection.overlayDetected;
  adzunaOverlayType =
    initialOverlayInspection.overlayType ?? adzunaOverlayType;
  adzunaOverlaySelectorsTried = Array.from(
    new Set([
      ...adzunaOverlaySelectorsTried,
      ...initialOverlayInspection.overlaySelectorsTried,
    ]),
  );

  if (initialOverlayInspection.overlayDetected) {
    const overlayCookiePhase = await dismissCookieConsentIfPresent({
      page: activePage,
      context: args.context,
      onPageReady: args.onPageReady,
    });
    activePage = overlayCookiePhase.page;
    for (const attempt of overlayCookiePhase.attempts) {
      attempts.push(attempt);
      if (attempt.candidateFound) {
        ctaFound = true;
      }
    }
    if (overlayCookiePhase.clicks.length > 0) {
      clicks.push(...overlayCookiePhase.clicks);
      adzunaHandoffPopupOccurred =
        adzunaHandoffPopupOccurred ||
        overlayCookiePhase.clicks.some(
          (click) => click.navigation === "popup" || click.navigation === "new-page",
        );
      adzunaHandoffUsedPopup = adzunaHandoffPopupOccurred;
    }
    for (const url of overlayCookiePhase.urlsVisited) {
      if (!urlsVisited.includes(url)) {
        urlsVisited.push(url);
      }
    }
    const postOverlayInspection = await inspectAdzunaHandoffOverlay({
      page: activePage,
    });
    adzunaOverlayDismissed =
      adzunaOverlayDismissed ||
      (initialOverlayInspection.overlayDetected &&
        !postOverlayInspection.overlayDetected);
    adzunaOverlayDetected =
      adzunaOverlayDetected || postOverlayInspection.overlayDetected;
    adzunaOverlayType =
      postOverlayInspection.overlayType ?? adzunaOverlayType;
    adzunaOverlaySelectorsTried = Array.from(
      new Set([
        ...adzunaOverlaySelectorsTried,
        ...postOverlayInspection.overlaySelectorsTried,
      ]),
    );

    const refreshedSignals = await extractAdzunaHandoffSignals(activePage).catch(
      () => undefined,
    );
    if (refreshedSignals) {
      adzunaHandoffPageTitle =
        refreshedSignals.pageTitle ?? adzunaHandoffPageTitle;
      adzunaHandoffVisibleCtas =
        refreshedSignals.likelyCtas.length > 0
          ? refreshedSignals.likelyCtas
          : adzunaHandoffVisibleCtas;
    }
  }

  const adzunaFallbackResult = await clickAdzunaFallbackLinkIfStuck({
    page: activePage,
    context: args.context,
    onPageReady: args.onPageReady,
  });

  activePage = adzunaFallbackResult.page;
  adzunaFallbackLinkFound = adzunaFallbackResult.found;
  adzunaFallbackLinkClicked = adzunaFallbackResult.clicked;
  adzunaFallbackLinkText = adzunaFallbackResult.text;
  adzunaFallbackLocatorStrategy = adzunaFallbackResult.locatorStrategy;
  adzunaFallbackElementFound = adzunaFallbackResult.elementFound;
  adzunaFallbackClickSucceeded = adzunaFallbackResult.clickSucceeded;
  adzunaFallbackHref = adzunaFallbackResult.href;
  adzunaFallbackHost = adzunaFallbackResult.host;
  adzunaFallbackDirectNavAttempted =
    adzunaFallbackResult.directNavAttempted;
  adzunaFallbackDirectNavSucceeded =
    adzunaFallbackResult.directNavSucceeded;
  adzunaExtractedRedirectUrl =
    adzunaFallbackResult.extractedRedirectUrl;
  adzunaExtractedRedirectSource =
    adzunaFallbackResult.extractedRedirectSource;
  adzunaExtractedRedirectHtmlRead =
    adzunaFallbackResult.extractedRedirectHtmlRead;
  adzunaExtractedRedirectFailureReason =
    adzunaFallbackResult.extractedRedirectFailureReason;
  adzunaExtractedRedirectNavAttempted =
    adzunaFallbackResult.extractedRedirectNavAttempted;
  adzunaExtractedRedirectNavSucceeded =
    adzunaFallbackResult.extractedRedirectNavSucceeded;
  adzunaFallbackUrlAfter = adzunaFallbackResult.urlAfter;
  adzunaTokenizedInterstitialDetected =
    adzunaFallbackResult.tokenizedInterstitialDetected;
  adzunaTokenizedParamsPresent =
    adzunaFallbackResult.tokenizedParamsPresent;
  adzunaDownstreamCandidates =
    adzunaFallbackResult.downstreamCandidates;
  adzunaScriptRedirectCandidates =
    adzunaFallbackResult.scriptRedirectCandidates;

  console.log("[AUTO_APPLY_ADZUNA_INTERSTITIAL_CONTINUE]", {
    handoffUrl,
    currentUrl: activePage.url(),
    stage: "after_extraction_attempt",
    adzunaExtractedRedirectHtmlRead,
    adzunaExtractedRedirectUrl: adzunaExtractedRedirectUrl ?? null,
    adzunaExtractedRedirectSource: adzunaExtractedRedirectSource ?? null,
    adzunaExtractedRedirectFailureReason:
      adzunaExtractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded,
    adzunaTokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent,
    adzunaDownstreamCandidates,
    adzunaScriptRedirectCandidates,
    adzunaNetworkRedirectCandidates: networkCapture?.snapshot() ?? [],
  });

  for (const attempt of adzunaFallbackResult.attempts) {
    attempts.push(attempt);
    if (attempt.candidateFound) {
      ctaFound = true;
    }
  }

  if (adzunaFallbackResult.clicks.length > 0) {
    clicks.push(...adzunaFallbackResult.clicks);
    ctaClicked = true;
    ctaClickedText = adzunaFallbackResult.text;
    ctaClickedSelector = adzunaFallbackResult.selector;
  }

  for (const url of adzunaFallbackResult.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  if (
    adzunaFallbackResult.clicked &&
    (await continueKnownHandoffChain("adzuna_fallback"))
  ) {
    adzunaDownstreamConfirmed = true;
    return finalize(true);
  }

  if (classifyAdzunaAuthPage(activePage.url()).isAuthPage) {
    console.info("[AUTO_APPLY_ADZUNA_AUTH_GATE]", {
      currentUrl: activePage.url(),
      stage: "post_interstitial_resolution",
    });
    return finalize(false);
  }

  if (discoveredResolverCandidates.length === 0) {
    const discoveredResolverResult = await collectApplySourceCandidates(
      activePage,
    ).catch(() => ({
      candidates: [] as ApplySourceCandidate[],
      rejectedCandidates: [] as ApplySourceRejectedCandidate[],
    }));

    discoveredResolverCandidates = discoveredResolverResult.candidates;
    discoveredResolverRejectedCandidates =
      discoveredResolverResult.rejectedCandidates;
  }

  const resolvedHandoffResult = await clickResolvedHandoffCandidateIfStuck({
    page: activePage,
    context: args.context,
    resolverSelectedLink: args.resolverSelectedLink,
    resolverCandidates: discoveredResolverCandidates,
    onPageReady: args.onPageReady,
  });

  activePage = resolvedHandoffResult.page;
  resolvedHandoffClickAttempted = resolvedHandoffResult.attempted;
  resolvedHandoffClickSucceeded = resolvedHandoffResult.succeeded;
  resolvedHandoffElementFound = resolvedHandoffResult.targetFound;
  resolvedHandoffLocatorStrategy = resolvedHandoffResult.locatorStrategy;
  resolvedHandoffDirectNavAttempted = resolvedHandoffResult.directNavAttempted;
  resolvedHandoffDirectNavSucceeded = resolvedHandoffResult.directNavSucceeded;
  resolvedHandoffDirectNavUrl = resolvedHandoffResult.directNavUrl;
  resolvedHandoffDirectNavUrlAfter = resolvedHandoffResult.directNavUrlAfter;
  resolvedHandoffClickedHref = resolvedHandoffResult.clickedHref;
  resolvedHandoffClickedText = resolvedHandoffResult.clickedText;
  resolvedHandoffUrlBefore = resolvedHandoffResult.urlBefore;
  resolvedHandoffUrlAfter = resolvedHandoffResult.urlAfter;
  blockedResolvedHandoffCandidates =
    resolvedHandoffResult.blockedCandidates;
  selectedResolvedHandoffCandidate =
    resolvedHandoffResult.selectedCandidate;

  for (const attempt of resolvedHandoffResult.attempts) {
    attempts.push(attempt);
    if (attempt.candidateFound) {
      ctaFound = true;
    }
  }

  if (resolvedHandoffResult.clicks.length > 0) {
    clicks.push(...resolvedHandoffResult.clicks);
    ctaClicked = true;
    ctaClickedText = resolvedHandoffResult.clickedText;
    ctaClickedSelector = resolvedHandoffResult.clickedSelector;
  }

  for (const url of resolvedHandoffResult.urlsVisited) {
    if (!urlsVisited.includes(url)) {
      urlsVisited.push(url);
    }
  }

  if (
    resolvedHandoffResult.succeeded &&
    (await continueKnownHandoffChain("resolved_handoff"))
  ) {
    adzunaHandoffPopupOccurred =
      adzunaHandoffPopupOccurred ||
      Boolean(resolvedHandoffResult.popupOccurred);
    adzunaHandoffUsedPopup =
      adzunaHandoffUsedPopup || Boolean(resolvedHandoffResult.usedPopup);
    adzunaDownstreamConfirmed =
      adzunaDownstreamConfirmed ||
      Boolean(resolvedHandoffResult.downstreamConfirmed);
    return finalize(true);
  }

  adzunaHandoffPopupOccurred =
    adzunaHandoffPopupOccurred ||
    Boolean(resolvedHandoffResult.popupOccurred);
  adzunaHandoffUsedPopup =
    adzunaHandoffUsedPopup || Boolean(resolvedHandoffResult.usedPopup);
  adzunaDownstreamConfirmed =
    adzunaDownstreamConfirmed ||
    Boolean(resolvedHandoffResult.downstreamConfirmed);

  if (classifyAdzunaAuthPage(activePage.url()).isAuthPage) {
    console.info("[AUTO_APPLY_ADZUNA_AUTH_GATE]", {
      currentUrl: activePage.url(),
      stage: "post_resolved_handoff",
    });
    return finalize(false);
  }

  for (let step = 1; step <= HANDOFF_CTA_MAX_STEPS; step += 1) {
    const scanAttempts = await scanHandoffCtaConfigs(activePage);
    for (const scanAttempt of scanAttempts) {
      const signature = `${scanAttempt.urlBefore}|${scanAttempt.matchedText}|${scanAttempt.action}`;
      if (seenScanAttempts.has(signature)) continue;
      seenScanAttempts.add(signature);
      attempts.push(scanAttempt);
      if (scanAttempt.candidateFound) {
        ctaFound = true;
      }
    }

    const candidate = await findHandoffCtaCandidate(activePage);
    if (!candidate) {
      break;
    }
    ctaFound = true;

    const signature = `${activePage.url()}|${candidate.selector}|${candidate.text}`;
    if (seenCandidates.has(signature)) {
      break;
    }
    seenCandidates.add(signature);

    const result = await clickHandoffCtaCandidate({
      page: activePage,
      context: args.context,
      candidate,
      step,
      onPageReady: args.onPageReady,
    });

    attempts.push(result.attempt);
    activePage = result.page;
    recordUrl();

    if (result.click) {
      clicks.push(result.click);
      ctaClicked = true;
      ctaClickedText = candidate.text;
      ctaClickedSelector = candidate.selector;
    }
    adzunaOverlayDetected =
      adzunaOverlayDetected || Boolean(result.overlayDetected);
    adzunaOverlayDismissed =
      adzunaOverlayDismissed || Boolean(result.overlayDismissed);
    adzunaOverlayType = result.overlayType ?? adzunaOverlayType;
    adzunaOverlaySelectorsTried = Array.from(
      new Set([
        ...adzunaOverlaySelectorsTried,
        ...(result.overlaySelectorsTried ?? []),
      ]),
    );
    adzunaHandoffPopupOccurred =
      adzunaHandoffPopupOccurred || Boolean(result.popupOccurred);
    adzunaHandoffUsedPopup =
      adzunaHandoffUsedPopup || Boolean(result.usedPopup);
    adzunaDownstreamConfirmed =
      adzunaDownstreamConfirmed || Boolean(result.downstreamConfirmed);

    const redirectedAfterClick = await waitForHandoffAutoRedirect(
      activePage,
      result.attempt.urlAfter ?? activePage.url(),
    );
    recordUrl();

    if (
      (redirectedAfterClick || result.click) &&
      (await continueKnownHandoffChain(`handoff_cta_${step}`))
    ) {
      adzunaDownstreamConfirmed = true;
      return finalize(true);
    }

    if (classifyAdzunaAuthPage(activePage.url()).isAuthPage) {
      console.info("[AUTO_APPLY_ADZUNA_AUTH_GATE]", {
        currentUrl: activePage.url(),
        stage: `handoff_cta_${step}`,
      });
      return finalize(false);
    }

    if (
      !isAdzunaLandRedirectPage(activePage.url()) &&
      !isAppcastTrackingPage(activePage.url())
    ) {
      break;
    }
  }

  if (await continueKnownHandoffChain("before_finalize")) {
    adzunaDownstreamConfirmed = true;
    return finalize(true);
  }

  const finalSignals = await extractAdzunaHandoffSignals(activePage).catch(
    () => undefined,
  );
  if (finalSignals) {
    adzunaHandoffPageTitle = finalSignals.pageTitle ?? adzunaHandoffPageTitle;
    adzunaHandoffVisibleCtas =
      finalSignals.likelyCtas.length > 0
        ? finalSignals.likelyCtas
        : adzunaHandoffVisibleCtas;
  }

  return finalize(false);
}

function mergePreludeIntoChase(args: {
  preludeUrlsVisited: string[];
  preludeClicks: ApplySessionClickRecord[];
  chase: CtaChaseResult;
}): CtaChaseResult {
  const mergedUrlsVisited = dedupeUrls([
    ...args.preludeUrlsVisited,
    ...args.chase.urlsVisited,
  ]);
  const hopCount = args.preludeClicks.length + args.chase.hopCount;
  const clicks = [...args.preludeClicks, ...args.chase.clicks];

  if ("unavailable" in args.chase && args.chase.unavailable) {
    return {
      ...args.chase,
      hopCount,
      urlsVisited: mergedUrlsVisited,
      clicks,
    };
  }

  return {
    ...args.chase,
    hopCount,
    urlsVisited: mergedUrlsVisited,
    clicks,
  };
}

async function collectApplySourceCandidates(
  page: Page,
): Promise<{
  candidates: ApplySourceCandidate[];
  rejectedCandidates: ApplySourceRejectedCandidate[];
}> {
  const currentUrl = page.url();
  const currentHostname = parseHostname(currentUrl);
  const snapshots = await page
    .locator("a")
    .evaluateAll(
      (anchors, args) => {
        function isVisible(element: Element) {
          if (!(element instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        }

        const seen = new Set<string>();
        const results: ApplySourceAnchorSnapshot[] = [];

        for (const anchor of anchors) {
          if (!(anchor instanceof HTMLAnchorElement)) continue;

          const rawHref = anchor.getAttribute("href")?.trim();
          if (!rawHref) continue;

          let absoluteHref = "";
          let url: URL | null = null;

          try {
            url = new URL(rawHref, args.currentUrl);
            absoluteHref = url.toString();
          } catch {
            continue;
          }

          if (!url || !absoluteHref || seen.has(absoluteHref)) continue;
          seen.add(absoluteHref);

          const text = [
            anchor.textContent ?? "",
            anchor.getAttribute("aria-label") ?? "",
            anchor.getAttribute("title") ?? "",
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240);

          results.push({
            href: absoluteHref,
            hostname: url.hostname.toLowerCase(),
            pathname: url.pathname,
            search: url.search,
            text,
            inMainContent: Boolean(
              anchor.closest(
                "main, article, [role='main'], .job, .job-content, .job-header, .job-details",
              ),
            ),
            inHeaderOrFooter: Boolean(
              anchor.closest("header, footer, nav, [role='navigation']"),
            ),
            visible: isVisible(anchor),
          });
        }

        return results;
      },
      {
        currentUrl,
      },
    )
    .catch(() => []);

  const candidates: ApplySourceCandidate[] = [];
  const rejectedCandidates: ApplySourceRejectedCandidate[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.hostname) {
      continue;
    }

    if (!snapshot.visible) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: "hidden_link",
      });
      continue;
    }

    const rejectReason = isLowValueAggregatorLink({
      currentUrl,
      currentHostname,
      href: snapshot.href,
      hostname: snapshot.hostname,
      pathname: snapshot.pathname,
      search: snapshot.search,
      text: snapshot.text,
      inHeaderOrFooter: snapshot.inHeaderOrFooter,
      inMainContent: snapshot.inMainContent,
    });

    if (rejectReason) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: rejectReason,
      });
      continue;
    }

    const rankedCandidate = rankApplySourceCandidate({
      currentHostname,
      href: snapshot.href,
      hostname: snapshot.hostname,
      pathname: snapshot.pathname,
      text: snapshot.text,
      inMainContent: snapshot.inMainContent,
      inHeaderOrFooter: snapshot.inHeaderOrFooter,
      visible: snapshot.visible,
    });

    if (rankedCandidate.score <= 0) {
      rejectedCandidates.push({
        href: snapshot.href,
        hostname: snapshot.hostname,
        text: snapshot.text,
        reason: "insufficient_apply_signal",
      });
      continue;
    }

    candidates.push(rankedCandidate);
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.href.localeCompare(right.href);
  });

  return {
    candidates: candidates.slice(0, 10),
    rejectedCandidates: rejectedCandidates.slice(0, 15),
  };
}

async function resolveApplySourceFromAggregatorPage(
  page: Page,
): Promise<ApplySourceResolverResult> {
  const { candidates, rejectedCandidates } =
    await collectApplySourceCandidates(page);
  const attemptedLinks = candidates.map((candidate) => candidate.href);
  const selectedLink = attemptedLinks[0];

  if (!selectedLink) {
    const result = {
      attemptedLinks,
      candidates,
      rejectedCandidates,
      success: false,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  }

  try {
    await page.goto(selectedLink, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);

    const result = {
      attemptedLinks,
      candidates,
      rejectedCandidates,
      selectedLink,
      success: true,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  } catch {
    const result = {
      attemptedLinks,
      candidates,
      rejectedCandidates,
      selectedLink,
      success: false,
      newUrl: page.url(),
    } satisfies ApplySourceResolverResult;

    console.log("[AUTO_APPLY_RESOLVER]", result);
    return result;
  }
}

function summarizeApplySourceLinks(args: {
  candidates: ApplySourceCandidate[];
  rejectedCandidates: ApplySourceRejectedCandidate[];
}) {
  const seen = new Set<string>();
  const summaries: string[] = [];

  for (const candidate of [...args.candidates, ...args.rejectedCandidates]) {
    const href = candidate.href?.trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const label = candidate.text?.trim();
    summaries.push(
      label ? `${label.slice(0, 120)} -> ${href}` : href,
    );

    if (summaries.length >= 8) {
      break;
    }
  }

  return summaries;
}

async function readCompactBodyTextPreview(page: Page) {
  const bodyText = await page
    .evaluate(() => {
      return (
        document.body?.innerText ??
        document.body?.textContent ??
        ""
      );
    })
    .catch(() => "");

  const normalized = bodyText.replace(/\s+/g, " ").trim();
  return normalized.length > 0
    ? normalized.slice(0, 420)
    : undefined;
}

function buildUnresolvedAdzunaHandoffFailureReasons(args: {
  currentUrl: string;
  extractedRedirectUrl?: string;
  extractedRedirectFailureReason?: string[];
  fallbackLinkFound: boolean;
  resolvedHandoffElementFound: boolean;
  handoffCtaFound: boolean;
  visibleResolverCandidateCount: number;
  appcastHopDetected: boolean;
  diceDestinationDetected: boolean;
  tokenizedInterstitialDetected?: boolean;
  downstreamCandidateCount?: number;
  scriptRedirectCandidateCount?: number;
  networkRedirectCandidateCount?: number;
}) {
  const reasons = new Set<string>();

  if (!args.extractedRedirectUrl) {
    reasons.add("no_extracted_redirect_url");
  }

  for (const reason of args.extractedRedirectFailureReason ?? []) {
    const normalized = String(reason ?? "").trim();
    if (normalized) {
      reasons.add(normalized);
    }
  }

  if (!args.fallbackLinkFound) {
    reasons.add("no_fallback_anchor_or_button");
  }

  if (
    !args.resolvedHandoffElementFound &&
    args.visibleResolverCandidateCount === 0
  ) {
    reasons.add("no_visible_external_application_link");
  }

  if (
    args.tokenizedInterstitialDetected &&
    (args.downstreamCandidateCount ?? 0) === 0
  ) {
    reasons.add("no_tokenized_downstream_candidate");
  }

  if (
    args.tokenizedInterstitialDetected &&
    (args.scriptRedirectCandidateCount ?? 0) === 0
  ) {
    reasons.add("no_script_redirect_candidate");
  }

  if (
    args.tokenizedInterstitialDetected &&
    (args.networkRedirectCandidateCount ?? 0) === 0
  ) {
    reasons.add("no_network_redirect_candidate");
  }

  if (!args.handoffCtaFound) {
    reasons.add("no_handoff_cta");
  }

  if (!args.appcastHopDetected) {
    reasons.add("no_appcast_hop");
  }

  if (!args.diceDestinationDetected) {
    reasons.add("no_downstream_destination");
  }

  if (isAdzunaLandRedirectPage(args.currentUrl)) {
    reasons.add(
      args.tokenizedInterstitialDetected
        ? "still_on_adzuna_tokenized_interstitial"
        : "still_on_adzuna_interstitial",
    );
  }

  return [...reasons];
}

function buildAdzunaInterstitialFailureMessage(args: {
  currentUrl: string;
  tokenizedInterstitialDetected?: boolean;
  visibleCtaText?: string;
  overlayDetected?: boolean;
  popupOccurred?: boolean;
  pageTitle?: string;
}) {
  const baseMessage =
    args.tokenizedInterstitialDetected ||
    isAdzunaTokenizedInterstitialPage(args.currentUrl)
      ? "Adzuna tokenized interstitial did not expose a usable downstream application URL."
      : "Adzuna handoff page loaded but no downstream employer URL was reached.";
  const details = [
    args.visibleCtaText
      ? `Visible CTA found: ${args.visibleCtaText}.`
      : "Visible CTA found: none.",
    `Overlay detected: ${args.overlayDetected ? "yes" : "no"}.`,
    `Popup opened: ${args.popupOccurred ? "yes" : "no"}.`,
    isAdzunaLandRedirectPage(args.currentUrl)
      ? "Final URL remained on Adzuna."
      : undefined,
    args.pageTitle ? `Page title: ${args.pageTitle}.` : undefined,
  ].filter(Boolean);

  return [baseMessage, ...details].join(" ");
}

async function captureAdzunaHandoffFailureArtifacts(args: {
  page: Page;
  resolverCandidates: ApplySourceCandidate[];
  resolverRejectedCandidates: ApplySourceRejectedCandidate[];
  extractedRedirectUrl?: string;
  extractedRedirectFailureReason?: string[];
  fallbackLinkFound: boolean;
  resolvedHandoffElementFound: boolean;
  handoffCtaFound: boolean;
  appcastHopDetected: boolean;
  diceDestinationDetected: boolean;
  tokenizedInterstitialDetected?: boolean;
  tokenizedParamsPresent?: string[];
  downstreamCandidates?: string[];
  scriptRedirectCandidates?: string[];
  networkRedirectCandidates?: string[];
  finalFailureReason?: string;
}) {
  const adzunaTokenizedParamsPresent =
    args.tokenizedParamsPresent ?? [];
  const adzunaDownstreamCandidates =
    args.downstreamCandidates ?? [];
  const adzunaScriptRedirectCandidates =
    args.scriptRedirectCandidates ?? [];
  const adzunaNetworkRedirectCandidates =
    args.networkRedirectCandidates ?? [];
  const adzunaExternalLinkCandidates = summarizeApplySourceLinks({
    candidates: args.resolverCandidates,
    rejectedCandidates: args.resolverRejectedCandidates,
  });
  const adzunaBodyTextPreview = await readCompactBodyTextPreview(args.page);
  const adzunaHandoffFailureReasons =
    buildUnresolvedAdzunaHandoffFailureReasons({
      currentUrl: args.page.url(),
      extractedRedirectUrl: args.extractedRedirectUrl,
      extractedRedirectFailureReason:
        args.extractedRedirectFailureReason,
      fallbackLinkFound: args.fallbackLinkFound,
      resolvedHandoffElementFound:
        args.resolvedHandoffElementFound,
      handoffCtaFound: args.handoffCtaFound,
      visibleResolverCandidateCount: args.resolverCandidates.length,
      appcastHopDetected: args.appcastHopDetected,
      diceDestinationDetected: args.diceDestinationDetected,
      tokenizedInterstitialDetected:
        args.tokenizedInterstitialDetected,
      downstreamCandidateCount: adzunaDownstreamCandidates.length,
      scriptRedirectCandidateCount:
        adzunaScriptRedirectCandidates.length,
      networkRedirectCandidateCount:
        adzunaNetworkRedirectCandidates.length,
    });

  return {
    adzunaHandoffFailureReasons,
    adzunaExternalLinkCandidates,
    adzunaBodyTextPreview,
    adzunaTokenizedInterstitialDetected:
      args.tokenizedInterstitialDetected === true,
    adzunaTokenizedParamsPresent,
    adzunaDownstreamCandidates,
    adzunaScriptRedirectCandidates,
    adzunaNetworkRedirectCandidates,
    adzunaFinalFailureReason: args.finalFailureReason,
  };
}

function mergeChaseResults(args: {
  initial: CtaChaseResult;
  resolved: CtaChaseResult;
  resolverUrl?: string;
}): CtaChaseResult {
  const mergedUrlsVisited = dedupeUrls([
    ...args.initial.urlsVisited,
    args.resolverUrl ?? "",
    ...args.resolved.urlsVisited,
  ]);
  const hopCount =
    args.initial.hopCount +
    (args.resolverUrl ? 1 : 0) +
    args.resolved.hopCount;
  const clicks = [...args.initial.clicks, ...args.resolved.clicks];
  const attempts = [...args.initial.attempts, ...args.resolved.attempts];
  const attemptedSelectors = [
    ...new Set([
      ...args.initial.attemptedSelectors,
      ...args.resolved.attemptedSelectors,
    ]),
  ];
  const finalReason = args.resolved.finalReason ?? args.initial.finalReason;
  const ctaFound = args.initial.ctaFound || args.resolved.ctaFound;
  const lastActionText =
    args.resolved.lastActionText ?? args.initial.lastActionText;
  const lastActionSelector =
    args.resolved.lastActionSelector ?? args.initial.lastActionSelector;

  if ("unavailable" in args.resolved && args.resolved.unavailable) {
    return {
      ...args.resolved,
      hopCount,
      urlsVisited: mergedUrlsVisited,
      clicks,
      attempts,
      attemptedSelectors,
      ctaFound,
      finalReason,
      lastActionText,
      lastActionSelector,
    };
  }

  return {
    ...args.resolved,
    hopCount,
    urlsVisited: mergedUrlsVisited,
    clicks,
    attempts,
    attemptedSelectors,
    ctaFound,
    finalReason,
    lastActionText,
    lastActionSelector,
  };
}

const ADZUNA_PUBLIC_SEARCH_FALLBACK_FAILURE_MESSAGE =
  "Adzuna handoff did not expose a usable downstream URL, and alternate public job-page discovery did not find a confirmed application path.";

async function runJobSearchFallbackFlow(args: {
  page: Page;
  context: BrowserContext;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  source?: string | null;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
  onStatus?: (update: ApplyStatusUpdate) => Promise<void> | void;
  viewerUrl?: string;
  remoteSessionId?: string;
}): Promise<JobSearchFallbackRunResult> {
  const discovery = await discoverJobSearchFallbackCandidates({
    title: args.title ?? "",
    company: args.company ?? "",
    location: args.location,
    currentUrl: args.page.url(),
    source: args.source,
  });

  const candidates = discovery.candidates.map((candidate) => ({ ...candidate }));
  const acceptedCandidates = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.rejected !== true)
    .slice(0, JOB_SEARCH_FALLBACK_MAX_CANDIDATE_VISITS);

  const fallbackState: JobSearchFallbackDebugState = {
    triggered: true,
    queries: discovery.queries,
    candidates,
    attemptCount: 0,
    success: false,
    failureReason: discovery.error,
  };

  if (acceptedCandidates.length === 0) {
    fallbackState.failureReason =
      discovery.error ??
      "No viable alternate public job-page candidates passed ranking.";
    return {
      ok: false,
      ...fallbackState,
    };
  }

  let activePage = args.page;

  for (const { candidate, index } of acceptedCandidates) {
    fallbackState.attemptCount += 1;

    await args.onStatus?.({
      status: "FINDING_APPLY",
      lastUrl: candidate.url,
      message: "Trying alternate public job pages.",
      viewerUrl: args.viewerUrl,
      openUrl: candidate.url,
      remoteSessionId: args.remoteSessionId,
    });

    console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate visit", {
      attempt: fallbackState.attemptCount,
      rank: index + 1,
      url: candidate.url,
      domain: candidate.domain,
      confidence: candidate.confidence,
      reason: candidate.reason,
    });

    try {
      if (activePage.isClosed()) {
        activePage = await args.context.newPage();
      }

      await activePage.goto(candidate.url, {
        waitUntil: "domcontentloaded",
        timeout: 15_000,
      });
      await waitForDomAndSettle(activePage);
      await args.onPageReady?.(activePage, args.context);
    } catch (error) {
      candidate.rejected = true;
      candidate.rejectionReason = `candidate_navigation_failed:${
        error instanceof Error ? error.message : String(error)
      }`;
      candidate.finalUrl = activePage.url();

      console.warn("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate navigation failed", {
        attempt: fallbackState.attemptCount,
        url: candidate.url,
        error: candidate.rejectionReason,
      });
      continue;
    }

    const initialInspection = await inspectJobSearchFallbackPage(activePage);
    const initialSignals = await detectPageSignals(activePage);
    const initialProgress = confirmJobSearchFallbackProgress({
      initialUrl: candidate.url,
      finalUrl: activePage.url(),
      signals: initialSignals,
      inspection: initialInspection,
    });

    candidate.pageTitle = initialInspection.pageTitle;
    candidate.visibleApplyCta = initialInspection.visibleApplyCta;
    candidate.visibleApplyText = initialInspection.visibleApplyTexts[0];
    candidate.looksLikeJobDetail = initialInspection.looksLikeJobDetail;
    candidate.finalUrl = activePage.url();

    if (initialProgress.ok) {
      candidate.downstreamProgressConfirmed = true;
      candidate.reason = `${candidate.reason}; ${initialProgress.reason}`;
      fallbackState.chosenCandidate = candidate.url;
      fallbackState.success = true;

      console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate succeeded without CTA chase", {
        attempt: fallbackState.attemptCount,
        candidateUrl: candidate.url,
        finalUrl: activePage.url(),
        progressReason: initialProgress.reason,
      });

      return {
        ok: true,
        ...fallbackState,
        page: activePage,
        chase: {
          page: activePage,
          hopCount: 0,
          urlsVisited: dedupeUrls([candidate.url, activePage.url()]),
          clicks: [],
          attempts: [],
          attemptedSelectors: [],
          ctaFound: false,
          signals: initialSignals,
          finalReason: `Search fallback reached a usable application page (${initialProgress.reason}).`,
        },
      };
    }

    if (initialInspection.rejectionReason && !initialInspection.visibleApplyCta) {
      candidate.rejected = true;
      candidate.rejectionReason = initialInspection.rejectionReason;

      console.warn("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate rejected before CTA chase", {
        attempt: fallbackState.attemptCount,
        url: candidate.url,
        rejectionReason: candidate.rejectionReason,
      });
      continue;
    }

    if (!initialInspection.visibleApplyCta) {
      candidate.rejected = true;
      candidate.rejectionReason = "no_visible_apply_cta_on_candidate_page";

      console.warn("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate missing visible apply CTA", {
        attempt: fallbackState.attemptCount,
        url: candidate.url,
      });
      continue;
    }

    const candidateStartUrl = activePage.url();
    const chased = await chaseApplyPath({
      page: activePage,
      context: args.context,
      onPageReady: args.onPageReady,
      onStatus: args.onStatus,
      viewerUrl: args.viewerUrl,
      remoteSessionId: args.remoteSessionId,
      openUrl: candidate.url,
      applicationId: null,
    });

    activePage = chased.page;

    const finalInspection = await inspectJobSearchFallbackPage(activePage);
    const progress = confirmJobSearchFallbackProgress({
      initialUrl: candidateStartUrl,
      finalUrl: activePage.url(),
      signals: chased.signals,
      inspection: finalInspection,
      interactionAttempted: true,
    });

    candidate.pageTitle = finalInspection.pageTitle ?? candidate.pageTitle;
    candidate.visibleApplyCta = finalInspection.visibleApplyCta;
    candidate.visibleApplyText =
      finalInspection.visibleApplyTexts[0] ?? candidate.visibleApplyText;
    candidate.looksLikeJobDetail = finalInspection.looksLikeJobDetail;
    candidate.popupOccurred = chased.clicks.some(
      (click) => click.navigation !== "same-tab",
    );
    candidate.downstreamProgressConfirmed = progress.ok;
    candidate.finalUrl = activePage.url();

    if (progress.ok) {
      candidate.reason = `${candidate.reason}; ${progress.reason}`;
      fallbackState.chosenCandidate = candidate.url;
      fallbackState.success = true;

      console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate succeeded after CTA chase", {
        attempt: fallbackState.attemptCount,
        candidateUrl: candidate.url,
        finalUrl: activePage.url(),
        progressReason: progress.reason,
        popupOccurred: candidate.popupOccurred === true,
      });

      return {
        ok: true,
        ...fallbackState,
        page: activePage,
        chase: chased,
      };
    }

    candidate.rejected = true;
    candidate.rejectionReason =
      finalInspection.rejectionReason ??
      chased.finalReason ??
      progress.reason ??
      "candidate_did_not_reach_application_flow";

    console.warn("[AUTO_APPLY_JOB_SEARCH_FALLBACK] candidate did not confirm downstream progress", {
      attempt: fallbackState.attemptCount,
      candidateUrl: candidate.url,
      finalUrl: activePage.url(),
      rejectionReason: candidate.rejectionReason,
      popupOccurred: candidate.popupOccurred === true,
    });
  }

  fallbackState.failureReason =
    fallbackState.failureReason ??
    "Alternate public job-page discovery did not find a confirmed application path.";

  console.warn("[AUTO_APPLY_JOB_SEARCH_FALLBACK] fallback exhausted", {
    attemptCount: fallbackState.attemptCount,
    failureReason: fallbackState.failureReason,
    queries: fallbackState.queries,
    candidates: fallbackState.candidates.map((candidate) => ({
      url: candidate.url,
      confidence: candidate.confidence,
      rejected: candidate.rejected === true,
      rejectionReason: candidate.rejectionReason ?? null,
      finalUrl: candidate.finalUrl ?? null,
      downstreamProgressConfirmed: candidate.downstreamProgressConfirmed === true,
    })),
  });

  return {
    ok: false,
    ...fallbackState,
  };
}

export async function applyWithPlaywright(args: {
  jobUrl: string;
  form?: {
    embedUrl?: string;
  };
  metadata?: {
    applicationId?: string | null;
    applySessionId?: string | null;
    originalUrl?: string | null;
    resolvedUrl?: string | null;
    source?: string | null;
    title?: string | null;
    company?: string | null;
    location?: string | null;
    strategy?: {
      id?: string | null;
      sourceHost?: string | null;
      destinationHost?: string | null;
      strategyType?: string | null;
      pageType?: string | null;
      derivedInstruction?: string | null;
      automationPrompt?: string | null;
      startUrl?: string | null;
      steps?: ApplySiteStrategyStep[] | null;
    };
    directJobResolution?: Pick<
      DirectJobResolution,
      | "confidence"
      | "provider"
      | "matchReason"
      | "error"
      | "candidates"
    > & { attempted?: boolean };
    userProfile?: unknown;
    resumeText?: string | null;
    resumeSummary?: string | null;
    jobDescription?: string | null;
    reviewBeforeSubmit?: boolean | null;
  };
  values: Record<string, string | string[]>;
  resumePath?: string | null;
  mode?: "AUTO" | "HUMAN_ASSIST";
  freshSession?: boolean;
  onPageReady?: (
    page: Page,
    context: BrowserContext,
  ) => Promise<void> | void;
  onStatus?: (update: ApplyStatusUpdate) => Promise<void> | void;
}): Promise<PlaywrightApplyResult> {
  let browser;
  let context: BrowserContext | undefined;
  let activePage: Page | undefined;
  let page!: Page;
  let remoteSession: Awaited<ReturnType<typeof createRemoteSession>> | null =
    null;
  let keepBrowserOpen = false;
  let headless: boolean | null = null;
  let playwrightLaunchStrategy:
    | "remote"
    | "local_ephemeral"
    | "local_persistent" = "local_ephemeral";
  let playwrightPersistentContext = false;
  let playwrightUserDataDir: string | undefined;
  let browserAutomationLibrary: ApplyBrowserAutomationLibrary = "playwright";
  let playwrightExtraAvailable = false;
  let puppeteerExtraAvailable = false;
  let stealthRequested = false;
  let stealthDependencyInstalled = false;
  let stealthRuntimeEnabled = false;
  let stealthPluginRegistered = false;
  const browserDiagnosticsEnabled =
    parseBooleanEnv(process.env.AUTO_APPLY_BROWSER_DIAGNOSTICS) === true;
  let browserRuntimeDiagnostics: BrowserRuntimeDiagnostics | undefined;

  const attemptedSelectors: string[] = [];
  const missingNames: string[] = [];
  const forceFreshSession = args.freshSession !== false;
  const entryUrl = args.jobUrl;
  const strategyStartUrl = args.metadata?.strategy?.startUrl
    ? normalizeJobUrl(args.metadata.strategy.startUrl)
    : undefined;
  let targetUrl = strategyStartUrl ?? args.form?.embedUrl ?? args.jobUrl;
  const originalJobUrl = args.metadata?.originalUrl
    ? normalizeJobUrl(args.metadata.originalUrl)
    : undefined;
  const resolvedDirectUrl = args.metadata?.resolvedUrl
    ? normalizeJobUrl(args.metadata.resolvedUrl)
    : undefined;
  const applySource = args.metadata?.source?.trim() || undefined;
  const searchJobTitle = args.metadata?.title?.trim() || undefined;
  const searchCompany = args.metadata?.company?.trim() || undefined;
  const searchLocation = args.metadata?.location?.trim() || undefined;
  const strategyMatched =
    Boolean(strategyStartUrl) ||
    Boolean(args.metadata?.strategy?.automationPrompt) ||
    Boolean(args.metadata?.strategy?.derivedInstruction);
  const applicationId = args.metadata?.applicationId?.trim() || undefined;
  const applySessionId = args.metadata?.applySessionId?.trim() || undefined;
  const strategyId = args.metadata?.strategy?.id?.trim() || undefined;
  const strategySourceHost = args.metadata?.strategy?.sourceHost?.trim() || undefined;
  const strategyDestinationHost =
    args.metadata?.strategy?.destinationHost?.trim() || undefined;
  const strategyType = args.metadata?.strategy?.strategyType?.trim() || undefined;
  const strategyPageType = args.metadata?.strategy?.pageType?.trim() || undefined;
  const strategyDerivedInstruction =
    args.metadata?.strategy?.derivedInstruction?.trim() || undefined;
  const strategyAutomationPrompt =
    args.metadata?.strategy?.automationPrompt?.trim() || undefined;
  const strategyReplaySteps = args.metadata?.strategy?.steps ?? [];
  const strategySanitizedStepCount =
    strategyReplaySteps.length;
  const strategyPreferredCtaTexts =
    collectStrategyPreferredCtaTexts(strategyReplaySteps);
  const strategyPreferredSelectors =
    collectStrategyPreferredSelectors(strategyReplaySteps);
  const greenhouseProviderForCta =
    isGreenhouseUrl(targetUrl) ||
    isGreenhouseUrl(originalJobUrl) ||
    isGreenhouseUrl(resolvedDirectUrl);
  const preferredCtaSelectors = mergePreferredCtaSelectors({
    strategySelectors: strategyPreferredSelectors,
    greenhouseProviderDetected: greenhouseProviderForCta,
  });
  const directJobResolutionAttempted =
    args.metadata?.directJobResolution?.attempted === true;
  const directJobResolutionConfidence =
    args.metadata?.directJobResolution?.confidence;
  const directJobResolutionProvider =
    args.metadata?.directJobResolution?.provider;
  const directJobResolutionMatchReason =
    args.metadata?.directJobResolution?.matchReason;
  const directJobResolutionError =
    args.metadata?.directJobResolution?.error;
  const directJobResolutionCandidates =
    args.metadata?.directJobResolution?.candidates;
  let searchFallbackTriggered = false;
  let searchFallbackQueries: string[] = [];
  let searchFallbackCandidates: JobSearchFallbackCandidate[] = [];
  let searchFallbackChosenCandidate: string | undefined;
  let searchFallbackAttemptCount = 0;
  let searchFallbackSuccess = false;
  let searchFallbackFailureReason: string | undefined;
  const usedResolvedDirectUrl =
    Boolean(originalJobUrl) &&
    Boolean(resolvedDirectUrl) &&
    originalJobUrl !== resolvedDirectUrl;
  const startingUrlKind = classifyJobUrlKind(originalJobUrl ?? entryUrl);
  let finalChosenUrlKind = classifyJobUrlKind(targetUrl);
  let currentUrl = targetUrl;
  let initialLoadedUrl = targetUrl;
  let domain = parseHostname(entryUrl) || parseHostname(targetUrl);
  let stoppedAtUrl: string | undefined;
  let stoppedAtTitle: string | undefined;
  let ctaAttempts: ApplySessionCtaAttemptRecord[] = [];
  let entryCtaFound = false;
  let entryCtaClicked = false;
  let entryCtaClickedText: string | undefined;
  let entryCtaClickedSelector: string | undefined;
  let entryDismissedBlocker = false;
  let adzunaApplyCaptureDetected = false;
  let adzunaApplyCaptureSkipClicked = false;
  let adzunaApplyCaptureSkipText: string | undefined;
  let adzunaApplyCaptureSkipSelector: string | undefined;
  let adzunaPostApplyProgressionAttempted = false;
  let adzunaPostApplyProgressionSucceeded = false;
  let adzunaPostApplyUrlAfter: string | undefined;
  let adzunaPostApplyPopupDetected = false;
  let adzunaPostApplyNewPageDetected = false;
  let adzunaPostApplyFallbackAttempted = false;
  let handoffPageDetected = false;
  let handoffUrl: string | undefined;
  let handoffContinuationAttempted = false;
  let handoffContinuationSucceeded = false;
  let handoffCtaFound = false;
  let handoffCtaClicked = false;
  let handoffCtaClickedText: string | undefined;
  let handoffCtaClickedSelector: string | undefined;
  let handoffAttempts: ApplySessionCtaAttemptRecord[] = [];
  let cookiePromptDetected = false;
  let cookiePromptClicked = false;
  let cookiePromptClickedText: string | undefined;
  let cookiePromptSelector: string | undefined;
  let cookiePromptAttempts: ApplySessionCtaAttemptRecord[] = [];
  let postCookieWaitAttempted = false;
  let postCookieUrlBefore: string | undefined;
  let postCookieUrlAfter: string | undefined;
  let postCookieUrlChanged = false;
  let postCookieProgressDetected = false;
  let postCookieTitleAfter: string | undefined;
  let applyCtaClickedText: string | undefined;
  let applyCtaClickedSelector: string | undefined;
  let applyHrefExtracted: string | undefined;
  let applyNavigationForced = false;
  let applyNavigationUrl: string | undefined;
  let entryPhaseClicks: ApplySessionClickRecord[] = [];
  let entryPhaseUrlsVisited: string[] = [];
  let handoffPhaseClicks: ApplySessionClickRecord[] = [];
  let handoffPhaseUrlsVisited: string[] = [];
  let cookiePhaseClicks: ApplySessionClickRecord[] = [];
  let cookiePhaseUrlsVisited: string[] = [];
  let adzunaPhaseClicks: ApplySessionClickRecord[] = [];
  let adzunaPhaseUrlsVisited: string[] = [];
  let realApplyPreludeClicks: ApplySessionClickRecord[] = [];
  let trackedClicks: ApplySessionClickRecord[] = [];
  let trackedUrlsVisited: string[] = [];
  let trackedHopCount = 0;
  let resolverAttemptedLinks: string[] = [];
  let resolverCandidates: ApplySourceCandidate[] = [];
  let resolverRejectedCandidates: ApplySourceRejectedCandidate[] = [];
  let resolverSelectedLink: string | undefined;
  let resolverSuccess: boolean | undefined;
  let resolverNewUrl: string | undefined;
  let adzunaHandoffFailureReasons: string[] | undefined;
  let adzunaExternalLinkCandidates: string[] | undefined;
  let adzunaBodyTextPreview: string | undefined;
  let adzunaTokenizedInterstitialDetected = false;
  let adzunaTokenizedParamsPresent: string[] | undefined;
  let adzunaDownstreamCandidates: string[] | undefined;
  let adzunaScriptRedirectCandidates: string[] | undefined;
  let adzunaNetworkRedirectCandidates: string[] | undefined;
  let adzunaFinalFailureReason: string | undefined;
  let adzunaHandoffPageTitle: string | undefined;
  let adzunaHandoffVisibleCtas: string[] | undefined;
  let adzunaOverlayDetected = false;
  let adzunaOverlayDismissed = false;
  let adzunaOverlayType: string | undefined;
  let adzunaOverlaySelectorsTried: string[] | undefined;
  let adzunaHandoffPopupOccurred = false;
  let adzunaHandoffUsedPopup = false;
  let adzunaDownstreamConfirmed = false;
  let adzunaAuthPageDetected = false;
  let adzunaForgotPasswordDetected = false;
  let adzunaLoginAttempted = false;
  let adzunaLoginSucceeded = false;
  let adzunaLoginFailedReason: string | undefined;
  let resolvedHandoffClickAttempted = false;
  let resolvedHandoffClickSucceeded = false;
  let resolvedHandoffElementFound = false;
  let resolvedHandoffLocatorStrategy: string | undefined;
  let resolvedHandoffDirectNavAttempted = false;
  let resolvedHandoffDirectNavSucceeded = false;
  let resolvedHandoffDirectNavUrl: string | undefined;
  let resolvedHandoffDirectNavUrlAfter: string | undefined;
  let adzunaFallbackLinkFound = false;
  let adzunaFallbackLinkClicked = false;
  let adzunaFallbackLinkText: string | undefined;
  let adzunaFallbackLocatorStrategy: string | undefined;
  let adzunaFallbackElementFound = false;
  let adzunaFallbackClickSucceeded = false;
  let adzunaFallbackHref: string | undefined;
  let adzunaFallbackHost: string | undefined;
  let adzunaFallbackDirectNavAttempted = false;
  let adzunaFallbackDirectNavSucceeded = false;
  let adzunaExtractedRedirectUrl: string | undefined;
  let adzunaExtractedRedirectSource:
    | "meta_refresh"
    | "inline_script"
    | "fallback_anchor"
    | "appcast_href"
    | "tokenized_dom_candidate"
    | undefined;
  let adzunaExtractedRedirectHtmlRead = false;
  let adzunaExtractedRedirectFailureReason: string[] | undefined;
  let adzunaExtractedRedirectNavAttempted = false;
  let adzunaExtractedRedirectNavSucceeded = false;
  let adzunaFallbackUrlAfter: string | undefined;
  let adzunaInterstitialRecognized = false;
  let appcastHopDetected = false;
  let diceDestinationDetected = false;
  let handoffResolvedViaKnownChain = false;
  let knownChainClassificationGuardApplied = false;
  let knownChainContinuationExhausted = false;
  let knownChainAllowedToFail = true;
  let knownChainContinuationRoutineCompleted = false;
  let blockedResolvedHandoffCandidates:
    ApplySourceRejectedCandidate[] = [];
  let selectedResolvedHandoffCandidate: string | undefined;
  let resolvedHandoffClickedHref: string | undefined;
  let resolvedHandoffClickedText: string | undefined;
  let resolvedHandoffUrlBefore: string | undefined;
  let resolvedHandoffUrlAfter: string | undefined;
  let latestActionText: string | undefined;
  let latestActionSelector: string | undefined;
  const rtxJobId = extractRtxJobId({
    targetUrl,
    originalJobUrl,
    resolvedDirectUrl,
    title: searchJobTitle,
  });
  const rtxFlowAttempted = false;
  let rtxFlowCompleted = false;
  let rtxFailureReason: string | undefined;
  let rtxProgressMarkers: string[] = [];

  if (strategyMatched) {
    console.log("[AUTO_APPLY_STRATEGY_GUIDANCE]", {
      strategyId: strategyId ?? null,
      strategySourceHost: strategySourceHost ?? null,
      strategyDestinationHost: strategyDestinationHost ?? null,
      strategyType: strategyType ?? null,
      strategyPageType: strategyPageType ?? null,
      strategyStartUrl: strategyStartUrl ?? null,
      strategySanitizedStepCount,
      targetUrl,
      strategyAutomationPrompt: strategyAutomationPrompt ?? null,
    });
  }

  const captureCurrentUrl = (pageOrUrl?: Page | string | null) => {
    if (typeof pageOrUrl === "string") {
      currentUrl = pageOrUrl;
      return currentUrl;
    }

    if (pageOrUrl) {
      activePage = pageOrUrl;
      currentUrl = pageOrUrl.url();
    }

    return currentUrl;
  };

  const mergeSearchFallbackState = (state: JobSearchFallbackDebugState) => {
    searchFallbackTriggered = state.triggered;
    searchFallbackQueries = state.queries;
    searchFallbackCandidates = state.candidates;
    searchFallbackChosenCandidate = state.chosenCandidate;
    searchFallbackAttemptCount = state.attemptCount;
    searchFallbackSuccess = state.success;
    searchFallbackFailureReason = state.failureReason;
  };

  const debugContext = () => ({
    entryUrl,
    initialLoadedUrl,
    originalJobUrl,
    resolvedDirectUrl,
    applySource,
    usedResolvedDirectUrl,
    directJobResolutionAttempted,
    directJobResolutionConfidence,
    directJobResolutionProvider,
    directJobResolutionMatchReason,
    directJobResolutionError,
    directJobResolutionCandidates,
    searchFallbackTriggered,
    searchFallbackQueries,
    searchFallbackCandidates,
    searchFallbackChosenCandidate,
    searchFallbackAttemptCount,
    searchFallbackSuccess,
    searchFallbackFailureReason,
    startingUrlKind,
    finalChosenUrlKind,
    domain,
    stoppedAtUrl,
    stoppedAtTitle,
    lastActionText: latestActionText,
    lastActionSelector: latestActionSelector,
    ctaAttempts,
    entryCtaFound,
    entryCtaClicked,
    entryCtaClickedText,
    entryCtaClickedSelector,
    entryDismissedBlocker,
    adzunaApplyCaptureDetected,
    adzunaApplyCaptureSkipClicked,
    adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected,
    adzunaPostApplyNewPageDetected,
    adzunaPostApplyFallbackAttempted,
    applyHrefExtracted,
    applyNavigationForced,
    applyNavigationUrl,
    handoffPageDetected,
    handoffUrl,
    handoffContinuationAttempted,
    handoffContinuationSucceeded,
    handoffCtaFound,
    handoffCtaClicked,
    handoffCtaClickedText,
    handoffCtaClickedSelector,
    handoffAttempts,
    cookiePromptDetected,
    cookiePromptClicked,
    cookiePromptClickedText,
    cookiePromptSelector,
    cookiePromptAttempts,
    postCookieWaitAttempted,
    postCookieUrlBefore,
    postCookieUrlAfter,
    postCookieUrlChanged,
    postCookieProgressDetected,
    postCookieTitleAfter,
    applyCtaClickedText,
    applyCtaClickedSelector,
    ctaClickedText: latestActionText,
    ctaClickedSelector: latestActionSelector,
    dismissedBlocker: entryDismissedBlocker,
    resolverCandidates,
    resolverRejectedCandidates,
    resolvedHandoffClickAttempted,
    resolvedHandoffClickSucceeded,
    adzunaHandoffFailureReasons,
    adzunaExternalLinkCandidates,
    adzunaBodyTextPreview,
    adzunaTokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent,
    adzunaDownstreamCandidates,
    adzunaScriptRedirectCandidates,
    adzunaNetworkRedirectCandidates,
    adzunaFinalFailureReason,
    adzunaHandoffPageTitle,
    adzunaHandoffVisibleCtas,
    adzunaOverlayDetected,
    adzunaOverlayDismissed,
    adzunaOverlayType,
    adzunaOverlaySelectorsTried,
    adzunaHandoffPopupOccurred,
    adzunaHandoffUsedPopup,
    adzunaDownstreamConfirmed,
    adzunaAuthPageDetected,
    adzunaForgotPasswordDetected,
    adzunaLoginAttempted,
    adzunaLoginSucceeded,
    adzunaLoginFailedReason,
    blockedResolvedHandoffCandidates,
    selectedResolvedHandoffCandidate,
    resolvedHandoffElementFound,
    resolvedHandoffLocatorStrategy,
    resolvedHandoffDirectNavAttempted,
    resolvedHandoffDirectNavSucceeded,
    resolvedHandoffDirectNavUrl,
    resolvedHandoffDirectNavUrlAfter,
    adzunaFallbackLinkFound,
    adzunaFallbackLinkClicked,
    adzunaFallbackLinkText,
    adzunaFallbackLocatorStrategy,
    adzunaFallbackElementFound,
    adzunaFallbackClickSucceeded,
    adzunaFallbackHref,
    adzunaFallbackHost,
    adzunaFallbackDirectNavAttempted,
    adzunaFallbackDirectNavSucceeded,
    adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason,
    adzunaExtractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded,
    adzunaFallbackUrlAfter,
    adzunaInterstitialRecognized,
    appcastHopDetected,
    diceDestinationDetected,
    handoffResolvedViaKnownChain,
    knownChainClassificationGuardApplied,
    knownChainContinuationExhausted,
    knownChainAllowedToFail,
    resolvedHandoffClickedHref,
    resolvedHandoffClickedText,
    resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter,
    strategyMatched,
    strategyId,
    strategySourceHost,
    strategyDestinationHost,
    strategyType,
    strategyPageType,
    strategyDerivedInstruction,
    strategyAutomationPrompt,
    strategyStartUrl,
    strategySanitizedStepCount,
    playwrightLaunchStrategy,
    playwrightPersistentContext,
    playwrightUserDataDir,
    rtxFlowAttempted,
    rtxFlowCompleted,
    rtxProgressMarkers,
    rtxFailureReason,
    rtxJobId,
  });

  const readPageTitle = async (page?: Page | null) => {
    if (!page) return undefined;

    const title = await page.title().catch(() => "");
    const normalized = title.trim();
    return normalized.length ? normalized : undefined;
  };

  const captureStopPoint = async (
    page?: Page | null,
    overrides?: {
      lastActionText?: string;
      lastActionSelector?: string;
    },
  ) => {
    stoppedAtUrl = captureCurrentUrl(page);
    stoppedAtTitle = await readPageTitle(page);

    return {
      stoppedAtUrl,
      stoppedAtTitle,
      lastActionText:
        overrides?.lastActionText ??
        latestActionText,
      lastActionSelector:
        overrides?.lastActionSelector ??
        latestActionSelector,
    };
  };

  const mergeCookiePromptPhase = (result: CookieConsentPhaseResult) => {
    cookiePromptDetected = cookiePromptDetected || result.detected;
    cookiePromptClicked = cookiePromptClicked || result.clicked;
    if (result.clickedText) {
      cookiePromptClickedText = result.clickedText;
    }
    if (result.clickedSelector) {
      cookiePromptSelector = result.clickedSelector;
    }
    postCookieWaitAttempted =
      postCookieWaitAttempted || result.postCookieWaitAttempted;
    if (result.postCookieUrlBefore) {
      postCookieUrlBefore = result.postCookieUrlBefore;
    }
    if (result.postCookieUrlAfter) {
      postCookieUrlAfter = result.postCookieUrlAfter;
    }
    postCookieUrlChanged =
      postCookieUrlChanged || Boolean(result.postCookieUrlChanged);
    postCookieProgressDetected =
      postCookieProgressDetected ||
      Boolean(result.postCookieProgressDetected);
    if (result.postCookieTitleAfter) {
      postCookieTitleAfter = result.postCookieTitleAfter;
    }
    if (result.attempts.length > 0) {
      cookiePromptAttempts = [...cookiePromptAttempts, ...result.attempts];
      ctaAttempts = [...ctaAttempts, ...result.attempts];
    }
    if (result.clicks.length > 0) {
      cookiePhaseClicks = [...cookiePhaseClicks, ...result.clicks];
      latestActionText = result.clickedText ?? latestActionText;
      latestActionSelector = result.clickedSelector ?? latestActionSelector;
    }
    if (result.urlsVisited.length > 0) {
      cookiePhaseUrlsVisited = dedupeUrls([
        ...cookiePhaseUrlsVisited,
        ...result.urlsVisited,
      ]);
    }
  };

  const mergeHandoffPhase = (handoffPhase: HandoffContinuationResult) => {
    activePage = handoffPhase.page;
    captureCurrentUrl(activePage);
    handoffPageDetected = handoffPhase.handoffPageDetected;
    handoffUrl = handoffPhase.handoffUrl;
    handoffContinuationAttempted = handoffPhase.continuationAttempted;
    handoffContinuationSucceeded = handoffPhase.continuationSucceeded;
    handoffCtaFound = handoffPhase.ctaFound;
    handoffCtaClicked = handoffPhase.ctaClicked;
    handoffCtaClickedText = handoffPhase.ctaClickedText;
    handoffCtaClickedSelector = handoffPhase.ctaClickedSelector;
    handoffAttempts = handoffPhase.attempts;
    handoffPhaseClicks = handoffPhase.clicks;
    handoffPhaseUrlsVisited = handoffPhase.urlsVisited;
    resolvedHandoffClickAttempted =
      handoffPhase.resolvedHandoffClickAttempted;
    resolvedHandoffClickSucceeded =
      handoffPhase.resolvedHandoffClickSucceeded;
    resolvedHandoffElementFound =
      handoffPhase.resolvedHandoffElementFound;
    resolvedHandoffLocatorStrategy =
      handoffPhase.resolvedHandoffLocatorStrategy;
    resolvedHandoffDirectNavAttempted =
      handoffPhase.resolvedHandoffDirectNavAttempted;
    resolvedHandoffDirectNavSucceeded =
      handoffPhase.resolvedHandoffDirectNavSucceeded;
    resolvedHandoffDirectNavUrl =
      handoffPhase.resolvedHandoffDirectNavUrl;
    resolvedHandoffDirectNavUrlAfter =
      handoffPhase.resolvedHandoffDirectNavUrlAfter;
    adzunaFallbackLinkFound = handoffPhase.adzunaFallbackLinkFound;
    adzunaFallbackLinkClicked = handoffPhase.adzunaFallbackLinkClicked;
    adzunaFallbackLinkText = handoffPhase.adzunaFallbackLinkText;
    adzunaFallbackLocatorStrategy =
      handoffPhase.adzunaFallbackLocatorStrategy;
    adzunaFallbackElementFound =
      handoffPhase.adzunaFallbackElementFound;
    adzunaFallbackClickSucceeded =
      handoffPhase.adzunaFallbackClickSucceeded;
    adzunaFallbackHref = handoffPhase.adzunaFallbackHref;
    adzunaFallbackHost = handoffPhase.adzunaFallbackHost;
    adzunaFallbackDirectNavAttempted =
      handoffPhase.adzunaFallbackDirectNavAttempted;
    adzunaFallbackDirectNavSucceeded =
      handoffPhase.adzunaFallbackDirectNavSucceeded;
    adzunaExtractedRedirectUrl =
      handoffPhase.adzunaExtractedRedirectUrl;
    adzunaExtractedRedirectSource =
      handoffPhase.adzunaExtractedRedirectSource;
    adzunaExtractedRedirectHtmlRead =
      handoffPhase.adzunaExtractedRedirectHtmlRead;
    adzunaExtractedRedirectFailureReason =
      handoffPhase.adzunaExtractedRedirectFailureReason;
    adzunaExtractedRedirectNavAttempted =
      handoffPhase.adzunaExtractedRedirectNavAttempted;
    adzunaExtractedRedirectNavSucceeded =
      handoffPhase.adzunaExtractedRedirectNavSucceeded;
    adzunaFallbackUrlAfter = handoffPhase.adzunaFallbackUrlAfter;
    adzunaTokenizedInterstitialDetected =
      handoffPhase.adzunaTokenizedInterstitialDetected;
    adzunaTokenizedParamsPresent =
      handoffPhase.adzunaTokenizedParamsPresent;
    adzunaDownstreamCandidates = handoffPhase.adzunaDownstreamCandidates;
    adzunaScriptRedirectCandidates =
      handoffPhase.adzunaScriptRedirectCandidates;
    adzunaNetworkRedirectCandidates =
      handoffPhase.adzunaNetworkRedirectCandidates;
    adzunaHandoffPageTitle = handoffPhase.adzunaHandoffPageTitle;
    adzunaHandoffVisibleCtas = handoffPhase.adzunaHandoffVisibleCtas;
    adzunaOverlayDetected = handoffPhase.adzunaOverlayDetected;
    adzunaOverlayDismissed = handoffPhase.adzunaOverlayDismissed;
    adzunaOverlayType = handoffPhase.adzunaOverlayType;
    adzunaOverlaySelectorsTried =
      handoffPhase.adzunaOverlaySelectorsTried;
    adzunaHandoffPopupOccurred =
      handoffPhase.adzunaHandoffPopupOccurred;
    adzunaHandoffUsedPopup = handoffPhase.adzunaHandoffUsedPopup;
    adzunaDownstreamConfirmed = handoffPhase.adzunaDownstreamConfirmed;
    adzunaInterstitialRecognized =
      handoffPhase.adzunaInterstitialRecognized;
    appcastHopDetected = handoffPhase.appcastHopDetected;
    diceDestinationDetected = handoffPhase.diceDestinationDetected;
    handoffResolvedViaKnownChain =
      handoffPhase.handoffResolvedViaKnownChain;
    if (handoffPhase.ctaClickedText || handoffPhase.ctaClickedSelector) {
      latestActionText = handoffPhase.ctaClickedText ?? latestActionText;
      latestActionSelector =
        handoffPhase.ctaClickedSelector ?? latestActionSelector;
    }
    ctaAttempts = [...ctaAttempts, ...handoffPhase.attempts];
    resolvedHandoffClickedHref = handoffPhase.resolvedHandoffClickedHref;
    resolvedHandoffClickedText = handoffPhase.resolvedHandoffClickedText;
    resolvedHandoffUrlBefore = handoffPhase.resolvedHandoffUrlBefore;
    resolvedHandoffUrlAfter = handoffPhase.resolvedHandoffUrlAfter;
    blockedResolvedHandoffCandidates =
      handoffPhase.blockedResolvedHandoffCandidates;
    selectedResolvedHandoffCandidate =
      handoffPhase.selectedResolvedHandoffCandidate;
    if (
      resolverCandidates.length === 0 &&
      handoffPhase.discoveredResolverCandidates.length > 0
    ) {
      resolverCandidates = handoffPhase.discoveredResolverCandidates;
    }
    if (
      resolverRejectedCandidates.length === 0 &&
      handoffPhase.discoveredResolverRejectedCandidates.length > 0
    ) {
      resolverRejectedCandidates =
        handoffPhase.discoveredResolverRejectedCandidates;
    }
  };

  const computeKnownChainClassificationState = (activeUrl: string) => {
    const onKnownChainPage = isKnownHandoffChainPage(activeUrl);
    const continuationCompleted =
      knownChainContinuationRoutineCompleted ||
      handoffResolvedViaKnownChain ||
      handoffContinuationSucceeded ||
      diceDestinationDetected;
    const continuationExhausted =
      onKnownChainPage && continuationCompleted && !diceDestinationDetected;

    return {
      onKnownChainPage,
      knownChainClassificationGuardApplied:
        onKnownChainPage && !continuationCompleted,
      knownChainContinuationExhausted: continuationExhausted,
      knownChainAllowedToFail:
        !onKnownChainPage || continuationCompleted || diceDestinationDetected,
    };
  };

  const refreshKnownChainClassificationState = (stage: string) => {
    const activeUrl = captureCurrentUrl(activePage);
    if (!isKnownHandoffChainPage(activeUrl)) {
      knownChainContinuationRoutineCompleted = false;
    }

    const state = computeKnownChainClassificationState(activeUrl);
    knownChainClassificationGuardApplied =
      state.knownChainClassificationGuardApplied;
    knownChainContinuationExhausted =
      state.knownChainContinuationExhausted;
    knownChainAllowedToFail = state.knownChainAllowedToFail;

    console.log("[AUTO_APPLY_KNOWN_CHAIN_GUARD]", {
      stage,
      currentUrl: currentUrl ?? null,
      handoffPageDetected,
      handoffContinuationAttempted,
      handoffContinuationSucceeded,
      adzunaInterstitialRecognized,
      appcastHopDetected,
      diceDestinationDetected,
      handoffResolvedViaKnownChain,
      knownChainClassificationGuardApplied,
      knownChainContinuationExhausted,
      knownChainAllowedToFail,
    });

    return state;
  };

  const continueKnownChainBeforeClassification = async (stage: string) => {
    const state = refreshKnownChainClassificationState(`${stage}:before`);
    if (!state.onKnownChainPage || !activePage || !context) {
      return false;
    }

    let routineRan = false;

    if (isAdzunaLandRedirectPage(activePage.url())) {
      routineRan = true;
      const handoffPhase = await runHandoffContinuationPhase({
        page: activePage,
        context,
        resolverSelectedLink,
        resolverCandidates,
        onPageReady: args.onPageReady,
      });
      mergeHandoffPhase(handoffPhase);
    } else if (isAppcastTrackingPage(activePage.url())) {
      routineRan = true;
      const chainedProgress = await waitForTrackedHandoffRedirects({
        page: activePage,
        context,
        onPageReady: args.onPageReady,
      });
      activePage = chainedProgress.page;
      captureCurrentUrl(activePage);
      handoffContinuationAttempted = true;
      handoffPhaseUrlsVisited = dedupeUrls([
        ...handoffPhaseUrlsVisited,
        ...chainedProgress.urlsVisited,
      ]);
      adzunaInterstitialRecognized =
        adzunaInterstitialRecognized ||
        chainedProgress.urlsVisited.some((url) => isAdzunaLandRedirectPage(url));
      appcastHopDetected = true;
      diceDestinationDetected =
        diceDestinationDetected ||
        chainedProgress.urlsVisited.some((url) => isDiceJobDetailPage(url)) ||
        isDiceJobDetailPage(activePage.url());
      handoffResolvedViaKnownChain =
        adzunaInterstitialRecognized &&
        appcastHopDetected &&
        diceDestinationDetected;
      handoffContinuationSucceeded =
        handoffContinuationSucceeded ||
        diceDestinationDetected ||
        (await hasReachedPostHandoffDestination(activePage));
    }

    if (isDiceJobDetailPage(activePage.url())) {
      diceDestinationDetected = true;
      handoffContinuationSucceeded = true;
      handoffResolvedViaKnownChain =
        adzunaInterstitialRecognized &&
        appcastHopDetected &&
        diceDestinationDetected;
    }

    const postContinuationCookiePhase = await dismissCookieConsentIfPresent({
      page: activePage,
      context,
      onPageReady: args.onPageReady,
    });
    activePage = postContinuationCookiePhase.page;
    captureCurrentUrl(activePage);
    mergeCookiePromptPhase(postContinuationCookiePhase);

    if (routineRan) {
      knownChainContinuationRoutineCompleted = true;
    }

    refreshKnownChainClassificationState(`${stage}:after`);
    return routineRan;
  };

  const buildAdzunaAuthFailureMessage = () => {
    switch (adzunaLoginFailedReason) {
      case "missing_adzuna_login_credentials":
        return "Adzuna login is required but credentials are not configured.";
      case "forgot_password_recovery_failed":
      case "missing_login_url":
      case "adzuna_login_page_not_reached":
        return "Adzuna redirected to forgot-password and could not recover back to login.";
      case "missing_adzuna_email_field":
        return "Adzuna login page was detected, but the email field could not be found.";
      case "missing_adzuna_password_field":
        return "Adzuna login page was detected, but the password field could not be found.";
      case "adzuna_login_submit_failed":
        return "Adzuna login submission could not be triggered.";
      case "adzuna_login_submit_no_progress":
      case "adzuna_login_still_on_auth_page_after_submit":
        return "Adzuna login did not complete successfully.";
      default:
        return "Adzuna login could not be completed.";
    }
  };

  const returnAdzunaAuthFailure = async (stage: string) => {
    const page = activePage;
    if (!page) return null;

    const finalUrl = page.url();
    const finalStatus = "FAILED";
    const message = buildAdzunaAuthFailureMessage();
    const signals = await detectPageSignals(page);
    const preludeClicks = [
      ...adzunaPhaseClicks,
      ...entryPhaseClicks,
      ...handoffPhaseClicks,
      ...cookiePhaseClicks,
    ];
    const preludeUrlsVisited = dedupeUrls([
      ...adzunaPhaseUrlsVisited,
      ...entryPhaseUrlsVisited,
      ...handoffPhaseUrlsVisited,
      ...cookiePhaseUrlsVisited,
      finalUrl,
    ]);
    const applyProgressDetected =
      preludeClicks.length > 0 ||
      adzunaFallbackLinkClicked ||
      resolvedHandoffClickSucceeded ||
      handoffCtaClicked;

    console.info("[AUTO_APPLY_ADZUNA_AUTH_FAILURE]", {
      stage,
      currentUrl: finalUrl,
      adzunaAuthPageDetected,
      adzunaForgotPasswordDetected,
      adzunaLoginAttempted,
      adzunaLoginSucceeded,
      adzunaLoginFailedReason: adzunaLoginFailedReason ?? null,
      selectedResolvedHandoffCandidate:
        selectedResolvedHandoffCandidate ?? null,
      blockedResolvedHandoffCandidates,
    });

    await args.onStatus?.({
      status: finalStatus,
      lastUrl: finalUrl,
      error: message,
      message,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    logPlaywrightEvidence({
      attemptedSelectors,
      applyCtaFound: applyProgressDetected,
      applyCtaClicked: applyProgressDetected,
      currentUrl: finalUrl,
      hopCount: preludeClicks.length,
      submitButtonFound: false,
      submitButtonClicked: false,
      confirmationTextFound: signals.confirmationTextFound,
      confirmationTextSnippet: signals.confirmationTextSnippet ?? null,
      successUrlPatternMatched: signals.successUrlPatternMatched,
      finalStatus,
      submissionConfirmed: false,
    });

    return {
      ok: false,
      status: finalStatus,
      finalUrl,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      message,
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        ...debugContext(),
        ...(await captureStopPoint(page)),
        finalUrl,
        verificationSignals: [],
        confirmationSignals: signals.confirmationSignals,
        pageText: signals.pageText,
        pageHtml: signals.html,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        applyCtaFound: applyProgressDetected,
        applyCtaClicked: applyProgressDetected,
        currentUrl: finalUrl,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: signals.confirmationTextFound,
        confirmationTextSnippet: signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: signals.successUrlPatternMatched,
        submissionConfirmed: false,
        finalStatus,
        success: false,
        needsHuman: false,
        unavailable: false,
        hopCount: preludeClicks.length,
        urlsVisited: preludeUrlsVisited,
        clicks: preludeClicks,
        formDetected: signals.formDetected,
        confirmationDetected: signals.confirmationDetected,
        verificationDetected: false,
        finalReason: adzunaLoginFailedReason ?? message,
        resolverAttemptedLinks,
        resolverSelectedLink,
        resolverSuccess,
        resolverNewUrl,
      }),
    } satisfies PlaywrightApplyResult;
  };

  const maybeHandleAdzunaAuthGateBeforeChase = async (stage: string) => {
    if (!page || !context) {
      return null;
    }

    const authResult = await handleAdzunaAuthGateIfPresent({
      page,
      context,
      attemptedSelectors,
      onPageReady: args.onPageReady,
    });

    if (!authResult.authPageDetected) {
      return null;
    }

    page = authResult.page;
    activePage = page;
    captureCurrentUrl(page);
    adzunaAuthPageDetected =
      adzunaAuthPageDetected || authResult.authPageDetected;
    adzunaForgotPasswordDetected =
      adzunaForgotPasswordDetected || authResult.forgotPasswordDetected;
    adzunaLoginAttempted =
      adzunaLoginAttempted || authResult.loginAttempted;
    adzunaLoginSucceeded =
      adzunaLoginSucceeded || authResult.loginSucceeded;
    if (authResult.loginFailedReason) {
      adzunaLoginFailedReason = authResult.loginFailedReason;
    }

    if (authResult.urlsVisited.length > 0) {
      handoffPhaseUrlsVisited = dedupeUrls([
        ...handoffPhaseUrlsVisited,
        ...authResult.urlsVisited,
      ]);
    }
    if (authResult.clicks.length > 0) {
      handoffPhaseClicks = [...handoffPhaseClicks, ...authResult.clicks];
      latestActionText =
        authResult.clicks.at(-1)?.text ?? latestActionText;
      latestActionSelector =
        authResult.clicks.at(-1)?.selector ?? latestActionSelector;
    }
    if (authResult.attempts.length > 0) {
      handoffAttempts = [...handoffAttempts, ...authResult.attempts];
      ctaAttempts = [...ctaAttempts, ...authResult.attempts];
    }

    const postAuthCookiePhase = await dismissCookieConsentIfPresent({
      page,
      context,
      onPageReady: args.onPageReady,
    });
    page = postAuthCookiePhase.page;
    activePage = page;
    captureCurrentUrl(page);
    mergeCookiePromptPhase(postAuthCookiePhase);

    if (
      isAdzunaLandRedirectPage(page.url()) ||
      isAppcastTrackingPage(page.url())
    ) {
      await continueKnownChainBeforeClassification(
        `${stage}:post_auth_known_chain_guard`,
      );
      page = activePage ?? page;
      captureCurrentUrl(page);
    }

    if (classifyAdzunaAuthPage(page.url()).isAuthPage) {
      return returnAdzunaAuthFailure(stage);
    }

    return null;
  };

  try {
    await args.onStatus?.({
      status: "STARTING",
      openUrl: undefined,
    });

    const preLaunchValidationFailure = validatePreLaunchTarget({
      targetUrl,
      entryUrl,
      originalJobUrl,
      resolvedDirectUrl,
      companyName: searchCompany,
      jobTitle: searchJobTitle,
      strategySourceHost,
      strategyDestinationHost,
    });

    if (preLaunchValidationFailure) {
      const stopClassification: ApplyStopClassification = {
        reason: preLaunchValidationFailure.reason,
        pageType: "resolver_failure",
        suggestedAction: "open_original_job_site",
      };
      const finalStatus = "APPLY_NOT_STARTED";
      const finalUrl = targetUrl;
      const skipLogMarker =
        preLaunchValidationFailure.reason === "wrong_employer_domain"
          ? "[AUTO_APPLY_REMOTE_BROWSER_SKIPPED_DOMAIN_MISMATCH]"
          : "[AUTO_APPLY_REMOTE_BROWSER_SKIPPED_INVALID_TARGET]";

      console.warn(skipLogMarker, {
        applicationId: applicationId ?? null,
        applySessionId: applySessionId ?? null,
        targetUrl,
        entryUrl,
        originalJobUrl: originalJobUrl ?? null,
        resolvedDirectUrl: resolvedDirectUrl ?? null,
        expectedEmployerHost:
          preLaunchValidationFailure.expectedEmployerHost || null,
        targetHost: preLaunchValidationFailure.targetHost || null,
        strategySourceHost:
          preLaunchValidationFailure.strategySourceHost ?? null,
        strategyDestinationHost:
          preLaunchValidationFailure.strategyDestinationHost ?? null,
        validationReason:
          preLaunchValidationFailure.validationReason ?? null,
        reason: preLaunchValidationFailure.reason,
      });

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        error: preLaunchValidationFailure.message,
        message: preLaunchValidationFailure.message,
        openUrl: finalUrl,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        applyCtaFound: false,
        applyCtaClicked: false,
        currentUrl: finalUrl,
        hopCount: 0,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        finalUrl,
        openUrl: finalUrl,
        message: preLaunchValidationFailure.message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          stoppedAtUrl: finalUrl,
          stoppedAtTitle: undefined,
          lastActionText: undefined,
          lastActionSelector: undefined,
          finalUrl,
          verificationSignals: [],
          confirmationSignals: [],
          pageText: undefined,
          pageHtml: undefined,
          targetUrl,
          applyCtaFound: false,
          applyCtaClicked: false,
          currentUrl: finalUrl,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: false,
          hopCount: 0,
          urlsVisited: dedupeUrls([finalUrl]),
          clicks: [],
          formDetected: false,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: `${preLaunchValidationFailure.reason}:${
            preLaunchValidationFailure.validationReason ?? "target_rejected"
          }`,
          stopClassification,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    const browserRuntime = await resolveApplyBrowserRuntime();
    const runtimeChromium = browserRuntime.chromium;
    browserAutomationLibrary = browserRuntime.browserAutomationLibrary;
    playwrightExtraAvailable = browserRuntime.playwrightExtraAvailable;
    puppeteerExtraAvailable = browserRuntime.puppeteerExtraAvailable;
    stealthRequested = browserRuntime.stealthRequested;
    stealthDependencyInstalled = browserRuntime.stealthDependencyInstalled;
    stealthRuntimeEnabled = browserRuntime.stealthRuntimeEnabled;
    stealthPluginRegistered = browserRuntime.stealthPluginRegistered;
    const runtimeDomain =
      parseHostname(targetUrl) || parseHostname(entryUrl) || null;

    if (shouldUseRemoteBrowser()) {
      remoteSession = await createRemoteSession({
        applicationId,
        applySessionId,
        purpose: "apply",
        keepAlive: false,
      });
      const useScrapflyRemote = remoteSession.provider === "scrapfly";
      const useCdp = useScrapflyRemote || shouldUseCdp(remoteSession.connectUrl);
      playwrightLaunchStrategy = "remote";
      playwrightPersistentContext = false;
      playwrightUserDataDir = undefined;
      headless = true;
      if (useScrapflyRemote) {
        browserAutomationLibrary = "playwright-extra";
        playwrightExtraAvailable = true;
        puppeteerExtraAvailable = true;
        stealthRequested = true;
        stealthDependencyInstalled = true;
        stealthRuntimeEnabled = true;
      }
      console.info("[AUTO_APPLY_BROWSER_RUNTIME]", {
        stealthEnabled: stealthRequested,
        browserDiagnosticsEnabled,
        runtime: browserAutomationLibrary,
        browserAutomationLibrary,
        runtimeFallbackUsed: browserAutomationLibrary === "playwright",
        browser: "chromium",
        playwrightExtraAvailable,
        puppeteerExtraAvailable,
        stealthDependencyInstalled,
        stealthRuntimeEnabled,
        stealthPluginRegistered,
        launchStrategy: playwrightLaunchStrategy,
        headless,
        persistentContext: playwrightPersistentContext,
        userDataDir: null,
        applySource: applySource ?? null,
        domain: runtimeDomain,
        targetUrl,
      });
      if (useScrapflyRemote) {
        const scrapflyConnection = await connectScrapflyBrowserSession({
          sessionId: remoteSession.sessionId,
        });
        browser = scrapflyConnection.browser;
        context = scrapflyConnection.context;
        page = scrapflyConnection.page;
        activePage = page;
        remoteSession = {
          ...remoteSession,
          sessionId: scrapflyConnection.sessionId,
          connectUrl: scrapflyConnection.wsEndpoint,
        };
        stealthPluginRegistered = scrapflyConnection.stealthPluginRegistered;
      } else {
        browser = useCdp
          ? await runtimeChromium.connectOverCDP(remoteSession.connectUrl)
          : await runtimeChromium.connect(remoteSession.connectUrl);
      }
      console.log("[AUTO_APPLY_REMOTE] connected to remote browser", {
        provider: remoteSession.provider,
        sessionId: remoteSession.sessionId,
      });
    } else {
      const launchOptions = resolveLocalLaunchOptions(args.mode, forceFreshSession);
      headless = launchOptions.headless;
      playwrightLaunchStrategy = launchOptions.strategy;
      playwrightPersistentContext = launchOptions.persistentContext;
      playwrightUserDataDir = launchOptions.userDataDir;
      console.info("[AUTO_APPLY_BROWSER_RUNTIME]", {
        stealthEnabled: stealthRequested,
        browserDiagnosticsEnabled,
        runtime: browserAutomationLibrary,
        browserAutomationLibrary,
        runtimeFallbackUsed: browserAutomationLibrary === "playwright",
        browser: "chromium",
        playwrightExtraAvailable,
        puppeteerExtraAvailable,
        stealthDependencyInstalled,
        stealthRuntimeEnabled,
        stealthPluginRegistered,
        launchStrategy: playwrightLaunchStrategy,
        headless,
        persistentContext: playwrightPersistentContext,
        userDataDir: playwrightUserDataDir ?? null,
        applySource: applySource ?? null,
        domain: runtimeDomain,
        targetUrl,
      });

      if (launchOptions.persistentContext && launchOptions.userDataDir) {
        mkdirSync(launchOptions.userDataDir, { recursive: true });
        context = await runtimeChromium.launchPersistentContext(
          launchOptions.userDataDir,
          {
            headless: launchOptions.headless,
          },
        );
        browser = context.browser() ?? undefined;
      } else {
        browser = await runtimeChromium.launch({
          headless: launchOptions.headless,
        });
      }
    }

    console.log("[AUTO_APPLY_PLAYWRIGHT] browser ready", {
      entryUrl,
      targetUrl,
      originalJobUrl: originalJobUrl ?? null,
      resolvedDirectUrl: resolvedDirectUrl ?? null,
      usedResolvedDirectUrl,
      applySource: applySource ?? null,
      directJobResolutionAttempted,
      directJobResolutionConfidence:
        typeof directJobResolutionConfidence === "number"
          ? Number(directJobResolutionConfidence.toFixed(3))
          : null,
      directJobResolutionProvider: directJobResolutionProvider ?? null,
      startingUrlKind,
      finalChosenUrlKind,
      mode: args.mode ?? "AUTO",
      usingRemoteBrowser: Boolean(remoteSession),
      remoteProvider: remoteSession?.provider ?? null,
      headless: remoteSession ? true : headless,
      requestedHeadless: process.env.PLAYWRIGHT_HEADLESS ?? null,
      launchStrategy: playwrightLaunchStrategy,
      persistentContext: playwrightPersistentContext,
      userDataDir: playwrightUserDataDir ?? null,
      headedDebug:
        parseBooleanEnv(process.env.PLAYWRIGHT_HEADED_DEBUG) === true,
    });

    if (!context) {
      if (!browser) {
        throw new Error("Playwright browser did not initialize.");
      }
      context = await browser.newContext();
    }
    page = context.pages()[0] ?? (await context.newPage());
    activePage = page;
    await args.onPageReady?.(page, context);
    if (forceFreshSession) {
      await resetRuntimeSessionState({
        context,
        page,
      });
      await args.onPageReady?.(page, context);
    }

    const startRoutingDecision = selectInitialAutomationTarget({
      sourceProvider: applySource,
      candidates: [
        {
          label: "strategy_start_url",
          url: strategyStartUrl,
        },
        {
          label: "form_embed_url",
          url: args.form?.embedUrl,
        },
        {
          label: "resolved_direct_url",
          url: resolvedDirectUrl,
        },
        {
          label: "job_url",
          url: args.jobUrl,
        },
        {
          label: "original_job_url",
          url: originalJobUrl,
        },
      ],
    });
    let destinationResolvedViaEcosia = false;

    if (startRoutingDecision.aggregatorSourceDetected) {
      await args.onStatus?.({
        status: "STARTING",
        message: "Aggregator source detected",
        lastUrl: captureCurrentUrl(page),
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: captureCurrentUrl(page),
        remoteSessionId: remoteSession?.sessionId,
      });
      console.info("[AUTO_APPLY_ROUTING] aggregator source detected", {
        source: applySource ?? null,
        entryUrl,
        originalJobUrl: originalJobUrl ?? null,
      });
    }

    if (startRoutingDecision.rejectedCandidates.length > 0) {
      await args.onStatus?.({
        status: "STARTING",
        message: "Invalid start URL rejected",
        lastUrl: captureCurrentUrl(page),
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: captureCurrentUrl(page),
        remoteSessionId: remoteSession?.sessionId,
      });
      console.info("[AUTO_APPLY_ROUTING] invalid start URL rejected", {
        rejectedCandidates: startRoutingDecision.rejectedCandidates,
      });
    }

    if (startRoutingDecision.requiresEcosiaSearch) {
      await args.onStatus?.({
        status: "STARTING",
        message: "Resolving real posting via Ecosia",
        lastUrl: captureCurrentUrl(page),
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: captureCurrentUrl(page),
        remoteSessionId: remoteSession?.sessionId,
      });

      const ecosiaResolution = await resolveRealPostingViaEcosia({
        page,
        title: searchJobTitle,
        company: searchCompany,
        location: searchLocation,
      });

      searchFallbackTriggered = true;
      searchFallbackQueries = ecosiaResolution.query ? [ecosiaResolution.query] : [];
      searchFallbackCandidates = ecosiaResolution.candidates;
      searchFallbackChosenCandidate = ecosiaResolution.ok
        ? ecosiaResolution.chosenCandidateUrl
        : undefined;
      searchFallbackAttemptCount = ecosiaResolution.attemptedCandidateCount;
      searchFallbackSuccess = ecosiaResolution.ok;
      searchFallbackFailureReason = ecosiaResolution.ok
        ? undefined
        : ecosiaResolution.failureCode;

      if (!ecosiaResolution.ok) {
        const finalUrl = captureCurrentUrl(page);
        const verificationRequired =
          ecosiaResolution.failureCode === "VERIFICATION_REQUIRED";
        const finalStatus = verificationRequired
          ? "VERIFICATION_REQUIRED"
          : "APPLY_NOT_STARTED";
        const message = verificationRequired
          ? APPLY_VERIFICATION_REQUIRED_USER_MESSAGE
          : "Real posting not found";

        await args.onStatus?.({
          status: finalStatus,
          lastUrl: finalUrl,
          error: message,
          message: verificationRequired
            ? message
            : "Real posting not found",
          viewerUrl: remoteSession?.viewerUrl,
          openUrl: finalUrl,
          remoteSessionId: remoteSession?.sessionId,
        });

        logPlaywrightEvidence({
          attemptedSelectors,
          applyCtaFound: false,
          applyCtaClicked: false,
          currentUrl: finalUrl,
          hopCount: 0,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          finalStatus,
          submissionConfirmed: false,
        });

        return {
          ok: false,
          status: finalStatus,
          needsHuman: verificationRequired,
          unavailable: !verificationRequired,
          finalUrl,
          openUrl: finalUrl,
          viewerUrl: remoteSession?.viewerUrl,
          message,
          debug: buildDebugPayload({
            attemptedSelectors,
            missingNames,
            ...debugContext(),
            ...(await captureStopPoint(page)),
            finalUrl,
            verificationSignals:
              ecosiaResolution.verificationSignals ?? [],
            confirmationSignals: [],
            pageText: undefined,
            pageHtml: undefined,
            sessionId: remoteSession?.sessionId,
            viewerUrl: remoteSession?.viewerUrl,
            targetUrl,
            applyCtaFound: false,
            applyCtaClicked: false,
            currentUrl: finalUrl,
            submitButtonFound: false,
            submitButtonClicked: false,
            confirmationTextFound: false,
            confirmationTextSnippet: null,
            successUrlPatternMatched: false,
            submissionConfirmed: false,
            finalStatus,
            success: false,
            needsHuman: verificationRequired,
            unavailable: !verificationRequired,
            hopCount: 0,
            urlsVisited: ecosiaResolution.visitedUrls,
            clicks: [],
            formDetected: false,
            confirmationDetected: false,
            verificationDetected: verificationRequired,
            finalReason: verificationRequired
              ? "verification_required"
              : REAL_POSTING_NOT_FOUND_CODE,
            resolverAttemptedLinks,
            resolverSelectedLink,
            resolverSuccess,
            resolverNewUrl,
          }),
        };
      }

      destinationResolvedViaEcosia = true;
      targetUrl = ecosiaResolution.resolvedUrl;
      finalChosenUrlKind = classifyJobUrlKind(targetUrl);

      await args.onStatus?.({
        status: "STARTING",
        message: "Employer/ATS posting found",
        lastUrl: captureCurrentUrl(page),
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: captureCurrentUrl(page),
        remoteSessionId: remoteSession?.sessionId,
      });
    } else if (startRoutingDecision.selectedUrl) {
      targetUrl = startRoutingDecision.selectedUrl;
      finalChosenUrlKind = classifyJobUrlKind(targetUrl);
    }

    if (forceFreshSession) {
      await args.onStatus?.({
        status: "STARTING",
        message: "Starting fresh browser session",
        lastUrl: captureCurrentUrl(page),
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: captureCurrentUrl(page),
        remoteSessionId: remoteSession?.sessionId,
      });
      await resetRuntimeSessionState({
        context,
        page,
        targetUrl,
      });
      await args.onPageReady?.(page, context);
      captureCurrentUrl(page);
    }

    await args.onStatus?.({
      status: "STARTING",
      message: "Starting automation from resolved destination",
      lastUrl: targetUrl,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: targetUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    if (isAdzunaUrl(targetUrl) || isAdzunaUnresolvedHandoffUrl(targetUrl)) {
      throw new Error(
        "Refusing to start apply automation on unresolved Adzuna URL.",
      );
    }

    console.log("[AUTO_APPLY_PLAYWRIGHT] navigating", {
      entryUrl,
      targetUrl,
      originalJobUrl: originalJobUrl ?? null,
      resolvedDirectUrl: resolvedDirectUrl ?? null,
      usedResolvedDirectUrl,
      applySource: applySource ?? null,
      startingUrlKind,
      finalChosenUrlKind,
      destinationResolvedViaEcosia,
    });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await waitForDomAndSettle(page);
    initialLoadedUrl = captureCurrentUrl(page);
    domain = parseHostname(initialLoadedUrl) || parseHostname(entryUrl);

    console.log("[AUTO_APPLY_PLAYWRIGHT] initial load", {
      entryUrl,
      targetUrl,
      originalJobUrl: originalJobUrl ?? null,
      resolvedDirectUrl: resolvedDirectUrl ?? null,
      usedResolvedDirectUrl,
      applySource: applySource ?? null,
      startingUrlKind,
      finalChosenUrlKind,
      initialLoadedUrl,
      domain,
    });
    const expectedResolvedHost = parseHostname(resolvedDirectUrl);
    const landedHost = parseHostname(initialLoadedUrl);
    if (
      resolvedDirectUrl &&
      expectedResolvedHost &&
      landedHost &&
      !hostsEquivalentOrSubdomain(landedHost, expectedResolvedHost) &&
      (isKnownAtsHost(expectedResolvedHost) || isKnownAtsHost(landedHost))
    ) {
      const message =
        "Auto Apply blocked a stale saved strategy because it tried to send the browser to a different employer domain.";
      console.error("[AUTO_APPLY_TARGET_GUARD] post-navigation mismatch detected", {
        applicationId: applicationId ?? null,
        applySessionId: applySessionId ?? null,
        expectedUrl: resolvedDirectUrl,
        actualUrl: initialLoadedUrl,
        expectedHost: expectedResolvedHost,
        actualHost: landedHost,
      });
      return {
        ok: false,
        status: "FAILED",
        finalUrl: resolvedDirectUrl,
        openUrl: resolvedDirectUrl,
        needsHuman: false,
        unavailable: true,
        message,
        debug: {
          attemptedSelectors,
          missingNames,
          entryUrl,
          initialLoadedUrl,
          finalUrl: resolvedDirectUrl,
          stoppedAtUrl: resolvedDirectUrl,
          originalJobUrl,
          resolvedDirectUrl,
          applySource,
          usedResolvedDirectUrl,
          startingUrlKind,
          finalChosenUrlKind,
          domain,
          targetUrl,
          currentUrl: resolvedDirectUrl,
          applyCtaFound: false,
          applyCtaClicked: false,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationDetected: false,
          verificationDetected: false,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          verificationSignals: [],
          confirmationSignals: [],
          finalStatus: "FAILED",
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: 0,
          urlsVisited: [resolvedDirectUrl],
          clicks: [],
          formDetected: false,
          finalReason: "STRATEGY_DOMAIN_MISMATCH",
        },
      };
    }
    const landedAtsComparison = resolvedDirectUrl
      ? compareAtsJobIdentityFromUrls(resolvedDirectUrl, initialLoadedUrl)
      : null;
    if (
      landedAtsComparison?.comparable === true &&
      landedAtsComparison.matches === false
    ) {
      const message =
        "Auto Apply blocked because the browser landed on a different Greenhouse job than the selected posting.";
      console.error("[AUTO_APPLY_IDENTITY] browser landed on mismatched ATS job", {
        applicationId: applicationId ?? null,
        applySessionId: applySessionId ?? null,
        expectedUrl: resolvedDirectUrl,
        actualUrl: initialLoadedUrl,
        expectedToken: landedAtsComparison.expected.token ?? null,
        actualToken: landedAtsComparison.actual.token ?? null,
      });
      console.error("[AUTO_APPLY_IDENTITY] stopped before form fill due to wrong Greenhouse token", {
        applicationId: applicationId ?? null,
        applySessionId: applySessionId ?? null,
        currentUrl: initialLoadedUrl,
      });
      return {
        ok: false,
        status: "FAILED",
        finalUrl: initialLoadedUrl,
        openUrl: initialLoadedUrl,
        needsHuman: false,
        unavailable: true,
        message,
        debug: {
          attemptedSelectors,
          missingNames,
          entryUrl,
          initialLoadedUrl,
          finalUrl: initialLoadedUrl,
          originalJobUrl,
          resolvedDirectUrl,
          applySource,
          usedResolvedDirectUrl,
          startingUrlKind,
          finalChosenUrlKind,
          domain,
          targetUrl,
          currentUrl: initialLoadedUrl,
          providerDetected: landedAtsComparison.actual.provider,
          applyCtaFound: false,
          applyCtaClicked: false,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationDetected: false,
          verificationDetected: false,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          verificationSignals: [],
          confirmationSignals: [],
          finalStatus: "FAILED",
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: 0,
          urlsVisited: [initialLoadedUrl],
          clicks: [],
          formDetected: false,
          finalReason: "JOB_IDENTITY_MISMATCH",
        },
      };
    }

    if (browserDiagnosticsEnabled) {
      try {
        browserRuntimeDiagnostics = await readBrowserRuntimeDiagnostics(page);
        const diagnosticsTargetHost =
          parseHostname(page.url()) || parseHostname(targetUrl) || null;
        console.info("[AUTO_APPLY_BROWSER_DIAGNOSTICS]", {
          applicationId: applicationId ?? null,
          applySessionId: applySessionId ?? null,
          targetHost: diagnosticsTargetHost,
          runtime: browserAutomationLibrary,
          stealthEnabled: stealthRequested,
          stealthPluginRegistered,
          ...browserRuntimeDiagnostics,
        });
      } catch (error) {
        console.warn("[AUTO_APPLY_BROWSER_DIAGNOSTICS] failed", {
          applicationId: applicationId ?? null,
          applySessionId: applySessionId ?? null,
          targetHost: parseHostname(page.url()) || parseHostname(targetUrl) || null,
          runtime: browserAutomationLibrary,
          stealthEnabled: stealthRequested,
          stealthPluginRegistered,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const initialSignals = await detectPageSignals(page);
    const forceEntryCtaPhase = shouldForceEntryCtaPhase(
      domain,
      page.url(),
    );
    const realApplyDestinationPage = isImmediateApplyDestinationPage({
      hostname: domain,
      currentUrl: page.url(),
      signals: initialSignals,
    });
    const willRunEntryCtaPhase =
      forceEntryCtaPhase ||
      (!initialSignals.confirmationDetected &&
        !initialSignals.needsHuman &&
        !initialSignals.formDetected);

    console.log("[AUTO_APPLY_ENTRY_CTA] gating", {
      domain,
      currentUrl: page.url(),
      isRealApplyDestinationPage: realApplyDestinationPage,
      forceEntryCtaPhase,
      willRunEntryCtaPhase,
      willRunUniversalActionLoop: true,
    });

    const adzunaDetailsPhase = isAdzunaDetailsPage(page.url())
      ? await runAdzunaDetailsApplyPhase({
          page,
          context,
          onPageReady: args.onPageReady,
        })
      : {
          page,
          urlsVisited: [page.url()],
          clicks: [],
          attempts: [],
          applyClicks: [],
          handled: false,
          applyClicked: false,
          applyCaptureDetected: false,
          applyCaptureSkipClicked: false,
          postApplyProgressionAttempted: false,
          postApplyProgressionSucceeded: false,
          postApplyPopupDetected: false,
          postApplyNewPageDetected: false,
          postApplyFallbackAttempted: false,
          applyNavigationForced: false,
        };

    page = adzunaDetailsPhase.page;
    captureCurrentUrl(page);
    if (adzunaDetailsPhase.attempts.length > 0) {
      ctaAttempts = [...ctaAttempts, ...adzunaDetailsPhase.attempts];
    }
    if (adzunaDetailsPhase.clicks.length > 0) {
      adzunaPhaseClicks = adzunaDetailsPhase.clicks;
      adzunaPhaseUrlsVisited = adzunaDetailsPhase.urlsVisited;
    }
    if (adzunaDetailsPhase.applyClicks.length > 0) {
      realApplyPreludeClicks = adzunaDetailsPhase.applyClicks;
      applyCtaClickedText = adzunaDetailsPhase.applyClickedText;
      applyCtaClickedSelector = adzunaDetailsPhase.applyClickedSelector;
    }
    adzunaApplyCaptureDetected = adzunaDetailsPhase.applyCaptureDetected;
    adzunaApplyCaptureSkipClicked =
      adzunaDetailsPhase.applyCaptureSkipClicked;
    adzunaApplyCaptureSkipText = adzunaDetailsPhase.applyCaptureSkipText;
    adzunaApplyCaptureSkipSelector =
      adzunaDetailsPhase.applyCaptureSkipSelector;
    adzunaPostApplyProgressionAttempted =
      adzunaDetailsPhase.postApplyProgressionAttempted;
    adzunaPostApplyProgressionSucceeded =
      adzunaDetailsPhase.postApplyProgressionSucceeded;
    adzunaPostApplyUrlAfter = adzunaDetailsPhase.postApplyUrlAfter;
    adzunaPostApplyPopupDetected =
      adzunaDetailsPhase.postApplyPopupDetected;
    adzunaPostApplyNewPageDetected =
      adzunaDetailsPhase.postApplyNewPageDetected;
    adzunaPostApplyFallbackAttempted =
      adzunaDetailsPhase.postApplyFallbackAttempted;
    applyHrefExtracted = adzunaDetailsPhase.applyHrefExtracted;
    applyNavigationForced =
      adzunaDetailsPhase.applyNavigationForced ?? false;
    applyNavigationUrl = adzunaDetailsPhase.applyNavigationUrl;
    latestActionText =
      adzunaDetailsPhase.latestActionText ?? latestActionText;
    latestActionSelector =
      adzunaDetailsPhase.latestActionSelector ?? latestActionSelector;

    const shouldRunGenericEntryPhase =
      willRunEntryCtaPhase && !adzunaDetailsPhase.applyClicked;

    const entryPhase = shouldRunGenericEntryPhase
      ? await runEntryCtaPhase({
          page,
          context,
          domain: detectApplyDomain(initialLoadedUrl || entryUrl),
          onPageReady: args.onPageReady,
        })
      : {
          page,
          urlsVisited: [page.url()],
          clicks: [],
          attempts: [],
          ctaFound: false,
          dismissedBlocker: false,
        };

    page = entryPhase.page;
    captureCurrentUrl(page);
    entryPhaseClicks = entryPhase.clicks;
    entryPhaseUrlsVisited = entryPhase.urlsVisited;
    trackedClicks = [];
    trackedUrlsVisited = entryPhaseUrlsVisited;
    trackedHopCount = 0;
    ctaAttempts = [...ctaAttempts, ...entryPhase.attempts];
    entryCtaFound = entryPhase.ctaFound;
    entryCtaClicked = entryPhase.clicks.length > 0;
    entryCtaClickedText = entryPhase.ctaClickedText;
    entryCtaClickedSelector = entryPhase.ctaClickedSelector;
    entryDismissedBlocker = entryPhase.dismissedBlocker;
    if (entryPhase.ctaClickedText || entryPhase.ctaClickedSelector) {
      latestActionText = entryPhase.ctaClickedText ?? latestActionText;
      latestActionSelector =
        entryPhase.ctaClickedSelector ?? latestActionSelector;
    }
    cookiePhaseClicks = [];
    cookiePhaseUrlsVisited = [];
    cookiePromptAttempts = [];

    if (isAdzunaLandRedirectPage(page.url())) {
      const handoffCookiePhase = await dismissCookieConsentIfPresent({
        page,
        context,
        onPageReady: args.onPageReady,
      });
      page = handoffCookiePhase.page;
      captureCurrentUrl(page);
      mergeCookiePromptPhase(handoffCookiePhase);

      const handoffPhase = await runHandoffContinuationPhase({
        page,
        context,
        resolverSelectedLink,
        resolverCandidates,
        onPageReady: args.onPageReady,
      });
      mergeHandoffPhase(handoffPhase);
      page = activePage ?? page;
      captureCurrentUrl(page);
    }

    const initialCookiePhase = await dismissCookieConsentIfPresent({
      page,
      context,
      onPageReady: args.onPageReady,
    });
    page = initialCookiePhase.page;
    captureCurrentUrl(page);
    mergeCookiePromptPhase(initialCookiePhase);

    // Keep apply CTA handling generic so the browser stays on the selected
    // posting URL instead of jumping through a hardcoded RTX-specific prelude.

    if (
      isAdzunaLandRedirectPage(page.url()) ||
      isAppcastTrackingPage(page.url())
    ) {
      await continueKnownChainBeforeClassification("pre_chase_guard");
      page = activePage ?? page;
      captureCurrentUrl(page);
    }

    const preChaseAdzunaAuthFailure =
      await maybeHandleAdzunaAuthGateBeforeChase("pre_chase_auth_gate");
    if (preChaseAdzunaAuthFailure) {
      return preChaseAdzunaAuthFailure;
    }

    let chase: CtaChaseResult | undefined;

    const unresolvedAdzunaHandoff =
      isAdzunaLandRedirectPage(page.url()) &&
      handoffPageDetected &&
      handoffContinuationAttempted &&
      !handoffContinuationSucceeded &&
      !handoffResolvedViaKnownChain &&
      !appcastHopDetected &&
      !diceDestinationDetected &&
      !adzunaExtractedRedirectUrl &&
      !adzunaFallbackLinkFound &&
      !resolvedHandoffElementFound &&
      !handoffCtaFound;

    if (unresolvedAdzunaHandoff) {
      const finalUrl = page.url();
      const finalStatus = "AUTO_APPLY_UNAVAILABLE";
      const message = buildAdzunaInterstitialFailureMessage({
        currentUrl: finalUrl,
        tokenizedInterstitialDetected:
          adzunaTokenizedInterstitialDetected,
        visibleCtaText:
          handoffCtaClickedText ??
          handoffCtaClickedSelector ??
          adzunaHandoffVisibleCtas?.[0],
        overlayDetected: adzunaOverlayDetected,
        popupOccurred: adzunaHandoffPopupOccurred,
        pageTitle: adzunaHandoffPageTitle,
      });
      const handoffFailureArtifacts =
        await captureAdzunaHandoffFailureArtifacts({
          page,
          resolverCandidates,
          resolverRejectedCandidates,
          extractedRedirectUrl: adzunaExtractedRedirectUrl,
          extractedRedirectFailureReason:
            adzunaExtractedRedirectFailureReason,
          fallbackLinkFound: adzunaFallbackLinkFound,
          resolvedHandoffElementFound,
          handoffCtaFound,
          appcastHopDetected,
          diceDestinationDetected,
          tokenizedInterstitialDetected:
            adzunaTokenizedInterstitialDetected,
          tokenizedParamsPresent: adzunaTokenizedParamsPresent,
          downstreamCandidates: adzunaDownstreamCandidates,
          scriptRedirectCandidates: adzunaScriptRedirectCandidates,
          networkRedirectCandidates: adzunaNetworkRedirectCandidates,
          finalFailureReason: message,
        });

      adzunaHandoffFailureReasons =
        handoffFailureArtifacts.adzunaHandoffFailureReasons;
      adzunaExternalLinkCandidates =
        handoffFailureArtifacts.adzunaExternalLinkCandidates;
      adzunaBodyTextPreview =
        handoffFailureArtifacts.adzunaBodyTextPreview;
      adzunaTokenizedInterstitialDetected =
        handoffFailureArtifacts.adzunaTokenizedInterstitialDetected;
      adzunaTokenizedParamsPresent =
        handoffFailureArtifacts.adzunaTokenizedParamsPresent;
      adzunaDownstreamCandidates =
        handoffFailureArtifacts.adzunaDownstreamCandidates;
      adzunaScriptRedirectCandidates =
        handoffFailureArtifacts.adzunaScriptRedirectCandidates;
      adzunaNetworkRedirectCandidates =
        handoffFailureArtifacts.adzunaNetworkRedirectCandidates;
      adzunaFinalFailureReason =
        handoffFailureArtifacts.adzunaFinalFailureReason;

      console.info("[AUTO_APPLY_ADZUNA_HANDOFF_FAILURE]", {
        currentUrl: finalUrl,
        handoffPageDetected,
        handoffContinuationAttempted,
        handoffContinuationSucceeded,
        adzunaInterstitialRecognized,
        adzunaExtractedRedirectUrl:
          adzunaExtractedRedirectUrl ?? null,
        adzunaExtractedRedirectFailureReason:
          adzunaExtractedRedirectFailureReason ?? [],
        adzunaTokenizedInterstitialDetected,
        adzunaTokenizedParamsPresent:
          adzunaTokenizedParamsPresent ?? [],
        adzunaDownstreamCandidates:
          adzunaDownstreamCandidates ?? [],
        adzunaScriptRedirectCandidates:
          adzunaScriptRedirectCandidates ?? [],
        adzunaNetworkRedirectCandidates:
          adzunaNetworkRedirectCandidates ?? [],
        adzunaFinalFailureReason: adzunaFinalFailureReason ?? message,
        adzunaFallbackLinkFound,
        resolvedHandoffElementFound,
        handoffCtaFound,
        resolverCandidates,
        resolverRejectedCandidates,
        adzunaHandoffFailureReasons,
        adzunaExternalLinkCandidates,
        adzunaBodyTextPreview,
      });

      const searchFallback = await runJobSearchFallbackFlow({
        page,
        context,
        title: searchJobTitle,
        company: searchCompany,
        location: searchLocation,
        source: applySource,
        onPageReady: args.onPageReady,
        onStatus: args.onStatus,
        viewerUrl: remoteSession?.viewerUrl,
        remoteSessionId: remoteSession?.sessionId,
      });
      mergeSearchFallbackState(searchFallback);

      if (searchFallback.ok) {
        page = searchFallback.page;
        captureCurrentUrl(page);
        domain = parseHostname(page.url()) || domain;
        chase = searchFallback.chase;

        console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] recovered from unresolved handoff", {
          initialUrl: finalUrl,
          recoveredUrl: page.url(),
          chosenCandidate: searchFallbackChosenCandidate ?? null,
          attemptCount: searchFallbackAttemptCount,
        });
      } else {
        const message = ADZUNA_PUBLIC_SEARCH_FALLBACK_FAILURE_MESSAGE;

        await args.onStatus?.({
          status: finalStatus,
          lastUrl: finalUrl,
          error: message,
          message,
          viewerUrl: remoteSession?.viewerUrl,
          openUrl: finalUrl,
          remoteSessionId: remoteSession?.sessionId,
        });

        logPlaywrightEvidence({
          attemptedSelectors,
          applyCtaFound: false,
          applyCtaClicked: false,
          currentUrl: finalUrl,
          hopCount: 0,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          finalStatus,
          submissionConfirmed: false,
        });

        return {
          ok: false,
          status: finalStatus,
          unavailable: true,
          finalUrl,
          openUrl: finalUrl,
          viewerUrl: remoteSession?.viewerUrl,
          message,
          debug: buildDebugPayload({
            attemptedSelectors,
            missingNames,
            ...debugContext(),
            ...(await captureStopPoint(page)),
            finalUrl,
            pageText: adzunaBodyTextPreview,
            sessionId: remoteSession?.sessionId,
            viewerUrl: remoteSession?.viewerUrl,
            targetUrl,
            applyCtaFound: false,
            applyCtaClicked: false,
            currentUrl: finalUrl,
            submitButtonFound: false,
            submitButtonClicked: false,
            confirmationTextFound: false,
            confirmationTextSnippet: null,
            successUrlPatternMatched: false,
            submissionConfirmed: false,
            finalStatus,
            success: false,
            needsHuman: false,
            unavailable: true,
            hopCount: 0,
            urlsVisited: dedupeUrls([
              ...adzunaPhaseUrlsVisited,
              ...entryPhaseUrlsVisited,
              ...handoffPhaseUrlsVisited,
              ...cookiePhaseUrlsVisited,
              finalUrl,
            ]),
            clicks: [
              ...adzunaPhaseClicks,
              ...entryPhaseClicks,
              ...handoffPhaseClicks,
              ...cookiePhaseClicks,
            ],
            formDetected: false,
            confirmationDetected: false,
            verificationDetected: false,
            finalReason:
              searchFallbackFailureReason ?? message,
            stopClassification:
              buildKnownHandoffStopClassification(finalUrl),
            resolverAttemptedLinks,
            resolverSelectedLink,
            resolverSuccess,
            resolverNewUrl,
            adzunaHandoffFailureReasons,
            adzunaExternalLinkCandidates,
            adzunaBodyTextPreview,
            adzunaTokenizedInterstitialDetected,
            adzunaTokenizedParamsPresent,
            adzunaDownstreamCandidates,
            adzunaScriptRedirectCandidates,
            adzunaNetworkRedirectCandidates,
            adzunaFinalFailureReason:
              adzunaFinalFailureReason ?? message,
          }),
        };
      }
    }

    chase =
      chase ??
      (await chaseApplyPath({
        page,
        context,
        onPageReady: args.onPageReady,
        onStatus: args.onStatus,
        viewerUrl: remoteSession?.viewerUrl,
        remoteSessionId: remoteSession?.sessionId,
        openUrl: page.url(),
        applicationId: applicationId ?? null,
        preferredTexts: strategyPreferredCtaTexts,
        preferredSelectors: preferredCtaSelectors,
      }));

    page = chase.page;
    captureCurrentUrl(page);
    if (isRtxWorkdayUrl(page.url())) {
      rtxFlowCompleted = true;
      rtxProgressMarkers = dedupeUrls([
        ...rtxProgressMarkers,
        "RTX_WORKDAY_REACHED",
      ]);
    }
    let rawChaseEvidence = buildCtaEvidence(
      chase,
      page.url(),
      realApplyPreludeClicks,
    );
    const initialStopClassification = deriveStopClassification({
      targetUrl,
      finalUrl: page.url(),
      currentUrl: page.url(),
      attemptedSelectors: chase.attemptedSelectors,
      applyCtaFound: rawChaseEvidence.applyCtaFound,
      applyCtaClicked: rawChaseEvidence.applyCtaClicked,
      hopCount: rawChaseEvidence.hopCount,
      confirmationTextFound: chase.signals.confirmationTextFound,
      verificationSignals: [
        ...chase.signals.verificationSignals,
        ...chase.signals.accountSignals,
      ],
      needsHuman: chase.signals.needsHuman,
      pageText: chase.signals.pageText,
      finalReason: chase.finalReason,
      formDetected: chase.signals.formDetected,
    });

    if (
      initialStopClassification.reason === "aggregator_no_cta" &&
      !rawChaseEvidence.applyCtaFound &&
      !(handoffPageDetected && handoffContinuationAttempted)
    ) {
      const resolverResult = await resolveApplySourceFromAggregatorPage(page);
      resolverAttemptedLinks = resolverResult.attemptedLinks;
      resolverCandidates = resolverResult.candidates;
      resolverRejectedCandidates = resolverResult.rejectedCandidates;
      resolverSelectedLink = resolverResult.selectedLink;
      resolverSuccess = resolverResult.success;
      resolverNewUrl = resolverResult.newUrl;

      if (resolverResult.success) {
        captureCurrentUrl(page);
        handoffPhaseClicks = [];
        handoffPhaseUrlsVisited = [];
        handoffAttempts = [];

        if (isAdzunaLandRedirectPage(page.url())) {
          const handoffCookiePhase = await dismissCookieConsentIfPresent({
            page,
            context,
            onPageReady: args.onPageReady,
          });
          page = handoffCookiePhase.page;
          captureCurrentUrl(page);
          mergeCookiePromptPhase(handoffCookiePhase);

          const handoffPhase = await runHandoffContinuationPhase({
            page,
            context,
            resolverSelectedLink,
            resolverCandidates,
            onPageReady: args.onPageReady,
          });
          mergeHandoffPhase(handoffPhase);
          page = activePage ?? page;
          captureCurrentUrl(page);
        }

        const resolvedCookiePhase = await dismissCookieConsentIfPresent({
          page,
          context,
          onPageReady: args.onPageReady,
        });
        page = resolvedCookiePhase.page;
        captureCurrentUrl(page);
        mergeCookiePromptPhase(resolvedCookiePhase);

        if (
          isAdzunaLandRedirectPage(page.url()) ||
          isAppcastTrackingPage(page.url())
        ) {
          await continueKnownChainBeforeClassification(
            "post_resolver_pre_chase_guard",
          );
          page = activePage ?? page;
          captureCurrentUrl(page);
        }

        const postResolverAdzunaAuthFailure =
          await maybeHandleAdzunaAuthGateBeforeChase(
            "post_resolver_auth_gate",
          );
        if (postResolverAdzunaAuthFailure) {
          return postResolverAdzunaAuthFailure;
        }

        const resolvedChase = await chaseApplyPath({
          page,
          context,
          onPageReady: args.onPageReady,
          onStatus: args.onStatus,
          viewerUrl: remoteSession?.viewerUrl,
          remoteSessionId: remoteSession?.sessionId,
          openUrl: page.url(),
          applicationId: applicationId ?? null,
          preferredTexts: strategyPreferredCtaTexts,
          preferredSelectors: preferredCtaSelectors,
        });

        page = resolvedChase.page;
        captureCurrentUrl(page);
        chase = mergeChaseResults({
          initial: chase,
          resolved: resolvedChase,
          resolverUrl: resolverResult.newUrl ?? resolverResult.selectedLink,
        });
        rawChaseEvidence = buildCtaEvidence(
          chase,
          page.url(),
          realApplyPreludeClicks,
        );
      }
    }

    if (
      isAdzunaLandRedirectPage(page.url()) ||
      isAppcastTrackingPage(page.url())
    ) {
      await continueKnownChainBeforeClassification(
        "post_chase_known_chain_guard",
      );
      page = activePage ?? page;
      captureCurrentUrl(page);

      if (
        !isAdzunaLandRedirectPage(page.url()) &&
        !isAppcastTrackingPage(page.url())
      ) {
        const recoveredAuthFailure =
          await maybeHandleAdzunaAuthGateBeforeChase(
            "post_chase_recovery_auth_gate",
          );
        if (recoveredAuthFailure) {
          return recoveredAuthFailure;
        }

        const recoveredChase = await chaseApplyPath({
          page,
          context,
          onPageReady: args.onPageReady,
          onStatus: args.onStatus,
          viewerUrl: remoteSession?.viewerUrl,
          remoteSessionId: remoteSession?.sessionId,
          openUrl: page.url(),
          applicationId: applicationId ?? null,
          preferredTexts: strategyPreferredCtaTexts,
          preferredSelectors: preferredCtaSelectors,
        });

        page = recoveredChase.page;
        captureCurrentUrl(page);
        chase = mergeChaseResults({
          initial: chase,
          resolved: recoveredChase,
          resolverUrl: page.url(),
        });
        rawChaseEvidence = buildCtaEvidence(
          chase,
          page.url(),
          realApplyPreludeClicks,
        );
      }
    }

    if (
      !searchFallbackTriggered &&
      knownChainAllowedToFail &&
      buildKnownHandoffStopClassification(page.url())
    ) {
      const searchFallback = await runJobSearchFallbackFlow({
        page,
        context,
        title: searchJobTitle,
        company: searchCompany,
        location: searchLocation,
        source: applySource,
        onPageReady: args.onPageReady,
        onStatus: args.onStatus,
        viewerUrl: remoteSession?.viewerUrl,
        remoteSessionId: remoteSession?.sessionId,
      });
      mergeSearchFallbackState(searchFallback);

      if (searchFallback.ok) {
        page = searchFallback.page;
        captureCurrentUrl(page);
        domain = parseHostname(page.url()) || domain;
        chase = mergeChaseResults({
          initial: chase,
          resolved: searchFallback.chase,
          resolverUrl:
            searchFallbackChosenCandidate ?? searchFallback.page.url(),
        });
        rawChaseEvidence = buildCtaEvidence(
          chase,
          page.url(),
          realApplyPreludeClicks,
        );

        console.info("[AUTO_APPLY_JOB_SEARCH_FALLBACK] recovered from known handoff stop", {
          finalUrl: page.url(),
          chosenCandidate: searchFallbackChosenCandidate ?? null,
          attemptCount: searchFallbackAttemptCount,
        });
      }
    }

    if (!chase) {
      throw new Error("CTA chase did not initialize.");
    }

    const effectiveChase = mergePreludeIntoChase({
      preludeUrlsVisited: dedupeUrls([
        ...adzunaPhaseUrlsVisited,
        ...entryPhaseUrlsVisited,
        ...handoffPhaseUrlsVisited,
        ...cookiePhaseUrlsVisited,
      ]),
      preludeClicks: [
        ...adzunaPhaseClicks,
        ...entryPhaseClicks,
        ...handoffPhaseClicks,
        ...cookiePhaseClicks,
      ],
      chase,
    });
    const chaseEvidence = buildCtaEvidence(
      chase,
      page.url(),
      realApplyPreludeClicks,
    );
    const latestApplyClick =
      chase.clicks.at(-1) ?? realApplyPreludeClicks.at(-1);
    ctaAttempts = [...ctaAttempts, ...chase.attempts];
    for (const selector of chase.attemptedSelectors) {
      if (!attemptedSelectors.includes(selector)) {
        attemptedSelectors.push(selector);
      }
    }
    applyCtaClickedText = latestApplyClick?.text ?? applyCtaClickedText;
    applyCtaClickedSelector =
      latestApplyClick?.selector ?? applyCtaClickedSelector;
    if (
      latestApplyClick?.text ||
      latestApplyClick?.selector ||
      chase.lastActionText ||
      chase.lastActionSelector
    ) {
      latestActionText =
        latestApplyClick?.text ?? chase.lastActionText ?? latestActionText;
      latestActionSelector =
        latestApplyClick?.selector ??
        chase.lastActionSelector ??
        latestActionSelector;
    }
    trackedClicks = effectiveChase.clicks;
    trackedUrlsVisited = effectiveChase.urlsVisited;
    trackedHopCount = chaseEvidence.hopCount;

    const landedWithoutStarting = isNoInteractionOnTarget({
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      currentUrl: chaseEvidence.currentUrl,
      targetUrl,
    });

    console.log("[AUTO_APPLY_PLAYWRIGHT] CTA chase result", {
      entryUrl,
      initialLoadedUrl,
      finalUrlAfterCtaChase: page.url(),
      domain,
      targetUrl,
      applyCtaFound: chaseEvidence.applyCtaFound,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      urlBeforeClick: chaseEvidence.urlBeforeClick ?? null,
      urlAfterClick: chaseEvidence.urlAfterClick ?? null,
      currentUrl: chaseEvidence.currentUrl,
      hopCount: chaseEvidence.hopCount,
      entryCtaFound,
      entryCtaClicked,
      entryCtaClickedText: entryCtaClickedText ?? null,
      entryCtaClickedSelector: entryCtaClickedSelector ?? null,
      entryDismissedBlocker,
      adzunaApplyCaptureDetected,
      adzunaApplyCaptureSkipClicked,
      adzunaApplyCaptureSkipText: adzunaApplyCaptureSkipText ?? null,
      adzunaApplyCaptureSkipSelector:
        adzunaApplyCaptureSkipSelector ?? null,
      adzunaPostApplyProgressionAttempted,
      adzunaPostApplyProgressionSucceeded,
      adzunaPostApplyUrlAfter: adzunaPostApplyUrlAfter ?? null,
      adzunaPostApplyPopupDetected,
      adzunaPostApplyNewPageDetected,
      adzunaPostApplyFallbackAttempted,
      applyHrefExtracted: applyHrefExtracted ?? null,
      applyNavigationForced,
      applyNavigationUrl: applyNavigationUrl ?? null,
      handoffPageDetected,
      handoffUrl: handoffUrl ?? null,
      handoffContinuationAttempted,
      handoffContinuationSucceeded,
      handoffCtaFound,
      handoffCtaClicked,
      handoffCtaClickedText: handoffCtaClickedText ?? null,
      handoffCtaClickedSelector: handoffCtaClickedSelector ?? null,
      handoffAttempts,
      resolvedHandoffClickAttempted,
      resolvedHandoffElementFound,
      resolvedHandoffLocatorStrategy:
        resolvedHandoffLocatorStrategy ?? null,
      resolvedHandoffClickSucceeded,
      resolvedHandoffDirectNavAttempted,
      resolvedHandoffDirectNavSucceeded,
      resolvedHandoffDirectNavUrl: resolvedHandoffDirectNavUrl ?? null,
      resolvedHandoffDirectNavUrlAfter:
        resolvedHandoffDirectNavUrlAfter ?? null,
      adzunaFallbackLinkFound,
      adzunaFallbackLinkClicked,
      adzunaFallbackLinkText: adzunaFallbackLinkText ?? null,
      adzunaFallbackLocatorStrategy:
        adzunaFallbackLocatorStrategy ?? null,
      adzunaFallbackElementFound,
      adzunaFallbackClickSucceeded,
      adzunaFallbackHref: adzunaFallbackHref ?? null,
      adzunaFallbackHost: adzunaFallbackHost ?? null,
      adzunaFallbackDirectNavAttempted,
      adzunaFallbackDirectNavSucceeded,
      adzunaExtractedRedirectUrl: adzunaExtractedRedirectUrl ?? null,
      adzunaExtractedRedirectSource:
        adzunaExtractedRedirectSource ?? null,
      adzunaExtractedRedirectHtmlRead,
      adzunaExtractedRedirectFailureReason:
        adzunaExtractedRedirectFailureReason ?? [],
      adzunaExtractedRedirectNavAttempted,
      adzunaExtractedRedirectNavSucceeded,
      adzunaFallbackUrlAfter: adzunaFallbackUrlAfter ?? null,
      adzunaTokenizedInterstitialDetected,
      adzunaTokenizedParamsPresent:
        adzunaTokenizedParamsPresent ?? [],
      adzunaDownstreamCandidates:
        adzunaDownstreamCandidates ?? [],
      adzunaScriptRedirectCandidates:
        adzunaScriptRedirectCandidates ?? [],
      adzunaNetworkRedirectCandidates:
        adzunaNetworkRedirectCandidates ?? [],
      adzunaFinalFailureReason: adzunaFinalFailureReason ?? null,
      adzunaInterstitialRecognized,
      appcastHopDetected,
      diceDestinationDetected,
      handoffResolvedViaKnownChain,
      resolvedHandoffClickedHref: resolvedHandoffClickedHref ?? null,
      resolvedHandoffClickedText: resolvedHandoffClickedText ?? null,
      resolvedHandoffUrlBefore: resolvedHandoffUrlBefore ?? null,
      resolvedHandoffUrlAfter: resolvedHandoffUrlAfter ?? null,
      adzunaAuthPageDetected,
      adzunaForgotPasswordDetected,
      adzunaLoginAttempted,
      adzunaLoginSucceeded,
      adzunaLoginFailedReason: adzunaLoginFailedReason ?? null,
      blockedResolvedHandoffCandidates,
      selectedResolvedHandoffCandidate:
        selectedResolvedHandoffCandidate ?? null,
      cookiePromptDetected,
      cookiePromptClicked,
      cookiePromptClickedText: cookiePromptClickedText ?? null,
      cookiePromptSelector: cookiePromptSelector ?? null,
      cookiePromptAttempts,
      postCookieWaitAttempted,
      postCookieUrlBefore: postCookieUrlBefore ?? null,
      postCookieUrlAfter: postCookieUrlAfter ?? null,
      postCookieUrlChanged,
      postCookieProgressDetected,
      postCookieTitleAfter: postCookieTitleAfter ?? null,
      applyCtaClickedText: applyCtaClickedText ?? null,
      applyCtaClickedSelector: applyCtaClickedSelector ?? null,
      ctaClickedText: latestActionText ?? null,
      ctaClickedSelector: latestActionSelector ?? null,
      dismissedBlocker: entryDismissedBlocker,
      ctaAttempts,
      resolverCandidates,
      resolverRejectedCandidates,
      resolverSelectedLink: resolverSelectedLink ?? null,
      searchFallbackTriggered,
      searchFallbackQueries,
      searchFallbackCandidates,
      searchFallbackChosenCandidate:
        searchFallbackChosenCandidate ?? null,
      searchFallbackAttemptCount,
      searchFallbackSuccess,
      searchFallbackFailureReason:
        searchFallbackFailureReason ?? null,
      confirmationTextFound: chase.signals.confirmationTextFound,
      confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
      successUrlPatternMatched: chase.signals.successUrlPatternMatched,
    });

    refreshKnownChainClassificationState("post_chase");

    const stalledAdzunaPostApply =
      adzunaPostApplyProgressionAttempted &&
      !adzunaPostApplyProgressionSucceeded &&
      isAdzunaDetailsPage(page.url());

    if (stalledAdzunaPostApply) {
      const finalUrl = page.url();
      const finalStatus = "AUTO_APPLY_UNAVAILABLE";
      const message =
        "Adzuna apply click did not progress beyond the details page.";

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        unavailable: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: false,
          finalReason:
            chase.finalReason ??
            "Adzuna post-apply progression did not leave the details page.",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (chase.signals.confirmationDetected) {
      const finalUrl = page.url();
      const submissionConfirmed = resolveSubmissionConfirmed({
        confirmationTextFound: chase.signals.confirmationTextFound,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        submitButtonClicked: false,
        applyCtaClicked: chaseEvidence.applyCtaClicked,
        hopCount: chaseEvidence.hopCount,
        currentUrl: finalUrl,
        targetUrl,
      });
      const finalStatus = submissionConfirmed ? "SUBMITTED" : "APPLY_NOT_STARTED";

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed,
      });

      if (!submissionConfirmed) {
        const message = landedWithoutStarting
          ? "Opened job page but could not start application."
          : "Application submission not confirmed.";

        await args.onStatus?.({
          status: finalStatus,
          lastUrl: finalUrl,
          error: message,
          message,
          viewerUrl: remoteSession?.viewerUrl,
          openUrl: finalUrl,
          remoteSessionId: remoteSession?.sessionId,
        });

        return {
          ok: false,
          status: finalStatus,
          finalUrl,
          openUrl: finalUrl,
          viewerUrl: remoteSession?.viewerUrl,
          message,
          debug: buildDebugPayload({
            attemptedSelectors,
            missingNames,
            ...debugContext(),
            ...(await captureStopPoint(page)),
            finalUrl,
            verificationSignals: chase.signals.verificationSignals,
            confirmationSignals: chase.signals.confirmationSignals,
            pageText: chase.signals.pageText,
            pageHtml: chase.signals.html,
            sessionId: remoteSession?.sessionId,
            viewerUrl: remoteSession?.viewerUrl,
            targetUrl,
            ...chaseEvidence,
            submitButtonFound: false,
            submitButtonClicked: false,
            confirmationTextFound: chase.signals.confirmationTextFound,
            confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
            successUrlPatternMatched: chase.signals.successUrlPatternMatched,
            submissionConfirmed,
            finalStatus,
            success: false,
            needsHuman: false,
            unavailable: landedWithoutStarting,
            hopCount: chaseEvidence.hopCount,
            urlsVisited: effectiveChase.urlsVisited,
            clicks: effectiveChase.clicks,
            formDetected: chase.signals.formDetected,
            confirmationDetected: chase.signals.confirmationDetected,
            verificationDetected: chase.signals.needsHuman,
            finalReason:
              chase.finalReason ??
              "Confirmation-like content was detected without any confirmed application action.",
            resolverAttemptedLinks,
            resolverSelectedLink,
            resolverSuccess,
            resolverNewUrl,
          }),
        };
      }

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed,
      });

      return {
        ok: true,
        status: finalStatus,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed,
          finalStatus,
          success: true,
          needsHuman: false,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: true,
          verificationDetected: chase.signals.needsHuman,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    const knownHandoffStopClassification =
      knownChainAllowedToFail
        ? buildKnownHandoffStopClassification(page.url())
        : undefined;

    if (knownHandoffStopClassification) {
      const finalUrl = page.url();
      const finalStatus = "AUTO_APPLY_UNAVAILABLE";
      const message =
        searchFallbackTriggered && !searchFallbackSuccess
          ? ADZUNA_PUBLIC_SEARCH_FALLBACK_FAILURE_MESSAGE
          : isAdzunaLandRedirectPage(finalUrl)
            ? buildAdzunaInterstitialFailureMessage({
                currentUrl: finalUrl,
                tokenizedInterstitialDetected:
                  adzunaTokenizedInterstitialDetected,
                visibleCtaText:
                  handoffCtaClickedText ??
                  handoffCtaClickedSelector ??
                  adzunaHandoffVisibleCtas?.[0],
                overlayDetected: adzunaOverlayDetected,
                popupOccurred: adzunaHandoffPopupOccurred,
                pageTitle: adzunaHandoffPageTitle,
              })
            : "Tracked redirect hop did not resolve to a usable application page.";
      const handoffFailureArtifacts =
        await captureAdzunaHandoffFailureArtifacts({
          page,
          resolverCandidates,
          resolverRejectedCandidates,
          extractedRedirectUrl: adzunaExtractedRedirectUrl,
          extractedRedirectFailureReason:
            adzunaExtractedRedirectFailureReason,
          fallbackLinkFound: adzunaFallbackLinkFound,
          resolvedHandoffElementFound,
          handoffCtaFound,
          appcastHopDetected,
          diceDestinationDetected,
          tokenizedInterstitialDetected:
            adzunaTokenizedInterstitialDetected,
          tokenizedParamsPresent: adzunaTokenizedParamsPresent,
          downstreamCandidates: adzunaDownstreamCandidates,
          scriptRedirectCandidates: adzunaScriptRedirectCandidates,
          networkRedirectCandidates: adzunaNetworkRedirectCandidates,
          finalFailureReason: message,
        });

      adzunaHandoffFailureReasons =
        handoffFailureArtifacts.adzunaHandoffFailureReasons;
      adzunaExternalLinkCandidates =
        handoffFailureArtifacts.adzunaExternalLinkCandidates;
      adzunaBodyTextPreview =
        handoffFailureArtifacts.adzunaBodyTextPreview;
      adzunaTokenizedInterstitialDetected =
        handoffFailureArtifacts.adzunaTokenizedInterstitialDetected;
      adzunaTokenizedParamsPresent =
        handoffFailureArtifacts.adzunaTokenizedParamsPresent;
      adzunaDownstreamCandidates =
        handoffFailureArtifacts.adzunaDownstreamCandidates;
      adzunaScriptRedirectCandidates =
        handoffFailureArtifacts.adzunaScriptRedirectCandidates;
      adzunaNetworkRedirectCandidates =
        handoffFailureArtifacts.adzunaNetworkRedirectCandidates;
      adzunaFinalFailureReason =
        handoffFailureArtifacts.adzunaFinalFailureReason;

      if (isAdzunaLandRedirectPage(finalUrl)) {
        console.info("[AUTO_APPLY_ADZUNA_HANDOFF_FAILURE]", {
          currentUrl: finalUrl,
          handoffPageDetected,
          handoffContinuationAttempted,
          handoffContinuationSucceeded,
          adzunaInterstitialRecognized,
          adzunaTokenizedInterstitialDetected,
          adzunaTokenizedParamsPresent:
            adzunaTokenizedParamsPresent ?? [],
          adzunaDownstreamCandidates:
            adzunaDownstreamCandidates ?? [],
          adzunaScriptRedirectCandidates:
            adzunaScriptRedirectCandidates ?? [],
          adzunaNetworkRedirectCandidates:
            adzunaNetworkRedirectCandidates ?? [],
          adzunaFinalFailureReason: adzunaFinalFailureReason ?? message,
          adzunaHandoffFailureReasons,
          adzunaExternalLinkCandidates,
          adzunaBodyTextPreview,
        });
      }

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        error: message,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        unavailable: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: [],
          confirmationSignals: chase.signals.confirmationSignals,
          pageText:
            chase.signals.pageText ?? adzunaBodyTextPreview,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: false,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: false,
          finalReason:
            searchFallbackFailureReason ??
            adzunaFinalFailureReason ??
            chase.finalReason ??
            message,
          stopClassification: knownHandoffStopClassification,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
          adzunaHandoffFailureReasons,
          adzunaExternalLinkCandidates,
          adzunaBodyTextPreview,
          adzunaTokenizedInterstitialDetected,
          adzunaTokenizedParamsPresent,
          adzunaDownstreamCandidates,
          adzunaScriptRedirectCandidates,
          adzunaNetworkRedirectCandidates,
          adzunaFinalFailureReason:
            adzunaFinalFailureReason ?? message,
        }),
      };
    }

    const allowChaseVerificationRequired = shouldAllowVerificationRequired(
      {
        status:
          chase.signals.verificationSignals.length > 0
            ? "VERIFICATION_REQUIRED"
            : "WAITING_HUMAN",
        verificationSignals: chase.signals.verificationSignals,
        needsHuman: chase.signals.needsHuman,
      },
      {
        attemptedSelectors,
        ...chaseEvidence,
        formScanAttempted: false,
        formFound: chase.signals.formDetected,
        formFillAttempted: false,
        verificationEvidence: chase.signals.verificationEvidence,
      },
    );
    if (chase.signals.needsHuman && knownChainAllowedToFail && allowChaseVerificationRequired) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const verificationRequired =
        chase.signals.verificationSignals.length > 0;
      console.log("[AUTO_APPLY_FORM_FIRST] pre-verification gate", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        attemptedSelectors,
        applyCtaFound: chaseEvidence.applyCtaFound,
        applyCtaClicked: chaseEvidence.applyCtaClicked,
        formScanAttempted: false,
        formFound: chase.signals.formDetected,
        formFillAttempted: false,
        filledFieldCount: 0,
        requiredFieldCount: 0,
        missingRequiredFields: [],
        verificationDetected: chase.signals.verificationEvidence.detected,
        verificationEvidence: chase.signals.verificationEvidence,
        allowVerificationRequired: allowChaseVerificationRequired,
      });
      const humanStatus = verificationRequired
        ? "VERIFICATION_REQUIRED"
        : "WAITING_HUMAN";
      const message = verificationRequired
        ? APPLY_VERIFICATION_REQUIRED_USER_MESSAGE
        : "Account creation or verification needs human completion.";

      await args.onStatus?.({
        status: humanStatus,
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus: humanStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: humanStatus,
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          verificationEvidence: chase.signals.verificationEvidence,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus: humanStatus,
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: verificationRequired,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if ("unavailable" in chase && chase.unavailable && knownChainAllowedToFail) {
      const finalUrl = page.url();
      const finalStatus = landedWithoutStarting
        ? "APPLY_NOT_STARTED"
        : "AUTO_APPLY_UNAVAILABLE";
      const message = landedWithoutStarting
        ? "Opened job page but could not start application."
        : "Auto apply is not available for this job application because no usable apply path was found.";

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: chase.signals.confirmationTextFound,
        confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
        successUrlPatternMatched: chase.signals.successUrlPatternMatched,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        unavailable: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: chase.signals.verificationSignals,
          confirmationSignals: chase.signals.confirmationSignals,
          pageText: chase.signals.pageText,
          pageHtml: chase.signals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: chase.signals.confirmationTextFound,
          confirmationTextSnippet: chase.signals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: chase.signals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: true,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: chase.signals.formDetected,
          confirmationDetected: chase.signals.confirmationDetected,
          verificationDetected: chase.signals.needsHuman,
          finalReason: chase.finalReason,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    console.log("[AUTO_APPLY_PLAYWRIGHT] resume availability", {
      targetUrl,
      hasResumePath: Boolean(args.resumePath),
    });

    if (greenhouseProviderForCta || isGreenhouseUrl(page.url())) {
      const beforeFallbackDetection = await detectGreenhouseApplicationForm(page);
      if (!beforeFallbackDetection.formDetected) {
        const currentGreenhouseUrl = page.url();
        const candidateEmbedUrl = await discoverGreenhouseEmbedCandidate(page);
        const embedFallback = buildSafeGreenhouseEmbedUrl({
          currentUrl: currentGreenhouseUrl,
          targetUrl,
          candidateUrl: candidateEmbedUrl,
        });
        console.log("[GREENHOUSE_FORM_FIRST] embed fallback before verification", {
          applicationId: applicationId ?? null,
          currentUrl: currentGreenhouseUrl,
          preferredTargetUrl: embedFallback.url ?? candidateEmbedUrl ?? null,
          allowed: embedFallback.allowed,
          reason: embedFallback.reason,
        });

        if (embedFallback.allowed && embedFallback.url) {
          await page
            .goto(embedFallback.url, { waitUntil: "domcontentloaded", timeout: 30_000 })
            .catch(() => null);
          await waitForDomAndSettle(page);
          captureCurrentUrl(page);
        }
      }
    }

    await args.onStatus?.({
      status: "OPENING_FORM",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    const meaningfulFormControls = await waitForMeaningfulFormControls(page, {
      timeoutMs: 15_000,
      minCount: 1,
      pollMs: 350,
    });
    if (!meaningfulFormControls && rtxFlowAttempted) {
      rtxFailureReason =
        rtxFailureReason ?? "RTX_MEANINGFUL_FORM_CONTROL_NOT_FOUND";
    }

    await args.onStatus?.({
      status: "FILLING_FORM",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
      debug: {
        currentUrl: page.url(),
        latestUrl: page.url(),
        formFound: Boolean(meaningfulFormControls),
        formScanAttempted: true,
      },
    });

    const greenhouseProviderDetected =
      isGreenhouseUrl(captureCurrentUrl(page)) || isGreenhouseUrl(targetUrl);
    let greenhouseFormState: FillGreenhouseApplicationFormResult | null = null;
    let genericFormState: VisibleFormState | null = null;
    let verificationOverriddenByVisibleForm = false;
    let formScanAttempted = false;
    let formFound = Boolean(meaningfulFormControls);
    let formFillAttempted = false;
    let genericFilledFieldCount = 0;
    let resumeUploadAttempted = false;
    let resumeUploadSucceeded = false;
    let submitOrContinueAttempted = false;
    let submitOrContinueClicked = false;

    if (greenhouseProviderDetected) {
      formScanAttempted = true;
      greenhouseFormState = await fillGreenhouseApplicationForm(page, {
        values: args.values,
        resumePath: args.resumePath,
        attemptedSelectors,
      });
      formFound = greenhouseFormState.formDetected;
      formFillAttempted = greenhouseFormState.formDetected;
      resumeUploadAttempted = greenhouseFormState.resumeUploadAttempted;
      resumeUploadSucceeded = greenhouseFormState.resumeUploadSucceeded;

      for (const missingName of greenhouseFormState.missingPayloadNames) {
        if (!missingNames.includes(missingName)) {
          missingNames.push(missingName);
        }
      }

      logGreenhouseFormState({
        currentUrl: captureCurrentUrl(page),
        stoppedAtUrl: captureCurrentUrl(page),
        formState: greenhouseFormState,
        filledFieldCount: greenhouseFormState.filledFieldCount,
        missingRequiredFields: greenhouseFormState.missingRequiredFields,
        submitButtonClicked: false,
        submissionConfirmed: false,
      });
    }

    if (!greenhouseFormState?.formDetected) {
      formScanAttempted = true;
      formFillAttempted = Boolean(meaningfulFormControls);
      for (const [name, rawValue] of Object.entries(args.values)) {
        const allowChoiceControls = shouldAllowChoiceControls(name, rawValue);
        const locator = await findMatchingLocator(page, name, attemptedSelectors, {
          allowChoiceControls,
        });
        if (!locator) {
          missingNames.push(name);
          continue;
        }

        const first = locator.first();
        const tagName = await first
          .evaluate((el) => el.tagName.toLowerCase())
          .catch(() => "");
        const inputType =
          tagName === "input"
            ? await first
                .evaluate(
                  (el) => (el as HTMLInputElement).type?.toLowerCase() || "text",
                )
                .catch(() => "text")
            : "";
        const count = await locator.count();

        if (tagName === "select") {
          const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
          const selected = await first
            .selectOption({ value: String(value) })
            .catch(async () => first.selectOption({ label: String(value) }));
          if (selected.length > 0) {
            genericFilledFieldCount += 1;
          }
          continue;
        }

        if (inputType === "checkbox") {
          const values = asArray(rawValue);
          for (let i = 0; i < count; i += 1) {
            const checkbox = locator.nth(i);
            if (!(await isInteractableChoiceLocator(checkbox))) {
              continue;
            }
            const elementValue = await checkbox.getAttribute("value");
            const labelText = (await extractLocatorText(checkbox))
              .toLowerCase()
              .trim();

            const shouldCheck = values.some((target) => {
              const normalized = target.toLowerCase().trim();
              if (elementValue && elementValue.toLowerCase() === normalized)
                return true;
              return Boolean(labelText) && labelText.includes(normalized);
            });

            if (shouldCheck) {
              await checkbox.check().catch(() => undefined);
              genericFilledFieldCount += 1;
            }
          }
          continue;
        }

        if (inputType === "radio") {
          const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
          for (let i = 0; i < count; i += 1) {
            const option = locator.nth(i);
            if (!(await isInteractableChoiceLocator(option))) {
              continue;
            }
            const optionValue = await option.getAttribute("value");
            const optionText = (await extractLocatorText(option))
              .toLowerCase()
              .trim();
            const normalizedValue = String(value).toLowerCase().trim();

            if (
              optionValue?.toLowerCase() === normalizedValue ||
              optionText.includes(normalizedValue)
            ) {
              await option
                .check()
                .catch(() => option.click().catch(() => undefined));
              genericFilledFieldCount += 1;
              break;
            }
          }
          continue;
        }

        if (inputType === "file") {
          if (args.resumePath) {
            resumeUploadAttempted = true;
            await first.setInputFiles(args.resumePath);
            resumeUploadSucceeded = true;
            genericFilledFieldCount += 1;
          }
          continue;
        }

        const value = Array.isArray(rawValue) ? (rawValue[0] ?? "") : rawValue;
        await first.fill(String(value ?? ""));
        genericFilledFieldCount += 1;
      }

      if (args.resumePath) {
        const fileInput = page.locator('input[type="file"]:visible').first();
        if ((await fileInput.count()) > 0) {
          resumeUploadAttempted = true;
          await fileInput.setInputFiles(args.resumePath);
          resumeUploadSucceeded = true;
          genericFilledFieldCount += 1;
          console.log("[AUTO_APPLY_CRAWL] resume uploaded", args.resumePath);
        }
      }

      if (greenhouseProviderDetected) {
        const postGenericDetection = await detectGreenhouseApplicationForm(page);
        formFound = postGenericDetection.formDetected;
        formFillAttempted = postGenericDetection.formDetected;
        greenhouseFormState = {
          ...postGenericDetection,
          filledFieldCount: genericFilledFieldCount,
          missingRequiredFields: [
            ...new Set(
              postGenericDetection.fields
                .filter((field) => field.required && field.enabled && !field.filled)
                .map((field) => field.label || field.name || "Required field")
                .filter(Boolean),
            ),
          ],
          missingPayloadNames: [],
          resumeInputFound: false,
          resumeUploadAttempted,
          resumeUploadSucceeded,
        };
      } else {
        genericFormState = await inspectVisibleFormState(page);
        formFound = genericFormState.formDetected;
        formFillAttempted = genericFormState.formDetected;
        genericFormState = {
          ...genericFormState,
          filledFieldCount: Math.max(
            genericFormState.filledFieldCount,
            genericFilledFieldCount,
          ),
        };
      }
    }

    const detectedFieldLabels =
      greenhouseFormState?.fields.map((field) => field.label).filter(Boolean) ??
      genericFormState?.missingRequiredFields ??
      [];
    console.log("[AUTO_APPLY_FORM_FILL] form scan result", {
      applicationId: applicationId ?? null,
      currentUrl: page.url(),
      formFound,
      inputCount:
        greenhouseFormState?.fields.filter((field) => field.type !== "textarea" && field.type !== "select").length ??
        genericFormState?.visibleFieldCount ??
        0,
      textareaCount:
        greenhouseFormState?.fields.filter((field) => field.type === "textarea").length ??
        0,
      selectCount:
        greenhouseFormState?.fields.filter((field) => field.type === "select").length ??
        0,
      fileInputCount:
        greenhouseFormState?.fields.filter((field) => field.type === "file").length ??
        (genericFormState?.fileInputFound ? 1 : 0),
      requiredFieldCount:
        greenhouseFormState?.requiredFieldCount ?? genericFormState?.requiredFieldCount ?? 0,
      labels: detectedFieldLabels,
    });
    console.log("[AUTO_APPLY_FORM_FILL] filled fields", {
      applicationId: applicationId ?? null,
      currentUrl: page.url(),
      filledFieldCount:
        greenhouseFormState?.filledFieldCount ?? genericFormState?.filledFieldCount ?? 0,
      filledLabels: [],
      resumeUploadAttempted,
      resumeUploadSucceeded,
      missingRequiredFields:
        greenhouseFormState?.missingRequiredFields ??
        genericFormState?.missingRequiredFields ??
        [],
      unsupportedRequiredFields: [],
    });
    const buildFormProgressDebug = () => ({
      formScanAttempted,
      formFound,
      formFillAttempted,
      resumeUploadAttempted,
      resumeUploadSucceeded,
      unsupportedRequiredFields: [] as string[],
    });
    let aiFormAnswerEngineRan = false;
    let aiFormAnswersGenerated = false;
    let aiFormAutofillCompleted = false;
    let aiFormScannedFields: FormFieldDescriptor[] = [];
    let aiFormGeneratedAnswers: GeneratedFormAnswer[] = [];
    let aiFormFillResult: FillGeneratedAnswersResult | null = null;
    let aiFormBlockedFields: Array<{
      fieldId: string;
      label: string;
      reason: string;
      category: string;
      answerDraft?: string | null;
      options?: string[];
      sensitive?: boolean;
    }> = [];

    if (formScanAttempted && formFound) {
      aiFormAnswerEngineRan = true;
      aiFormScannedFields = await scanCurrentForm(page);
      const requiredFieldCount = aiFormScannedFields.filter(
        (field) => field.required && field.visible && !field.disabled,
      ).length;
      console.log("[AI_FORM_ENGINE] form scanned", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        fieldCount: aiFormScannedFields.length,
        requiredFieldCount,
        labels: aiFormScannedFields.map((field) => field.label).slice(0, 40),
      });
      for (const field of aiFormScannedFields.filter(
        (item) => item.required && item.visible && !item.disabled,
      )) {
        const classification = classifyRequiredApplicationField({
          questionLabel: field.label,
          fieldType: field.inputType,
          placeholder: field.placeholder,
          required: field.required,
          name: field.name,
          id: field.idAttribute,
          nearbyText: field.nearbyText,
          options: field.options,
        });
        console.log("[AI_FORM_ANSWER] detected required question", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label: field.label,
          fieldType: field.inputType,
          classification: classification.category,
          reason: classification.reason,
        });
      }
      console.log("[AI_FORM_ANSWER] context available", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        hasProfile: Boolean(args.metadata?.userProfile),
        hasResumeText: Boolean(args.metadata?.resumeText),
        hasResumeSummary: Boolean(args.metadata?.resumeSummary),
        hasJobTitle: Boolean(searchJobTitle),
        hasCompanyName: Boolean(searchCompany),
        hasJobDescription: Boolean(args.metadata?.jobDescription),
        existingAnswerCount: Object.keys(args.values).length,
      });

      const aiGenerated = await generateFormAnswers({
        userProfile: args.metadata?.userProfile ?? args.values,
        resumeText: args.metadata?.resumeText ?? undefined,
        resumeSummary: args.metadata?.resumeSummary ?? undefined,
        jobTitle: searchJobTitle,
        companyName: searchCompany,
        jobDescription: args.metadata?.jobDescription ?? undefined,
        pageText: await page.innerText("body").catch(() => ""),
        source: applySource,
        existingApplicationAnswers: Object.fromEntries(
          Object.entries(args.values).map(([key, value]) => [
            key,
            Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
          ]),
        ),
        fields: aiFormScannedFields,
      });
      aiFormGeneratedAnswers = aiGenerated.answers;
      aiFormBlockedFields = aiGenerated.blockedFields;
      aiFormAnswersGenerated = true;

      console.log("[AI_FORM_ENGINE] answers generated", {
        applicationId: applicationId ?? null,
        answeredCount: aiGenerated.answers.length,
        blockedCount: aiGenerated.blockedFields.length,
        answers: aiGenerated.answers.map((answer) => ({
          label: answer.label,
          confidence: answer.confidence,
          safeToAutofill: answer.safeToAutofill,
          requiresUserReview: answer.requiresUserReview,
          sourceBasis: answer.sourceBasis,
        })),
        blockedFields: aiGenerated.blockedFields,
      });
      for (const answer of aiGenerated.answers) {
        console.log("[AI_FORM_ANSWER] generated answer", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label: answer.label,
          confidence: answer.confidence,
          safeToAutofill: answer.safeToAutofill,
          requiresUserReview: answer.requiresUserReview,
          sourceHints: answer.sourceBasis,
          answerLength:
            typeof answer.value === "string"
              ? answer.value.length
              : Array.isArray(answer.value)
                ? answer.value.join(",").length
                : String(answer.value).length,
          reason: answer.reason,
        });
      }
      for (const blocked of aiGenerated.blockedFields) {
        console.log("[AI_FORM_ANSWER] skipped field", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label: blocked.label,
          category: blocked.category,
          reason: blocked.reason,
        });
      }

      aiFormFillResult = await fillGeneratedAnswers(page, aiGenerated.answers, {
        fields: aiFormScannedFields,
        resumePath: args.resumePath,
        applicationId: applicationId ?? null,
        sessionId: applySessionId ?? remoteSession?.sessionId ?? applicationId ?? null,
      });
      aiFormAutofillCompleted = aiFormFillResult.failedCount === 0;
      resumeUploadAttempted =
        resumeUploadAttempted || aiFormFillResult.resumeUploadAttempted;
      resumeUploadSucceeded =
        resumeUploadSucceeded || aiFormFillResult.resumeUploadSucceeded;

      console.log("[AI_FORM_ENGINE] playwright fill completed", {
        applicationId: applicationId ?? null,
        filledCount: aiFormFillResult.filledCount,
        skippedCount: aiFormFillResult.skippedCount,
        failedCount: aiFormFillResult.failedCount,
        remainingRequiredFields: aiFormFillResult.remainingRequiredFields,
        resumeUploadAttempted: aiFormFillResult.resumeUploadAttempted,
        resumeUploadSucceeded: aiFormFillResult.resumeUploadSucceeded,
      });
      for (const field of aiFormFillResult.filledFields) {
        console.log("[AI_FORM_ANSWER] filled field", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label: field.label,
        });
      }
      for (const skipped of [
        ...aiFormFillResult.skippedFields,
        ...aiFormFillResult.failedFields,
      ]) {
        console.log("[AI_FORM_ANSWER] skipped field", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label: skipped.label,
          reason: skipped.reason,
        });
      }
      console.log("[AI_FORM_ANSWER] retrying required-field validation", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        filledCount: aiFormFillResult.filledCount,
      });
      for (const label of aiFormFillResult.remainingRequiredFields) {
        console.log("[AI_FORM_ANSWER] still missing after attempt", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          label,
        });
      }

      const fillBlockers = [
        ...aiFormFillResult.skippedFields,
        ...aiFormFillResult.failedFields,
      ]
        .filter((field) =>
          aiFormFillResult?.remainingRequiredFields.includes(field.label),
        )
        .map((field) => ({
          fieldId: field.fieldId,
          label: field.label,
          reason: field.reason,
          category: "unsupported",
        }));
        aiFormBlockedFields = [
        ...aiFormBlockedFields,
        ...fillBlockers.filter(
          (field) =>
            !aiFormBlockedFields.some((existing) => existing.fieldId === field.fieldId),
        ),
      ];

      if (greenhouseFormState?.formDetected) {
        greenhouseFormState = {
          ...greenhouseFormState,
          filledFieldCount:
            greenhouseFormState.filledFieldCount + aiFormFillResult.filledCount,
          missingRequiredFields: aiFormFillResult.remainingRequiredFields,
          resumeUploadAttempted,
          resumeUploadSucceeded,
        };
      }

      if (genericFormState?.formDetected) {
        genericFormState = {
          ...genericFormState,
          filledFieldCount:
            genericFormState.filledFieldCount + aiFormFillResult.filledCount,
          missingRequiredFields: aiFormFillResult.remainingRequiredFields,
        };
      }

      const remainingAfterSinglePass =
        greenhouseFormState?.missingRequiredFields ??
        genericFormState?.missingRequiredFields ??
        aiFormFillResult.remainingRequiredFields;
      if (remainingAfterSinglePass.length > 0) {
        const sessionId =
          applySessionId ?? applicationId ?? `local-${Date.now().toString(36)}`;
        const iterativeResult = await fillApplicationFormIteratively({
          page,
          applicationId: applicationId ?? "unknown_application",
          sessionId,
          jobContext: {
            jobTitle: searchJobTitle,
            companyName: searchCompany,
            jobDescription: args.metadata?.jobDescription,
            source: applySource,
          },
          userProfile: args.metadata?.userProfile ?? args.values,
          resumeContext: {
            resumeText: args.metadata?.resumeText,
            resumeSummary: args.metadata?.resumeSummary,
          },
          existingApplicationMaterials: {
            values: args.values,
            pageUrl: page.url(),
          },
          resumePath: args.resumePath,
          maxPasses: 4,
          autoSubmit: false,
        });

        aiFormFillResult = {
          ...aiFormFillResult,
          filledCount: aiFormFillResult.filledCount + iterativeResult.fieldsFilled,
          remainingRequiredFields: iterativeResult.remainingRequiredFields,
          resumeUploadAttempted:
            aiFormFillResult.resumeUploadAttempted ||
            iterativeResult.resumeUploadAttempted,
          resumeUploadSucceeded:
            aiFormFillResult.resumeUploadSucceeded ||
            iterativeResult.resumeUploadSucceeded,
        };
        if (
          iterativeResult.completed &&
          iterativeResult.remainingRequiredFields.length === 0 &&
          iterativeResult.blockedFields.length === 0
        ) {
          aiFormBlockedFields = [];
          console.log("[AUTO_APPLY_FORM_RECHECK_PASS]", {
            applicationId: applicationId ?? null,
            currentUrl: page.url(),
            missingRequiredFields: [],
            blockedCount: 0,
            lastAction: iterativeResult.lastAction,
            submitAttempted: iterativeResult.submitAttempted,
            submitConfirmed: iterativeResult.submitConfirmed,
          });
        }
      aiFormBlockedFields = [
          ...aiFormBlockedFields,
          ...iterativeResult.blockedFields.map((field) => ({
            fieldId: field.fieldId,
            label: field.label,
            reason: field.reason,
            category: field.classification,
            answerDraft: field.answerDraft ?? null,
            options: field.options,
            sensitive: field.sensitive,
          })),
        ];
        resumeUploadAttempted =
          resumeUploadAttempted || iterativeResult.resumeUploadAttempted;
        resumeUploadSucceeded =
          resumeUploadSucceeded || iterativeResult.resumeUploadSucceeded;
        if (greenhouseFormState?.formDetected) {
          greenhouseFormState = {
            ...greenhouseFormState,
            filledFieldCount:
              greenhouseFormState.filledFieldCount + iterativeResult.fieldsFilled,
            missingRequiredFields: iterativeResult.remainingRequiredFields,
            resumeUploadAttempted,
            resumeUploadSucceeded,
          };
        }
        if (genericFormState?.formDetected) {
          genericFormState = {
            ...genericFormState,
            filledFieldCount:
              genericFormState.filledFieldCount + iterativeResult.fieldsFilled,
            missingRequiredFields: iterativeResult.remainingRequiredFields,
          };
        }
      }
    }

    const aiFormProgressDebug = {
      aiFormAnswerEngineRan,
      aiFormAnswersGenerated,
      aiFormAutofillCompleted,
      aiFormFieldCount: aiFormScannedFields.length,
      aiFormRequiredFieldCount: aiFormScannedFields.filter(
        (field) => field.required && field.visible && !field.disabled,
      ).length,
      aiFormAnsweredCount: aiFormGeneratedAnswers.length,
      aiFormBlockedCount: aiFormBlockedFields.length,
      aiFormFilledCount: aiFormFillResult?.filledCount ?? 0,
      aiFormRemainingRequiredFields:
        aiFormFillResult?.remainingRequiredFields ?? [],
      aiFormBlockedFields,
      missingQuestions:
        aiFormBlockedFields.length > 0
          ? aiFormBlockedFields.map((field) => ({
              fieldId: field.fieldId,
              label: field.label,
              classification: field.category,
              reason: field.reason,
              aiDraft: field.answerDraft ?? null,
              options: field.options,
              sensitive: field.sensitive,
            }))
          : [],
    };
    const finalFormProgressDebug = {
      ...buildFormProgressDebug(),
      ...aiFormProgressDebug,
    };
    const buildMissingRequiredMessage = (fields: string[]) => {
      if (!aiFormAnswerEngineRan || fields.length === 0) {
        return `Missing required fields: ${fields.join(", ")}`;
      }

      const firstField = fields[0];
      const blocker = aiFormBlockedFields.find(
        (field) => field.label === firstField,
      );
      const contextAvailable = [
        args.metadata?.userProfile ? "profile" : "",
        args.metadata?.resumeText || args.metadata?.resumeSummary ? "resume" : "",
        searchJobTitle ? "job title" : "",
        searchCompany ? "company" : "",
        args.metadata?.jobDescription ? "job description" : "",
      ]
        .filter(Boolean)
        .join(", ");
      const reason =
        blocker?.reason ??
        "The field remained empty after AI/profile/resume autofill and validation retry.";
      const profileSource =
        args.metadata?.userProfile && typeof args.metadata.userProfile === "object"
          ? (args.metadata.userProfile as Record<string, unknown>)
          : args.values;
      const profilePhone = String(
        (profileSource as Record<string, unknown>).phone ??
          (profileSource as Record<string, unknown>).phoneNumber ??
          "",
      ).trim();
      const isPhoneStop = /\bphone|telephone|mobile\b/i.test(firstField);
      const phoneReason =
        isPhoneStop && profilePhone
          ? "Phone number exists in profile, but the form's phone/country-code control did not validate after autofill."
          : reason;
      const suggestedAction =
        isPhoneStop && profilePhone
          ? "Suggested action: review the phone/country-code field or continue manually."
          : "Suggested action: answer manually or add the missing preference to your profile, then continue Auto Apply.";

      return [
        isPhoneStop ? "Could not complete phone field." : `Could not answer required field: "${firstField}".`,
        `Reason: ${phoneReason}`,
        `Context available: ${contextAvailable || "none"}.`,
        suggestedAction,
        fields.length > 1 ? `Other missing fields: ${fields.slice(1).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    };

    if (
      greenhouseProviderDetected &&
      greenhouseFormState?.formDetected &&
      greenhouseFormState.missingRequiredFields.length > 0
    ) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = buildMissingRequiredMessage(
        greenhouseFormState.missingRequiredFields,
      );
      const lastFormRecheckAt = Date.now();
      const visibleValidationErrors = await collectVisibleValidationErrors(page);
      console.log("[AUTO_APPLY_NEEDS_USER_ANSWERS_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        missingRequiredFields: greenhouseFormState.missingRequiredFields,
        visibleValidationErrorCount: visibleValidationErrors.length,
      });

      await args.onStatus?.({
        status: "NEEDS_USER_ANSWERS",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          lastFormRecheckAt,
          finalRecheckPassed: false,
          readyToSubmit: false,
          submitAttempted: false,
          missingRequiredFields: greenhouseFormState.missingRequiredFields,
          visibleValidationErrors,
          aiFormBlockedCount: aiFormBlockedFields.length,
          actionLabel: "Answer questions to continue",
          currentUrl: finalUrl,
          latestUrl: finalUrl,
        },
      });

      logGreenhouseFormState({
        currentUrl: finalUrl,
        stoppedAtUrl: finalUrl,
        formState: greenhouseFormState,
        filledFieldCount: greenhouseFormState.filledFieldCount,
        missingRequiredFields: greenhouseFormState.missingRequiredFields,
        submitButtonClicked: false,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: "NEEDS_USER_ANSWERS",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: [],
          confirmationSignals: [],
          pageText: await page.innerText("body").catch(() => ""),
          pageHtml: await page.content().catch(() => ""),
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...finalFormProgressDebug,
          ...chaseEvidence,
          currentUrl: finalUrl,
          formScanAttempted,
          formFound,
          formFillAttempted,
          resumeUploadAttempted,
          resumeUploadSucceeded,
          providerDetected: "greenhouse",
          formContextUrl: greenhouseFormState.formContextUrl,
          submitButtonFound: greenhouseFormState.submitButtonFound,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          lastFormRecheckAt,
          finalRecheckPassed: false,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors,
          actionLabel: "Answer questions to continue",
          finalStatus: "NEEDS_USER_ANSWERS",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState.formDetected,
          visibleFieldCount: greenhouseFormState.visibleFieldCount,
          fillableFieldCount: greenhouseFormState.fillableFieldCount,
          filledFieldCount: greenhouseFormState.filledFieldCount,
          requiredFieldCount: greenhouseFormState.requiredFieldCount,
          missingRequiredFields: greenhouseFormState.missingRequiredFields,
          verificationOverriddenByVisibleForm: false,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: aiFormAnswerEngineRan
            ? "missing_required_answers_after_ai"
            : "missing_required_fields",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (
      !greenhouseProviderDetected &&
      genericFormState?.formDetected &&
      genericFormState.missingRequiredFields.length > 0
    ) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = buildMissingRequiredMessage(
        genericFormState.missingRequiredFields,
      );
      const lastFormRecheckAt = Date.now();
      const visibleValidationErrors = await collectVisibleValidationErrors(page);
      console.log("[AUTO_APPLY_NEEDS_USER_ANSWERS_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        missingRequiredFields: genericFormState.missingRequiredFields,
        visibleValidationErrorCount: visibleValidationErrors.length,
      });

      await args.onStatus?.({
        status: "NEEDS_USER_ANSWERS",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          lastFormRecheckAt,
          finalRecheckPassed: false,
          readyToSubmit: false,
          submitAttempted: false,
          missingRequiredFields: genericFormState.missingRequiredFields,
          visibleValidationErrors,
          aiFormBlockedCount: aiFormBlockedFields.length,
          actionLabel: "Answer questions to continue",
          currentUrl: finalUrl,
          latestUrl: finalUrl,
        },
      });

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        currentUrl: finalUrl,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        finalStatus: "WAITING_HUMAN",
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: "NEEDS_USER_ANSWERS",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: [],
          confirmationSignals: [],
          pageText: await page.innerText("body").catch(() => ""),
          pageHtml: await page.content().catch(() => ""),
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...finalFormProgressDebug,
          ...chaseEvidence,
          currentUrl: finalUrl,
          formScanAttempted,
          formFound,
          formFillAttempted,
          resumeUploadAttempted,
          resumeUploadSucceeded,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          lastFormRecheckAt,
          finalRecheckPassed: false,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors,
          actionLabel: "Answer questions to continue",
          finalStatus: "NEEDS_USER_ANSWERS",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: genericFormState.formDetected,
          visibleFieldCount: genericFormState.visibleFieldCount,
          fillableFieldCount: genericFormState.fillableFieldCount,
          filledFieldCount: genericFormState.filledFieldCount,
          requiredFieldCount: genericFormState.requiredFieldCount,
          missingRequiredFields: genericFormState.missingRequiredFields,
          verificationOverriddenByVisibleForm: false,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: aiFormAnswerEngineRan
            ? "missing_required_answers_after_ai"
            : "missing_required_fields",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    const greenhouseSubmitRoot =
      greenhouseFormState?.usedFrame === true
        ? page
            .frames()
            .find((frame) => frame.url() === greenhouseFormState?.formContextUrl) ?? page
        : page;
    const finalMissingRequiredFields =
      greenhouseFormState?.missingRequiredFields ??
      genericFormState?.missingRequiredFields ??
      aiFormFillResult?.remainingRequiredFields ??
      [];
    const fileUploadPending = Boolean(
      args.resumePath && resumeUploadAttempted && !resumeUploadSucceeded,
    );

    const preSubmitSignals = await detectPageSignals(page);
    if (preSubmitSignals.needsHuman) {
      if (
        greenhouseProviderDetected &&
        greenhouseFormState?.formDetected &&
        greenhouseFormState.fillableFieldCount > 0
      ) {
        verificationOverriddenByVisibleForm = true;
        logGreenhouseFormState({
          currentUrl: page.url(),
          stoppedAtUrl: page.url(),
          formState: greenhouseFormState,
          filledFieldCount: greenhouseFormState.filledFieldCount,
          missingRequiredFields: greenhouseFormState.missingRequiredFields,
          verificationSignals: preSubmitSignals.verificationSignals,
          verificationOverriddenByVisibleForm: true,
          submitButtonClicked: false,
          submissionConfirmed: false,
        });
      } else if (
        !greenhouseProviderDetected &&
        genericFormState?.formDetected &&
        genericFormState.fillableFieldCount > 0
      ) {
        verificationOverriddenByVisibleForm = true;
        console.info("[AUTO_APPLY_UNIVERSAL_ACTION] verification overridden by visible form", {
          currentUrl: page.url(),
          visibleFieldCount: genericFormState.visibleFieldCount,
          fillableFieldCount: genericFormState.fillableFieldCount,
          requiredFieldCount: genericFormState.requiredFieldCount,
          missingRequiredFields: genericFormState.missingRequiredFields,
          verificationSignals: preSubmitSignals.verificationSignals,
        });
      } else {
        keepBrowserOpen = true;
        const finalUrl = page.url();
        const verificationRequired =
          preSubmitSignals.verificationSignals.length > 0;
        const allowVerificationRequired = shouldAllowVerificationRequired(
          {
            status: verificationRequired ? "VERIFICATION_REQUIRED" : "WAITING_HUMAN",
            verificationSignals: preSubmitSignals.verificationSignals,
            needsHuman: preSubmitSignals.needsHuman,
          },
          {
            attemptedSelectors,
            ...chaseEvidence,
            formScanAttempted,
            formFound,
            formFillAttempted,
            verificationEvidence: preSubmitSignals.verificationEvidence,
          },
        );
        console.log("[AUTO_APPLY_FORM_FIRST] pre-verification gate", {
          applicationId: applicationId ?? null,
          currentUrl: page.url(),
          attemptedSelectors,
          applyCtaFound: chaseEvidence.applyCtaFound,
          applyCtaClicked: chaseEvidence.applyCtaClicked,
          formScanAttempted,
          formFound,
          formFillAttempted,
          filledFieldCount:
            greenhouseFormState?.filledFieldCount ??
            genericFormState?.filledFieldCount ??
            0,
          requiredFieldCount:
            greenhouseFormState?.requiredFieldCount ??
            genericFormState?.requiredFieldCount ??
            0,
          missingRequiredFields:
            greenhouseFormState?.missingRequiredFields ??
            genericFormState?.missingRequiredFields ??
            [],
          verificationDetected: preSubmitSignals.verificationEvidence.detected,
          verificationEvidence: preSubmitSignals.verificationEvidence,
          allowVerificationRequired,
        });
        const humanStatus = verificationRequired && allowVerificationRequired
          ? "VERIFICATION_REQUIRED"
          : "WAITING_HUMAN";
        const message = humanStatus === "VERIFICATION_REQUIRED"
          ? APPLY_VERIFICATION_REQUIRED_USER_MESSAGE
          : "Account creation or verification needs human completion.";

        await args.onStatus?.({
          status: humanStatus,
          lastUrl: finalUrl,
          message,
          viewerUrl: remoteSession?.viewerUrl,
          openUrl: finalUrl,
          remoteSessionId: remoteSession?.sessionId,
        });

        if (greenhouseFormState) {
          logGreenhouseFormState({
            currentUrl: finalUrl,
            stoppedAtUrl: finalUrl,
            formState: greenhouseFormState,
            filledFieldCount: greenhouseFormState.filledFieldCount,
            missingRequiredFields: greenhouseFormState.missingRequiredFields,
            verificationSignals: preSubmitSignals.verificationSignals,
            verificationOverriddenByVisibleForm: false,
            submitButtonClicked: false,
            submissionConfirmed: false,
          });
        }

        logPlaywrightEvidence({
          attemptedSelectors,
          ...chaseEvidence,
          currentUrl: finalUrl,
          submitButtonFound: false,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          finalStatus: humanStatus,
          submissionConfirmed: false,
        });

        return {
          ok: false,
          status: humanStatus,
          needsHuman: true,
          finalUrl,
          openUrl: finalUrl,
          viewerUrl: remoteSession?.viewerUrl,
          message,
          debug: buildDebugPayload({
            attemptedSelectors,
            missingNames,
            ...finalFormProgressDebug,
            ...debugContext(),
            ...(await captureStopPoint(page)),
            finalUrl,
            verificationSignals: preSubmitSignals.verificationSignals,
            verificationEvidence: preSubmitSignals.verificationEvidence,
            confirmationSignals: preSubmitSignals.confirmationSignals,
            pageText: preSubmitSignals.pageText,
            pageHtml: preSubmitSignals.html,
            sessionId: remoteSession?.sessionId,
            viewerUrl: remoteSession?.viewerUrl,
            targetUrl,
            ...chaseEvidence,
            currentUrl: finalUrl,
            providerDetected: greenhouseProviderDetected
              ? "greenhouse"
              : undefined,
            formContextUrl: greenhouseFormState?.formContextUrl,
            submitButtonFound: false,
            submitButtonClicked: false,
            confirmationTextFound: preSubmitSignals.confirmationTextFound,
            confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
            successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
            submissionConfirmed: false,
            finalStatus: humanStatus,
            success: false,
            needsHuman: true,
            unavailable: false,
            hopCount: chaseEvidence.hopCount,
            urlsVisited: effectiveChase.urlsVisited,
            clicks: effectiveChase.clicks,
            formDetected:
              greenhouseFormState?.formDetected ?? preSubmitSignals.formDetected,
            visibleFieldCount: greenhouseFormState?.visibleFieldCount,
            fillableFieldCount: greenhouseFormState?.fillableFieldCount,
            filledFieldCount: greenhouseFormState?.filledFieldCount,
            requiredFieldCount: greenhouseFormState?.requiredFieldCount,
            missingRequiredFields: greenhouseFormState?.missingRequiredFields,
            verificationOverriddenByVisibleForm: false,
            confirmationDetected: preSubmitSignals.confirmationDetected,
            verificationDetected: verificationRequired,
            finalReason: "Verification detected before submission.",
            resolverAttemptedLinks,
            resolverSelectedLink,
            resolverSuccess,
            resolverNewUrl,
          }),
        };
      }
    }

    const verificationChallengeVisible = Boolean(
      preSubmitSignals.needsHuman &&
        preSubmitSignals.verificationEvidence.detected &&
        !verificationOverriddenByVisibleForm,
    );
    console.log("[AUTO_APPLY_FINAL_RECHECK_START]", {
      applicationId: applicationId ?? null,
      currentUrl: page.url(),
      formFound,
      missingRequiredFieldsBeforeRecheck: finalMissingRequiredFields,
      blockedCount: aiFormBlockedFields.length,
    });
    const finalRecheck = await runFinalRequiredFieldRecheck({
      page,
      submitRoot: greenhouseSubmitRoot,
      formFound,
      missingRequiredFields: finalMissingRequiredFields,
      blockedCount: aiFormBlockedFields.length,
      fileUploadPending,
      verificationChallengeVisible,
    });
    const providerForFinalCheck = greenhouseProviderDetected
      ? "greenhouse"
      : "generic";
    const sessionIdForFinalCheck = applySessionId ?? remoteSession?.sessionId ?? null;
    console.log("[AUTO_APPLY_FINAL_REQUIRED_CHECK]", {
      applicationId: applicationId ?? null,
      sessionId: sessionIdForFinalCheck,
      provider: providerForFinalCheck,
      currentUrl: page.url(),
      formFound: finalRecheck.formFound,
      requiredFieldCount: finalRecheck.requiredFieldCount,
      filledRequiredFieldCount: finalRecheck.filledRequiredFieldCount,
      missingRequiredCount: finalRecheck.missingRequiredFields.length,
      visibleValidationErrorCount: finalRecheck.visibleValidationErrors.length,
      blockedCount: finalRecheck.blockedCount,
      submitButtonFound: finalRecheck.submitButtonFound,
      submitButtonEnabled: finalRecheck.submitButtonEnabled,
      fileUploadPending: finalRecheck.fileUploadPending,
      verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
    });
    if (finalRecheck.submitButtonFound) {
      console.log("[AUTO_APPLY_SUBMIT_BUTTON_RESOLVED]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        label: finalRecheck.submitButtonLabel ?? null,
        selectorType: finalRecheck.submitSelectorType ?? null,
        insideForm: finalRecheck.submitInsideForm,
        enabled: finalRecheck.submitButtonEnabled,
      });
    }
    const finalRecheckPassed =
      finalRecheck.formFound &&
      finalRecheck.missingRequiredFields.length === 0 &&
      finalRecheck.blockedCount === 0 &&
      finalRecheck.visibleValidationErrors.length === 0;
    const reviewBeforeSubmit =
      args.mode === "HUMAN_ASSIST" || args.metadata?.reviewBeforeSubmit === true;
    const readyToSubmit =
      finalRecheckPassed &&
      finalRecheck.submitButtonFound &&
      finalRecheck.submitButtonEnabled !== false &&
      !finalRecheck.fileUploadPending &&
      !finalRecheck.verificationChallengeVisible;
    const lastFormRecheckAt = Date.now();
    const finalRecheckStatusDebug: Partial<ApplySessionDebug> = {
      lastFormRecheckAt,
      finalRecheckPassed,
      readyToSubmit,
      submitAttempted: false,
      submissionConfirmed: false,
      finalRequiredCheckPassed: finalRecheckPassed,
      allRequiredFieldsFilled: finalRecheckPassed,
      submitButtonFound: finalRecheck.submitButtonFound,
      submitButtonEnabled: finalRecheck.submitButtonEnabled,
      missingRequiredFields: finalRecheck.missingRequiredFields,
      visibleValidationErrors: finalRecheck.visibleValidationErrors,
      fileUploadPending: finalRecheck.fileUploadPending,
      verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
      aiFormBlockedCount: finalRecheck.blockedCount,
      reviewBeforeSubmit,
      actionLabel: reviewBeforeSubmit ? "Review and submit application" : undefined,
      currentUrl: page.url(),
      latestUrl: page.url(),
    };

    if (finalRecheckPassed) {
      console.log("[AUTO_APPLY_FINAL_RECHECK_PASS]", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        submitButtonFound: finalRecheck.submitButtonFound,
        submitButtonEnabled: finalRecheck.submitButtonEnabled,
        fileUploadPending: finalRecheck.fileUploadPending,
        verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
      });
      console.log("[AUTO_APPLY_ALL_REQUIRED_FIELDS_FILLED]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: page.url(),
        requiredFieldCount: finalRecheck.requiredFieldCount,
        filledRequiredFieldCount: finalRecheck.filledRequiredFieldCount,
        missingRequiredFields: [],
        readyToSubmit: true,
      });
    }
    console.log("[AUTO_APPLY_FORM_RECHECK_PASS]", {
      applicationId: applicationId ?? null,
      currentUrl: page.url(),
      formFound: finalRecheck.formFound,
      requiredFieldCount: finalRecheck.requiredFieldCount,
      filledRequiredFieldCount: finalRecheck.filledRequiredFieldCount,
      missingRequiredFields: finalRecheck.missingRequiredFields,
      blockedCount: finalRecheck.blockedCount,
      visibleValidationErrorCount: finalRecheck.visibleValidationErrors.length,
      submitButtonFound: finalRecheck.submitButtonFound,
      submitButtonEnabled: finalRecheck.submitButtonEnabled,
      fileUploadPending: finalRecheck.fileUploadPending,
      verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
      finalRecheckPassed,
    });

    if (
      finalRecheck.formFound &&
      (finalRecheck.missingRequiredFields.length > 0 ||
        finalRecheck.blockedCount > 0 ||
        finalRecheck.visibleValidationErrors.length > 0)
    ) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const needsAnswerFields =
        finalRecheck.missingRequiredFields.length > 0
          ? finalRecheck.missingRequiredFields
          : finalRecheck.visibleValidationErrors;
      const message = needsAnswerFields.length
        ? `Required fields still need attention: ${needsAnswerFields.join(", ")}`
        : "Some required fields need user input before Hirexa can submit.";
      console.log("[AUTO_APPLY_FINAL_RECHECK_NEEDS_USER_ANSWERS]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        missingRequiredFields: finalRecheck.missingRequiredFields,
        blockedCount: finalRecheck.blockedCount,
        visibleValidationErrorCount: finalRecheck.visibleValidationErrors.length,
      });
      console.log("[AUTO_APPLY_REQUIRED_FIELDS_STILL_MISSING]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        missingRequiredFields: finalRecheck.missingRequiredFieldDetails.map(
          (field) => ({
            label: field.label,
            fieldType: field.fieldType,
            reason: field.reason,
          }),
        ),
        status: "NEEDS_USER_ANSWERS",
      });
      console.log("[AUTO_APPLY_NEEDS_USER_ANSWERS_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        missingRequiredFields: finalRecheck.missingRequiredFields,
        blockedCount: finalRecheck.blockedCount,
        visibleValidationErrorCount: finalRecheck.visibleValidationErrors.length,
      });
      await args.onStatus?.({
        status: "NEEDS_USER_ANSWERS",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          ...finalRecheckStatusDebug,
          actionLabel: "Answer questions to continue",
        },
      });
      return {
        ok: false,
        status: "NEEDS_USER_ANSWERS",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...finalFormProgressDebug,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: preSubmitSignals.verificationSignals,
          verificationEvidence: preSubmitSignals.verificationEvidence,
          confirmationSignals: preSubmitSignals.confirmationSignals,
          pageText: preSubmitSignals.pageText,
          pageHtml: preSubmitSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected ? "greenhouse" : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          submitButtonFound: finalRecheck.submitButtonFound,
          submitButtonEnabled: finalRecheck.submitButtonEnabled,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalRequiredCheckPassed: false,
          allRequiredFieldsFilled: false,
          lastFormRecheckAt,
          finalRecheckPassed: false,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors: finalRecheck.visibleValidationErrors,
          fileUploadPending: finalRecheck.fileUploadPending,
          verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
          reviewBeforeSubmit,
          actionLabel: "Answer questions to continue",
          finalStatus: "NEEDS_USER_ANSWERS",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? genericFormState?.formDetected ?? true,
          visibleFieldCount:
            greenhouseFormState?.visibleFieldCount ?? genericFormState?.visibleFieldCount,
          fillableFieldCount:
            greenhouseFormState?.fillableFieldCount ?? genericFormState?.fillableFieldCount,
          filledFieldCount:
            greenhouseFormState?.filledFieldCount ?? genericFormState?.filledFieldCount,
          requiredFieldCount:
            greenhouseFormState?.requiredFieldCount ?? genericFormState?.requiredFieldCount,
          missingRequiredFields: needsAnswerFields,
          verificationOverriddenByVisibleForm,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (finalRecheckPassed && finalRecheck.verificationChallengeVisible) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = "Verification is required before submission.";
      console.log("[AUTO_APPLY_VERIFICATION_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        verificationEvidence: preSubmitSignals.verificationEvidence,
      });
      await args.onStatus?.({
        status: "VERIFICATION_REQUIRED",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          ...finalRecheckStatusDebug,
          actionLabel: "Complete verification",
        },
      });
      return {
        ok: false,
        status: "VERIFICATION_REQUIRED",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...finalFormProgressDebug,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: preSubmitSignals.verificationSignals,
          verificationEvidence: preSubmitSignals.verificationEvidence,
          confirmationSignals: preSubmitSignals.confirmationSignals,
          pageText: preSubmitSignals.pageText,
          pageHtml: preSubmitSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected ? "greenhouse" : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          submitButtonFound: finalRecheck.submitButtonFound,
          submitButtonEnabled: finalRecheck.submitButtonEnabled,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalRequiredCheckPassed: finalRecheckPassed,
          allRequiredFieldsFilled: finalRecheckPassed,
          lastFormRecheckAt,
          finalRecheckPassed,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors: finalRecheck.visibleValidationErrors,
          fileUploadPending: finalRecheck.fileUploadPending,
          verificationChallengeVisible: true,
          reviewBeforeSubmit,
          actionLabel: "Complete verification",
          finalStatus: "VERIFICATION_REQUIRED",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? genericFormState?.formDetected ?? true,
          visibleFieldCount:
            greenhouseFormState?.visibleFieldCount ?? genericFormState?.visibleFieldCount,
          fillableFieldCount:
            greenhouseFormState?.fillableFieldCount ?? genericFormState?.fillableFieldCount,
          filledFieldCount:
            greenhouseFormState?.filledFieldCount ?? genericFormState?.filledFieldCount,
          requiredFieldCount:
            greenhouseFormState?.requiredFieldCount ?? genericFormState?.requiredFieldCount,
          missingRequiredFields: [],
          verificationOverriddenByVisibleForm,
          confirmationDetected: false,
          verificationDetected: true,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (finalRecheckPassed && reviewBeforeSubmit) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message = "Hirexa filled the application. Review the form before submitting.";
      console.log("[AUTO_APPLY_READY_FOR_USER_REVIEW]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        submitButtonFound: finalRecheck.submitButtonFound,
        filledFieldCount:
          greenhouseFormState?.filledFieldCount ??
          genericFormState?.filledFieldCount ??
          aiFormFillResult?.filledCount ??
          0,
      });
      await args.onStatus?.({
        status: "READY_FOR_USER_REVIEW",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: finalRecheckStatusDebug,
      });
      return {
        ok: false,
        status: "READY_FOR_USER_REVIEW",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...finalFormProgressDebug,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: preSubmitSignals.verificationSignals,
          verificationEvidence: preSubmitSignals.verificationEvidence,
          confirmationSignals: preSubmitSignals.confirmationSignals,
          pageText: preSubmitSignals.pageText,
          pageHtml: preSubmitSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected ? "greenhouse" : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          submitButtonFound: finalRecheck.submitButtonFound,
          submitButtonEnabled: finalRecheck.submitButtonEnabled,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalRequiredCheckPassed: finalRecheckPassed,
          allRequiredFieldsFilled: finalRecheckPassed,
          lastFormRecheckAt,
          finalRecheckPassed,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors: finalRecheck.visibleValidationErrors,
          fileUploadPending: finalRecheck.fileUploadPending,
          verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
          reviewBeforeSubmit,
          actionLabel: "Review and submit application",
          finalStatus: "READY_FOR_USER_REVIEW",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? true,
          visibleFieldCount: greenhouseFormState?.visibleFieldCount,
          fillableFieldCount: greenhouseFormState?.fillableFieldCount,
          filledFieldCount:
            greenhouseFormState?.filledFieldCount ?? genericFormState?.filledFieldCount,
          requiredFieldCount:
            greenhouseFormState?.requiredFieldCount ?? genericFormState?.requiredFieldCount,
          missingRequiredFields: [],
          verificationOverriddenByVisibleForm,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (finalRecheckPassed && !readyToSubmit) {
      keepBrowserOpen = true;
      const finalUrl = page.url();
      const message =
        "Required fields appear complete, but Hirexa could not find an enabled submit button.";
      console.log("[AUTO_APPLY_SUBMIT_BUTTON_UNAVAILABLE_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        submitButtonFound: finalRecheck.submitButtonFound,
        submitButtonEnabled: finalRecheck.submitButtonEnabled,
        fileUploadPending: finalRecheck.fileUploadPending,
      });
      await args.onStatus?.({
        status: "READY_FOR_USER_REVIEW",
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          ...finalRecheckStatusDebug,
          actionLabel: "Review and submit application",
        },
      });
      return {
        ok: false,
        status: "READY_FOR_USER_REVIEW",
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...finalFormProgressDebug,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          verificationSignals: preSubmitSignals.verificationSignals,
          verificationEvidence: preSubmitSignals.verificationEvidence,
          confirmationSignals: preSubmitSignals.confirmationSignals,
          pageText: preSubmitSignals.pageText,
          pageHtml: preSubmitSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected ? "greenhouse" : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          submitButtonFound: finalRecheck.submitButtonFound,
          submitButtonEnabled: finalRecheck.submitButtonEnabled,
          submitButtonClicked: false,
          confirmationTextFound: preSubmitSignals.confirmationTextFound,
          confirmationTextSnippet: preSubmitSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: preSubmitSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          lastFormRecheckAt,
          finalRecheckPassed,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors: finalRecheck.visibleValidationErrors,
          fileUploadPending: finalRecheck.fileUploadPending,
          verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
          reviewBeforeSubmit,
          actionLabel: "Review and submit application",
          finalStatus: "READY_FOR_USER_REVIEW",
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? genericFormState?.formDetected ?? true,
          visibleFieldCount:
            greenhouseFormState?.visibleFieldCount ?? genericFormState?.visibleFieldCount,
          fillableFieldCount:
            greenhouseFormState?.fillableFieldCount ?? genericFormState?.fillableFieldCount,
          filledFieldCount:
            greenhouseFormState?.filledFieldCount ?? genericFormState?.filledFieldCount,
          requiredFieldCount:
            greenhouseFormState?.requiredFieldCount ?? genericFormState?.requiredFieldCount,
          missingRequiredFields: [],
          verificationOverriddenByVisibleForm,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    if (readyToSubmit) {
      console.log("[AUTO_APPLY_READY_TO_SUBMIT]", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        submitSelector: finalRecheck.submitSelector,
      });
      console.log("[AUTO_APPLY_STOP_FILLING_READY_TO_SUBMIT]", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        submitSelector: finalRecheck.submitSelector,
      });
    }

    await args.onStatus?.({
      status: "SUBMITTING_APPLICATION",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
      debug: {
        ...finalRecheckStatusDebug,
        readyToSubmit,
      },
    });
      console.log("[AUTO_APPLY_SUBMITTING_APPLICATION]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: page.url(),
        finalRecheckPassed,
        readyToSubmit,
    });

    let submitUsed: string | null = null;
    let submitButtonFound = finalRecheck.submitButtonFound;
    let submitButtonEnabled = finalRecheck.submitButtonEnabled;
    let submitButtonClicked = false;
    let submitConfirmationUrl: string | null = null;
    let submitPopupUrl: string | null = null;
    let submitSameTabUrl: string | null = null;
    let submitConfirmationSource:
      | "popup_url"
      | "same_tab_url"
      | "popup_text"
      | "same_tab_text"
      | "network_response"
      | "unknown"
      | null = null;
    if (!context) {
      throw new Error("Playwright context was unavailable before submit.");
    }
    const submissionContext = context;
    for (const submitSelector of FINAL_SUBMIT_SELECTORS) {
      const button = greenhouseSubmitRoot.locator(submitSelector).first();
      if ((await button.count()) === 0) continue;
      if (!(await button.isVisible().catch(() => false))) continue;
      if (!(await button.isEnabled().catch(() => false))) continue;

      submitButtonFound = true;
      submitButtonEnabled = true;
      submitUsed = submitSelector;
      console.log("[AUTO_APPLY_SUBMIT] submit button found", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        selector: submitSelector,
      });
      submitOrContinueAttempted = true;
      console.log("[AUTO_APPLY_SUBMIT_AFTER_RECHECK]", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        selector: submitSelector,
        finalRecheckPassed,
        missingRequiredFields: finalRecheck.missingRequiredFields,
        blockedCount: finalRecheck.blockedCount,
      });
      console.log("[AUTO_APPLY_SUBMIT_AFTER_FINAL_RECHECK]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: page.url(),
        selector: submitSelector,
        finalRecheckPassed,
        readyToSubmit,
      });
      console.log("[AUTO_APPLY_CLICK_SUBMIT_APPLICATION]", {
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: page.url(),
        selector: submitSelector,
      });
      console.log("[AUTO_APPLY_CRAWL] clicking submit", submitSelector);
      const submitConfirmation = await submitAndDetectGreenhouseConfirmation({
        page,
        submitLocator: button,
        provider: providerForFinalCheck,
        applicationId: applicationId ?? null,
        sessionId: sessionIdForFinalCheck,
        targetUrl,
      });
      submitButtonClicked = submitConfirmation.submitClicked;
      submitOrContinueClicked = submitConfirmation.submitClicked;
      submitConfirmationUrl = submitConfirmation.confirmationUrl;
      submitPopupUrl = submitConfirmation.popupUrl;
      submitSameTabUrl = submitConfirmation.sameTabUrl;
      submitConfirmationSource = submitConfirmation.confirmationSource;
      break;
    }

    if (!submitUsed) {
      const finalUrl = page.url();
      const finalStatus: ApplySessionStatus = finalRecheckPassed
        ? "READY_FOR_USER_REVIEW"
        : "UNCONFIRMED";
      const message = finalRecheckPassed
        ? "Hirexa filled the application, but could not find a submit button to click automatically."
        : "Opened application form but could not find a submit button.";
      if (finalRecheckPassed) {
        console.log("[AUTO_APPLY_READY_FOR_USER_REVIEW]", {
          applicationId: applicationId ?? null,
          currentUrl: finalUrl,
          reason: "submit_button_not_found_after_successful_recheck",
        });
      }

      await args.onStatus?.({
        status: finalStatus,
        lastUrl: finalUrl,
        error: message,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
        debug: {
          ...finalRecheckStatusDebug,
          actionLabel: "Review and submit application",
        },
      });

      if (greenhouseFormState) {
        logGreenhouseFormState({
          currentUrl: finalUrl,
          stoppedAtUrl: finalUrl,
          formState: greenhouseFormState,
          filledFieldCount: greenhouseFormState.filledFieldCount,
          missingRequiredFields: greenhouseFormState.missingRequiredFields,
          verificationOverriddenByVisibleForm,
          submitButtonClicked,
          submissionConfirmed: false,
        });
      }

      logPlaywrightEvidence({
        attemptedSelectors,
        ...chaseEvidence,
        currentUrl: finalUrl,
        submitButtonFound,
        submitButtonClicked,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        finalStatus,
        submissionConfirmed: false,
      });

      return {
        ok: false,
        status: finalStatus,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...debugContext(),
          ...(await captureStopPoint(page)),
          finalUrl,
          pageHtml: await page.content().catch(() => ""),
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected
            ? "greenhouse"
            : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          ...finalFormProgressDebug,
          submitOrContinueAttempted,
          submitOrContinueClicked,
          submitButtonFound,
          submitButtonEnabled,
          submitButtonClicked,
          confirmationTextFound: false,
          confirmationTextSnippet: null,
          successUrlPatternMatched: false,
          submissionConfirmed: false,
          lastFormRecheckAt,
          finalRecheckPassed,
          readyToSubmit: false,
          submitAttempted: false,
          visibleValidationErrors: finalRecheck.visibleValidationErrors,
          fileUploadPending: finalRecheck.fileUploadPending,
          verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
          reviewBeforeSubmit,
          actionLabel: finalRecheckPassed
            ? "Review and submit application"
            : undefined,
          finalStatus,
          success: false,
          needsHuman: false,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: effectiveChase.urlsVisited,
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? true,
          visibleFieldCount: greenhouseFormState?.visibleFieldCount,
          fillableFieldCount: greenhouseFormState?.fillableFieldCount,
          filledFieldCount: greenhouseFormState?.filledFieldCount,
          requiredFieldCount: greenhouseFormState?.requiredFieldCount,
          missingRequiredFields: greenhouseFormState?.missingRequiredFields,
          verificationOverriddenByVisibleForm,
          confirmationDetected: false,
          verificationDetected: false,
          finalReason: message,
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    await args.onStatus?.({
      status: "WAITING_FOR_CONFIRMATION",
      lastUrl: captureCurrentUrl(page),
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: currentUrl,
      remoteSessionId: remoteSession?.sessionId,
      debug: {
        ...finalRecheckStatusDebug,
        readyToSubmit,
        submitAttempted: true,
        submitButtonClicked: true,
        submitButtonFound,
        submitButtonEnabled,
      },
    });

    await waitForDomAndSettle(page);
    const currentPageFinalUrl = captureCurrentUrl(page);
    const finalSignals = await detectPageSignals(page);
    let greenhouseConfirmation = submitButtonClicked
      ? submitConfirmationUrl
        ? ({
            confirmed: true,
            confirmationUrl: submitConfirmationUrl,
            confirmationSource: submitConfirmationSource ?? "unknown",
            reason: "Confirmation was detected while handling the submit click.",
            pageTextSnippet: undefined,
            popupUrl: submitPopupUrl,
          } as const)
        : await detectGreenhouseSubmissionConfirmation({
            context: submissionContext,
            page,
            observedPages: [],
            provider: providerForFinalCheck,
            targetUrl,
          })
      : null;
    let confirmationMatch = greenhouseConfirmation?.confirmed
      ? ({
          confirmed: true,
          finalUrl: greenhouseConfirmation.confirmationUrl ?? currentPageFinalUrl,
          pageTextSnippet: greenhouseConfirmation.pageTextSnippet,
          popupUrl: greenhouseConfirmation.popupUrl ?? null,
          matchedBy:
            greenhouseConfirmation.confirmationSource === "popup_url" ||
            greenhouseConfirmation.confirmationSource === "popup_text"
              ? "popup"
              : greenhouseConfirmation.confirmationSource === "same_tab_url"
                ? "url"
                : greenhouseConfirmation.confirmationSource === "same_tab_text"
                  ? "text"
                  : greenhouseConfirmation.confirmationSource === "network_response"
                    ? "url"
                    : "context-page",
        } satisfies SubmissionConfirmationMatch)
      : submitButtonClicked
        ? await detectSubmissionConfirmationAcrossPages(
            submissionContext,
            page,
            targetUrl,
            [],
          )
        : ({
            confirmed: false,
            finalUrl: currentPageFinalUrl,
          } satisfies SubmissionConfirmationMatch);
    let finalUrl = confirmationMatch.confirmed
      ? confirmationMatch.finalUrl
      : currentPageFinalUrl;
    const crossPageConfirmationTextFound =
      confirmationMatch.confirmed &&
      (confirmationMatch.matchedBy === "text" ||
        Boolean(confirmationMatch.pageTextSnippet));
    const crossPageSuccessUrlPatternMatched =
      confirmationMatch.confirmed &&
      isSubmissionConfirmationUrl(confirmationMatch.finalUrl);
    let confirmationTextFound =
      finalSignals.confirmationTextFound || crossPageConfirmationTextFound;
    const confirmationTextSnippet =
      confirmationMatch.pageTextSnippet ??
      finalSignals.confirmationTextSnippet ??
      null;
    let successUrlPatternMatched =
      finalSignals.successUrlPatternMatched || crossPageSuccessUrlPatternMatched;
    let confirmationSignals = [
      ...finalSignals.confirmationSignals,
      ...(confirmationMatch.confirmed
        ? [`submission-confirmation:${confirmationMatch.matchedBy ?? "unknown"}`]
        : []),
    ];
    if (confirmationMatch.confirmed) {
      if (isSubmissionConfirmationUrl(finalUrl)) {
        console.log("[AUTO_APPLY_CONFIRMATION] greenhouse /confirmation detected", {
          applicationId: applicationId ?? null,
          applySessionId: sessionIdForFinalCheck,
          provider: providerForFinalCheck,
          finalUrl,
          matchedBy: confirmationMatch.matchedBy ?? null,
        });
      } else if (confirmationMatch.matchedBy === "url") {
        console.log("[AUTO_APPLY_CONFIRMATION] same-tab confirmation detected", {
          applicationId: applicationId ?? null,
          applySessionId: sessionIdForFinalCheck,
          provider: providerForFinalCheck,
          finalUrl,
        });
      }
      console.log("[AUTO_APPLY_CONFIRMATION] detected", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        originalUrl: targetUrl,
        finalUrl,
        matchedBy: confirmationMatch.matchedBy ?? null,
        submitButtonClicked,
        confirmationDetected: true,
        submissionConfirmed: true,
      });
    }
    let success = resolveSubmissionConfirmed({
      confirmationTextFound,
      successUrlPatternMatched,
      submitButtonClicked,
      applyCtaClicked: chaseEvidence.applyCtaClicked,
      hopCount: chaseEvidence.hopCount,
      currentUrl: finalUrl,
      targetUrl,
    }) || (submitButtonClicked && confirmationMatch.confirmed);
    let postSubmitValidation = success
      ? ({
          validationErrorCount: 0,
          errors: [],
        } satisfies GreenhouseValidationExtractionResult)
      : await extractGreenhouseValidationErrors({
          page,
          provider: providerForFinalCheck,
        });
    let postSubmitValidationErrors = postSubmitValidation.errors.map(
      formatPostSubmitValidationError,
    );
    let postSubmitValidationRepairAttempted = false;
    let postSubmitValidationRepairSucceeded = false;
    let validationErrorsAfterSubmit =
      !success && postSubmitValidation.validationErrorCount > 0;
    let securityValidationAfterSubmit =
      validationErrorsAfterSubmit && hasPostSubmitSecurityValidation(postSubmitValidation);

    if (validationErrorsAfterSubmit) {
      console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] extracted validation errors", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        validationErrorCount: postSubmitValidation.validationErrorCount,
        errors: postSubmitValidation.errors.map((error) => ({
          text: error.text,
          normalizedText: error.normalizedText,
          fieldLabel: error.fieldLabel,
          fieldName: error.fieldName,
          fieldId: error.fieldId,
          fieldType: error.fieldType,
          selectorHint: error.selectorHint,
          ariaInvalid: error.ariaInvalid,
          ariaDescribedBy: error.ariaDescribedBy,
          describedByText: error.describedByText,
          closestFormGroupText: error.closestFormGroupText,
          nearbyText: error.nearbyText,
          category: error.category,
          repairable: error.repairable,
        })),
      });
      for (const error of postSubmitValidation.errors) {
        console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] mapped validation error to field", {
          applicationId: applicationId ?? null,
          applySessionId: sessionIdForFinalCheck,
          provider: providerForFinalCheck,
          text: error.text,
          fieldLabel: error.fieldLabel,
          fieldName: error.fieldName,
          fieldId: error.fieldId,
          fieldType: error.fieldType,
          ariaInvalid: error.ariaInvalid,
          ariaDescribedBy: error.ariaDescribedBy,
          describedByText: error.describedByText,
          closestFormGroupText: error.closestFormGroupText,
          nearbyText: error.nearbyText,
          category: error.category,
          repairable: error.repairable,
        });
      }
    }

    if (
      validationErrorsAfterSubmit &&
      !securityValidationAfterSubmit &&
      hasRepairablePostSubmitValidation(postSubmitValidation)
    ) {
      postSubmitValidationRepairAttempted = true;
      console.log("[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] repair attempted", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        repairableCount: postSubmitValidation.errors.filter((error) => error.repairable).length,
      });
      const repairResult = await fillApplicationFormIteratively({
        page,
        applicationId: applicationId ?? "unknown_application",
        sessionId:
          sessionIdForFinalCheck ??
          applicationId ??
          `post-submit-${Date.now().toString(36)}`,
        jobContext: {
          jobTitle: searchJobTitle,
          companyName: searchCompany,
          jobDescription: args.metadata?.jobDescription,
          source: applySource,
        },
        userProfile: args.metadata?.userProfile ?? args.values,
        resumeContext: {
          resumeText: args.metadata?.resumeText,
          resumeSummary: args.metadata?.resumeSummary,
        },
        existingApplicationMaterials: {
          values: args.values,
          pageUrl: page.url(),
        },
        resumePath: args.resumePath,
        maxPasses: 1,
        autoSubmit: false,
      }).catch((error) => {
        console.log("[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] repair failed", {
          applicationId: applicationId ?? null,
          applySessionId: sessionIdForFinalCheck,
          provider: providerForFinalCheck,
          reason: error instanceof Error ? error.message : "repair_failed",
        });
        return null;
      });
      const validationAfterRepair = await extractGreenhouseValidationErrors({
        page,
        provider: providerForFinalCheck,
      });
      postSubmitValidationRepairSucceeded =
        Boolean(repairResult) && validationAfterRepair.validationErrorCount === 0;
      postSubmitValidation = validationAfterRepair;
      postSubmitValidationErrors = postSubmitValidation.errors.map(
        formatPostSubmitValidationError,
      );
      validationErrorsAfterSubmit = postSubmitValidation.validationErrorCount > 0;
      securityValidationAfterSubmit =
        validationErrorsAfterSubmit && hasPostSubmitSecurityValidation(postSubmitValidation);

      console.log(
        postSubmitValidationRepairSucceeded
          ? "[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] repair succeeded"
          : "[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] repair failed",
        {
          applicationId: applicationId ?? null,
          applySessionId: sessionIdForFinalCheck,
          provider: providerForFinalCheck,
          remainingValidationErrorCount: postSubmitValidation.validationErrorCount,
          fieldsFilled: repairResult?.fieldsFilled ?? 0,
        },
      );

      if (postSubmitValidationRepairSucceeded && submitUsed) {
        const repairSubmitButton = greenhouseSubmitRoot.locator(submitUsed).first();
        if (
          (await repairSubmitButton.count()) > 0 &&
          (await repairSubmitButton.isVisible().catch(() => false)) &&
          (await repairSubmitButton.isEnabled().catch(() => false))
        ) {
          console.log("[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] re-submit attempted", {
            applicationId: applicationId ?? null,
            applySessionId: sessionIdForFinalCheck,
            provider: providerForFinalCheck,
            currentUrl: page.url(),
            selector: submitUsed,
          });
          const repairSubmit = await submitAndDetectGreenhouseConfirmation({
            page,
            submitLocator: repairSubmitButton,
            provider: providerForFinalCheck,
            applicationId: applicationId ?? null,
            sessionId: sessionIdForFinalCheck,
            targetUrl,
          });
          submitButtonClicked = submitButtonClicked || repairSubmit.submitClicked;
          submitConfirmationUrl = repairSubmit.confirmationUrl ?? submitConfirmationUrl;
          submitPopupUrl = repairSubmit.popupUrl ?? submitPopupUrl;
          submitSameTabUrl = repairSubmit.sameTabUrl ?? submitSameTabUrl;
          submitConfirmationSource =
            repairSubmit.confirmationSource !== "unknown"
              ? repairSubmit.confirmationSource
              : submitConfirmationSource;
          if (repairSubmit.submissionConfirmed && repairSubmit.confirmationUrl) {
            console.log(
              "[AUTO_APPLY_SUBMIT_VALIDATION_REPAIR] confirmation detected after repair",
              {
                applicationId: applicationId ?? null,
                applySessionId: sessionIdForFinalCheck,
                provider: providerForFinalCheck,
                confirmationUrl: repairSubmit.confirmationUrl,
                confirmationSource: repairSubmit.confirmationSource,
              },
            );
            greenhouseConfirmation = {
              confirmed: true,
              confirmationUrl: repairSubmit.confirmationUrl,
              confirmationSource: repairSubmit.confirmationSource,
              reason: "Confirmation was detected after repairing submit validation errors.",
              pageTextSnippet: undefined,
              popupUrl: repairSubmit.popupUrl,
            };
            confirmationMatch = {
              confirmed: true,
              finalUrl: repairSubmit.confirmationUrl,
              popupUrl: repairSubmit.popupUrl,
              matchedBy:
                repairSubmit.confirmationSource === "popup_url" ||
                repairSubmit.confirmationSource === "popup_text"
                  ? "popup"
                  : repairSubmit.confirmationSource === "same_tab_text"
                    ? "text"
                    : "url",
            };
            finalUrl = repairSubmit.confirmationUrl;
            confirmationTextFound =
              confirmationTextFound ||
              repairSubmit.confirmationSource === "popup_text" ||
              repairSubmit.confirmationSource === "same_tab_text";
            successUrlPatternMatched =
              successUrlPatternMatched ||
              isSubmissionConfirmationUrl(repairSubmit.confirmationUrl);
            confirmationSignals = [
              ...confirmationSignals,
              `submission-confirmation:${confirmationMatch.matchedBy ?? "unknown"}`,
            ];
            success = true;
            postSubmitValidation = { validationErrorCount: 0, errors: [] };
            postSubmitValidationErrors = [];
            validationErrorsAfterSubmit = false;
            securityValidationAfterSubmit = false;
          }
        }
      }
    }

    const postSubmitStopClassification: ApplyStopClassification | undefined =
      validationErrorsAfterSubmit
        ? securityValidationAfterSubmit
          ? {
              reason: "verification_required_after_submit",
              pageType: "human_verification_gate",
              suggestedAction: "complete_verification",
            }
          : {
              reason: "submit_blocked_by_validation_errors",
              pageType: "application_form",
              suggestedAction: "review_validation_errors",
            }
        : undefined;
    const postSubmitLastAction:
      | "submit_blocked_by_validation_errors"
      | "verification_required_after_submit"
      | undefined =
      postSubmitStopClassification?.reason === "submit_blocked_by_validation_errors" ||
      postSubmitStopClassification?.reason === "verification_required_after_submit"
        ? postSubmitStopClassification.reason
        : undefined;
    let finalStatus: ApplySessionStatus = success
      ? "SUBMITTED"
      : validationErrorsAfterSubmit
        ? securityValidationAfterSubmit
          ? "VERIFICATION_REQUIRED"
          : "NEEDS_USER_ANSWERS"
        : "WAITING_FOR_CONFIRMATION";
    if (success) {
      console.log("[AUTO_APPLY_SUBMITTED_CONFIRMED]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        submitButtonClicked,
        confirmationTextFound,
        successUrlPatternMatched,
        matchedBy: confirmationMatch.matchedBy ?? null,
      });
    } else if (validationErrorsAfterSubmit) {
      console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        validationErrorCount: postSubmitValidationErrors.length,
        stopReason: postSubmitStopClassification?.reason,
      });
      console.log("[AUTO_APPLY_SUBMIT_VALIDATION_ERRORS] stopping due to remaining validation errors", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        validationErrorCount: postSubmitValidationErrors.length,
        errors: postSubmitValidation.errors.map((error) => ({
          text: error.text,
          fieldLabel: error.fieldLabel,
          fieldName: error.fieldName,
          fieldId: error.fieldId,
          fieldType: error.fieldType,
          ariaInvalid: error.ariaInvalid,
          ariaDescribedBy: error.ariaDescribedBy,
          describedByText: error.describedByText,
          closestFormGroupText: error.closestFormGroupText,
          nearbyText: error.nearbyText,
          category: error.category,
          repairable: error.repairable,
        })),
      });
    } else {
      console.log("[AUTO_APPLY_SUBMIT_CONFIRMATION_UNCLEAR]", {
        applicationId: applicationId ?? null,
        currentUrl: finalUrl,
        submitButtonClicked,
        confirmationTextFound,
        successUrlPatternMatched,
      });
      console.log("[AUTO_APPLY_CONFIRMATION] confirmation not detected after submit", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        popupUrl: submitPopupUrl,
        sameTabUrl: submitSameTabUrl,
      });
    }

    if (success && finalSignals.needsHuman) {
      console.log(
        "[AUTO_APPLY_CONFIRMATION] verification suppressed after confirmed submission",
        {
          applicationId: applicationId ?? null,
          finalUrl,
          verificationSignals: finalSignals.verificationSignals,
        },
      );
    }

    if (greenhouseFormState) {
      logGreenhouseFormState({
        currentUrl: finalUrl,
        stoppedAtUrl: finalUrl,
        formState: greenhouseFormState,
        filledFieldCount: greenhouseFormState.filledFieldCount,
        missingRequiredFields: greenhouseFormState.missingRequiredFields,
        verificationSignals: success ? [] : finalSignals.verificationSignals,
        verificationOverriddenByVisibleForm,
        submitButtonClicked,
        submissionConfirmed: success,
      });
    }

    logPlaywrightEvidence({
      attemptedSelectors,
      ...chaseEvidence,
      currentUrl: finalUrl,
      submitButtonFound,
      submitButtonClicked,
      confirmationTextFound,
      confirmationTextSnippet,
      successUrlPatternMatched,
      finalStatus,
      submissionConfirmed: success,
      verificationDetected: success ? false : finalSignals.needsHuman,
    });

    if (
      finalSignals.needsHuman &&
      finalSignals.verificationSignals.length > 0 &&
      !validationErrorsAfterSubmit &&
      !success
    ) {
      keepBrowserOpen = true;
      const verificationRequired =
        finalSignals.verificationSignals.length > 0;
      const allowVerificationRequired = shouldAllowVerificationRequired(
        {
          status: verificationRequired ? "VERIFICATION_REQUIRED" : "WAITING_HUMAN",
          verificationSignals: finalSignals.verificationSignals,
          needsHuman: finalSignals.needsHuman,
        },
        {
          attemptedSelectors,
          ...chaseEvidence,
          formScanAttempted,
          formFound,
          formFillAttempted,
          verificationEvidence: finalSignals.verificationEvidence,
        },
      );
      console.log("[AUTO_APPLY_FORM_FIRST] pre-verification gate", {
        applicationId: applicationId ?? null,
        currentUrl: page.url(),
        attemptedSelectors,
        applyCtaFound: chaseEvidence.applyCtaFound,
        applyCtaClicked: chaseEvidence.applyCtaClicked,
        formScanAttempted,
        formFound,
        formFillAttempted,
        filledFieldCount:
          greenhouseFormState?.filledFieldCount ??
          genericFormState?.filledFieldCount ??
          0,
        requiredFieldCount:
          greenhouseFormState?.requiredFieldCount ??
          genericFormState?.requiredFieldCount ??
          0,
        missingRequiredFields:
          greenhouseFormState?.missingRequiredFields ??
          genericFormState?.missingRequiredFields ??
          [],
        verificationDetected: finalSignals.verificationEvidence.detected,
        verificationEvidence: finalSignals.verificationEvidence,
        allowVerificationRequired,
      });
      const humanStatus = verificationRequired && allowVerificationRequired
        ? "VERIFICATION_REQUIRED"
        : "WAITING_HUMAN";
      const message = humanStatus === "VERIFICATION_REQUIRED"
        ? APPLY_VERIFICATION_REQUIRED_USER_MESSAGE
        : "Account creation or verification needs human completion.";

      await args.onStatus?.({
        status: humanStatus,
        lastUrl: finalUrl,
        message,
        viewerUrl: remoteSession?.viewerUrl,
        openUrl: finalUrl,
        remoteSessionId: remoteSession?.sessionId,
      });

      return {
        ok: false,
        status: humanStatus,
        needsHuman: true,
        finalUrl,
        openUrl: finalUrl,
        viewerUrl: remoteSession?.viewerUrl,
        message,
        debug: buildDebugPayload({
          attemptedSelectors,
          missingNames,
          ...finalFormProgressDebug,
          submitOrContinueAttempted,
          submitOrContinueClicked,
          ...debugContext(),
          ...(await captureStopPoint(page, {
            lastActionText: submitButtonClicked
              ? "Submit application"
              : undefined,
            lastActionSelector: submitUsed ?? undefined,
          })),
          finalUrl,
          submitSelectorUsed: submitUsed,
          verificationSignals: finalSignals.verificationSignals,
          verificationEvidence: finalSignals.verificationEvidence,
          confirmationSignals: finalSignals.confirmationSignals,
          pageText: finalSignals.pageText,
          pageHtml: finalSignals.html,
          sessionId: remoteSession?.sessionId,
          viewerUrl: remoteSession?.viewerUrl,
          targetUrl,
          ...chaseEvidence,
          currentUrl: finalUrl,
          providerDetected: greenhouseProviderDetected
            ? "greenhouse"
            : undefined,
          formContextUrl: greenhouseFormState?.formContextUrl,
          submitButtonFound,
          submitButtonClicked,
          confirmationTextFound: finalSignals.confirmationTextFound,
          confirmationTextSnippet: finalSignals.confirmationTextSnippet ?? null,
          successUrlPatternMatched: finalSignals.successUrlPatternMatched,
          submissionConfirmed: false,
          finalStatus: humanStatus,
          success: false,
          needsHuman: true,
          unavailable: false,
          hopCount: chaseEvidence.hopCount,
          urlsVisited: [...effectiveChase.urlsVisited, finalUrl],
          clicks: effectiveChase.clicks,
          formDetected: greenhouseFormState?.formDetected ?? true,
          visibleFieldCount: greenhouseFormState?.visibleFieldCount,
          fillableFieldCount: greenhouseFormState?.fillableFieldCount,
          filledFieldCount: greenhouseFormState?.filledFieldCount,
          requiredFieldCount: greenhouseFormState?.requiredFieldCount,
          missingRequiredFields: greenhouseFormState?.missingRequiredFields,
          verificationOverriddenByVisibleForm,
          confirmationDetected: success,
          verificationDetected: verificationRequired && allowVerificationRequired,
          finalReason: "Verification detected after submit.",
          resolverAttemptedLinks,
          resolverSelectedLink,
          resolverSuccess,
          resolverNewUrl,
        }),
      };
    }

    const finalNeedsHuman =
      finalStatus === "NEEDS_USER_ANSWERS" ||
      finalStatus === "VERIFICATION_REQUIRED";
    const submittedAt = success ? new Date().toISOString() : undefined;
    const confirmationSource =
      greenhouseConfirmation?.confirmationSource ??
      confirmationMatch.matchedBy ??
      null;
    const popupUrl =
      confirmationMatch.popupUrl ??
      greenhouseConfirmation?.popupUrl ??
      submitPopupUrl ??
      null;
    const sameTabUrl = submitSameTabUrl ?? currentPageFinalUrl;
    const finalMessage = success
      ? "Application submitted successfully."
      : finalStatus === "NEEDS_USER_ANSWERS"
        ? [
            "Submit blocked by validation errors. Hirexa clicked Submit Application, but Greenhouse returned validation errors and did not open the confirmation page.",
            ...postSubmitValidation.errors
              .slice(0, 5)
              .map((error) => `- ${error.text} — ${error.fieldLabel ?? "Unknown field"}`),
          ].join("\n")
        : finalStatus === "VERIFICATION_REQUIRED"
          ? "Greenhouse blocked final submission with a verification check after submit."
        : "Hirexa clicked Submit Application but could not confirm the final Greenhouse confirmation page. Check the opened confirmation tab or your email.";
    if (success) {
      console.log("[AUTO_APPLY_SESSION] confirmation url saved", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        confirmationUrl: finalUrl,
        popupUrl,
        sameTabUrl,
        confirmationSource,
      });
    } else if (postSubmitValidation.validationErrorCount > 0) {
      console.log("[AUTO_APPLY_SESSION] post-submit validation errors saved", {
        applicationId: applicationId ?? null,
        applySessionId: sessionIdForFinalCheck,
        provider: providerForFinalCheck,
        currentUrl: finalUrl,
        validationErrorCount: postSubmitValidation.validationErrorCount,
        errors: postSubmitValidation.errors.map((error) => ({
          text: error.text,
          fieldLabel: error.fieldLabel,
          fieldName: error.fieldName,
          fieldId: error.fieldId,
          category: error.category,
          repairable: error.repairable,
        })),
      });
    }
    await args.onStatus?.({
      status: finalStatus,
      lastUrl: finalUrl,
      error: success ? undefined : finalMessage,
      message: finalMessage,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
      submissionStatus: success ? "SUBMITTED" : undefined,
      debug: {
        ...finalRecheckStatusDebug,
        finalUrl,
        currentUrl: finalUrl,
        latestUrl: finalUrl,
        stoppedAtUrl: success ? finalUrl : undefined,
        readyToSubmit,
        submitAttempted: true,
        submitButtonFound,
        submitButtonEnabled,
        submitButtonClicked,
        confirmationDetected: success,
        confirmationTextFound,
        confirmationTextSnippet,
        successUrlPatternMatched,
        confirmationMatchedBy: confirmationMatch.matchedBy,
        confirmationFinalUrl: confirmationMatch.confirmed ? finalUrl : undefined,
        confirmationUrl: confirmationMatch.confirmed ? finalUrl : undefined,
        confirmationSource,
        popupUrl,
        sameTabUrl,
        verificationDetected: false,
        verificationSignals: success ? [] : finalSignals.verificationSignals,
        submissionConfirmed: success,
        submittedAt,
        visibleValidationErrors: postSubmitValidationErrors,
        postSubmitValidationErrorCount: postSubmitValidation.validationErrorCount,
        postSubmitValidationErrors: postSubmitValidation.errors,
        postSubmitValidationRepairAttempted,
        postSubmitValidationRepairSucceeded,
        stopClassification: postSubmitStopClassification,
        lastAction: postSubmitLastAction,
        missingRequiredFields: validationErrorsAfterSubmit
          ? postSubmitValidationErrors
          : [],
      },
    });

    return {
      ok: success,
      status: finalStatus,
      finalUrl,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      needsHuman: finalNeedsHuman,
      message: finalMessage,
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        ...finalFormProgressDebug,
        ...debugContext(),
        ...(await captureStopPoint(page, {
          lastActionText: submitButtonClicked
            ? "Submit application"
            : undefined,
          lastActionSelector: submitUsed ?? undefined,
        })),
        finalUrl,
        stoppedAtUrl: success ? finalUrl : undefined,
        submitSelectorUsed: submitUsed,
        verificationSignals: success ? [] : finalSignals.verificationSignals,
        confirmationSignals,
        pageText: finalSignals.pageText,
        pageHtml: finalSignals.html,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        ...chaseEvidence,
        currentUrl: finalUrl,
        providerDetected: greenhouseProviderDetected
          ? "greenhouse"
          : undefined,
        formContextUrl: greenhouseFormState?.formContextUrl,
        submitButtonFound,
        submitButtonEnabled,
        submitButtonClicked,
        confirmationTextFound,
        confirmationTextSnippet,
        successUrlPatternMatched,
        confirmationMatchedBy: confirmationMatch.matchedBy,
        confirmationFinalUrl: confirmationMatch.confirmed ? finalUrl : undefined,
        confirmationUrl: confirmationMatch.confirmed ? finalUrl : undefined,
        confirmationSource,
        popupUrl,
        sameTabUrl,
        submissionConfirmed: success,
        submittedAt,
        finalRequiredCheckPassed: finalRecheckPassed,
        allRequiredFieldsFilled: finalRecheckPassed,
        lastFormRecheckAt,
        finalRecheckPassed,
        readyToSubmit,
        submitAttempted: true,
        visibleValidationErrors: postSubmitValidationErrors,
        postSubmitValidationErrorCount: postSubmitValidation.validationErrorCount,
        postSubmitValidationErrors: postSubmitValidation.errors,
        postSubmitValidationRepairAttempted,
        postSubmitValidationRepairSucceeded,
        stopClassification: postSubmitStopClassification,
        fileUploadPending: finalRecheck.fileUploadPending,
        verificationChallengeVisible: finalRecheck.verificationChallengeVisible,
        reviewBeforeSubmit,
        finalStatus,
        success,
        needsHuman: finalNeedsHuman,
        unavailable: false,
        hopCount: chaseEvidence.hopCount,
        urlsVisited: [...effectiveChase.urlsVisited, finalUrl],
        clicks: effectiveChase.clicks,
        formDetected: greenhouseFormState?.formDetected ?? true,
        visibleFieldCount: greenhouseFormState?.visibleFieldCount,
        fillableFieldCount: greenhouseFormState?.fillableFieldCount,
        filledFieldCount: greenhouseFormState?.filledFieldCount,
        requiredFieldCount: greenhouseFormState?.requiredFieldCount,
        missingRequiredFields: validationErrorsAfterSubmit
          ? postSubmitValidationErrors
          : greenhouseFormState?.missingRequiredFields,
        verificationOverriddenByVisibleForm,
        confirmationDetected: success,
        verificationDetected: false,
        finalReason: success
          ? "Submission confirmed."
          : postSubmitStopClassification?.reason ?? finalMessage,
        resolverAttemptedLinks,
        resolverSelectedLink,
        resolverSuccess,
        resolverNewUrl,
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Playwright submit failed.";
    const finalUrl = captureCurrentUrl();
    const preErrorHopCount = trackedHopCount;
    const preErrorUrlsVisited = dedupeUrls([
      ...trackedUrlsVisited,
      finalUrl,
    ]);
    console.log("[AUTO_APPLY_CRAWL] error", message);

    await args.onStatus?.({
      status: "FAILED",
      lastUrl: finalUrl,
      error: message,
      viewerUrl: remoteSession?.viewerUrl,
      openUrl: finalUrl,
      remoteSessionId: remoteSession?.sessionId,
    });

    logPlaywrightEvidence({
      attemptedSelectors,
      applyCtaFound: preErrorHopCount > 0,
      applyCtaClicked: preErrorHopCount > 0,
      currentUrl: finalUrl,
      hopCount: preErrorHopCount,
      submitButtonFound: false,
      submitButtonClicked: false,
      confirmationTextFound: false,
      confirmationTextSnippet: null,
      successUrlPatternMatched: false,
      finalStatus: "FAILED",
      submissionConfirmed: false,
    });

    return {
      ok: false,
      status: "FAILED",
      finalUrl,
      message,
      openUrl: finalUrl,
      viewerUrl: remoteSession?.viewerUrl,
      debug: buildDebugPayload({
        attemptedSelectors,
        missingNames,
        ...debugContext(),
        ...(await captureStopPoint(activePage)),
        finalUrl,
        sessionId: remoteSession?.sessionId,
        viewerUrl: remoteSession?.viewerUrl,
        targetUrl,
        applyCtaFound: preErrorHopCount > 0,
        applyCtaClicked: preErrorHopCount > 0,
        currentUrl: finalUrl,
        submitButtonFound: false,
        submitButtonClicked: false,
        confirmationTextFound: false,
        confirmationTextSnippet: null,
        successUrlPatternMatched: false,
        submissionConfirmed: false,
        finalStatus: "FAILED",
        success: false,
        needsHuman: false,
        unavailable: false,
        hopCount: preErrorHopCount,
        urlsVisited: preErrorUrlsVisited,
        clicks: trackedClicks,
        formDetected: false,
        confirmationDetected: false,
        verificationDetected: false,
        finalReason: message,
        resolverAttemptedLinks,
        resolverSelectedLink,
        resolverSuccess,
        resolverNewUrl,
      }),
    };
  } finally {
    if (keepBrowserOpen && remoteSession?.provider === "scrapfly") {
      await disconnectScrapflyBrowserSession(browser).catch(() => undefined);
      console.info("[AUTO_APPLY_SCRAPFLY_SESSION_PAUSED_FOR_USER]", {
        applicationId: applicationId ?? null,
        applySessionId: applySessionId ?? null,
        scrapflySessionId: remoteSession.sessionId,
        currentUrl: currentUrl ?? null,
        targetUrl,
      });
    }

    if (!keepBrowserOpen) {
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }

    if (remoteSession && !keepBrowserOpen) {
      await closeRemoteSession(
        remoteSession.provider,
        remoteSession.sessionId,
      ).catch(() => undefined);
    }
  }
}

export function toApplySessionDebug(
  result: PlaywrightApplyResult["debug"] | undefined,
): ApplySessionDebug | undefined {
  if (!result) return undefined;

  return {
    entryUrl: result.entryUrl,
    initialLoadedUrl: result.initialLoadedUrl,
    finalUrl: result.finalUrl,
    originalJobUrl: result.originalJobUrl,
    resolvedDirectUrl: result.resolvedDirectUrl,
    applySource: result.applySource,
    usedResolvedDirectUrl: result.usedResolvedDirectUrl,
    directJobResolutionAttempted:
      result.directJobResolutionAttempted,
    directJobResolutionConfidence:
      result.directJobResolutionConfidence,
    directJobResolutionProvider: result.directJobResolutionProvider,
    directJobResolutionMatchReason:
      result.directJobResolutionMatchReason,
    directJobResolutionError: result.directJobResolutionError,
    directJobResolutionCandidates:
      result.directJobResolutionCandidates ?? [],
    searchFallbackTriggered: result.searchFallbackTriggered,
    searchFallbackQueries: result.searchFallbackQueries ?? [],
    searchFallbackCandidates: result.searchFallbackCandidates ?? [],
    searchFallbackChosenCandidate:
      result.searchFallbackChosenCandidate,
    searchFallbackAttemptCount: result.searchFallbackAttemptCount,
    searchFallbackSuccess: result.searchFallbackSuccess,
    searchFallbackFailureReason:
      result.searchFallbackFailureReason,
    startingUrlKind: result.startingUrlKind,
    finalChosenUrlKind: result.finalChosenUrlKind,
    domain: result.domain,
    stoppedAtUrl: result.stoppedAtUrl,
    stoppedAtTitle: result.stoppedAtTitle,
    lastActionText: result.lastActionText,
    lastActionSelector: result.lastActionSelector,
    hopCount: result.hopCount,
    urlsVisited: result.urlsVisited,
    clicks: result.clicks,
    ctaAttempts: result.ctaAttempts,
    entryCtaFound: result.entryCtaFound,
    entryCtaClicked: result.entryCtaClicked,
    entryCtaClickedText: result.entryCtaClickedText,
    entryCtaClickedSelector: result.entryCtaClickedSelector,
    entryDismissedBlocker: result.entryDismissedBlocker,
    adzunaApplyCaptureDetected: result.adzunaApplyCaptureDetected,
    adzunaApplyCaptureSkipClicked:
      result.adzunaApplyCaptureSkipClicked,
    adzunaApplyCaptureSkipText: result.adzunaApplyCaptureSkipText,
    adzunaApplyCaptureSkipSelector:
      result.adzunaApplyCaptureSkipSelector,
    adzunaPostApplyProgressionAttempted:
      result.adzunaPostApplyProgressionAttempted,
    adzunaPostApplyProgressionSucceeded:
      result.adzunaPostApplyProgressionSucceeded,
    adzunaPostApplyUrlAfter: result.adzunaPostApplyUrlAfter,
    adzunaPostApplyPopupDetected: result.adzunaPostApplyPopupDetected,
    adzunaPostApplyNewPageDetected:
      result.adzunaPostApplyNewPageDetected,
    adzunaPostApplyFallbackAttempted:
      result.adzunaPostApplyFallbackAttempted,
    handoffPageDetected: result.handoffPageDetected,
    handoffUrl: result.handoffUrl,
    handoffContinuationAttempted: result.handoffContinuationAttempted,
    handoffContinuationSucceeded: result.handoffContinuationSucceeded,
    handoffCtaFound: result.handoffCtaFound,
    handoffCtaClicked: result.handoffCtaClicked,
    handoffCtaClickedText: result.handoffCtaClickedText,
    handoffCtaClickedSelector: result.handoffCtaClickedSelector,
    handoffAttempts: result.handoffAttempts,
    cookiePromptDetected: result.cookiePromptDetected,
    cookiePromptClicked: result.cookiePromptClicked,
    cookiePromptClickedText: result.cookiePromptClickedText,
    cookiePromptSelector: result.cookiePromptSelector,
    cookiePromptAttempts: result.cookiePromptAttempts,
    postCookieWaitAttempted: result.postCookieWaitAttempted,
    postCookieUrlBefore: result.postCookieUrlBefore,
    postCookieUrlAfter: result.postCookieUrlAfter,
    postCookieUrlChanged: result.postCookieUrlChanged,
    postCookieProgressDetected: result.postCookieProgressDetected,
    postCookieTitleAfter: result.postCookieTitleAfter,
    applyCtaClickedText: result.applyCtaClickedText,
    applyCtaClickedSelector: result.applyCtaClickedSelector,
    applyHrefExtracted: result.applyHrefExtracted,
    applyNavigationForced: result.applyNavigationForced,
    applyNavigationUrl: result.applyNavigationUrl,
    ctaClickedText: result.ctaClickedText,
    ctaClickedSelector: result.ctaClickedSelector,
    dismissedBlocker: result.dismissedBlocker,
    attemptedSelectors: result.attemptedSelectors,
    applyCtaFound: result.applyCtaFound,
    applyCtaClicked: result.applyCtaClicked,
    targetUrl: result.targetUrl,
    urlBeforeClick: result.urlBeforeClick,
    urlAfterClick: result.urlAfterClick,
    currentUrl: result.currentUrl,
    providerDetected: result.providerDetected,
    formContextUrl: result.formContextUrl,
    formDetected: result.formDetected,
    visibleFieldCount: result.visibleFieldCount,
    fillableFieldCount: result.fillableFieldCount,
    filledFieldCount: result.filledFieldCount,
    requiredFieldCount: result.requiredFieldCount,
    missingRequiredFields: result.missingRequiredFields ?? [],
    unsupportedRequiredFields: result.unsupportedRequiredFields ?? [],
    formScanAttempted: result.formScanAttempted,
    formFound: result.formFound,
    formFillAttempted: result.formFillAttempted,
    resumeUploadAttempted: result.resumeUploadAttempted,
    resumeUploadSucceeded: result.resumeUploadSucceeded,
    submitOrContinueAttempted: result.submitOrContinueAttempted,
    submitOrContinueClicked: result.submitOrContinueClicked,
    aiFormAnswerEngineRan: result.aiFormAnswerEngineRan,
    aiFormAnswersGenerated: result.aiFormAnswersGenerated,
    aiFormAutofillCompleted: result.aiFormAutofillCompleted,
    aiFormFieldCount: result.aiFormFieldCount,
    aiFormRequiredFieldCount: result.aiFormRequiredFieldCount,
    aiFormAnsweredCount: result.aiFormAnsweredCount,
    aiFormBlockedCount: result.aiFormBlockedCount,
    aiFormFilledCount: result.aiFormFilledCount,
    aiFormRemainingRequiredFields:
      result.aiFormRemainingRequiredFields ?? [],
    aiFormBlockedFields: result.aiFormBlockedFields ?? [],
    missingQuestions: result.missingQuestions ?? [],
    verificationOverriddenByVisibleForm:
      result.verificationOverriddenByVisibleForm,
    submitButtonFound: result.submitButtonFound,
    submitButtonEnabled: result.submitButtonEnabled,
    submitButtonClicked: result.submitButtonClicked,
    finalRequiredCheckPassed: result.finalRequiredCheckPassed,
    allRequiredFieldsFilled: result.allRequiredFieldsFilled,
    lastFormRecheckAt: result.lastFormRecheckAt,
    finalRecheckPassed: result.finalRecheckPassed,
    readyToSubmit: result.readyToSubmit,
    submitAttempted: result.submitAttempted,
    visibleValidationErrors: result.visibleValidationErrors ?? [],
    fileUploadPending: result.fileUploadPending,
    verificationChallengeVisible: result.verificationChallengeVisible,
    reviewBeforeSubmit: result.reviewBeforeSubmit,
    actionLabel: result.actionLabel,
    submittedAt: result.submittedAt,
    confirmationDetected: result.confirmationDetected,
    confirmationTextFound: result.confirmationTextFound,
    confirmationTextSnippet: result.confirmationTextSnippet ?? null,
    successUrlPatternMatched: result.successUrlPatternMatched,
    verificationDetected: result.verificationDetected,
    verificationEvidence: result.verificationEvidence,
    submissionConfirmed: result.submissionConfirmed,
    stopClassification: result.stopClassification,
    finalReason: result.finalReason,
    resolverAttemptedLinks: result.resolverAttemptedLinks,
    resolverCandidates: result.resolverCandidates,
    resolverRejectedCandidates: result.resolverRejectedCandidates,
    resolverSelectedLink: result.resolverSelectedLink,
    resolverSuccess: result.resolverSuccess,
    resolverNewUrl: result.resolverNewUrl,
    adzunaHandoffFailureReasons:
      result.adzunaHandoffFailureReasons ?? [],
    adzunaExternalLinkCandidates:
      result.adzunaExternalLinkCandidates ?? [],
    adzunaBodyTextPreview: result.adzunaBodyTextPreview,
    adzunaTokenizedInterstitialDetected:
      result.adzunaTokenizedInterstitialDetected,
    adzunaTokenizedParamsPresent:
      result.adzunaTokenizedParamsPresent ?? [],
    adzunaDownstreamCandidates:
      result.adzunaDownstreamCandidates ?? [],
    adzunaScriptRedirectCandidates:
      result.adzunaScriptRedirectCandidates ?? [],
    adzunaNetworkRedirectCandidates:
      result.adzunaNetworkRedirectCandidates ?? [],
    adzunaFinalFailureReason: result.adzunaFinalFailureReason,
    adzunaHandoffPageTitle: result.adzunaHandoffPageTitle,
    adzunaHandoffVisibleCtas:
      result.adzunaHandoffVisibleCtas ?? [],
    adzunaOverlayDetected: result.adzunaOverlayDetected,
    adzunaOverlayDismissed: result.adzunaOverlayDismissed,
    adzunaOverlayType: result.adzunaOverlayType,
    adzunaOverlaySelectorsTried:
      result.adzunaOverlaySelectorsTried ?? [],
    adzunaHandoffPopupOccurred:
      result.adzunaHandoffPopupOccurred,
    adzunaHandoffUsedPopup: result.adzunaHandoffUsedPopup,
    adzunaDownstreamConfirmed: result.adzunaDownstreamConfirmed,
    adzunaAuthPageDetected: result.adzunaAuthPageDetected,
    adzunaForgotPasswordDetected:
      result.adzunaForgotPasswordDetected,
    adzunaLoginAttempted: result.adzunaLoginAttempted,
    adzunaLoginSucceeded: result.adzunaLoginSucceeded,
    adzunaLoginFailedReason: result.adzunaLoginFailedReason,
    blockedResolvedHandoffCandidates:
      result.blockedResolvedHandoffCandidates ?? [],
    selectedResolvedHandoffCandidate:
      result.selectedResolvedHandoffCandidate,
    resolvedHandoffClickAttempted: result.resolvedHandoffClickAttempted,
    resolvedHandoffClickSucceeded: result.resolvedHandoffClickSucceeded,
    resolvedHandoffClickedHref: result.resolvedHandoffClickedHref,
    resolvedHandoffClickedText: result.resolvedHandoffClickedText,
    resolvedHandoffUrlBefore: result.resolvedHandoffUrlBefore,
    resolvedHandoffUrlAfter: result.resolvedHandoffUrlAfter,
    adzunaExtractedRedirectUrl: result.adzunaExtractedRedirectUrl,
    adzunaExtractedRedirectSource:
      result.adzunaExtractedRedirectSource,
    adzunaExtractedRedirectHtmlRead:
      result.adzunaExtractedRedirectHtmlRead,
    adzunaExtractedRedirectFailureReason:
      result.adzunaExtractedRedirectFailureReason ?? [],
    adzunaExtractedRedirectNavAttempted:
      result.adzunaExtractedRedirectNavAttempted,
    adzunaExtractedRedirectNavSucceeded:
      result.adzunaExtractedRedirectNavSucceeded,
    adzunaInterstitialRecognized:
      result.adzunaInterstitialRecognized,
    appcastHopDetected: result.appcastHopDetected,
    diceDestinationDetected: result.diceDestinationDetected,
    handoffResolvedViaKnownChain:
      result.handoffResolvedViaKnownChain,
    knownChainClassificationGuardApplied:
      result.knownChainClassificationGuardApplied,
    knownChainContinuationExhausted:
      result.knownChainContinuationExhausted,
    knownChainAllowedToFail: result.knownChainAllowedToFail,
    playwrightLaunchStrategy: result.playwrightLaunchStrategy,
    playwrightPersistentContext:
      result.playwrightPersistentContext,
    playwrightUserDataDir: result.playwrightUserDataDir,
    rtxFlowAttempted: result.rtxFlowAttempted,
    rtxFlowCompleted: result.rtxFlowCompleted,
    rtxProgressMarkers: result.rtxProgressMarkers ?? [],
    rtxFailureReason: result.rtxFailureReason,
    rtxJobId: result.rtxJobId,
  } as ApplySessionDebug;
}
