"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  quickReplies?: string[];
};

type StaffingAiChatErrorPayload = {
  error?: string;
  details?: Array<{ path?: string; message?: string }>;
  fieldErrors?: Record<string, string[] | undefined>;
  assistantMessage?: string;
  reply?: string;
};

const DEFAULT_SETTINGS = getSafeDefaultCompanyChatSettings();
const OLD_HIREXA_AI_WELCOME_KEY =
  "hi im hirexa ai tell me what kind of role youre looking for and ill help collect the key details";
const HIREXA_AI_WELCOME_MESSAGE =
  "Hi, I’m Hirexa AI. I’ll help collect the key details about the type of role you’re looking for. What’s your name?";
const PRIVACY_NOTICE_MESSAGE_ID = "privacy-notice";
const PRIVACY_POLICY_LABEL = "Privacy Policy";
const CHATBOT_PRIVACY_NOTICE_TEXT =
  "By using this chatbot, you agree that the information you provide may be collected, saved, and reviewed by authorized hiring or staffing agency staff to respond to your inquiry, contact you, and help match you with potential job opportunities. - Privacy Policy";
const QUICK_REPLY_MARKER = "You can choose from:";

const INITIAL_DRAFT: StaffingLeadDraft = {
  desiredWorkTypes: [],
  shiftAvailability: [],
  experience: [],
};

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getQuickReplyMarkerIndex(content: string) {
  return content.toLowerCase().indexOf(QUICK_REPLY_MARKER.toLowerCase());
}

function cleanQuickReplyOption(value: string) {
  return value
    .replace(/^[-*]\s*/, "")
    .replace(/^or\s+/i, "")
    .replace(/[.;]+$/, "")
    .trim();
}

function parseQuickReplyOptions(content: string) {
  const markerIndex = getQuickReplyMarkerIndex(content);
  if (markerIndex < 0) return [];

  const optionsSource = content.slice(markerIndex + QUICK_REPLY_MARKER.length);
  const seenOptions = new Set<string>();
  const options = optionsSource
    .split(/\r?\n|,\s*/g)
    .map(cleanQuickReplyOption)
    .filter(Boolean)
    .filter((option) => {
      const normalizedOption = option.toLowerCase();
      if (seenOptions.has(normalizedOption)) return false;
      seenOptions.add(normalizedOption);
      return true;
    });

  return options.length > 1 ? options : [];
}

