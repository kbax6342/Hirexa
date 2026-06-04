"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Progress } from "@/app/components/ui/progress";
import { Textarea } from "@/app/components/ui/textarea";
import { getDefaultCompanyChatSettings } from "@/app/lib/ai-chat/defaultCompanyChatSettings";
import {
  getCompletedStaffingFieldCount,
  getMissingStaffingFields,
  normalizeRequiredStaffingFields,
  STAFFING_FIELD_LABELS,
} from "@/app/lib/staffing/getMissingStaffingFields";
import { cn } from "@/app/lib/utils";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import type {
  StaffingAiChatRequest,
  StaffingAiChatResponse,
  StaffingChatMessage,
  StaffingLeadApiError,
  StaffingLeadApiSuccess,
  StaffingLeadDraft,
  StaffingLeadSubmissionInput,
  StaffingLeadSummary,
} from "@/app/types/staffing-screening";

type StaffingAiChatDemoProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug?: string;
  companySettings?: AiChatCompanySettings;
  onDraftChange?: (draft: StaffingLeadDraft) => void;
  onSubmitted?: (lead: StaffingLeadDraft, result: StaffingLeadApiSuccess) => void;
  onRestart?: () => void;
};

type DisplayChatMessage = StaffingChatMessage & {
  id: string;
};

const DEFAULT_SETTINGS = getDefaultCompanyChatSettings();

const INITIAL_DRAFT: StaffingLeadDraft = {
  desiredWorkTypes: [],
  shiftAvailability: [],
  experience: [],
};

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatValue(value: boolean | string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return value?.trim() ? value : "—";
}

function resetDraft() {
  return {
    ...INITIAL_DRAFT,
    desiredWorkTypes: [],
    shiftAvailability: [],
    experience: [],
  } satisfies StaffingLeadDraft;
}

function getRequiredFields(settings: AiChatCompanySettings) {
  const requiredFields = normalizeRequiredStaffingFields(
    settings.requiredScreeningFields
  );

  return settings.transportationQuestionEnabled
    ? requiredFields
    : requiredFields.filter((field) => field !== "transportationStatus");
}

function buildInitialMessages(settings: AiChatCompanySettings): DisplayChatMessage[] {
  const welcomeMessage =
    settings.welcomeMessage?.trim() || DEFAULT_SETTINGS.welcomeMessage || "";
  const complianceMessage =
    settings.complianceDisclaimer?.trim() ||
    DEFAULT_SETTINGS.complianceDisclaimer ||
    "";

  return [
    {
      id: "welcome",
      role: "assistant" as const,
      content: welcomeMessage,
    },
    {
      id: "compliance",
      role: "assistant" as const,
      content: complianceMessage,
    },
  ].filter((message) => message.content.trim().length > 0);
}

