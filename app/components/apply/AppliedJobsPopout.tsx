"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SavedStrategyPanel from "@/app/components/apply/SavedStrategyPanel";
import { APPLY_SESSION_POLL_INTERVAL_MS } from "@/app/lib/apply/applySessionPolling";
import {
  clearAutoApplyPopupState,
  createEmptyAutoApplyPopupState,
  isAutoApplyPopupStateExpired,
  loadAutoApplyPopupState,
  saveAutoApplyPopupState,
  type AutoApplyPopupItem,
  type AutoApplyPopupState,
} from "@/app/lib/apply/autoApplyPopupSession";
import type { ApplyStopClassification } from "@/app/lib/apply/stopClassification";
import {
  getApplyAutomationErrorMessage,
  normalizeApplyAutomationErrorCode,
  prefixErrorCodeInMessage,
} from "@/app/lib/apply/errorCodes";
import {
  isApplySessionSuccessStatus,
  isApplySessionTerminalStatus,
  toApplySessionDisplayStatus,
} from "@/app/lib/apply/sessionStatus";
import { isSearchResultsUrl } from "@/app/lib/jobSources";

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
    errorCode?: string | null;
    debug?: {
      finalUrl?: string | null;
      latestUrl?: string | null;
      stoppedAtUrl?: string | null;
      stoppedAtTitle?: string | null;
      currentUrl?: string | null;
      originalJobUrl?: string | null;
      resolvedDirectUrl?: string | null;
      targetUrl?: string | null;
      lastAction?: string | null;
      lastActionText?: string | null;
      lastActionSelector?: string | null;
      stopReason?: string | null;
      stopClassification?: ApplyStopClassification | null;
      missingQuestions?: AutoApplyPopupItem["missingQuestions"];
    };
  };
  error?: string;
};

function formatAutoApplyMessage(args: {
  message?: string | null;
  errorCode?: string | null;
}) {
  const normalizedCode = normalizeApplyAutomationErrorCode(args.errorCode);
  const prefixed = prefixErrorCodeInMessage({
    errorCode: normalizedCode,
    message: args.message,
  });
  if (prefixed) return prefixed;
  return normalizedCode ? getApplyAutomationErrorMessage(normalizedCode) : null;
}

function formatAutoApplyStatusLabel(status: string | null | undefined) {
  const raw = String(status ?? "").trim().toUpperCase();
  if (raw === "FILLING_FORM") return "Filling application...";
  if (raw === "SUBMITTING_APPLICATION") return "Submitting application...";
  if (raw === "SUBMITTED") return "Application submitted";
  if (raw === "NEEDS_USER_ANSWERS") return "Answer questions to continue";
  const normalized = toApplySessionDisplayStatus(status) ?? status ?? "STARTING";

  switch (normalized) {
    case "VERIFICATION_REQUIRED":
      return "Verification required";
    case "APPLY_NOT_STARTED":
      return "Could not start";
    case "AUTO_APPLY_UNAVAILABLE":
      return "Not available";
    case "UNCONFIRMED":
      return "Unconfirmed";
    case "STALE_SESSION":
    case "READY_TO_RETRY":
      return "Auto Apply paused";
    case "READY_FOR_USER_REVIEW":
      return "Ready for review";
    case "WAITING_CONFIRMATION":
    case "WAITING_FOR_CONFIRMATION":
      return "Submission status unclear";
    case "SUBMITTED":
      return "Application submitted";
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
    status === "VERIFICATION_REQUIRED" ||
    status === "APPLY_NOT_STARTED" ||
    status === "WAITING_HUMAN" ||
    status === "STALE_SESSION" ||
    status === "READY_TO_RETRY" ||
    status === "READY_FOR_USER_REVIEW" ||
    status === "WAITING_CONFIRMATION" ||
    status === "WAITING_FOR_CONFIRMATION" ||
    status === "NEEDS_USER_ANSWERS" ||
    status === "FAILED"
  );
}

