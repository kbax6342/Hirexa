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
    case "SUBMITTED":
      return "Submitted";
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
    status === "FAILED"
  );
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
  return (
    item.stoppedAtUrl ??
    item.latestUrl ??
    item.currentUrl ??
    item.lastUrl ??
    item.targetUrl ??
    item.resolvedDirectUrl ??
    item.originalJobUrl ??
    item.jobUrl ??
    null
  );
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
            const formattedMessage = formatAutoApplyMessage({
              message: payload.session.message ?? payload.session.error ?? null,
              errorCode: payload.session.errorCode ?? null,
            });

            nextItems[item.applicationId] = {
              ...nextItems[item.applicationId],
              applySessionId: isApplySessionTerminalStatus(displayStatus)
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
              const canRenderStoppedPageUi =
                stoppedStatus &&
                Boolean(
                  stoppedUrl ||
                    item.stopClassification ||
                    item.stopReason ||
                    item.lastAction
                );

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
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-gray-600">{item.message}</p>
                    )
                  ) : canRenderStoppedPageUi ? (
                    <div className="mt-2 space-y-1 text-[11px] text-gray-600">
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
                    </div>
                  ) : null}
                </div>
              );
            })}
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