function createAssistantDisplayMessage(
  content: string,
  id = createMessageId()
): DisplayChatMessage {
  const quickReplies = parseQuickReplyOptions(content);

  return {
    id,
    role: "assistant",
    content,
    ...(quickReplies.length > 0 ? { quickReplies } : {}),
  };
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

function getStaffingChatErrorMessage(
  payload: StaffingAiChatErrorPayload | null,
  fallback = "Unable to continue the staffing demo chat."
) {
  if (process.env.NODE_ENV === "development" && payload?.error) {
    const detailText = Array.isArray(payload.details)
      ? payload.details
          .map((detail) =>
            [detail.path, detail.message].filter(Boolean).join(": ")
          )
          .filter(Boolean)
          .join("; ")
      : "";

    return detailText ? `${payload.error} ${detailText}` : payload.error;
  }

  return payload?.reply || payload?.assistantMessage || fallback;
}

function isStaffingAiChatResponse(
  payload: StaffingAiChatResponse | StaffingAiChatErrorPayload | null
): payload is StaffingAiChatResponse {
  return Boolean(
    payload &&
      typeof payload.assistantMessage === "string" &&
      "leadDraft" in payload &&
      "missingFields" in payload &&
      "isComplete" in payload
  );
}

function getRequiredFields(settings: AiChatCompanySettings) {
  const requiredFields = normalizeRequiredStaffingFields(
    settings.requiredScreeningFields
  );

  return settings.transportationQuestionEnabled
    ? requiredFields
    : requiredFields.filter((field) => field !== "transportationStatus");
}

function getWelcomeMessageKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildInitialMessages(settings: AiChatCompanySettings): DisplayChatMessage[] {
  const rawWelcomeMessage =
    settings.welcomeMessage?.trim() || DEFAULT_SETTINGS.welcomeMessage || "";
  const welcomeMessage = getWelcomeMessageKey(rawWelcomeMessage) ===
    OLD_HIREXA_AI_WELCOME_KEY
    ? HIREXA_AI_WELCOME_MESSAGE
    : rawWelcomeMessage;

  return [
    createAssistantDisplayMessage(welcomeMessage, "welcome"),
    createAssistantDisplayMessage(
      CHATBOT_PRIVACY_NOTICE_TEXT,
      PRIVACY_NOTICE_MESSAGE_ID
    ),
  ].filter((message) => message.content.trim().length > 0);
}

function toStaffingChatMessages(messages: DisplayChatMessage[]): StaffingChatMessage[] {
  return messages
    .filter((message) => message.id !== PRIVACY_NOTICE_MESSAGE_ID)
    .map(({ role, content }) => ({ role, content }));
}

function getMessageContentWithoutQuickReplies(message: DisplayChatMessage) {
  if (!message.quickReplies?.length) return message.content;

  const optionListStart = getQuickReplyMarkerIndex(message.content);

  return optionListStart >= 0
    ? message.content.slice(0, optionListStart).trim()
    : message.content;
}

function renderChatMessageContent(
  message: DisplayChatMessage,
  content = message.content
) {
  if (
    message.role !== "assistant" ||
    message.content !== CHATBOT_PRIVACY_NOTICE_TEXT
  ) {
    return content;
  }

  const [beforeLabel, afterLabel = ""] =
    CHATBOT_PRIVACY_NOTICE_TEXT.split(PRIVACY_POLICY_LABEL);

  return (
    <>
      {beforeLabel}
      <Link
        href="/privacy-policy"
        className="font-medium text-slate-700 underline underline-offset-2 hover:text-slate-950"
      >
        {PRIVACY_POLICY_LABEL}
      </Link>
      {afterLabel}
    </>
  );
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedQuickReplies, setSelectedQuickReplies] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const selectedQuickRepliesRef = useRef<Record<string, string>>({});

  const clearSelectedQuickReplies = useCallback(() => {
    selectedQuickRepliesRef.current = {};
    setSelectedQuickReplies({});
  }, []);

  const markQuickReplySelected = useCallback((messageId: string, option: string) => {
    selectedQuickRepliesRef.current = {
      ...selectedQuickRepliesRef.current,
      [messageId]: option,
    };
    setSelectedQuickReplies(selectedQuickRepliesRef.current);
  }, []);

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
  const chatTitle =
    resolvedSettings.chatTitle?.trim() ||
    resolvedSettings.chatDisplayName?.trim() ||
    DEFAULT_SETTINGS.chatDisplayName;
  const chatSubtitle =
    resolvedSettings.chatSubtitle?.trim() ||
    resolvedSettings.companyLocation?.trim() ||
    "Candidate screening assistant";
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
        setConversationId(null);
        setError(null);
        setSettingsWarning(null);
        clearSelectedQuickReplies();
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
        setConversationId(null);
        setError(null);
        setTextInput("");
        setSettingsWarning(null);
        clearSelectedQuickReplies();
      } catch (settingsError) {
        if (!isMounted) return;
        setResolvedSettings(DEFAULT_SETTINGS);
        setMessages(buildInitialMessages(DEFAULT_SETTINGS));
        setDraftLead(resetDraft());
        setCompletionSummary(null);
        setLeadSubmissionResult(null);
        setConversationId(null);
        setError(null);
        setTextInput("");
        clearSelectedQuickReplies();
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
  }, [clearSelectedQuickReplies, companySettings, companySlug]);

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
    setConversationId(null);
    setError(null);
    setIsSendingMessage(false);
    setIsSubmittingLead(false);
    setIsSettingsOpen(false);
    clearSelectedQuickReplies();
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
        firstName: summary.firstName,
        lastName: summary.lastName,
        fullName: summary.fullName,
        candidateName: summary.candidateName,
        phone: summary.phone,
        email: summary.email,
        city: summary.city,
        state: summary.state,
        zipCode: summary.zipCode,
        preferredContactMethod: summary.preferredContactMethod,
        desiredWorkTypes: summary.desiredWorkTypes,
        desiredJobType: summary.desiredJobType,
        preferredShift: summary.preferredShift,
        shiftAvailability: summary.shiftAvailability,
        startAvailability: summary.startAvailability,
        transportationStatus: summary.transportationStatus,
        workAuthorization: summary.workAuthorization,
        workAuthorizationStatus: summary.workAuthorizationStatus,
        experience: summary.experience,
        workExperienceSummary: summary.workExperienceSummary,
        resumeUploadOrWorkHistorySummary:
          summary.resumeUploadOrWorkHistorySummary,
        resumeUrl: summary.resumeUrl,
        linkedinUrl: summary.linkedinUrl,
        certifications: summary.certifications,
        desiredPay: summary.desiredPay,
        desiredPayRange: summary.desiredPayRange,
        startDate: summary.startDate,
        previousEmployer: summary.previousEmployer,
        educationLevel: summary.educationLevel,
        languagesSpoken: summary.languagesSpoken,
        veteranStatus: summary.veteranStatus,
        referralSource: summary.referralSource,
        contactConsent: summary.contactConsent ?? summary.consentToContact,
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

  async function sendCandidateMessage(messageText: string) {
    const trimmedValue = messageText.trim();

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
        messages: toStaffingChatMessages(nextMessages),
        conversationId: conversationId ?? undefined,
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
        | StaffingAiChatErrorPayload
        | null;

      if (!response.ok || !isStaffingAiChatResponse(payload)) {
        throw new Error(
          getStaffingChatErrorMessage(payload)
        );
      }

      const assistantReply = payload.reply ?? payload.assistantMessage;
      setConversationId(payload.conversationId ?? conversationId ?? null);
      applyDraftUpdate(payload.leadDraft);
      const assistantChatMessage = createAssistantDisplayMessage(assistantReply);

      setMessages((current) => [...current, assistantChatMessage]);

      if (payload.isComplete && payload.completionSummary) {
        setCompletionSummary(payload.completionSummary);
        void submitCompletedLead(
          payload.completionSummary,
          toStaffingChatMessages([...nextMessages, assistantChatMessage])
        );
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

  async function handleSendMessage() {
    await sendCandidateMessage(textInput);
  }

  function handleQuickReplySelect(messageId: string, option: string) {
    if (selectedQuickRepliesRef.current[messageId]) return;
    markQuickReplySelected(messageId, option);
    void sendCandidateMessage(option);
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
          className="w-[calc(100vw-1rem)] max-w-[430px] overflow-hidden rounded-[2rem] border-slate-200 bg-white text-black shadow-[0_30px_90px_-40px_rgba(2,8,23,0.9)]"
        >
          <div
            id="hirexa-staffing-chat-header"
            className="border-b border-slate-200 bg-white px-4 py-4 sm:px-5"
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
                    <p
                      id="hirexa-staffing-chat-company-name"
                      className="text-xs font-semibold uppercase tracking-[0.2em] text-black"
                    >
                      {companyName}
                    </p>
                    <h3
                      id="hirexa-staffing-chat-assistant-name"
                      className="mt-0.5 text-base font-semibold leading-tight text-black"
                    >
                      {chatTitle}
                    </h3>
                    <p
                      id="hirexa-staffing-chat-subtitle"
                      className="mt-0.5 text-xs leading-5 text-black"
                    >
                      {chatSubtitle}
                    </p>
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

          <div id="hirexa-staffing-chat-body">
            <div
              id="hirexa-staffing-chat-collected-info-panel"
              className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-black">
                    Candidate info collected
                  </div>
                  <div className="mt-1 text-sm text-black">
                    {completedFieldCount} of {requiredFields.length} screening fields
                    captured
                  </div>
                </div>
                <Button
                  id="hirexa-staffing-chat-reset-button"
                  type="button"
                  variant="outline"
                  onClick={() => resetDemo()}
                  className="rounded-full border-slate-200 bg-white text-black hover:bg-slate-50 hover:text-black"
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
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-black"
                    >
                      <span className="font-semibold text-black">{entry.label}:</span>{" "}
                      {entry.value}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-black">
                    Nothing captured yet. The assistant will fill this in as the
                    candidate chats.
                  </div>
                )}
              </div>
            </div>

            <div
              id="hirexa-staffing-chat-missing-fields-panel"
              className="border-b border-slate-200 bg-white px-4 py-3 text-xs text-black sm:px-5"
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
              {messages.map((message, messageIndex) => {
                const quickReplies = message.quickReplies ?? [];
                const selectedQuickReply = selectedQuickReplies[message.id];
                const hasCandidateReplyAfter = messages
                  .slice(messageIndex + 1)
                  .some((nextMessage) => nextMessage.role === "candidate");
                const messageContent = getMessageContentWithoutQuickReplies(message);

                return (
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
                        "flex max-w-[88%] flex-col",
                        message.role === "candidate" ? "items-end" : "items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-[1.35rem] px-4 py-3 text-sm leading-6",
                          message.role === "candidate"
                            ? "border border-slate-200 bg-slate-100 text-black shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]"
                            : "whitespace-pre-line border border-slate-200 bg-white text-black"
                        )}
                        style={
                          message.role === "candidate"
                            ? { borderColor: accentColor }
                            : undefined
                        }
                      >
                        {renderChatMessageContent(message, messageContent)}
                      </div>

                      {message.role === "assistant" && quickReplies.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {quickReplies.map((option) => {
                            const isSelected = selectedQuickReply === option;
                            const isDisabled =
                              Boolean(selectedQuickReply) ||
                              hasCandidateReplyAfter ||
                              isSendingMessage ||
                              isSubmittingLead ||
                              Boolean(completionSummary);

                            return (
                              <button
                                key={option}
                                type="button"
                                aria-pressed={isSelected}
                                disabled={isDisabled}
                                onClick={() =>
                                  handleQuickReplySelect(message.id, option)
                                }
                                className={cn(
                                  "rounded-full border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 transition-all duration-200 hover:bg-blue-50 disabled:cursor-not-allowed",
                                  isSelected
                                    ? "scale-105 bg-blue-600 text-white shadow-md hover:bg-blue-600"
                                    : "bg-white",
                                  isDisabled && !isSelected ? "opacity-70" : ""
                                )}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

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
                        {formatValue(
                          finalSummary.contactConsent ??
                            finalSummary.consentToContact
                        )}
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
            className="hirexa-staffing-chat-input-section border-t border-slate-200 bg-white px-4 py-4 sm:px-5"
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
                    placeholder={`Tell ${assistantName} what kind of work you're looking for...`}
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
              </form>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