function autoApplyStatusCopy(status: string | null | undefined, message?: string | null) {
  if (status === "STALE_SESSION" || status === "READY_TO_RETRY") {
    return {
      title: "Auto Apply paused",
      message:
        message ??
        "The browser session stopped before Hirexa could finish this application.",
      action: "Retry Auto Apply",
    };
  }
  if (status === "READY_FOR_USER_REVIEW") {
    return {
      title: "Ready for review",
      message: message ?? "Hirexa filled the application. Review the form before submitting.",
      action: "Open review",
    };
  }
  if (status === "WAITING_CONFIRMATION" || status === "WAITING_FOR_CONFIRMATION") {
    return {
      title: "Submission status unclear",
      message:
        message ??
        "Hirexa clicked Submit Application but could not confirm the final Greenhouse confirmation page.",
      action: "Check confirmation tab or email",
    };
  }
  if (status === "NEEDS_USER_ANSWERS") {
    if (/submit blocked by validation errors|greenhouse returned validation errors/i.test(message ?? "")) {
      return {
        title: "Submit blocked by validation errors",
        message:
          message ??
          "Hirexa clicked Submit Application, but Greenhouse returned validation errors and did not open the confirmation page.",
        action: "Review validation errors",
      };
    }
    return {
      title: "Needs answers",
      message: message ?? "Hirexa needs your input for fields it should not guess.",
      action: "Answer questions to continue",
    };
  }
  return { title: null, message, action: null };
}

function pickLatestAutoApplyStopUrl(item: {
  stoppedAtUrl?: string | null;
  latestUrl?: string | null;
  currentUrl?: string | null;
  lastUrl?: string | null;
  targetUrl?: string | null;
  resolvedDirectUrl?: string | null;
  originalJobUrl?: string | null;
  jobUrl?: string | null;
}) {
  const prioritized = [
    item.stoppedAtUrl,
    item.latestUrl,
    item.currentUrl,
    item.lastUrl,
    item.targetUrl,
    item.resolvedDirectUrl,
    item.originalJobUrl,
    item.jobUrl,
  ].filter((value): value is string => Boolean(value));
  const first = prioritized[0] ?? null;
  const nonSearchResult = prioritized.find((value) => !isSearchResultsUrl(value));

  if (first && isSearchResultsUrl(first) && nonSearchResult) {
    return nonSearchResult;
  }

  return first;
}

