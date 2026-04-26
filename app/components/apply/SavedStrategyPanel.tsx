"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/components/ui/button";
import TeachPageDialog from "@/app/components/apply/TeachPageDialog";
import {
  deriveStopClassification,
  getStopPageTypeLabel,
  getStopReasonLabel,
  getStopSuggestedActionLabel,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";
import { getStopSuggestedActionUi } from "@/app/lib/apply/stopActionUi";
import { cn } from "@/app/lib/utils";
import {
  APPLY_SITE_STRATEGY_UPDATED_EVENT,
  exportStrategies,
  getApplySiteStrategyMatch,
  getApplySiteStrategyStatusLabel,
  importStrategies,
  loadApplySiteStrategies,
  refreshApplySiteStrategies,
  resolveStrategyHostname,
  strategyMatchesStopReason,
  updateApplySiteStrategyReplayState,
  type ApplySiteStrategyRecord,
  type ApplySiteStrategyStep,
} from "@/app/lib/apply/siteStrategyStore";
import { getPromptGenerationStatus } from "@/app/lib/apply/siteStrategyPrompt";
import { APPLY_VERIFICATION_REQUIRED_USER_MESSAGE } from "@/app/lib/apply/sessionStatus";

type SavedStrategyPanelProps = {
  finalUrl?: string | null;
  currentUrl?: string | null;
  lastAction?: string | null;
  stopReason?: string | null;
  errorMessage?: string | null;
  stopClassification?: ApplyStopClassification | null;
  compact?: boolean;
  tone?: "neutral" | "amber";
  className?: string;
};

type ReplayTimelineStep = ApplySiteStrategyStep & {
  status?: string | null;
  reason?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type ReplaySessionResponse = {
  ok?: boolean;
  error?: string;
  session?: {
    id: string;
    hostname: string;
    startUrl: string;
    finalUrl: string;
    stopReason: string;
    lastAction: string;
    status: "STARTING" | "RUNNING" | "COMPLETED" | "FAILED";
    startedAt: string;
    updatedAt: string;
    currentUrl: string | null;
    stepCount: number;
    completedStepCount: number;
    failingStepId?: string | null;
    error?: string | null;
    lastReplayedAt?: string | null;
    lastReplayResult?: {
      status: "COMPLETED" | "FAILED";
      currentUrl: string | null;
      reason?: string | null;
      failingStepId?: string | null;
      completedStepCount: number;
      totalStepCount: number;
    } | null;
    steps: ReplayTimelineStep[];
  };
};

const RTX_VERIFICATION_UI_MESSAGE =
  APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;

function formatReplayStatus(status: unknown) {
  if (status == null || status === "") return null;
  if (typeof status !== "string") return "Unknown";

  switch (status) {
    case "STARTING":
      return "Starting";
    case "RUNNING":
      return "Running";
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "PENDING":
      return "Pending";
    default:
      return status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseHostname(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .trim()
      .toLowerCase();
  }
}

function isRtxStopHost(hostname: string) {
  return (
    hostname === "rtx.com" ||
    hostname.endsWith(".rtx.com") ||
    hostname.endsWith(".myworkdayjobs.com") ||
    hostname.endsWith(".workdayjobs.com")
  );
}

function getImportedHostnameKeys(json: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Import JSON must be an object.");
  }

  const strategies = "strategies" in parsed ? parsed.strategies : parsed;
  if (!isRecord(strategies)) {
    throw new Error("Import JSON must contain an object of hostname-keyed strategies.");
  }

  return Object.entries(strategies).map(([key, value]) => {
    if (isRecord(value) && typeof value.hostname === "string") {
      return value.hostname;
    }

    return key;
  });
}

function withOverwriteFlag(json: string, overwriteExisting: boolean) {
  const parsed = JSON.parse(json) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Import JSON must be an object.");
  }

  if ("strategies" in parsed && isRecord(parsed.strategies)) {
    return JSON.stringify(
      {
        ...parsed,
        overwriteExisting,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      overwriteExisting,
      strategies: parsed,
    },
    null,
    2,
  );
}

export default function SavedStrategyPanel({
  finalUrl,
  currentUrl,
  lastAction,
  stopReason,
  errorMessage,
  stopClassification,
  compact = false,
  tone = "neutral",
  className,
}: SavedStrategyPanelProps) {
  const [savedStrategy, setSavedStrategy] = useState<ApplySiteStrategyRecord | null>(
    null,
  );
  const [savedStrategyMatchesCurrentStop, setSavedStrategyMatchesCurrentStop] =
    useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replaySessionId, setReplaySessionId] = useState<string | null>(null);
  const [replaySession, setReplaySession] =
    useState<ReplaySessionResponse["session"] | null>(null);
  const [replayMessage, setReplayMessage] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const verificationMessageLoggedRef = useRef(false);
  const verificationResumeLoggedRef = useRef(false);

  const resolvedUrl = currentUrl ?? finalUrl ?? "";
  const resolvedHostname = useMemo(
    () => resolveStrategyHostname(resolvedUrl),
    [resolvedUrl],
  );
  const resolvedStopClassification = useMemo(
    () =>
      stopClassification ??
      deriveStopClassification({
        finalUrl,
        currentUrl,
        lastAction,
        message: errorMessage,
      }),
    [currentUrl, errorMessage, finalUrl, lastAction, stopClassification],
  );
  const strategySteps = savedStrategy?.steps ?? [];
  const activeReplaySteps = replaySession?.steps ?? strategySteps;
  const isReplayRunning =
    replaySession?.status === "STARTING" || replaySession?.status === "RUNNING";
  const failingReplayStep =
    replaySession?.failingStepId && replaySession?.steps?.length
      ? replaySession.steps.find((step) => step.id === replaySession.failingStepId) ??
        null
      : null;
  const recommendedAction = resolvedStopClassification.suggestedAction;
  const recommendedActionUi = getStopSuggestedActionUi(recommendedAction);
  const verificationUiMessage = useMemo(() => {
    if (resolvedStopClassification.reason !== "verification_required") {
      return null;
    }

    const isRtxContext = [
      parseHostname(currentUrl),
      parseHostname(finalUrl),
      parseHostname(savedStrategy?.finalUrl),
      parseHostname(savedStrategy?.lastTrainedUrl),
    ].some((hostname) => hostname.length > 0 && isRtxStopHost(hostname));

    if (isRtxContext) {
      return RTX_VERIFICATION_UI_MESSAGE;
    }

    const fallbackMessage = String(errorMessage ?? "").trim();
    const fallbackLooksLikeVerification = /verify|verification|human|cloudflare|captcha|turnstile|just a moment|checking your browser/i.test(
      fallbackMessage,
    );

    return fallbackLooksLikeVerification && fallbackMessage.length > 0
      ? fallbackMessage
      : APPLY_VERIFICATION_REQUIRED_USER_MESSAGE;
  }, [
    currentUrl,
    errorMessage,
    finalUrl,
    resolvedStopClassification.reason,
    savedStrategy?.finalUrl,
    savedStrategy?.lastTrainedUrl,
  ]);
  const strategyHealthClassName = savedStrategy
    ? savedStrategy.status === "working"
      ? "text-emerald-700"
      : savedStrategy.status === "unstable"
        ? "text-red-700"
        : savedStrategy.status === "tested_once"
          ? "text-amber-700"
          : "text-gray-700"
    : "text-gray-700";
  const lastReplayOutcomeLabel = savedStrategy
    ? savedStrategy.lastReplaySucceeded === true
      ? "Succeeded"
      : savedStrategy.lastReplaySucceeded === false
        ? "Failed"
        : "Not replayed yet"
    : "Not replayed yet";
  const promptGenerationStatus = savedStrategy
    ? getPromptGenerationStatus(savedStrategy, {
        replaySafeSteps: strategySteps,
        rawRecordedSteps: savedStrategy.rawSteps,
      })
    : null;

  useEffect(() => {
    if (
      verificationUiMessage === RTX_VERIFICATION_UI_MESSAGE &&
      !verificationMessageLoggedRef.current
    ) {
      console.info("[AUTO_APPLY_RTX_PROGRESS]", {
        marker: "RTX_VERIFICATION_REQUIRED_UI_MESSAGE_MAPPED",
        stoppedAtUrl:
          currentUrl ?? finalUrl ?? savedStrategy?.lastTrainedUrl ?? savedStrategy?.finalUrl ?? null,
      });
      verificationMessageLoggedRef.current = true;
    }

    if (verificationUiMessage !== RTX_VERIFICATION_UI_MESSAGE) {
      verificationMessageLoggedRef.current = false;
    }
  }, [
    currentUrl,
    finalUrl,
    savedStrategy?.finalUrl,
    savedStrategy?.lastTrainedUrl,
    verificationUiMessage,
  ]);

  useEffect(() => {
    const resumeAvailable =
      resolvedStopClassification.reason === "verification_required" &&
      recommendedAction === "complete_verification";

    if (resumeAvailable && !verificationResumeLoggedRef.current) {
      console.info("[AUTO_APPLY_RTX_PROGRESS]", {
        marker: "RTX_VERIFICATION_REQUIRED_RESUME_AVAILABLE",
        canResumeAfterHumanStep: true,
      });
      verificationResumeLoggedRef.current = true;
    }

    if (!resumeAvailable) {
      verificationResumeLoggedRef.current = false;
    }
  }, [recommendedAction, resolvedStopClassification.reason]);

  const refreshStrategy = useCallback(() => {
    if (!resolvedHostname) {
      setSavedStrategy(null);
      setSavedStrategyMatchesCurrentStop(false);
      return;
    }

    const match = getApplySiteStrategyMatch({
      hostname: resolvedHostname,
      reason: resolvedStopClassification.reason,
    });
    setSavedStrategy(match.strategy);
    setSavedStrategyMatchesCurrentStop(match.matchedByReason);
  }, [resolvedHostname, resolvedStopClassification.reason]);

  useEffect(() => {
    void (async () => {
      await refreshApplySiteStrategies().catch(() => undefined);
      refreshStrategy();
    })();
    setPreviewOpen(false);
    setReplaySessionId(null);
    setReplaySession(null);
    setReplayMessage(null);
    setReplayError(null);
    setLibraryMessage(null);
    setLibraryError(null);
  }, [refreshStrategy]);

  useEffect(() => {
    const handleStrategiesUpdated = () => {
      refreshStrategy();
    };

    window.addEventListener(
      APPLY_SITE_STRATEGY_UPDATED_EVENT,
      handleStrategiesUpdated,
    );

    return () => {
      window.removeEventListener(
        APPLY_SITE_STRATEGY_UPDATED_EVENT,
        handleStrategiesUpdated,
      );
    };
  }, [refreshStrategy]);

  useEffect(() => {
    if (
      !replaySessionId ||
      (replaySession?.status !== "STARTING" && replaySession?.status !== "RUNNING")
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/apply-replay/${replaySessionId}`, {
            cache: "no-store",
          });
          const payload = (await response.json()) as ReplaySessionResponse;

          if (!response.ok || !payload.ok || !payload.session) {
            throw new Error(payload.error ?? "Unable to load replay status.");
          }

          setReplaySession(payload.session);

          if (
            payload.session.status === "COMPLETED" ||
            payload.session.status === "FAILED"
          ) {
            setReplaySessionId(null);

            if (resolvedHostname) {
              try {
                const next = await updateApplySiteStrategyReplayState({
                  strategyId: savedStrategy?.id,
                  strategyKey: savedStrategy?.strategyKey,
                  hostname: resolvedHostname,
                  replayStatus:
                    payload.session.status === "FAILED" ? "FAILED" : "COMPLETED",
                  lastReplayedAt:
                    payload.session.lastReplayedAt ?? new Date().toISOString(),
                  lastReplayResult: payload.session.lastReplayResult
                    ? {
                        ...payload.session.lastReplayResult,
                        currentUrl:
                          payload.session.lastReplayResult.currentUrl ?? undefined,
                        reason:
                          payload.session.lastReplayResult.reason ?? undefined,
                        failingStepId:
                          payload.session.lastReplayResult.failingStepId ?? undefined,
                      }
                    : null,
                  failingStepId: payload.session.failingStepId ?? null,
                });
                setSavedStrategy(next);
                setSavedStrategyMatchesCurrentStop(
                  strategyMatchesStopReason({
                    strategy: next,
                    reason: resolvedStopClassification.reason,
                  }),
                );
              } catch {
                // Keep showing the live replay result even if local persistence fails.
              }
            }

            setReplayMessage(
              payload.session.status === "FAILED"
                ? "Saved strategy replay stopped before completion."
                : "Saved strategy replay completed.",
            );
            setReplayError(payload.session.error ?? null);
          }
        } catch (error) {
          setReplaySessionId(null);
          setReplayError(
            error instanceof Error ? error.message : "Unable to load replay status.",
          );
        }
      })();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [
    replaySession?.status,
    replaySessionId,
    resolvedHostname,
    resolvedStopClassification.reason,
    savedStrategy?.id,
    savedStrategy?.strategyKey,
  ]);

  const palette =
    tone === "amber"
      ? {
          panel: "border-amber-200 bg-amber-50 text-amber-900",
          button: "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
          subtle: "text-amber-800/80",
        }
      : {
          panel: "border-gray-200 bg-gray-50 text-gray-700",
          button: "border-gray-300 bg-white text-gray-900 hover:bg-gray-100",
          subtle: "text-gray-500",
        };

  const sharedButtonClassName = cn(
    compact ? "h-7 px-2 text-[11px]" : "",
    palette.button,
  );
  const recommendedActionUrl =
    resolvedUrl || savedStrategy?.lastTrainedUrl || savedStrategy?.finalUrl || null;

  const handleStrategySaved = useCallback((strategy: ApplySiteStrategyRecord) => {
    setSavedStrategy(strategy);
    setSavedStrategyMatchesCurrentStop(
      strategyMatchesStopReason({
        strategy,
        reason: resolvedStopClassification.reason,
      }),
    );
    setPreviewOpen(Boolean(strategy.steps?.length));
    setReplaySession(null);
    setReplaySessionId(null);
    setReplayMessage(null);
    setReplayError(null);
  }, [resolvedStopClassification.reason]);

  const renderTeachDialog = (triggerLabel: string) => (
    <TeachPageDialog
      finalUrl={finalUrl}
      currentUrl={currentUrl}
      lastAction={lastAction}
      stopReason={stopReason}
      errorMessage={errorMessage}
      stopClassification={resolvedStopClassification}
      triggerLabel={triggerLabel}
      triggerClassName={sharedButtonClassName}
      onStrategySaved={handleStrategySaved}
    />
  );

  const renderWalkthroughTeachDialog = () => (
    <TeachPageDialog
      finalUrl={finalUrl}
      currentUrl={currentUrl}
      lastAction={lastAction}
      stopReason={stopReason}
      errorMessage={errorMessage}
      stopClassification={resolvedStopClassification}
      triggerLabel="Walk through in Teach Mode"
      triggerClassName={sharedButtonClassName}
      autoStartRecordingOnOpen
      onStrategySaved={handleStrategySaved}
    />
  );

  const renderRecommendedActionButton = () => {
    switch (recommendedAction) {
      case "teach_this_page":
        return null;
      case "open_original_job_site":
      case "sign_in_and_retry":
      case "login_to_continue":
      case "complete_verification":
      case "review_and_retry":
      default:
        return recommendedActionUrl ? (
          <Button asChild variant="outline" size="sm" className={sharedButtonClassName}>
            <a href={recommendedActionUrl} target="_blank" rel="noreferrer">
              {recommendedActionUi.label}
            </a>
          </Button>
        ) : null;
    }
  };

  const recommendedActionButton = renderRecommendedActionButton();

  const renderStopSummary = () => (
    <div className="rounded-lg border border-current/10 bg-white/70 p-3">
      {resolvedStopClassification.reason === "verification_required" ? (
        <p className="font-semibold text-current">Human verification required</p>
      ) : (
        <p className="font-semibold text-current">
          Why it stopped: {getStopReasonLabel(resolvedStopClassification.reason)}
        </p>
      )}
      <p className={cn("mt-1", palette.subtle)}>
        Page type: {getStopPageTypeLabel(resolvedStopClassification.pageType)}
      </p>
      <p className={cn("mt-1", palette.subtle)}>
        Suggested action:{" "}
        {getStopSuggestedActionLabel(resolvedStopClassification.suggestedAction)}
      </p>
      {resolvedStopClassification.reason === "verification_required" &&
      recommendedActionUrl ? (
        <p className={cn("mt-1", palette.subtle)}>
          Current URL:{" "}
          <a
            className="break-all underline"
            href={recommendedActionUrl}
            target="_blank"
            rel="noreferrer"
          >
            {recommendedActionUrl}
          </a>
        </p>
      ) : null}
      {verificationUiMessage ? (
        <p className={cn("mt-2", palette.subtle)}>{verificationUiMessage}</p>
      ) : null}
    </div>
  );

  const renderRecommendedNextStep = () => (
    <div className="rounded-lg border border-current/10 bg-white/70 p-3">
      <p className="font-semibold text-current">Recommended next step</p>
      <p className={cn("mt-1", palette.subtle)}>
        {recommendedActionUi.recommendationText}
      </p>
      {recommendedActionButton ? (
        <div className="mt-3 flex flex-wrap gap-2">{recommendedActionButton}</div>
      ) : null}
      <p className={cn("mt-3 text-xs", palette.subtle)}>
        Use Teach Mode to show Hirexa the exact steps on this page.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {renderWalkthroughTeachDialog()}
        {savedStrategy && strategySteps.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sharedButtonClassName}
            onClick={() => setPreviewOpen((current) => !current)}
          >
            Preview strategy
          </Button>
        ) : null}
      </div>
    </div>
  );

  const renderLibraryActions = () => (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          void (async () => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;

            try {
              const rawJson = await file.text();
              const currentStrategies = loadApplySiteStrategies();
              const importedKeys = getImportedHostnameKeys(rawJson);
              const duplicateCount = importedKeys.filter((key) => {
                const hostname = resolveStrategyHostname(key);
                return Boolean(
                  hostname &&
                    Object.values(currentStrategies).some(
                      (strategy) => strategy.hostname === hostname,
                    ),
                );
              }).length;

              const overwriteExisting =
                duplicateCount > 0
                  ? window.confirm(
                      `${duplicateCount} matching hostname${
                        duplicateCount === 1 ? "" : "s"
                      } already exist. Click OK to overwrite them, or Cancel to keep existing records.`,
                    )
                  : false;

              const importResult = await importStrategies(
                withOverwriteFlag(rawJson, overwriteExisting),
              );

              await refreshApplySiteStrategies().catch(() => undefined);
              refreshStrategy();
              setLibraryMessage(
                `Import complete. Imported ${importResult.imported}, overwritten ${importResult.overwritten}, skipped ${importResult.skipped}.`,
              );
              setLibraryError(null);
            } catch (error) {
              setLibraryMessage(null);
              setLibraryError(
                error instanceof Error
                  ? error.message
                  : "Unable to import strategies.",
              );
            }
          })();
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={sharedButtonClassName}
        onClick={() => {
          try {
            const json = exportStrategies();
            const blob = new Blob([json], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            const dateStamp = new Date().toISOString().slice(0, 10);

            anchor.href = url;
            anchor.download = `hirexa-strategy-library-${dateStamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.URL.revokeObjectURL(url);

            setLibraryMessage("Exported saved strategies to JSON.");
            setLibraryError(null);
          } catch (error) {
            setLibraryMessage(null);
            setLibraryError(
              error instanceof Error
                ? error.message
                : "Unable to export strategies.",
            );
          }
        }}
      >
        Export strategies
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={sharedButtonClassName}
        onClick={() => importInputRef.current?.click()}
      >
        Import strategies
      </Button>
    </>
  );

  const startStrategyReplay = useCallback(
    async (mode: "fresh" | "last_url") => {
      if (!savedStrategy) return;

      try {
        setPreviewOpen(true);
        setReplayError(null);
        setReplayMessage(null);

        const response = await fetch("/api/apply-replay/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            hostname: savedStrategy.hostname,
            finalUrl: finalUrl ?? savedStrategy.finalUrl,
            currentUrl: currentUrl ?? finalUrl ?? savedStrategy.lastTrainedUrl,
            retryMode: mode,
            stopReason:
              stopReason ??
              savedStrategy.stopReason ??
              "HUMAN_INTERVENTION_REQUIRED",
            lastAction: lastAction ?? savedStrategy.lastAction ?? "",
            strategy: {
              finalUrl: savedStrategy.finalUrl,
              lastTrainedUrl: savedStrategy.lastTrainedUrl,
              steps: savedStrategy.steps ?? [],
            },
          }),
        });

        const payload = (await response.json()) as ReplaySessionResponse;
        if (!response.ok || !payload.ok || !payload.session) {
          throw new Error(payload.error ?? "Unable to start saved strategy replay.");
        }

        setReplaySession(payload.session);
        setReplaySessionId(payload.session.id);
        setReplayMessage(
          mode === "fresh"
            ? "Retry started with a fresh browser session."
            : "Retry started from the last URL.",
        );

        try {
          const next = await updateApplySiteStrategyReplayState({
            strategyId: savedStrategy.id,
            strategyKey: savedStrategy.strategyKey,
            hostname: savedStrategy.hostname,
            replayStatus: "RUNNING",
            lastReplayResult: null,
            failingStepId: null,
          });
          setSavedStrategy(next);
          setSavedStrategyMatchesCurrentStop(
            strategyMatchesStopReason({
              strategy: next,
              reason: resolvedStopClassification.reason,
            }),
          );
        } catch {
          // Replay can still proceed if local persistence is unavailable.
        }
      } catch (error) {
        setReplayError(
          error instanceof Error
            ? error.message
            : "Unable to start saved strategy replay.",
        );
      }
    },
    [
      currentUrl,
      finalUrl,
      lastAction,
      resolvedStopClassification.reason,
      savedStrategy,
      stopReason,
    ],
  );

  if (!resolvedUrl && !resolvedHostname) {
    return null;
  }

  if (!savedStrategy) {
    return (
      <div className={cn("mt-2 space-y-2", className)}>
        {renderStopSummary()}
        {renderRecommendedNextStep()}

        <div className="flex flex-wrap gap-2">{renderLibraryActions()}</div>
        {libraryMessage ? (
          <p className={cn(compact ? "text-[11px]" : "text-sm", "text-current")}>
            {libraryMessage}
          </p>
        ) : null}
        {libraryError ? (
          <p className={cn(compact ? "text-[11px]" : "text-sm", "text-red-600")}>
            {libraryError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-2 rounded-lg border p-3",
        palette.panel,
        compact ? "text-[11px]" : "text-sm",
        className,
      )}
      >
      {renderStopSummary()}
      <div className="mt-3">{renderRecommendedNextStep()}</div>

      <p className="mt-3 font-semibold text-current">
        {savedStrategyMatchesCurrentStop
          ? "A saved strategy exists for this type of stop."
          : "A saved strategy exists for this site."}
      </p>
      <p className={cn("mt-1 break-all", palette.subtle)}>
        Hostname: {savedStrategy.hostname}
      </p>
      <p className={cn("mt-1", palette.subtle)}>
        Updated: {new Date(savedStrategy.updatedAt).toLocaleString()}
      </p>
      <p className={cn("mt-1", palette.subtle)}>
        Step count: {strategySteps.length}
      </p>
      <div className="mt-3 rounded-lg border border-current/10 bg-white/70 p-3">
        <p className="font-semibold text-current">
          Strategy health:{" "}
          <span className={strategyHealthClassName}>
            {getApplySiteStrategyStatusLabel(savedStrategy.status)}
          </span>
        </p>
        <p className={cn("mt-1", palette.subtle)}>
          Successful replays: {savedStrategy.successCount}
        </p>
        <p className={cn("mt-1", palette.subtle)}>
          Failed replays: {savedStrategy.failureCount}
        </p>
        <p className={cn("mt-1", palette.subtle)}>
          Last replay: {lastReplayOutcomeLabel}
        </p>
        <p className={cn("mt-1", palette.subtle)}>
          Prompt generation: {promptGenerationStatus?.label ?? "Needs recorded steps"}
        </p>
        {savedStrategy.promptModel ? (
          <p className={cn("mt-1", palette.subtle)}>
            Model used: {savedStrategy.promptModel}
          </p>
        ) : null}
        {savedStrategy.promptReasoningEffort ? (
          <p className={cn("mt-1", palette.subtle)}>
            Reasoning effort: {savedStrategy.promptReasoningEffort}
          </p>
        ) : null}
        <p className={cn("mt-1", palette.subtle)}>
          Replay status: {savedStrategy.replayStatus ?? "IDLE"}
        </p>
        {savedStrategy.lastReplayedAt ? (
          <p className={cn("mt-1", palette.subtle)}>
            Last replayed: {new Date(savedStrategy.lastReplayedAt).toLocaleString()}
          </p>
        ) : null}
        {savedStrategy.derivedInstruction ? (
          <p className={cn("mt-1", palette.subtle)}>
            Generated summary: {savedStrategy.derivedInstruction}
          </p>
        ) : null}
        {savedStrategy.promptWarning ? (
          <p className="mt-1 text-amber-700">
            {savedStrategy.promptWarning}
          </p>
        ) : null}
        {savedStrategy.lastFailureReason ? (
          <p className="mt-1 text-red-600">
            Last failure: {savedStrategy.lastFailureReason}
          </p>
        ) : null}
        {savedStrategy.failingStepId ? (
          <p className={cn("mt-1", palette.subtle)}>
            Last failing step: {savedStrategy.failingStepId}
          </p>
        ) : null}
      </div>

      {strategySteps.length === 0 ? (
        <p className={cn("mt-2", palette.subtle)}>
          This saved strategy has notes, but no replayable steps yet. Retrain this
          page to capture a visible flow.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={sharedButtonClassName}
          onClick={() => setPreviewOpen((current) => !current)}
        >
          Review previous attempt
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={sharedButtonClassName}
          disabled={strategySteps.length === 0 || isReplayRunning}
          onClick={() => {
            void startStrategyReplay("fresh");
          }}
        >
          {isReplayRunning ? "Replaying..." : "Retry with fresh session"}
        </Button>

        {savedStrategy.lastTrainedUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sharedButtonClassName}
            disabled={strategySteps.length === 0 || isReplayRunning}
            onClick={() => {
              void startStrategyReplay("last_url");
            }}
          >
            Retry from last URL
          </Button>
        ) : null}

        {renderTeachDialog("Retrain")}

        {renderLibraryActions()}
      </div>

      {replaySession ? (
        <div className="mt-3 rounded-md border border-current/10 bg-white/70 p-3">
          <p className="font-medium text-current">
            Replay status: {formatReplayStatus(replaySession.status)}
          </p>
          <p className={cn("mt-1 break-all", palette.subtle)}>
            Current URL: {replaySession.currentUrl ?? replaySession.startUrl}
          </p>
          <p className={cn("mt-1", palette.subtle)}>
            Progress: {replaySession.completedStepCount}/{replaySession.stepCount}
          </p>
          {failingReplayStep ? (
            <p className={cn("mt-1", palette.subtle)}>
              Failing step: {failingReplayStep.type}
              {failingReplayStep.label ? ` - ${failingReplayStep.label}` : ""}
            </p>
          ) : null}
          {replaySession.error ? (
            <p className="mt-1 text-red-600">Reason: {replaySession.error}</p>
          ) : null}
        </div>
      ) : null}

      {replayMessage ? <p className="mt-3 text-current">{replayMessage}</p> : null}
      {replayError ? <p className="mt-2 text-red-600">{replayError}</p> : null}
      {libraryMessage ? <p className="mt-2 text-current">{libraryMessage}</p> : null}
      {libraryError ? <p className="mt-2 text-red-600">{libraryError}</p> : null}

      {(previewOpen || Boolean(replaySession)) && activeReplaySteps.length > 0 ? (
        <div className="mt-3 rounded-md border border-current/10 bg-white/70 p-3">
          <p className="font-medium text-current">Saved steps</p>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {activeReplaySteps.map((step, index) => {
              const replayStatus =
                "status" in step && typeof step.status === "string" && step.status
                  ? step.status
                  : null;
              const replayReason =
                "reason" in step && typeof step.reason === "string" && step.reason
                  ? step.reason
                  : null;

              return (
                <div
                  key={step.id}
                  className="rounded-md border border-current/10 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-current">
                      {index + 1}. {step.type}
                      {step.label ? ` - ${step.label}` : ""}
                    </p>
                    {replayStatus ? (
                      <span className={cn("text-xs", palette.subtle)}>
                        {formatReplayStatus(replayStatus)}
                      </span>
                    ) : null}
                  </div>

                  {step.selector ? (
                    <p className={cn("mt-1 break-all text-xs", palette.subtle)}>
                      Selector: {step.selector}
                    </p>
                  ) : null}

                  {step.text ? (
                    <p className={cn("mt-1 break-all text-xs", palette.subtle)}>
                      Text: {step.text}
                    </p>
                  ) : null}

                  {step.value ? (
                    <p className={cn("mt-1 break-all text-xs", palette.subtle)}>
                      Value: {step.value}
                    </p>
                  ) : null}

                  {typeof step.checked === "boolean" ? (
                    <p className={cn("mt-1 text-xs", palette.subtle)}>
                      Checked: {String(step.checked)}
                    </p>
                  ) : null}

                  <p className={cn("mt-1 break-all text-xs", palette.subtle)}>
                    URL: {step.currentUrl}
                  </p>

                  {replayReason ? (
                    <p className="mt-1 text-xs text-red-600">Reason: {replayReason}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
