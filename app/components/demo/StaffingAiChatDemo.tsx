"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import DemoQuickControls from "@/app/components/chatbot/DemoQuickControls";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card } from "@/app/components/ui/card";
import { Textarea } from "@/app/components/ui/textarea";
import { getSafeDefaultCompanyChatSettings } from "@/app/lib/ai-chat/defaultCompanyChatSettings";
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

const DEFAULT_SETTINGS = getSafeDefaultCompanyChatSettings();

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

function buildInitialMessages(settings: AiChatCompanySettings): DisplayChatMessage[] {
  const welcomeMessage =
    settings.welcomeMessage?.trim() || DEFAULT_SETTINGS.welcomeMessage || "";

  return [
    {
      id: "welcome",
      role: "assistant" as const,
      content: welcomeMessage,
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

  const accentColor = resolvedSettings.brandPrimaryColor?.trim() || "#0284c7";
  const assistantName =
    resolvedSettings.chatDisplayName?.trim() || DEFAULT_SETTINGS.chatDisplayName;
  const chatTitle =
    resolvedSettings.chatTitle?.trim() ||
    resolvedSettings.chatDisplayName?.trim() ||
    DEFAULT_SETTINGS.chatDisplayName;
  const companyLogoUrl =
    resolvedSettings.companyLogoUrl?.trim() ||
    "/branding/staffing-chat-avatar.png";

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
        const response = await fetch(`/api/chatbots/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok: true;
              chatbot: { aiChatSettings: AiChatCompanySettings };
            }
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload || !payload.ok) {
          throw new Error(
            payload && !payload.ok && payload.error
              ? payload.error
              : "Unable to load company AI chat settings."
          );
        }

        const nextSettings = payload.chatbot.aiChatSettings;

        if (!isMounted) return;
        setResolvedSettings(nextSettings);
        setMessages(buildInitialMessages(nextSettings));
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

  async function submitCompletedLead(
    summary: StaffingLeadSummary,
    transcript: StaffingChatMessage[]
  ) {
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
          `/demo/${encodeURIComponent(resolvedSettings.companySlug)}`,
        score: summary.score,
        tier: summary.tier,
        recommendedAction: summary.recommendedAction,
        chatMessages: transcript,
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
      const assistantChatMessage: DisplayChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: payload.assistantMessage,
      };

      setMessages((current) => [...current, assistantChatMessage]);

      if (payload.isComplete && payload.completionSummary) {
        setCompletionSummary(payload.completionSummary);
        void submitCompletedLead(payload.completionSummary, [
          ...nextMessages,
          {
            role: "assistant",
            content: payload.assistantMessage,
          },
        ]);
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
          className="flex h-[75vh] w-[calc(100vw-1rem)] max-w-[430px] flex-col overflow-hidden rounded-[2rem] border-slate-200 bg-white text-black shadow-[0_30px_90px_-40px_rgba(2,8,23,0.9)]"
        >
          <div
            id="hirexa-staffing-chat-header"
            className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    id="hirexa-staffing-chat-company-icon"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white"
                    style={{ borderColor: accentColor }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={companyLogoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <h3
                      id="hirexa-staffing-chat-assistant-name"
                      className="text-base font-semibold leading-tight text-black"
                    >
                      {chatTitle}
                    </h3>
                  </div>
                </div>
                {settingsWarning ? (
                  <p
                    id="hirexa-staffing-chat-settings-warning"
                    className="mt-2 text-xs leading-5 text-amber-700"
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
                    className="absolute right-0 top-12 z-10 w-56 rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]"
                  >
                    <div className="px-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-black">
                        Demo settings
                      </div>
                      <p className="mt-1 text-xs leading-5 text-black">
                        Quick controls for this company chat demo.
                      </p>
                    </div>

                    <div className="mt-3 space-y-2">
                      <DemoQuickControls
                        companySlug={resolvedSettings.companySlug}
                        onReset={() => resetDemo()}
                        onClose={handleCloseChat}
                      />
                    </div>
                  </div>
                ) : null}

                <button
                  id="hirexa-staffing-chat-settings-toggle"
                  type="button"
                  onClick={() => setIsSettingsOpen((current) => !current)}
                  className="rounded-full border border-slate-200 bg-white p-2 text-black transition hover:bg-slate-50 hover:text-black"
                  aria-label="Open AI chat demo settings"
                  aria-expanded={isSettingsOpen}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </button>

                <button
                  id="hirexa-staffing-chat-close-button"
                  type="button"
                  onClick={handleCloseChat}
                  className="rounded-full border border-slate-200 bg-white p-2 text-black transition hover:bg-slate-50 hover:text-black"
                  aria-label="Close AI chat demo"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

          </div>

          <div id="hirexa-staffing-chat-body" className="min-h-0 flex-1">
            <div
              id="hirexa-staffing-chat-messages"
              className="h-full space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
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
                        ? "border border-slate-200 bg-slate-100 text-black shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]"
                        : "border border-slate-200 bg-white text-black"
                    )}
                    style={
                      message.role === "candidate"
                        ? { borderColor: accentColor }
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
                  <div className="max-w-[88%] rounded-[1.35rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-black">
                    {assistantName} is reviewing the message and checking which
                    screening fields are still missing...
                  </div>
                </div>
              ) : null}

              {error ? (
                <div
                  id="hirexa-staffing-chat-error-message"
                  className="rounded-[1.35rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-black"
                >
                  {error}
                </div>
              ) : null}

              {finalSummary ? (
                <div
                  id="hirexa-staffing-chat-final-summary-section"
                  className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-black"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black">
                        Candidate Lead Summary
                      </p>
                      <h4 className="mt-1 text-lg font-semibold text-black">
                        {formatValue(finalSummary.candidateName)}
                      </h4>
                    </div>
                    <Badge className="border-emerald-200 bg-white text-black">
                      {(leadSubmissionResult?.score ?? finalSummary.score)}/100 •{" "}
                      {leadSubmissionResult?.tier ?? finalSummary.tier}
                    </Badge>
                  </div>

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-black">Company</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.companyName)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Company location</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.companyLocation)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Phone</dt>
                      <dd className="mt-1 text-black">{formatValue(finalSummary.phone)}</dd>
                    </div>
                    <div>
                      <dt className="text-black">Email</dt>
                      <dd className="mt-1 break-all text-black">
                        {formatValue(finalSummary.email)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Preferred contact</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.preferredContactMethod)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Desired work type</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.desiredWorkTypes)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Desired job type</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.desiredJobType)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Shift availability</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.shiftAvailability)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Start availability</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.startAvailability)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Transportation</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.transportationStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Experience</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.experience)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Desired pay</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.desiredPayRange)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-black">Consent</dt>
                      <dd className="mt-1 text-black">
                        {formatValue(finalSummary.consentToContact)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 rounded-[1.25rem] border border-emerald-200 bg-white p-3 text-black">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircleIcon className="h-5 w-5 text-emerald-700" />
                      Recommended recruiter action
                    </div>
                    <p className="mt-2 text-sm leading-6">
                      {leadSubmissionResult?.recommendedAction ??
                        finalSummary.recommendedAction}
                    </p>
                    <p
                      id="hirexa-staffing-chat-disclaimer"
                      className="mt-2 text-xs leading-5 text-black"
                    >
                      {resolvedSettings.completionMessage ||
                        "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions."}
                    </p>
                  </div>

                  {isSubmittingLead ? (
                    <div className="mt-3 text-xs text-black">
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
            className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-5"
          >
            {finalSummary ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => resetDemo()}
                  style={{ borderColor: accentColor }}
                  className="rounded-full border bg-white text-black hover:bg-slate-50 hover:text-black"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Reset Demo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseChat}
                  className="rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
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
                <div className="relative">
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
                    placeholder="Ask the AI assistant..."
                    className="min-h-[104px] resize-none rounded-2xl border-slate-300 bg-white pb-14 text-black placeholder:text-slate-500"
                  />
                  <Button
                    id="hirexa-staffing-chat-send-button"
                    type="submit"
                    disabled={!textInput.trim() || isSendingMessage || isSubmittingLead}
                    style={{ borderColor: accentColor }}
                    className="absolute bottom-3 right-3 h-9 rounded-full border bg-white px-3 text-sm text-black hover:bg-slate-50 hover:text-black"
                  >
                    Send
                    <PaperAirplaneIcon className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] leading-4 text-slate-500">
                  This chat is used only to collect job-related screening
                  information and help organize your responses for recruiter
                  review. The AI does not make hiring decisions, rank candidates,
                  or determine eligibility for employment. A recruiter or hiring
                  team member will review your information before any decision is
                  made.
                </p>
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
