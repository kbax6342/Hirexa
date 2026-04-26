"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Textarea } from "@/app/components/ui/textarea";
import {
  APPLY_SITE_STRATEGY_UPDATED_EVENT,
  getApplySiteStrategy,
  refreshApplySiteStrategies,
  resolveStrategyHostname,
  saveApplySiteStrategy,
  type ApplySiteStrategyRecord,
  type ApplySiteStrategyStep,
} from "@/app/lib/apply/siteStrategyStore";
import {
  buildApplySiteStrategyCodexPrompt,
  getPromptGenerationStatus,
} from "@/app/lib/apply/siteStrategyPrompt";
import {
  deriveStopClassification,
  type ApplyStopClassification,
} from "@/app/lib/apply/stopClassification";

type TeachPageDialogProps = {
  finalUrl?: string | null;
  currentUrl?: string | null;
  lastAction?: string | null;
  stopReason?: string | null;
  errorMessage?: string | null;
  stopClassification?: ApplyStopClassification | null;
  triggerLabel?: string;
  triggerClassName?: string;
  autoStartRecordingOnOpen?: boolean;
  onStrategySaved?: (strategy: ApplySiteStrategyRecord) => void;
};

type TrainingSessionResponse = {
  ok?: boolean;
  error?: string;
  session?: {
    id: string;
    hostname: string;
    finalUrl: string;
    stopReason: string;
    lastAction: string;
    status: "RECORDING" | "STOPPED" | "FAILED";
    startedAt: string;
    updatedAt: string;
    currentUrl: string | null;
    stepCount: number;
    steps: ApplySiteStrategyStep[];
    error?: string | null;
  };
};

function getLatestRecordedStepTimestamp(steps: ApplySiteStrategyStep[]) {
  return steps.reduce((latest, step) => {
    const next = Date.parse(step.timestamp);
    if (!Number.isFinite(next)) return latest;
    return Math.max(latest, next);
  }, 0);
}

function recordedStepsAreNewer(
  strategy: ApplySiteStrategyRecord,
  recordedSteps: ApplySiteStrategyStep[],
) {
  if (recordedSteps.length === 0) {
    return false;
  }

  const savedRawSteps = strategy.rawSteps ?? strategy.steps ?? [];
  if (savedRawSteps.length === 0) {
    return true;
  }

  const savedTimestamp = Math.max(
    getLatestRecordedStepTimestamp(savedRawSteps),
    Date.parse(strategy.updatedAt) || 0,
  );
  const currentTimestamp = getLatestRecordedStepTimestamp(recordedSteps);

  return (
    currentTimestamp > savedTimestamp ||
    recordedSteps.length !== savedRawSteps.length
  );
}