export default function StaffingAiChatDemo({
  isOpen,
  onOpenChange,
  companySlug,
  companySettings,
  onDraftChange,
  onSubmitted,
  onRestart,
}: StaffingAiChatDemoProps) {
  const [resolvedSettings, setResolvedSettings] =
    useState<AiChatCompanySettings>(companySettings ?? DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<DisplayChatMessage[]>(
    buildInitialMessages(companySettings ?? DEFAULT_SETTINGS)
  );
  const [textInput, setTextInput] = useState("");
  const [draftLead, setDraftLead] = useState<StaffingLeadDraft>(resetDraft());
  const [completionSummary, setCompletionSummary] =
    useState<StaffingLeadSummary | null>(null);
  const [leadSubmissionResult, setLeadSubmissionResult] =
    useState<StaffingLeadApiSuccess | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const requiredFields = useMemo(
    () => getRequiredFields(resolvedSettings),
    [resolvedSettings]
  );
  const missingFields = useMemo(
    () => getMissingStaffingFields(draftLead, requiredFields),
    [draftLead, requiredFields]
  );
  const completedFieldCount = useMemo(
    () => getCompletedStaffingFieldCount(draftLead, requiredFields),
    [draftLead, requiredFields]
  );
  const progressValue = Math.round(
    (completedFieldCount / Math.max(requiredFields.length, 1)) * 100
  );
  const collectedEntries = useMemo(
    () =>
      requiredFields
        .filter((field) => {
          const value = draftLead[field];
          if (Array.isArray(value)) {
            return value.length > 0;
          }

          if (typeof value === "boolean") {
            return true;
          }

          return typeof value === "string" && value.trim().length > 0;
        })
        .map((field) => ({
          label: STAFFING_FIELD_LABELS[field],
          value: formatValue(draftLead[field]),
        })),
    [draftLead, requiredFields]
  );

  const accentColor = resolvedSettings.brandPrimaryColor?.trim() || "#0284c7";
  const assistantName =
    resolvedSettings.chatDisplayName?.trim() || DEFAULT_SETTINGS.chatDisplayName;
  const companyName =
    resolvedSettings.companyName?.trim() || DEFAULT_SETTINGS.companyName;
  const companyLocation =
    resolvedSettings.companyLocation?.trim() || DEFAULT_SETTINGS.companyLocation;

  const chatStatusLabel = leadSubmissionResult
    ? `${leadSubmissionResult.tier} • ${leadSubmissionResult.score}/100`
    : isSubmittingLead
      ? "Finalizing lead"
      : isSendingMessage
        ? `${assistantName} is responding`
        : `Screening progress: ${completedFieldCount} of ${requiredFields.length} fields complete`;

  useEffect(() => {
    onDraftChange?.(draftLead);
  }, [draftLead, onDraftChange]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, error, completionSummary, isSendingMessage, isSubmittingLead]);

  useEffect(() => {
    if (!isOpen) {
      setIsSettingsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;

    async function hydrateSettings() {
      if (companySettings) {
        if (!isMounted) return;
        setResolvedSettings(companySettings);
        setMessages(buildInitialMessages(companySettings));
        setDraftLead(resetDraft());
        setCompletionSummary(null);
        setLeadSubmissionResult(null);
        setError(null);
        setSettingsWarning(null);
        setTextInput("");
        return;
      }

      try {
        const slug = companySlug?.trim() || DEFAULT_SETTINGS.companySlug;
        const response = await fetch(
          `/api/ai-chat/settings/${encodeURIComponent(slug)}`,
          {
            cache: "no-store",
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; settings: AiChatCompanySettings }
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload || !payload.ok) {
          throw new Error(
            payload && !payload.ok && payload.error
              ? payload.error
              : "Unable to load company AI chat settings."
          );
        }

        if (!isMounted) return;
        setResolvedSettings(payload.settings);
        setMessages(buildInitialMessages(payload.settings));
        setDraftLead(resetDraft());
        setCompletionSummary(null);
        setLeadSubmissionResult(null);
        setError(null);
        setTextInput("");
        setSettingsWarning(null);
      } catch (settingsError) {
        if (!isMounted) return;
        setResolvedSettings(DEFAULT_SETTINGS);
        setMessages(buildInitialMessages(DEFAULT_SETTINGS));
        setDraftLead(resetDraft());
        setCompletionSummary(null);
        setLeadSubmissionResult(null);
        setError(null);
        setTextInput("");
        setSettingsWarning(
          settingsError instanceof Error
            ? `${settingsError.message} Using fallback demo settings.`
            : "Using fallback demo settings."
        );
      }
    }

    void hydrateSettings();

    return () => {
      isMounted = false;
    };
  }, [companySettings, companySlug]);

  function applyDraftUpdate(nextDraft: StaffingLeadDraft) {
    setDraftLead(nextDraft);
  }

  function resetDemo(nextSettings?: AiChatCompanySettings) {
    const settingsToUse = nextSettings ?? resolvedSettings;
    setMessages(buildInitialMessages(settingsToUse));
    setTextInput("");
    applyDraftUpdate(resetDraft());
    setCompletionSummary(null);
    setLeadSubmissionResult(null);
    setError(null);
    setIsSendingMessage(false);
    setIsSubmittingLead(false);
    setIsSettingsOpen(false);
    onRestart?.();
  }

  function handleCloseChat() {
    setIsSettingsOpen(false);
    onOpenChange(false);
  }

  async function submitCompletedLead(summary: StaffingLeadSummary) {
    if (leadSubmissionResult || isSubmittingLead) {
      return;
    }

    setIsSubmittingLead(true);
    setError(null);

    try {
      const payloadBody: StaffingLeadSubmissionInput = {
        candidateName: summary.candidateName,
        phone: summary.phone,
        email: summary.email,
        preferredContactMethod: summary.preferredContactMethod,
        desiredWorkTypes: summary.desiredWorkTypes,
        desiredJobType: summary.desiredJobType,
        shiftAvailability: summary.shiftAvailability,
        startAvailability: summary.startAvailability,
        transportationStatus: summary.transportationStatus,
        experience: summary.experience,
        desiredPayRange: summary.desiredPayRange,
        consentToContact: summary.consentToContact,
        companySlug: summary.companySlug ?? resolvedSettings.companySlug,
        companyName: summary.companyName ?? resolvedSettings.companyName,
        companyLocation: summary.companyLocation ?? resolvedSettings.companyLocation,
        companyIndustry: summary.companyIndustry ?? resolvedSettings.companyIndustry,
        recruiterEmail: summary.recruiterEmail ?? resolvedSettings.recruiterEmail,
        sourcePage:
          summary.sourcePage ??
          `/demo/minutemen-ai-chat?companySlug=${encodeURIComponent(
            resolvedSettings.companySlug
          )}`,
        score: summary.score,
        tier: summary.tier,
        recommendedAction: summary.recommendedAction,
      };

      const response = await fetch("/api/demo/screening-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadBody),
      });

      const payload = (await response.json().catch(() => null)) as
        | StaffingLeadApiSuccess
        | StaffingLeadApiError
        | null;

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          payload && "error" in payload
            ? payload.error
            : "Unable to submit the demo lead."
        );
      }

      setLeadSubmissionResult(payload);
      onSubmitted?.(summary, payload);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to submit the demo lead."
      );
    } finally {
      setIsSubmittingLead(false);
    }
  }

  async function handleSendMessage() {
    const trimmedValue = textInput.trim();

    if (!trimmedValue || isSendingMessage || isSubmittingLead || completionSummary) {
      return;
    }

    const candidateMessage: DisplayChatMessage = {
      id: createMessageId(),
      role: "candidate",
      content: trimmedValue,
    };

    const nextMessages = [...messages, candidateMessage];
    setMessages(nextMessages);
    setTextInput("");
    setError(null);
    setIsSendingMessage(true);

    try {
      const requestBody: StaffingAiChatRequest = {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        leadDraft: draftLead,
        companySlug: resolvedSettings.companySlug,
        companySettings: resolvedSettings,
      };

      const response = await fetch("/api/demo/staffing-ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json().catch(() => null)) as
        | StaffingAiChatResponse
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("assistantMessage" in payload)) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Unable to continue the staffing demo chat."
        );
      }

      applyDraftUpdate(payload.leadDraft);

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: payload.assistantMessage,
        },
      ]);

      if (payload.isComplete && payload.completionSummary) {
        setCompletionSummary(payload.completionSummary);
        void submitCompletedLead(payload.completionSummary);
      }
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Unable to continue the staffing demo chat."
      );
    } finally {
      setIsSendingMessage(false);
    }
  }

  const finalSummary = completionSummary;

  return (
    <div
      id="hirexa-staffing-chat-root"
      className="fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-1rem)] justify-end sm:bottom-6 sm:right-6"
    >
      {!isOpen ? (
        <Button
          id="hirexa-staffing-chat-floating-button"
          type="button"
          onClick={() => onOpenChange(true)}
          style={{ backgroundColor: accentColor }}
          className="h-14 rounded-full px-6 text-base font-semibold text-white shadow-[0_24px_70px_-35px_rgba(14,165,233,0.85)] hover:opacity-95"
        >
          <ChatBubbleLeftRightIcon className="h-5 w-5" />
          AI Chat Demo
        </Button>
      ) : (
        <Card
          id="hirexa-staffing-chat-window"
          className="w-[calc(100vw-1rem)] max-w-[430px] overflow-hidden rounded-[2rem] border-slate-800 bg-[#071120] text-white shadow-[0_30px_90px_-40px_rgba(2,8,23,0.9)]"
        >
          <div
            id="hirexa-staffing-chat-header"
            className="border-b border-white/10 bg-[linear-gradient(145deg,rgba(8,23,49,0.98),rgba(2,8,23,0.94))] px-4 py-4 sm:px-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    id="hirexa-staffing-chat-company-icon"
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-sky-100"
                    style={{ backgroundColor: accentColor }}
                  >
                    <SparklesIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p
                      id="hirexa-staffing-chat-assistant-name"
                      className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/80"
                    >
                      {assistantName}
                    </p>
                    <h3
                      id="hirexa-staffing-chat-company-name"
                      className="text-lg font-semibold text-white"
                    >
                      {companyName}
                    </h3>
                  </div>
                </div>
                <p
                  id="hirexa-staffing-chat-company-context"
                  className="mt-3 text-sm leading-6 text-slate-300"
                >
                  Candidate screening demo for {companyLocation || companyName} hiring
                  roles.
                </p>
                {settingsWarning ? (
                  <p
                    id="hirexa-staffing-chat-settings-warning"
                    className="mt-2 text-xs leading-5 text-amber-200"
                  >
                    {settingsWarning}
                  </p>
                ) : null}
              </div>

              <div
                id="hirexa-staffing-chat-header-actions"
                className="relative flex items-center gap-2 self-start"
              >
                {isSettingsOpen ? (
                  <div
                    id="hirexa-staffing-chat-settings-menu"
                    className="absolute right-0 top-12 z-10 w-56 rounded-[1.25rem] border border-white/10 bg-[#081524] p-3 shadow-[0_20px_60px_-30px_rgba(2,8,23,0.95)]"
                  >
                    <div className="px-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                        Demo settings
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        Quick controls for this company chat demo.
                      </p>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Button
                        id="hirexa-staffing-chat-settings-reset-button"
                        type="button"
                        variant="outline"
                        onClick={() => resetDemo()}
                        className="w-full justify-start rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                      >
                        <ArrowPathIcon className="h-4 w-4" />
                        Reset demo
                      </Button>
                      <Button
                        id="hirexa-staffing-chat-settings-close-button"
                        type="button"
                        variant="outline"
                        onClick={handleCloseChat}
                        className="w-full justify-start rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                      >
                        <XMarkIcon className="h-4 w-4" />
                        Close chat
                      </Button>
                    </div>
                  </div>
                ) : null}

                <button
                  id="hirexa-staffing-chat-settings-toggle"
                  type="button"
                  onClick={() => setIsSettingsOpen((current) => !current)}
                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Open AI chat demo settings"
                  aria-expanded={isSettingsOpen}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </button>

                <button
                  id="hirexa-staffing-chat-close-button"
                  type="button"
                  onClick={handleCloseChat}
                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Close AI chat demo"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div
              id="hirexa-staffing-chat-progress-section"
              className="mt-4"
            >
              <Progress value={progressValue} className="h-2 bg-white/10" />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>Screening progress</span>
                <span id="hirexa-staffing-chat-progress-label">{chatStatusLabel}</span>
              </div>
            </div>
          </div>

          <div id="hirexa-staffing-chat-body">
            <div
              id="hirexa-staffing-chat-collected-info-panel"
              className="border-b border-white/10 bg-[#091522] px-4 py-3 sm:px-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                    Candidate info collected
                  </div>
                  <div className="mt-1 text-sm text-slate-300">
                    {completedFieldCount} of {requiredFields.length} screening fields
                    captured
                  </div>
                </div>
                <Button
                  id="hirexa-staffing-chat-reset-button"
                  type="button"
                  variant="outline"
                  onClick={() => resetDemo()}
                  className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Reset Demo
                </Button>
              </div>

              <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-y-auto">
                {collectedEntries.length > 0 ? (
                  collectedEntries.map((entry) => (
                    <div
                      key={entry.label}
                      id={`hirexa-staffing-chat-collected-field-${entry.label
                        .toLowerCase()
                        .replace(/\s+/g, "-")}`}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-100"
                    >
                      <span className="font-semibold text-white">{entry.label}:</span>{" "}
                      {entry.value}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400">
                    Nothing captured yet. The assistant will fill this in as the
                    candidate chats.
                  </div>
                )}
              </div>
            </div>

            <div
              id="hirexa-staffing-chat-missing-fields-panel"
              className="border-b border-white/10 bg-[#091522] px-4 py-3 text-xs text-slate-400 sm:px-5"
            >
              {missingFields.length > 0 ? (
                <>
                  Still needed:{" "}
                  {missingFields
                    .slice(0, 4)
                    .map((field) => STAFFING_FIELD_LABELS[field])
                    .join(", ")}
                  {missingFields.length > 4 ? ", and more" : ""}
                </>
              ) : (
                "All required screening fields have been collected."
              )}
            </div>

            <div
              id="hirexa-staffing-chat-messages"
              className="max-h-[360px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {messages.map((message) => (
                <div
                  id={`hirexa-staffing-chat-message-${message.id}`}
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "candidate" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-[1.35rem] px-4 py-3 text-sm leading-6",
                      message.role === "candidate"
                        ? "text-white shadow-[0_18px_40px_-24px_rgba(14,165,233,0.8)]"
                        : "border border-white/10 bg-white/[0.05] text-slate-100"
                    )}
                    style={
                      message.role === "candidate"
                        ? { backgroundColor: accentColor }
                        : undefined
                    }
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {isSendingMessage ? (
                <div
                  id="hirexa-staffing-chat-loading-message"
                  className="flex justify-start"
                >
                  <div className="max-w-[88%] rounded-[1.35rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm leading-6 text-slate-100">
                    {assistantName} is reviewing the message and checking which
                    screening fields are still missing...
                  </div>
                </div>
              ) : null}

              {error ? (
                <div
                  id="hirexa-staffing-chat-error-message"
                  className="rounded-[1.35rem] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                >
                  {error}
                </div>
              ) : null}

              {finalSummary ? (
                <div
                  id="hirexa-staffing-chat-final-summary-section"
                  className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm text-emerald-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/80">
                        Candidate Lead Summary
                      </p>
                      <h4 className="mt-1 text-lg font-semibold text-white">
                        {formatValue(finalSummary.candidateName)}
                      </h4>
                    </div>
                    <Badge className="border-emerald-300/25 bg-emerald-500/10 text-emerald-50">
                      {(leadSubmissionResult?.score ?? finalSummary.score)}/100 •{" "}
                      {leadSubmissionResult?.tier ?? finalSummary.tier}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-emerald-100/75">Company</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.companyName)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Company location</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.companyLocation)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Phone</dt>
                      <dd className="mt-1 text-white">{formatValue(finalSummary.phone)}</dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Email</dt>
                      <dd className="mt-1 break-all text-white">
                        {formatValue(finalSummary.email)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Preferred contact</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.preferredContactMethod)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Desired work type</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.desiredWorkTypes)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Desired job type</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.desiredJobType)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Shift availability</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.shiftAvailability)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Start availability</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.startAvailability)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Transportation</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.transportationStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Experience</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.experience)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Desired pay</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.desiredPayRange)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-emerald-100/75">Consent</dt>
                      <dd className="mt-1 text-white">
                        {formatValue(finalSummary.consentToContact)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-[#04101f]/55 p-3 text-white">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircleIcon className="h-5 w-5 text-emerald-200" />
                      Recommended recruiter action
                    </div>
                    <p className="mt-2 text-sm leading-6">
                      {leadSubmissionResult?.recommendedAction ??
                        finalSummary.recommendedAction}
                    </p>
                    <p
                      id="hirexa-staffing-chat-disclaimer"
                      className="mt-2 text-xs leading-5 text-emerald-100/80"
                    >
                      {resolvedSettings.completionMessage ||
                        "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions."}
                    </p>
                  </div>

                  {isSubmittingLead ? (
                    <div className="mt-3 text-xs text-emerald-100/80">
                      Submitting the completed lead to the mocked recruiter API...
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div ref={messageEndRef} />
            </div>
          </div>

          <div
            id="hirexa-staffing-chat-input-section"
            className="border-t border-white/10 bg-[#050d19] px-4 py-4 sm:px-5"
          >
            {finalSummary ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => resetDemo()}
                  style={{ backgroundColor: accentColor }}
                  className="rounded-full text-white hover:opacity-95"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Reset Demo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseChat}
                  className="rounded-full border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                >
                  Close Demo
                </Button>
              </div>
            ) : (
              <form
                id="hirexa-staffing-chat-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSendMessage();
                }}
                className="space-y-3"
              >
                <Textarea
                  id="hirexa-staffing-chat-textarea"
                  value={textInput}
                  onChange={(event) => setTextInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder={`Tell ${assistantName} what kind of work you're looking for...`}
                  className="min-h-[84px] rounded-2xl border-white/10 bg-white/[0.04] text-white placeholder:text-slate-400"
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs leading-5 text-slate-400">
                    Use natural language. {assistantName} will collect the required
                    screening fields behind the scenes.
                  </div>
                  <Button
                    id="hirexa-staffing-chat-send-button"
                    type="submit"
                    disabled={!textInput.trim() || isSendingMessage || isSubmittingLead}
                    style={{ backgroundColor: accentColor }}
                    className="rounded-full text-white hover:opacity-95"
                  >
                    Send
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