export default function AppliedJobsPopout({
  buttonId = "applied-jobs-popout-toggle",
}: {
  buttonId?: string;
}) {
  const [autoApplyPopupState, setAutoApplyPopupState] = useState<AutoApplyPopupState>(
    () => createEmptyAutoApplyPopupState()
  );
  const [showAppliedPanel, setShowAppliedPanel] = useState(false);
  const autoApplyPollInFlightRef = useRef(false);
  const [answeringItem, setAnsweringItem] = useState<AutoApplyPopupItem | null>(null);
  const [answerValues, setAnswerValues] = useState<Record<string, string>>({});
  const [saveAnswerValues, setSaveAnswerValues] = useState<Record<string, boolean>>({});
  const [answerSubmitError, setAnswerSubmitError] = useState<string | null>(null);
  const [answerSubmitLoading, setAnswerSubmitLoading] = useState(false);

  const autoApplyItems = useMemo(
    () =>
      Object.values(autoApplyPopupState.items).sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
    [autoApplyPopupState.items]
  );

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

  const retryAutoApply = useCallback(
    async (item: AutoApplyPopupItem) => {
      updateAutoApplyPopupState((current, now) => ({
        ...current,
        items: {
          ...current.items,
          [item.applicationId]: {
            ...current.items[item.applicationId],
            status: "STARTING",
            message: "Retrying Auto Apply...",
            updatedAt: now,
          },
        },
      }));
      await fetch(`/api/applications/${item.applicationId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: true }),
      }).catch(() => null);
    },
    [updateAutoApplyPopupState],
  );

  const markAutoApplyActivity = useCallback(() => {
    updateAutoApplyPopupState((current, now) => ({
      ...current,
      lastActivityAt: now,
    }));
  }, [updateAutoApplyPopupState]);

  const dismissAutoApplyPopup = useCallback(() => {
    updateAutoApplyPopupState((current, now) => ({
      ...current,
      dismissedAt: now,
      isOpen: false,
      lastActivityAt: now,
    }));
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

  useEffect(() => {
    const now = Date.now();
    const stored = loadAutoApplyPopupState();

    if (!stored || isAutoApplyPopupStateExpired(stored, now)) {
      clearAutoApplyPopupState();
      const fresh = createEmptyAutoApplyPopupState(now);
      setAutoApplyPopupState(fresh);
      setShowAppliedPanel(false);
      return;
    }

    setAutoApplyPopupState(stored);
    setShowAppliedPanel(stored.isOpen && Object.keys(stored.items).length > 0);
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
    const interval = window.setInterval(() => {
      setAutoApplyPopupState((current) => {
        if (!isAutoApplyPopupStateExpired(current)) {
          return current;
        }

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
            const payloadMissingQuestions =
              payload.session.debug?.missingQuestions ??
              nextItems[item.applicationId]?.missingQuestions ??
              item.missingQuestions ??
              [];
            const formattedMessage = formatAutoApplyMessage({
              message: payload.session.message ?? payload.session.error ?? null,
              errorCode: payload.session.errorCode ?? null,
            });

            nextItems[item.applicationId] = {
              ...nextItems[item.applicationId],
              applySessionId: isApplySessionTerminalStatus(displayStatus) && payloadMissingQuestions.length === 0
                ? null
                : nextItems[item.applicationId]?.applySessionId ??
                  item.applySessionId ??
                  null,
              status: displayStatus,
              message: formattedMessage,
              errorCode:
                normalizeApplyAutomationErrorCode(payload.session.errorCode) ??
                null,
              lastUrl:
                payload.session.debug?.latestUrl ??
                payload.session.debug?.finalUrl ??
                payload.session.debug?.currentUrl ??
                payload.session.lastUrl ??
                nextItems[item.applicationId]?.lastUrl ??
                item.lastUrl ??
                null,
              latestUrl:
                payload.session.debug?.latestUrl ??
                payload.session.debug?.stoppedAtUrl ??
                payload.session.debug?.currentUrl ??
                payload.session.debug?.finalUrl ??
                payload.session.lastUrl ??
                nextItems[item.applicationId]?.latestUrl ??
                item.latestUrl ??
                null,
              stoppedAtUrl: pickLatestAutoApplyStopUrl({
                stoppedAtUrl: payload.session.debug?.stoppedAtUrl,
                latestUrl: payload.session.debug?.latestUrl,
                currentUrl: payload.session.debug?.currentUrl,
                lastUrl:
                  payload.session.debug?.finalUrl ?? payload.session.lastUrl,
                targetUrl:
                  payload.session.debug?.targetUrl ??
                  nextItems[item.applicationId]?.targetUrl ??
                  item.targetUrl,
                resolvedDirectUrl:
                  payload.session.debug?.resolvedDirectUrl ??
                  nextItems[item.applicationId]?.resolvedDirectUrl ??
                  item.resolvedDirectUrl,
                originalJobUrl:
                  payload.session.debug?.originalJobUrl ??
                  nextItems[item.applicationId]?.originalJobUrl ??
                  item.originalJobUrl,
                jobUrl:
                  nextItems[item.applicationId]?.jobUrl ??
                  item.jobUrl ??
                  null,
              }),
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
              missingQuestions: payloadMissingQuestions,
              originalJobUrl:
                payload.session.debug?.originalJobUrl ??
                nextItems[item.applicationId]?.originalJobUrl ??
                item.originalJobUrl ??
                null,
              resolvedDirectUrl:
                payload.session.debug?.resolvedDirectUrl ??
                nextItems[item.applicationId]?.resolvedDirectUrl ??
                item.resolvedDirectUrl ??
                null,
              targetUrl:
                payload.session.debug?.targetUrl ??
                nextItems[item.applicationId]?.targetUrl ??
                item.targetUrl ??
                null,
              updatedAt: now,
            } satisfies AutoApplyPopupItem;
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

  if (autoApplyItems.length === 0) {
    return null;
  }

  return (
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
              const stoppedUrl = pickLatestAutoApplyStopUrl(item);
              const statusCopy = autoApplyStatusCopy(item.status, item.message);
              const canRenderStoppedPageUi =
                stoppedStatus &&
                Boolean(
                  stoppedUrl ||
                    item.stopClassification ||
                    item.stopReason ||
                    item.lastAction
                );
              const missingQuestions = item.missingQuestions ?? [];

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
                        {statusCopy.title ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                            <div className="font-semibold">{statusCopy.title}</div>
                            <div className="mt-0.5">{statusCopy.message}</div>
                          </div>
                        ) : null}
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
                          errorMessage={item.message}
                          stopClassification={item.stopClassification}
                          compact
                          className="mt-2"
                        />
                        {missingQuestions.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAnsweringItem(item);
                              setAnswerSubmitError(null);
                              setAnswerValues(
                                Object.fromEntries(
                                  missingQuestions.map((question) => [
                                    question.label,
                                    question.aiDraft ?? "",
                                  ]),
                                ),
                              );
                              setSaveAnswerValues({});
                            }}
                            className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                          >
                            Answer questions to continue
                          </button>
                        ) : null}
                        {item.status === "STALE_SESSION" || item.status === "READY_TO_RETRY" ? (
                          <button
                            type="button"
                            onClick={() => void retryAutoApply(item)}
                            className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                          >
                            Retry Auto Apply
                          </button>
                        ) : null}
                        {item.status === "READY_FOR_USER_REVIEW" || item.status === "WAITING_CONFIRMATION" || item.status === "WAITING_FOR_CONFIRMATION" ? (
                          stoppedUrl ? (
                            <a
                              href={stoppedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                            >
                              {statusCopy.action ?? "Open application"}
                            </a>
                          ) : null
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-gray-600">
                        {statusCopy.title ? (
                          <div className="font-semibold text-gray-800">{statusCopy.title}</div>
                        ) : null}
                        <p>{statusCopy.message ?? item.message}</p>
                        {submitted && stoppedUrl ? (
                          <p>
                            Final URL:{" "}
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
                      </div>
                    )
                  ) : canRenderStoppedPageUi ? (
                    <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                      {statusCopy.title ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                          <div className="font-semibold">{statusCopy.title}</div>
                          <div className="mt-0.5">{statusCopy.message}</div>
                        </div>
                      ) : null}
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
                        errorMessage={item.message}
                        stopClassification={item.stopClassification}
                        compact
                        className="mt-2"
                      />
                      {missingQuestions.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAnsweringItem(item);
                            setAnswerSubmitError(null);
                            setAnswerValues(
                              Object.fromEntries(
                                missingQuestions.map((question) => [
                                  question.label,
                                  question.aiDraft ?? "",
                                ]),
                              ),
                            );
                            setSaveAnswerValues({});
                          }}
                          className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          Answer questions to continue
                        </button>
                      ) : null}
                      {item.status === "STALE_SESSION" || item.status === "READY_TO_RETRY" ? (
                        <button
                          type="button"
                          onClick={() => void retryAutoApply(item)}
                          className="mt-2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          Retry Auto Apply
                        </button>
                      ) : null}
                      {item.status === "READY_FOR_USER_REVIEW" || item.status === "WAITING_CONFIRMATION" || item.status === "WAITING_FOR_CONFIRMATION" ? (
                        stoppedUrl ? (
                          <a
                            href={stoppedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                          >
                            {statusCopy.action ?? "Open application"}
                          </a>
                        ) : null
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {answeringItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Answer application questions
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Hirexa needs your input for fields it should not guess.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnsweringItem(null)}
                className="rounded-md px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {(answeringItem.missingQuestions ?? []).map((question) => {
                const label = question.label;
                const value = answerValues[label] ?? question.aiDraft ?? "";
                const isChoice = (question.options?.length ?? 0) > 0;
                return (
                  <div key={question.fieldId || label} className="rounded-xl border border-gray-200 p-3">
                    <label className="text-sm font-semibold text-gray-900">
                      {label}
                    </label>
                    {question.aiDraft ? (
                      <p className="mt-1 text-xs font-medium text-blue-700">
                        AI draft - review before continuing
                      </p>
                    ) : null}
                    {question.sensitive ? (
                      <p className="mt-1 text-xs text-gray-600">
                        This is voluntary/self-identification information. Hirexa will not guess this.
                      </p>
                    ) : null}
                    {isChoice ? (
                      <select
                        value={value}
                        onChange={(event) =>
                          setAnswerValues((prev) => ({
                            ...prev,
                            [label]: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select an answer</option>
                        {question.sensitive ? (
                          <option value="Prefer not to answer">Prefer not to answer</option>
                        ) : null}
                        {question.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={value}
                        onChange={(event) =>
                          setAnswerValues((prev) => ({
                            ...prev,
                            [label]: event.target.value,
                          }))
                        }
                        rows={question.aiDraft ? 5 : 3}
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    )}
                    <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={saveAnswerValues[label] === true}
                        onChange={(event) =>
                          setSaveAnswerValues((prev) => ({
                            ...prev,
                            [label]: event.target.checked,
                          }))
                        }
                      />
                      {question.sensitive
                        ? "Save this voluntary answer to my profile for future applications"
                        : "Save this answer for future applications"}
                    </label>
                  </div>
                );
              })}
            </div>

            {answerSubmitError ? (
              <p className="mt-3 text-sm text-red-600">{answerSubmitError}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnsweringItem(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={answerSubmitLoading}
                onClick={async () => {
                  if (!answeringItem.applySessionId) return;
                  setAnswerSubmitLoading(true);
                  setAnswerSubmitError(null);
                  try {
                    const answers = Object.fromEntries(
                      Object.entries(answerValues).filter(([, value]) => value.trim()),
                    );
                    const saveRes = await fetch(
                      `/api/apply-sessions/${answeringItem.applySessionId}/answers`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          answers,
                          saveToProfile: saveAnswerValues,
                        }),
                      },
                    );
                    const savePayload = (await saveRes.json()) as {
                      ok?: boolean;
                      error?: string;
                    };
                    if (!saveRes.ok || !savePayload.ok) {
                      throw new Error(savePayload.error ?? "Could not save answers.");
                    }

                    await fetch(`/api/applications/${answeringItem.applicationId}/apply`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ answers, background: true }),
                    }).catch(() => null);

                    setAnsweringItem(null);
                    updateAutoApplyPopupState((current, now) => ({
                      ...current,
                      items: {
                        ...current.items,
                        [answeringItem.applicationId]: {
                          ...current.items[answeringItem.applicationId],
                          status: "STARTING",
                          message: "Continuing Auto Apply with your answers...",
                          updatedAt: now,
                        },
                      },
                    }));
                  } catch (error) {
                    setAnswerSubmitError(
                      error instanceof Error ? error.message : "Could not continue Auto Apply.",
                    );
                  } finally {
                    setAnswerSubmitLoading(false);
                  }
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {answerSubmitLoading ? "Saving..." : "Continue Auto Apply"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        id={buttonId}
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
  );
}