export default function TeachPageDialog({
  finalUrl,
  currentUrl,
  lastAction,
  stopReason,
  errorMessage,
  stopClassification,
  triggerLabel,
  triggerClassName,
  autoStartRecordingOnOpen = false,
  onStrategySaved,
}: TeachPageDialogProps) {
  const [open, setOpen] = useState(false);
  const [urlOrHostname, setUrlOrHostname] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectors, setSelectors] = useState("");
  const [savedStrategy, setSavedStrategy] = useState<ApplySiteStrategyRecord | null>(
    null,
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trainingSessionId, setTrainingSessionId] = useState<string | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<
    "idle" | "starting" | "recording" | "stopped"
  >("idle");
  const [recordedSteps, setRecordedSteps] = useState<ApplySiteStrategyStep[]>([]);
  const [recordingStepCount, setRecordingStepCount] = useState(0);
  const [lastTrainedUrl, setLastTrainedUrl] = useState<string | null>(null);
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [existingStrategy, setExistingStrategy] = useState<ApplySiteStrategyRecord | null>(
    null,
  );
  const [teachMode, setTeachMode] = useState<"fresh" | "review">("fresh");
  const [saving, setSaving] = useState(false);
  const [generatedCodexPrompt, setGeneratedCodexPrompt] = useState("");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [promptGeneratedAt, setPromptGeneratedAt] = useState<string | null>(null);
  const [promptModel, setPromptModel] = useState<string | null>(null);
  const [promptReasoningEffort, setPromptReasoningEffort] = useState<string | null>(null);
  const [promptWarning, setPromptWarning] = useState<string | null>(null);
  const [promptMessage, setPromptMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [promptGeneratedLocally, setPromptGeneratedLocally] = useState(false);

  const resolvedUrl = finalUrl ?? currentUrl ?? "";
  const resolvedStopReason = stopReason ?? "HUMAN_INTERVENTION_REQUIRED";
  const resolvedLastAction = lastAction ?? "";
  const resolvedErrorMessage = errorMessage ?? "";
  const resolvedHostname = useMemo(
    () => resolveStrategyHostname(urlOrHostname || resolvedUrl),
    [resolvedUrl, urlOrHostname],
  );
  const resolvedStopClassification = useMemo(
    () =>
      stopClassification ??
      deriveStopClassification({
        finalUrl,
        currentUrl,
        lastAction,
      }),
    [currentUrl, finalUrl, lastAction, stopClassification],
  );
  const teachFieldClassName = "bg-white text-black";
  const canShowGeneratedPrompt = generatedCodexPrompt.trim().length > 0;
  const promptSourceStrategy = useMemo(() => {
    if (!savedStrategy) {
      return null;
    }

    const useRecordedSteps = recordedStepsAreNewer(savedStrategy, recordedSteps);
    const nextRecordedSteps = useRecordedSteps
      ? recordedSteps
      : savedStrategy.rawSteps ?? savedStrategy.steps ?? [];
    const nextReplaySafeSteps = useRecordedSteps
      ? recordedSteps
      : savedStrategy.steps ??
        savedStrategy.sanitizedSteps ??
        savedStrategy.rawSteps ??
        [];
    const nextLastTrainedUrl = useRecordedSteps
      ? recordedSteps.at(-1)?.currentUrl ??
        lastTrainedUrl ??
        savedStrategy.lastTrainedUrl
      : savedStrategy.lastTrainedUrl ??
        lastTrainedUrl ??
        nextRecordedSteps.at(-1)?.currentUrl;

    return {
      ...savedStrategy,
      instructions: instructions.trim() || savedStrategy.instructions,
      selectors: selectors.trim() || savedStrategy.selectors,
      steps: nextReplaySafeSteps,
      rawSteps: nextRecordedSteps,
      sanitizedSteps: nextReplaySafeSteps,
      lastTrainedUrl: nextLastTrainedUrl,
    } satisfies ApplySiteStrategyRecord;
  }, [instructions, lastTrainedUrl, recordedSteps, savedStrategy, selectors]);
  const promptGenerationStatus = useMemo(
    () =>
      getPromptGenerationStatus(promptSourceStrategy, {
        generated: promptGeneratedLocally,
        replaySafeSteps: promptSourceStrategy?.steps,
        rawRecordedSteps: promptSourceStrategy?.rawSteps,
      }),
    [promptGeneratedLocally, promptSourceStrategy],
  );
  const canGeneratePrompt =
    Boolean(promptSourceStrategy) &&
    promptGenerationStatus.key !== "needs_recorded_steps";

  const setPromptFields = useCallback((strategy: ApplySiteStrategyRecord | null) => {
    const promptValue =
      strategy?.generatedCodexPrompt ?? strategy?.automationPrompt ?? "";
    const summaryValue = strategy?.aiSummary ?? strategy?.derivedInstruction ?? "";

    setGeneratedCodexPrompt(promptValue);
    setGeneratedSummary(summaryValue);
    setPromptGeneratedAt(strategy?.promptGeneratedAt ?? strategy?.updatedAt ?? null);
    setPromptModel(strategy?.promptModel ?? null);
    setPromptReasoningEffort(strategy?.promptReasoningEffort ?? null);
    setPromptWarning(strategy?.promptWarning ?? null);
  }, []);

  const hydrateFromExistingStrategy = useCallback(
    (strategy: ApplySiteStrategyRecord) => {
      setTeachMode("review");
      setInstructions(strategy.instructions ?? "");
      setSelectors(strategy.selectors ?? "");
      setRecordedSteps(strategy.rawSteps ?? strategy.steps ?? []);
      setRecordingStepCount(
        strategy.rawSteps?.length ?? strategy.steps?.length ?? 0,
      );
      setLastTrainedUrl(strategy.lastTrainedUrl ?? resolvedUrl ?? null);
      setPromptFields(strategy);
    },
    [resolvedUrl, setPromptFields],
  );

  useEffect(() => {
    if (!open) return;

    const initialTarget = resolvedUrl || resolvedHostname;
    const initialHostname =
      resolveStrategyHostname(initialTarget) || initialTarget;

    setUrlOrHostname(initialTarget);
    setTrainingSessionId(null);
    setTrainingStatus("idle");
    setTrainingMessage(null);
    setTrainingError(null);
    setInstructions("");
    setSelectors("");
    setRecordedSteps([]);
    setRecordingStepCount(0);
    setLastTrainedUrl(resolvedUrl || null);
    setSaveMessage(null);
    setSaveError(null);
    setExistingStrategy(null);
    setSavedStrategy(null);
    setTeachMode("fresh");
    setSaving(false);
    setGeneratedCodexPrompt("");
    setGeneratedSummary("");
    setPromptGeneratedAt(null);
    setPromptModel(null);
    setPromptReasoningEffort(null);
    setPromptWarning(null);
    setPromptMessage(null);
    setCopyMessage(null);
    setPromptGeneratedLocally(false);

    void (async () => {
      await refreshApplySiteStrategies().catch(() => undefined);
      const existing = getApplySiteStrategy(initialHostname);
      setExistingStrategy(existing ?? null);
      setSavedStrategy(existing);
    })();
  }, [open, resolvedHostname, resolvedUrl]);

  useEffect(() => {
    if (!open) return;

    const handleStrategiesUpdated = () => {
      const activeTarget = urlOrHostname || resolvedUrl || resolvedHostname;
      if (!activeTarget) return;

      const next = getApplySiteStrategy(activeTarget);
      setExistingStrategy(next ?? null);
      setSavedStrategy(next);
      if (teachMode === "review" && next) {
        setPromptFields(next);
      }
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
  }, [open, resolvedHostname, resolvedUrl, setPromptFields, teachMode, urlOrHostname]);

  useEffect(() => {
    if (!open || !trainingSessionId || trainingStatus !== "recording") {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/apply-training/${trainingSessionId}`, {
            cache: "no-store",
          });
          const payload = (await response.json()) as TrainingSessionResponse;
          if (!response.ok || !payload.ok || !payload.session) {
            return;
          }

          setRecordedSteps(payload.session.steps ?? []);
          setRecordingStepCount(payload.session.stepCount);
          setLastTrainedUrl(payload.session.currentUrl ?? payload.session.finalUrl);

          if (payload.session.status !== "RECORDING") {
            setTrainingStatus("stopped");
            setTrainingMessage("Recording stopped. Review the captured steps below.");
            setTrainingError(payload.session.error ?? null);
            setTrainingSessionId(null);
          }
        } catch {
          // Best-effort polling while the session is active.
        }
      })();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [open, trainingSessionId, trainingStatus]);

  const isRecording = trainingStatus === "recording";
  const canSaveStrategy = Boolean(resolvedHostname) && trainingStatus !== "starting";
  const generateCodexPrompt = useCallback(() => {
    if (!promptSourceStrategy || !canGeneratePrompt) {
      return;
    }

    const generatedAt = new Date().toISOString();
    const prompt = buildApplySiteStrategyCodexPrompt(promptSourceStrategy, {
      replaySafeSteps: promptSourceStrategy.steps,
      rawRecordedSteps: promptSourceStrategy.rawSteps,
    });

    setGeneratedCodexPrompt(prompt);
    setGeneratedSummary(
      promptSourceStrategy.aiSummary ??
        promptSourceStrategy.derivedInstruction ??
        "",
    );
    setPromptGeneratedAt(generatedAt);
    setPromptModel("local-deterministic");
    setPromptReasoningEffort(null);
    setPromptWarning(null);
    setPromptMessage("Prompt generated locally from saved strategy evidence.");
    setCopyMessage(null);
    setPromptGeneratedLocally(true);

    if (process.env.NODE_ENV !== "production") {
      console.info("[APPLY_STRATEGY_PROMPT] generated", {
        hostname: promptSourceStrategy.hostname,
        finalUrl: promptSourceStrategy.finalUrl,
        lastTrainedUrl: promptSourceStrategy.lastTrainedUrl ?? null,
        stepCount:
          promptSourceStrategy.rawSteps?.length ??
          promptSourceStrategy.steps?.length ??
          0,
        hasInstructions: promptSourceStrategy.instructions.trim().length > 0,
        hasSelectors: (promptSourceStrategy.selectors ?? "").trim().length > 0,
      });
    }
  }, [canGeneratePrompt, promptSourceStrategy]);

  const copyPromptToClipboard = useCallback(() => {
    if (!canShowGeneratedPrompt) return;

    void (async () => {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setCopyMessage("Clipboard is unavailable in this browser.");
        return;
      }

      try {
        await navigator.clipboard.writeText(generatedCodexPrompt);
        setCopyMessage("Copied prompt to clipboard.");
      } catch {
        setCopyMessage("Unable to copy prompt.");
      }
    })();
  }, [canShowGeneratedPrompt, generatedCodexPrompt]);

  const saveStrategy = useCallback(
    async (mode: "save" | "regenerate") => {
      if (!canSaveStrategy || isRecording) return;

      try {
        setSaving(true);
        setPromptMessage(null);
        setCopyMessage(null);
        const next = await saveApplySiteStrategy({
          hostname: urlOrHostname || resolvedHostname,
          finalUrl: resolvedUrl || urlOrHostname,
          lastAction: resolvedLastAction,
          stopReason: resolvedStopReason,
          supportedReasons: [resolvedStopClassification.reason],
          instructions,
          selectors,
          errorMessage: resolvedErrorMessage,
          steps: recordedSteps,
          trainingSource:
            recordedSteps.length > 0 ? "playwright_recording" : undefined,
          lastTrainedUrl:
            recordedSteps.at(-1)?.currentUrl ?? lastTrainedUrl ?? resolvedUrl,
          pageType: resolvedStopClassification.pageType,
        });

        setSavedStrategy(next);
        setExistingStrategy(next);
        setPromptFields(next);
        setSaveMessage(
          mode === "save"
            ? `Saved strategy for ${next.hostname} and generated a Codex prompt.`
            : `Regenerated Codex prompt for ${next.hostname}.`,
        );
        setSaveError(null);
        if (process.env.NODE_ENV !== "production") {
          console.log("[apply strategy] strategy saved, closing modal", {
            strategyKey: next.strategyKey ?? null,
            siteDomain: next.hostname,
          });
        }
        onStrategySaved?.(next);
        setOpen(false);
      } catch (error) {
        setSaveMessage(null);
        setSaveError(
          error instanceof Error ? error.message : "Failed to save strategy.",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      canSaveStrategy,
      instructions,
      isRecording,
      lastTrainedUrl,
      onStrategySaved,
      recordedSteps,
      resolvedErrorMessage,
      resolvedHostname,
      resolvedLastAction,
      resolvedStopClassification.pageType,
      resolvedStopClassification.reason,
      resolvedStopReason,
      resolvedUrl,
      selectors,
      setPromptFields,
      urlOrHostname,
    ],
  );

  const startRecording = useCallback(async () => {
    try {
      setTrainingStatus("starting");
      setTrainingMessage(null);
      setTrainingError(null);
      setRecordedSteps([]);
      setRecordingStepCount(0);
      setLastTrainedUrl(resolvedUrl || null);

      const response = await fetch("/api/apply-training/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hostname: resolvedHostname,
          finalUrl: resolvedUrl,
          stopReason: resolvedStopReason,
          lastAction: resolvedLastAction,
        }),
      });

      const payload = (await response.json()) as TrainingSessionResponse;
      if (!response.ok || !payload.ok || !payload.session) {
        throw new Error(payload.error ?? "Unable to start training recording.");
      }

      setTrainingSessionId(payload.session.id);
      setTrainingStatus("recording");
      setRecordedSteps(payload.session.steps ?? []);
      setRecordingStepCount(payload.session.stepCount);
      setLastTrainedUrl(payload.session.currentUrl ?? payload.session.finalUrl);
      setTrainingMessage(
        "Visible Playwright browser opened. Perform the flow there, then click Stop recording here.",
      );
    } catch (error) {
      setTrainingStatus("idle");
      setTrainingError(
        error instanceof Error
          ? error.message
          : "Unable to start training recording.",
      );
    }
  }, [resolvedHostname, resolvedLastAction, resolvedStopReason, resolvedUrl]);

  useEffect(() => {
    if (
      !open ||
      !autoStartRecordingOnOpen ||
      !resolvedUrl ||
      trainingStatus !== "idle" ||
      trainingSessionId
    ) {
      return;
    }

    void startRecording();
  }, [
    autoStartRecordingOnOpen,
    open,
    resolvedUrl,
    startRecording,
    trainingSessionId,
    trainingStatus,
  ]);

  if (!resolvedUrl && !resolvedHostname) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? "Teach this page"}
      </Button>
      <DialogContent className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-fit max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-gray-200 bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>Teach this page</DialogTitle>
          <DialogDescription>
            Save hostname-specific notes and optionally record a visible Playwright
            session for this stopped page.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-800">
              URL or hostname
            </label>
            <Input
              className={teachFieldClassName}
              value={urlOrHostname}
              onChange={(event) => setUrlOrHostname(event.target.value)}
              placeholder="https://jobs.example.com/apply or jobs.example.com"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-800">Hostname</label>
              <Input
                className={teachFieldClassName}
                value={resolvedHostname}
                readOnly
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-800">
                Detected stop reason
              </label>
              <Input
                className={teachFieldClassName}
                value={resolvedStopReason}
                readOnly
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-800">
                Error message
              </label>
              <Textarea
                className={teachFieldClassName}
                value={resolvedErrorMessage}
                readOnly
                rows={3}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-800">
                Last action
              </label>
              <Input
                className={teachFieldClassName}
                value={resolvedLastAction}
                readOnly
              />
            </div>
          </div>

          {resolvedHostname ? (
            <p className="text-xs text-gray-500">
              Saving under hostname: {resolvedHostname}
            </p>
          ) : null}

          {existingStrategy ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <span className="font-medium text-gray-900">Mode:</span>
              <span className="text-gray-700">
                {teachMode === "fresh"
                  ? "Fresh entry (default)"
                  : "Review previous attempt"}
              </span>
              {teachMode === "fresh" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => hydrateFromExistingStrategy(existingStrategy)}
                >
                  Review previous attempt
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTeachMode("fresh");
                    setInstructions("");
                    setSelectors("");
                    setRecordedSteps([]);
                    setRecordingStepCount(0);
                    setLastTrainedUrl(resolvedUrl || null);
                    setPromptFields(null);
                    setPromptMessage(null);
                    setPromptGeneratedLocally(false);
                    setCopyMessage(null);
                  }}
                >
                  Back to fresh entry
                </Button>
              )}
            </div>
          ) : null}

          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-sky-600 bg-sky-600 text-white hover:bg-sky-700 hover:text-white"
                disabled={!resolvedUrl || trainingStatus === "starting" || isRecording}
                onClick={() => {
                  void startRecording();
                }}
              >
                Start recording
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-sky-600 bg-sky-600 text-white hover:bg-sky-700 hover:text-white"
                disabled={!trainingSessionId || !isRecording}
                onClick={() => {
                  void (async () => {
                    if (!trainingSessionId) return;

                    try {
                      const response = await fetch(
                        `/api/apply-training/${trainingSessionId}`,
                        {
                          method: "DELETE",
                        },
                      );
                      const payload =
                        (await response.json()) as TrainingSessionResponse;
                      if (!response.ok || !payload.ok || !payload.session) {
                        throw new Error(
                          payload.error ?? "Unable to stop training recording.",
                        );
                      }

                      setTrainingStatus("stopped");
                      setTrainingSessionId(null);
                      setRecordedSteps(payload.session.steps ?? []);
                      setRecordingStepCount(payload.session.stepCount);
                      setLastTrainedUrl(
                        payload.session.currentUrl ?? payload.session.finalUrl,
                      );
                      setTrainingMessage(
                        "Recording stopped. Review the captured steps below.",
                      );
                      setTrainingError(payload.session.error ?? null);
                    } catch (error) {
                      setTrainingError(
                        error instanceof Error
                          ? error.message
                          : "Unable to stop training recording.",
                      );
                    }
                  })();
                }}
              >
                Stop recording
              </Button>
            </div>

            {trainingMessage ? (
              <p className="mt-2 text-sm text-gray-700">{trainingMessage}</p>
            ) : null}

            {trainingError ? (
              <p className="mt-2 text-sm text-red-600">{trainingError}</p>
            ) : null}

            {isRecording ? (
              <p className="mt-2 text-xs text-gray-500">
                Recording live. Captured steps so far: {recordingStepCount}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-800">
              Instructions
            </label>
            <Textarea
              className={teachFieldClassName}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Describe how this site should be handled next time."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-800">
              Selector notes
            </label>
            <Textarea
              className={teachFieldClassName}
              value={selectors}
              onChange={(event) => setSelectors(event.target.value)}
              placeholder="Optional CSS/XPath/button text notes."
            />
          </div>

          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-gray-900">
                Recorded steps ({recordedSteps.length})
              </p>
              {lastTrainedUrl ? (
                <p className="max-w-[60%] truncate text-xs text-gray-500">
                  Last trained URL: {lastTrainedUrl}
                </p>
              ) : null}
            </div>

            {recordedSteps.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                No recorded steps yet. Start a visible Playwright session to build a
                replayable step list.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {recordedSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="rounded-md border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {index + 1}. {step.type}
                          {step.label ? ` - ${step.label}` : ""}
                        </p>
                        {step.selector ? (
                          <p className="mt-1 break-all text-xs text-gray-500">
                            Selector: {step.selector}
                          </p>
                        ) : null}
                        {step.text ? (
                          <p className="mt-1 break-all text-xs text-gray-500">
                            Text: {step.text}
                          </p>
                        ) : null}
                        {step.value ? (
                          <p className="mt-1 break-all text-xs text-gray-500">
                            Value: {step.value}
                          </p>
                        ) : null}
                        {typeof step.checked === "boolean" ? (
                          <p className="mt-1 text-xs text-gray-500">
                            Checked: {String(step.checked)}
                          </p>
                        ) : null}
                        <p className="mt-1 break-all text-xs text-gray-500">
                          URL: {step.currentUrl}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Recorded: {new Date(step.timestamp).toLocaleString()}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRecordedSteps((current) =>
                            current.filter((candidate) => candidate.id !== step.id),
                          );
                          setRecordingStepCount((current) => Math.max(0, current - 1));
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {savedStrategy ? (
            <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p className="font-medium text-gray-900">
                Saved strategy for {savedStrategy.hostname}
              </p>
              <p className="mt-1 break-all text-xs text-gray-500">
                Last saved URL: {savedStrategy.finalUrl}
              </p>
              {savedStrategy.lastTrainedUrl ? (
                <p className="mt-1 break-all text-xs text-gray-500">
                  Last trained URL: {savedStrategy.lastTrainedUrl}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-gray-500">
                Replay-safe steps: {savedStrategy.steps?.length ?? 0}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Raw recorded steps: {savedStrategy.rawSteps?.length ?? savedStrategy.steps?.length ?? 0}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Updated: {new Date(savedStrategy.updatedAt).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Prompt generation: {promptGenerationStatus.label}
              </p>
              {savedStrategy.derivedInstruction ? (
                <p className="mt-2 text-xs text-gray-600">
                  Generated summary: {savedStrategy.derivedInstruction}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-gray-900">Generated Codex Prompt</p>
              <div className="flex flex-wrap items-center gap-2">
                {savedStrategy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!canGeneratePrompt}
                    onClick={generateCodexPrompt}
                  >
                    Generate Codex Prompt
                  </Button>
                ) : null}
                {canShowGeneratedPrompt ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyPromptToClipboard}
                  >
                    Copy Prompt
                  </Button>
                ) : null}
              </div>
            </div>

            {generatedSummary ? (
              <p className="mt-2 text-xs text-gray-600">{generatedSummary}</p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                {savedStrategy
                  ? "Generate a paste-ready Codex prompt from the saved strategy and recorded steps."
                  : "Save strategy to unlock local prompt generation."}
              </p>
            )}

            <Textarea
              className="mt-2 min-h-40 bg-white text-black"
              value={generatedCodexPrompt}
              readOnly
              placeholder="Codex prompt appears here after save."
            />

            {(promptGeneratedAt || promptModel) && canShowGeneratedPrompt ? (
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                <p>
                  Generated{" "}
                  {promptGeneratedAt
                    ? new Date(promptGeneratedAt).toLocaleString()
                    : "just now"}
                </p>
                {promptModel ? <p>Model used: {promptModel}</p> : null}
                {promptReasoningEffort ? (
                  <p>Reasoning effort: {promptReasoningEffort}</p>
                ) : null}
              </div>
            ) : null}

            {promptMessage ? (
              <p className="mt-2 text-xs text-emerald-700">{promptMessage}</p>
            ) : null}

            {promptWarning ? (
              <p className="mt-2 text-xs text-amber-700">{promptWarning}</p>
            ) : null}

            {copyMessage ? (
              <p className="mt-2 text-xs text-gray-600">{copyMessage}</p>
            ) : null}
          </div>

          {saveMessage ? (
            <p className="text-sm text-emerald-700">{saveMessage}</p>
          ) : null}

          {saveError ? (
            <p className="text-sm text-red-600">{saveError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              void saveStrategy("save");
            }}
            disabled={!canSaveStrategy || isRecording || saving}
          >
            {saving ? "Saving..." : "Save strategy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
