import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

import {
  getCompanyChatSettingsBySlug,
  getCurrentCompanyChatSettings,
} from "@/app/lib/ai-chat/companyChatSettingsStore";
import { normalizeCompanyChatSettings } from "@/app/lib/ai-chat/validateCompanyChatSettings";
import {
  getMissingStaffingFields,
  normalizeRequiredStaffingFields,
  STAFFING_FIELD_LABELS,
  type StaffingRequiredField,
} from "@/app/lib/staffing/getMissingStaffingFields";
import { mergeStaffingLeadDraft } from "@/app/lib/staffing/mergeStaffingLeadDraft";
import { buildStaffingLeadSummary } from "@/app/lib/staffing/scoreStaffingLead";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import type {
  StaffingAiChatResponse,
  StaffingChatMessage,
  StaffingLeadDraft,
} from "@/app/types/staffing-screening";
import {
  STAFFING_CONTACT_METHOD_OPTIONS,
  STAFFING_EXPERIENCE_OPTIONS,
  STAFFING_POSITION_TYPE_OPTIONS,
  STAFFING_SHIFT_OPTIONS,
  STAFFING_START_AVAILABILITY_OPTIONS,
  STAFFING_TRANSPORTATION_OPTIONS,
  STAFFING_WORK_TYPE_OPTIONS,
  staffingChatMessageSchema,
} from "@/app/types/staffing-screening";
import { aiChatCompanySettingsSchema } from "@/app/types/ai-chat-settings";
import { getCompanyChatbotSettingsBySlug } from "@/lib/chatbot/getCompanyChatbot";

export const runtime = "nodejs";

const STAFFING_CHAT_MODEL =
  process.env.OPENAI_STAFFING_CHAT_MODEL?.trim() || "gpt-4o-mini";
const STAFFING_CHAT_MAX_OUTPUT_TOKENS = 220;
const STAFFING_CHAT_TEMPERATURE = 0.2;

const requestLeadDraftSchema = z
  .object({
    firstName: z.unknown().optional(),
    lastName: z.unknown().optional(),
    fullName: z.unknown().optional(),
    candidateName: z.unknown().optional(),
    phone: z.unknown().optional(),
    email: z.unknown().optional(),
    city: z.unknown().optional(),
    state: z.unknown().optional(),
    zipCode: z.unknown().optional(),
    preferredContactMethod: z.unknown().optional(),
    desiredWorkTypes: z.unknown().optional(),
    desiredJobType: z.unknown().optional(),
    preferredShift: z.unknown().optional(),
    shiftAvailability: z.unknown().optional(),
    startAvailability: z.unknown().optional(),
    transportationStatus: z.unknown().optional(),
    workAuthorization: z.unknown().optional(),
    workAuthorizationStatus: z.unknown().optional(),
    experience: z.unknown().optional(),
    workExperienceSummary: z.unknown().optional(),
    resumeUploadOrWorkHistorySummary: z.unknown().optional(),
    resumeUrl: z.unknown().optional(),
    linkedinUrl: z.unknown().optional(),
    certifications: z.unknown().optional(),
    desiredPay: z.unknown().optional(),
    desiredPayRange: z.unknown().optional(),
    startDate: z.unknown().optional(),
    previousEmployer: z.unknown().optional(),
    educationLevel: z.unknown().optional(),
    languagesSpoken: z.unknown().optional(),
    veteranStatus: z.unknown().optional(),
    referralSource: z.unknown().optional(),
    contactConsent: z.unknown().optional(),
    consentToContact: z.unknown().optional(),
  })
  .passthrough()
  .default({});

const requestSchema = z.object({
  message: z.string().trim().min(1).optional(),
  messages: z.array(staffingChatMessageSchema).optional(),
  conversationId: z.string().trim().min(1).optional(),
  leadDraft: requestLeadDraftSchema,
  companySlug: z.string().trim().optional(),
  companySettings: z.unknown().optional(),
}).passthrough().superRefine((value, context) => {
  const hasMessage = typeof value.message === "string" && value.message.trim().length > 0;
  const hasMessages = Array.isArray(value.messages) && value.messages.length > 0;

  if (!hasMessage && !hasMessages) {
    context.addIssue({
      code: "custom",
      path: ["messages"],
      message: "Provide either a non-empty messages array or a message string.",
    });
  }
});

type ParsedStaffingAiChatRequest = z.infer<typeof requestSchema>;

const aiResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "extractedLeadDraft"],
  properties: {
    assistantMessage: {
      type: "string",
    },
    extractedLeadDraft: {
      type: "object",
      additionalProperties: false,
      required: [
        "firstName",
        "lastName",
        "fullName",
        "candidateName",
        "phone",
        "email",
        "city",
        "state",
        "zipCode",
        "preferredContactMethod",
        "desiredWorkTypes",
        "desiredJobType",
        "shiftAvailability",
        "startAvailability",
        "transportationStatus",
        "workAuthorizationStatus",
        "experience",
        "resumeUploadOrWorkHistorySummary",
        "linkedinUrl",
        "certifications",
        "desiredPayRange",
        "startDate",
        "previousEmployer",
        "educationLevel",
        "languagesSpoken",
        "veteranStatus",
        "referralSource",
        "contactConsent",
        "consentToContact",
      ],
      properties: {
        firstName: { type: ["string", "null"] },
        lastName: { type: ["string", "null"] },
        fullName: { type: ["string", "null"] },
        candidateName: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        state: { type: ["string", "null"] },
        zipCode: { type: ["string", "null"] },
        preferredContactMethod: {
          type: ["string", "null"],
          enum: [...STAFFING_CONTACT_METHOD_OPTIONS, null],
        },
        desiredWorkTypes: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: [...STAFFING_WORK_TYPE_OPTIONS],
          },
        },
        desiredJobType: {
          type: ["string", "null"],
          enum: [...STAFFING_POSITION_TYPE_OPTIONS, null],
        },
        shiftAvailability: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: [...STAFFING_SHIFT_OPTIONS],
          },
        },
        startAvailability: {
          type: ["string", "null"],
          enum: [...STAFFING_START_AVAILABILITY_OPTIONS, null],
        },
        transportationStatus: {
          type: ["string", "null"],
          enum: [...STAFFING_TRANSPORTATION_OPTIONS, null],
        },
        workAuthorizationStatus: { type: ["string", "null"] },
        experience: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: [...STAFFING_EXPERIENCE_OPTIONS],
          },
        },
        resumeUploadOrWorkHistorySummary: { type: ["string", "null"] },
        linkedinUrl: { type: ["string", "null"] },
        certifications: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        desiredPayRange: { type: ["string", "null"] },
        startDate: { type: ["string", "null"] },
        previousEmployer: { type: ["string", "null"] },
        educationLevel: { type: ["string", "null"] },
        languagesSpoken: {
          type: ["array", "null"],
          items: { type: "string" },
        },
        veteranStatus: { type: ["string", "null"] },
        referralSource: { type: ["string", "null"] },
        contactConsent: { type: ["boolean", "null"] },
        consentToContact: { type: ["boolean", "null"] },
      },
    },
  },
} as const;

type AiExtractedLeadDraft = {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  candidateName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  preferredContactMethod: string | null;
  desiredWorkTypes: string[] | null;
  desiredJobType: string | null;
  shiftAvailability: string[] | null;
  startAvailability: string | null;
  transportationStatus: string | null;
  workAuthorizationStatus: string | null;
  experience: string[] | null;
  resumeUploadOrWorkHistorySummary: string | null;
  linkedinUrl: string | null;
  certifications: string[] | null;
  desiredPayRange: string | null;
  startDate: string | null;
  previousEmployer: string | null;
  educationLevel: string | null;
  languagesSpoken: string[] | null;
  veteranStatus: string | null;
  referralSource: string | null;
  contactConsent: boolean | null;
  consentToContact: boolean | null;
};

type AiStructuredResponse = {
  assistantMessage: string;
  extractedLeadDraft: AiExtractedLeadDraft;
};

const STAFFING_JOB_TYPE_PROMPT_OPTIONS = [
  "Full-time",
  "Part-time",
  "Temporary",
  "Seasonal",
] as const;

type StaffingIntakeStep =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "city"
  | "state"
  | "zipCode"
  | "preferredContactMethod"
  | "desiredWorkTypes"
  | "desiredJobType"
  | "shiftAvailability"
  | "startAvailability"
  | "transportationStatus"
  | "workAuthorizationStatus"
  | "experience"
  | "resumeUploadOrWorkHistorySummary"
  | "linkedinUrl"
  | "certifications"
  | "desiredPayRange"
  | "startDate"
  | "previousEmployer"
  | "educationLevel"
  | "languagesSpoken"
  | "veteranStatus"
  | "referralSource"
  | "consentToContact"
  | "complete";

class OpenAiDemoChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiDemoChatError";
  }
}

function createConversationId() {
  return `staffing-demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function redactDebugText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g,
      "[redacted-phone]"
    );
}

function truncateDebugText(value: string, limit = 240) {
  const redacted = redactDebugText(value);
  return redacted.length > limit ? `${redacted.slice(0, limit)}...` : redacted;
}

function estimateTokenCount(value: string) {
  return Math.ceil(value.length / 4);
}

function logStaffingChatDebug(message: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  console.log(message, meta);
}

function sanitizeRequestBodyForLog(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { bodyType: typeof body };
  }

  const input = body as Record<string, unknown>;
  const leadDraft =
    input.leadDraft && typeof input.leadDraft === "object" && !Array.isArray(input.leadDraft)
      ? (input.leadDraft as Record<string, unknown>)
      : null;

  return {
    keys: Object.keys(input),
    message:
      typeof input.message === "string"
        ? truncateDebugText(input.message)
        : undefined,
    messages: Array.isArray(input.messages)
      ? input.messages.map((message) => {
          const chatMessage = message as { role?: unknown; content?: unknown };
          return {
            role: chatMessage.role,
            content:
              typeof chatMessage.content === "string"
                ? truncateDebugText(chatMessage.content)
                : chatMessage.content,
          };
        })
      : undefined,
    conversationId: typeof input.conversationId === "string" ? input.conversationId : undefined,
    companySlug: typeof input.companySlug === "string" ? input.companySlug : undefined,
    hasCompanySettings: Boolean(input.companySettings),
    leadDraftKeys: leadDraft ? Object.keys(leadDraft) : [],
    leadDraft: leadDraft
      ? Object.fromEntries(
          Object.entries(leadDraft).map(([key, value]) => [
            key,
            key === "email" || key === "phone" ? "[redacted]" : value,
          ])
        )
      : undefined,
  };
}

function getRequestPresence(body: unknown) {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const hasMessage =
    typeof input.message === "string" && input.message.trim().length > 0;
  const hasMessages = Array.isArray(input.messages) && input.messages.length > 0;

  return {
    present: {
      message: hasMessage,
      messages: hasMessages,
      leadDraft: Boolean(input.leadDraft),
      conversationId:
        typeof input.conversationId === "string" &&
        input.conversationId.trim().length > 0,
      companySlug:
        typeof input.companySlug === "string" && input.companySlug.trim().length > 0,
      companySettings: Boolean(input.companySettings),
    },
    missing: !hasMessage && !hasMessages ? ["messages or message"] : [],
  };
}

function formatZodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "request",
    message: issue.message,
  }));
}

function normalizeConversationMessages(
  body: ParsedStaffingAiChatRequest
): StaffingChatMessage[] {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages;
  }

  return [
    {
      role: "candidate",
      content: body.message?.trim() ?? "",
    },
  ];
}

function buildChatResponse(args: {
  assistantMessage: string;
  conversationId: string;
  requestMessages: StaffingChatMessage[];
  leadDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
  isComplete: boolean;
  completionSummary?: StaffingAiChatResponse["completionSummary"];
}): StaffingAiChatResponse {
  const assistantMessage = args.assistantMessage.trim();

  return {
    assistantMessage,
    reply: assistantMessage,
    messages: [
      ...args.requestMessages,
      {
        role: "assistant",
        content: assistantMessage,
      },
    ],
    conversationId: args.conversationId,
    leadDraft: args.leadDraft,
    missingFields: args.missingFields,
    isComplete: args.isComplete,
    completionSummary: args.completionSummary,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getResponseText(resp: unknown): string {
  const response = resp as
    | {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      }
    | undefined;

  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function normalizeComparable(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+/#&\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getNameParts(value: string) {
  return value
    .replace(/[^\p{L}' -]+/gu, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function assignNameParts(
  inferred: Record<string, unknown>,
  parts: string[],
  currentDraft: StaffingLeadDraft
) {
  const cleanParts = parts
    .map((part) => part.replace(/[^\p{L}'-]+/gu, ""))
    .filter(Boolean);
  if (cleanParts.length === 0) return;

  const firstName = titleCase(cleanParts[0]);
  const lastName =
    cleanParts.length > 1 ? titleCase(cleanParts.slice(1).join(" ")) : undefined;

  inferred.firstName = firstName;

  if (lastName) {
    inferred.lastName = lastName;
    inferred.fullName = `${firstName} ${lastName}`;
    inferred.candidateName = `${firstName} ${lastName}`;
  } else if (!currentDraft.firstName) {
    inferred.firstName = firstName;
  }
}

function findLatestMessage(
  messages: StaffingChatMessage[],
  role: StaffingChatMessage["role"]
) {
  return [...messages].reverse().find((message) => message.role === role)?.content ?? "";
}

function getWordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function getShortTextAnswer(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.includes("@")) return undefined;
  if (/(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/.test(normalized)) {
    return undefined;
  }

  return getWordCount(normalized) <= 8 ? normalized : undefined;
}

function getHintedFieldsFromAssistantMessage(message: string) {
  const normalized = normalizeComparable(message);
  const hinted = new Set<StaffingRequiredField>();

  if (normalized.includes("name")) hinted.add("candidateName");
  if (normalized.includes("phone")) hinted.add("phone");
  if (normalized.includes("email")) hinted.add("email");
  if (normalized.includes("city")) hinted.add("city");
  if (normalized.includes("state")) hinted.add("state");
  if (normalized.includes("zip")) hinted.add("zipCode");
  if (normalized.includes("contact method") || normalized.includes("text") || normalized.includes("phone call")) {
    hinted.add("preferredContactMethod");
  }
  if (normalized.includes("work") || normalized.includes("role")) hinted.add("desiredWorkTypes");
  if (normalized.includes("temporary") || normalized.includes("direct hire") || normalized.includes("full time") || normalized.includes("part time")) {
    hinted.add("desiredJobType");
  }
  if (normalized.includes("shift")) hinted.add("shiftAvailability");
  if (normalized.includes("start")) hinted.add("startAvailability");
  if (normalized.includes("transportation")) hinted.add("transportationStatus");
  if (normalized.includes("authorization") || normalized.includes("authorized")) {
    hinted.add("workAuthorizationStatus");
  }
  if (normalized.includes("experience")) hinted.add("experience");
  if (normalized.includes("resume") || normalized.includes("work history")) {
    hinted.add("resumeUploadOrWorkHistorySummary");
  }
  if (normalized.includes("linkedin")) hinted.add("linkedinUrl");
  if (normalized.includes("certification") || normalized.includes("certifications")) {
    hinted.add("certifications");
  }
  if (normalized.includes("pay")) hinted.add("desiredPayRange");
  if (normalized.includes("start date")) hinted.add("startDate");
  if (normalized.includes("previous employer") || normalized.includes("last employer")) {
    hinted.add("previousEmployer");
  }
  if (normalized.includes("education")) hinted.add("educationLevel");
  if (normalized.includes("languages")) hinted.add("languagesSpoken");
  if (normalized.includes("veteran")) hinted.add("veteranStatus");
  if (normalized.includes("referral") || normalized.includes("hear about")) {
    hinted.add("referralSource");
  }
  if (normalized.includes("consent") || normalized.includes("contacted")) {
    hinted.add("consentToContact");
  }

  return [...hinted];
}

function inferLeadDraftHeuristically(args: {
  messages: StaffingChatMessage[];
  currentDraft: StaffingLeadDraft;
}) {
  const latestCandidateMessage = findLatestMessage(args.messages, "candidate");
  const latestAssistantMessage = findLatestMessage(args.messages, "assistant");
  const normalized = normalizeComparable(latestCandidateMessage);
  const hintedFields = getHintedFieldsFromAssistantMessage(latestAssistantMessage);
  const isShortResponse = getWordCount(latestCandidateMessage) <= 5;
  const inferred: Record<string, unknown> = {};
  const shortTextAnswer = getShortTextAnswer(latestCandidateMessage);

  const emailMatch = latestCandidateMessage.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  if (emailMatch) {
    inferred.email = emailMatch[0];
  }

  const phoneMatch = latestCandidateMessage.match(
    /(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/
  );
  if (phoneMatch) {
    inferred.phone = phoneMatch[0];
  }

  const zipMatch = latestCandidateMessage.match(/\b\d{5}\b/);
  if (zipMatch) {
    inferred.zipCode = zipMatch[0];
  } else if (hintedFields.includes("zipCode") && shortTextAnswer) {
    inferred.zipCode = shortTextAnswer;
  }

  if (hintedFields.includes("city") && shortTextAnswer) {
    inferred.city = shortTextAnswer;
  }

  if (hintedFields.includes("state") && shortTextAnswer) {
    inferred.state = shortTextAnswer;
  }

  if (hintedFields.includes("workAuthorizationStatus") && shortTextAnswer) {
    inferred.workAuthorizationStatus = shortTextAnswer;
    inferred.workAuthorization = shortTextAnswer;
  }

  if (
    hintedFields.includes("resumeUploadOrWorkHistorySummary") &&
    shortTextAnswer
  ) {
    inferred.resumeUploadOrWorkHistorySummary = latestCandidateMessage.trim();
  }

  if (hintedFields.includes("linkedinUrl") && shortTextAnswer) {
    inferred.linkedinUrl = shortTextAnswer;
  }

  if (hintedFields.includes("certifications") && shortTextAnswer) {
    inferred.certifications = latestCandidateMessage;
  }

  if (hintedFields.includes("startDate") && shortTextAnswer) {
    inferred.startDate = shortTextAnswer;
  }

  if (hintedFields.includes("previousEmployer") && shortTextAnswer) {
    inferred.previousEmployer = shortTextAnswer;
  }

  if (hintedFields.includes("educationLevel") && shortTextAnswer) {
    inferred.educationLevel = shortTextAnswer;
  }

  if (hintedFields.includes("languagesSpoken") && shortTextAnswer) {
    inferred.languagesSpoken = latestCandidateMessage;
  }

  if (hintedFields.includes("veteranStatus") && shortTextAnswer) {
    inferred.veteranStatus = shortTextAnswer;
  }

  if (hintedFields.includes("referralSource") && shortTextAnswer) {
    inferred.referralSource = shortTextAnswer;
  }

  const payMatch = latestCandidateMessage.match(
    /(\$?\d{2,3}(?:\.\d{1,2})?\s*(?:-|to)\s*\$?\d{2,3}(?:\.\d{1,2})?\s*(?:\/?\s*(?:hr|hour))?|\$?\d{2,3}(?:\.\d{1,2})?\s*(?:\/?\s*(?:hr|hour)|an hour))/i
  );
  if (
    payMatch &&
    (hintedFields.includes("desiredPayRange") ||
      /(?:\$|\b(?:hr|hour|pay|wage|rate)\b)/i.test(
        `${payMatch[0]} ${latestCandidateMessage}`
      ))
  ) {
    inferred.desiredPayRange = payMatch[0];
  }

  const lastNameMatch = latestCandidateMessage.match(
    /(?:my last name is|last name is|surname is)\s+([a-z]+(?:\s+[a-z]+){0,2})/i
  );
  const nameMatch = latestCandidateMessage.match(
    /(?:my name is|this is|it(?:')?s)\s+([a-z]+(?:\s+[a-z]+){0,2})/i
  );
  if (lastNameMatch && args.currentDraft.firstName && !args.currentDraft.lastName) {
    const lastNameParts = getNameParts(lastNameMatch[1]);
    if (lastNameParts.length > 0) {
      const lastName = titleCase(lastNameParts.join(" "));
      inferred.lastName = lastName;
      inferred.fullName = `${args.currentDraft.firstName} ${lastName}`;
      inferred.candidateName = `${args.currentDraft.firstName} ${lastName}`;
    }
  } else if (nameMatch) {
    assignNameParts(inferred, getNameParts(nameMatch[1]), args.currentDraft);
  } else if (
    hintedFields.includes("candidateName") &&
    !/\d/.test(latestCandidateMessage) &&
    !latestCandidateMessage.includes("@") &&
    latestCandidateMessage.split(/\s+/).filter(Boolean).length <= 4
  ) {
    const latestAssistantNormalized = normalizeComparable(latestAssistantMessage);
    const nameParts = getNameParts(latestCandidateMessage);

    if (
      args.currentDraft.firstName &&
      !args.currentDraft.lastName &&
      latestAssistantNormalized.includes("last name") &&
      nameParts.length > 0
    ) {
      const lastName = titleCase(nameParts.join(" "));
      inferred.lastName = lastName;
      inferred.fullName = `${args.currentDraft.firstName} ${lastName}`;
      inferred.candidateName = `${args.currentDraft.firstName} ${lastName}`;
    } else {
      assignNameParts(inferred, nameParts, args.currentDraft);
    }
  }

  if (/\btemp[\s-]*to[\s-]*hire\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Temp-to-Hire";
  } else if (/\bdirect[\s-]*hire\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Direct Hire";
  } else if (/\bfull[\s-]*time\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Full-Time";
  } else if (/\bpart[\s-]*time\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Part-Time";
  } else if (/\btemporary\b|\btemp\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Temporary";
  } else if (/\bseasonal\b|\bseason\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Seasonal";
  } else if (/\bopen to anything\b|\banything\b/i.test(latestCandidateMessage)) {
    inferred.desiredJobType = "Open to Anything";
  }

  if (/\bwarehouse\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Warehouse"];
  }
  if (/\bmanufacturing\b|\bfactory\b|\bproduction\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Manufacturing"];
  }
  if (/\bforklift\b|\bhi[- ]?lo\b|\bfork truck\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Forklift"];
  }
  if (/\bgeneral labor\b|\bgeneral labour\b|\blabor\b|\blabour\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "General Labor"];
  }
  if (/\bassembly\b|\bassembler\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Assembly"];
  }
  if (/\bpacking\b|\bshipping\b|\bpackaging\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Packing / Shipping"];
  }
  if (/\boffice\b|\badministrative\b|\badmin\b|\bclerical\b|\breception\b/i.test(latestCandidateMessage)) {
    inferred.desiredWorkTypes = [...(Array.isArray(inferred.desiredWorkTypes) ? inferred.desiredWorkTypes : []), "Office / Administrative"];
  }

  if (/\b1st shift\b|\bfirst shift\b|\bday shift\b|\bdays\b|\bmornings\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "1st Shift"];
  }
  if (/\b2nd shift\b|\bsecond shift\b|\bafternoon\b|\bevening\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "2nd Shift"];
  }
  if (/\b3rd shift\b|\bthird shift\b|\bnight\b|\bovernight\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "3rd Shift"];
  }
  if (/\bweekend\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "Weekends"];
  }
  if (/\bovertime\b|\bot\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "Overtime"];
  }
  if (/\bflexible\b|\bany shift\b|\bopen schedule\b/i.test(latestCandidateMessage)) {
    inferred.shiftAvailability = [...(Array.isArray(inferred.shiftAvailability) ? inferred.shiftAvailability : []), "Flexible"];
  }

  if (/\btoday\b|\basap\b|\bimmediately\b|\bright away\b/i.test(latestCandidateMessage)) {
    inferred.startAvailability = "Today";
  } else if (/\bthis week\b|\bnext few days\b|\bsoon\b/i.test(latestCandidateMessage)) {
    inferred.startAvailability = "This Week";
  } else if (/\bwithin 2 weeks\b|\bwithin two weeks\b|\b2 weeks\b|\btwo weeks\b/i.test(latestCandidateMessage)) {
    inferred.startAvailability = "Within 2 Weeks";
  } else if (/\blater\b|\bnext month\b|\bnot right away\b/i.test(latestCandidateMessage)) {
    inferred.startAvailability = "Later";
  }

  if (
    /\breliable transportation\b|\bown car\b|\bhave a car\b|\bvehicle\b|\blicensed\b/i.test(
      normalized
    ) ||
    (hintedFields.includes("transportationStatus") &&
      isShortResponse &&
      /^(yes|yep|yeah|sure)$/i.test(normalized))
  ) {
    inferred.transportationStatus = "Yes";
  }
  if (/\bdepends on location\b|\bdepending on location\b|\bdepends\b|\bbus line\b/i.test(normalized)) {
    inferred.transportationStatus = "Depends on location";
  }
  if (
    hintedFields.includes("transportationStatus") &&
    (/\bno transportation\b|\bno ride\b|\bdo not have transportation\b|\bdon t have transportation\b/i.test(
      normalized
    ) ||
      (isShortResponse && /^(no|nope)$/i.test(normalized)))
  ) {
    inferred.transportationStatus = "No";
  }

  if (/\bforklift\b|\bhi[- ]?lo\b|\bfork truck\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Forklift"];
  }
  if (/\bassembly line\b|\bassembly\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Assembly Line"];
  }
  if (/\bpicking\b|\bpacking\b|\bpick and pack\b|\bpick pack\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Picking / Packing"];
  }
  if (/\bshipping\b|\breceiving\b|\bshipping and receiving\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Shipping / Receiving"];
  }
  if (/\bmachine operator\b|\bmachine operation\b|\boperating machines\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Machine Operation"];
  }
  if (/\bquality\b|\binspection\b|\bqa\b|\bqc\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "Quality Inspection"];
  }
  if (/\bgeneral labor\b|\bgeneral labour\b|\blabor\b|\blabour\b/i.test(latestCandidateMessage)) {
    inferred.experience = [...(Array.isArray(inferred.experience) ? inferred.experience : []), "General Labor"];
  }
  if (/\bnone yet\b|\bno experience\b|\bnone\b/i.test(latestCandidateMessage)) {
    inferred.experience = ["None Yet"];
  }

  if (
    /\bprefer(?:s)? text\b|\btext is best\b|\btext me\b|\bsms\b/i.test(normalized) ||
    (hintedFields.includes("preferredContactMethod") &&
      isShortResponse &&
      /\btext\b|\bsms\b/i.test(normalized))
  ) {
    inferred.preferredContactMethod = "Text";
  } else if (
    /\bprefer(?:s)? phone call\b|\bprefer(?:s)? a call\b|\bcall me\b|\bphone call\b/i.test(
      normalized
    ) ||
    (hintedFields.includes("preferredContactMethod") &&
      isShortResponse &&
      /\bcall\b|\bphone\b/i.test(normalized))
  ) {
    inferred.preferredContactMethod = "Phone Call";
  } else if (
    /\bprefer(?:s)? email\b|\bemail works best\b|\bemail me\b/i.test(normalized) ||
    (hintedFields.includes("preferredContactMethod") &&
      isShortResponse &&
      /\bemail\b/i.test(normalized))
  ) {
    inferred.preferredContactMethod = "Email";
  } else if (
    hintedFields.includes("preferredContactMethod") &&
    /\bany\b|\beither\b|\bno preference\b/i.test(normalized)
  ) {
    inferred.preferredContactMethod = "Any";
  }

  if (
    /\byes,? i agree\b|\bi agree\b|\byes you can\b|\bcontact me\b|\bok to contact\b|\bokay to contact\b/i.test(
      normalized
    )
    ||
    (hintedFields.includes("consentToContact") &&
      isShortResponse &&
      /^(yes|yep|yeah|sure)$/i.test(normalized))
  ) {
    inferred.contactConsent = true;
    inferred.consentToContact = true;
  } else if (
    hintedFields.includes("consentToContact") &&
    (/\bdo not agree\b|\bdon t agree\b|\bdo not contact\b|\bdon t contact\b/i.test(
      normalized
    ) ||
      (isShortResponse && /^(no|nope)$/i.test(normalized)))
  ) {
    inferred.contactConsent = false;
    inferred.consentToContact = false;
  }

  return mergeStaffingLeadDraft(args.currentDraft, inferred);
}

function getEffectiveRequiredFields(settings: AiChatCompanySettings) {
  let requiredFields = normalizeRequiredStaffingFields([
    ...(settings.requiredScreeningFields ?? []),
    ...(settings.optionalScreeningFields ?? []),
  ]);

  if (
    settings.requireConsentToContact &&
    !requiredFields.includes("consentToContact")
  ) {
    requiredFields = [...requiredFields, "consentToContact"];
  } else if (!settings.requireConsentToContact) {
    requiredFields = requiredFields.filter(
      (field) => field !== "consentToContact"
    );
  }

  return settings.transportationQuestionEnabled
    ? requiredFields
    : requiredFields.filter((field) => field !== "transportationStatus");
}

async function resolveCompanySettings(body: ParsedStaffingAiChatRequest) {
  if (body.companySettings) {
    const parsedSettings = aiChatCompanySettingsSchema.safeParse(body.companySettings);

    if (parsedSettings.success) {
      return normalizeCompanyChatSettings(parsedSettings.data);
    }

    console.warn("[demo/staffing-ai-chat] ignoring invalid companySettings", {
      details: formatZodIssues(parsedSettings.error),
    });
  }

  if (body.companySlug) {
    const companyChatbot = await getCompanyChatbotSettingsBySlug(body.companySlug);
    if (companyChatbot) {
      return normalizeCompanyChatSettings(companyChatbot.aiChatSettings);
    }

    return getCompanyChatSettingsBySlug(body.companySlug);
  }

  return getCurrentCompanyChatSettings();
}

function buildCompletionMessage(
  settings: AiChatCompanySettings,
  leadDraft: StaffingLeadDraft,
  summaryScore: number,
  tier: string
) {
  const firstName = leadDraft.firstName?.trim();
  const completionMessage =
    settings.completionMessage?.trim() ||
    (firstName
      ? `Thanks, ${firstName} — Hirexa can use this information to guide the next step in your job search. Your screening summary is ready.`
      : "Thanks — Hirexa can use this information to guide the next step in your job search. Your screening summary is ready.");

  return `${completionMessage} Lead score: ${summaryScore}/100 (${tier}).`;
}

function joinFieldLabels(fields: StaffingRequiredField[]) {
  return fields.map((field) => STAFFING_FIELD_LABELS[field].toLowerCase());
}

function formatOptionsAsLines(options: readonly string[]) {
  return options.join("\n");
}

function getCandidateDisplayName(leadDraft: StaffingLeadDraft) {
  const explicitName =
    leadDraft.fullName?.trim() || leadDraft.candidateName?.trim();
  if (explicitName) return explicitName;

  return [leadDraft.firstName?.trim(), leadDraft.lastName?.trim()]
    .filter(Boolean)
    .join(" ");
}

function getStaffingIntakeStep(
  leadDraft: StaffingLeadDraft,
  missingFields: StaffingRequiredField[]
): StaffingIntakeStep {
  const firstName = leadDraft.firstName?.trim();
  const lastName = leadDraft.lastName?.trim();

  if (!firstName) return "firstName";
  if (!lastName) return "lastName";

  const orderedFields: Array<{
    field: StaffingRequiredField;
    step: StaffingIntakeStep;
  }> = [
    { field: "email", step: "email" },
    { field: "phone", step: "phone" },
    { field: "consentToContact", step: "consentToContact" },
    { field: "city", step: "city" },
    { field: "state", step: "state" },
    { field: "zipCode", step: "zipCode" },
    { field: "desiredWorkTypes", step: "desiredWorkTypes" },
    { field: "desiredJobType", step: "desiredJobType" },
    { field: "shiftAvailability", step: "shiftAvailability" },
    { field: "startAvailability", step: "startAvailability" },
    { field: "desiredPayRange", step: "desiredPayRange" },
    { field: "experience", step: "experience" },
    { field: "transportationStatus", step: "transportationStatus" },
    { field: "workAuthorizationStatus", step: "workAuthorizationStatus" },
    {
      field: "resumeUploadOrWorkHistorySummary",
      step: "resumeUploadOrWorkHistorySummary",
    },
    { field: "linkedinUrl", step: "linkedinUrl" },
    { field: "certifications", step: "certifications" },
    { field: "startDate", step: "startDate" },
    { field: "previousEmployer", step: "previousEmployer" },
    { field: "educationLevel", step: "educationLevel" },
    { field: "languagesSpoken", step: "languagesSpoken" },
    { field: "veteranStatus", step: "veteranStatus" },
    { field: "referralSource", step: "referralSource" },
    { field: "preferredContactMethod", step: "preferredContactMethod" },
  ];

  return (
    orderedFields.find(({ field }) => missingFields.includes(field))?.step ??
    "complete"
  );
}

function buildFirstNamePrompt(latestCandidateMessage: string) {
  const normalized = normalizeComparable(latestCandidateMessage);
  const lookingForWork =
    normalized.includes("looking for work") ||
    normalized.includes("looking for a job") ||
    normalized.includes("looking for job") ||
    normalized.includes("need work") ||
    normalized.includes("need a job") ||
    normalized.includes("find work") ||
    normalized.includes("find a job");

  return lookingForWork
    ? "Great to hear you're looking for work! Can I get your first name please?"
    : "Can I get your first name please?";
}

function buildLastNamePrompt(leadDraft: StaffingLeadDraft) {
  const firstName = leadDraft.firstName?.trim();
  return firstName
    ? `Thanks, ${firstName}! What's your last name?`
    : "Thanks! What's your last name?";
}

function buildEmailPrompt(leadDraft: StaffingLeadDraft) {
  if (leadDraft.email && !hasValidEmail(leadDraft.email)) {
    return "Please share a valid email address.";
  }

  const displayName = getCandidateDisplayName(leadDraft);
  return displayName
    ? `Awesome, ${displayName}! Now, could you share your email address?`
    : "Awesome! Now, could you share your email address?";
}

function buildPhonePrompt(leadDraft: StaffingLeadDraft) {
  if (leadDraft.phone && !hasValidPhone(leadDraft.phone)) {
    return "Please share a valid phone number for recruiter follow-up.";
  }

  return "Thanks. What's the best phone number for recruiter follow-up?";
}

function hasValidEmail(value: string | undefined) {
  return Boolean(value?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function hasValidPhone(value: string | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function hasValidZipCode(value: string | undefined) {
  return Boolean(value?.trim() && /^\d{5}$/.test(value.trim()));
}

function buildCityPrompt() {
  return "What city are you located in?";
}

function buildStatePrompt() {
  return "What state are you located in?";
}

function buildZipCodePrompt(leadDraft: StaffingLeadDraft) {
  return leadDraft.zipCode && !hasValidZipCode(leadDraft.zipCode)
    ? "Please enter a standard 5-digit ZIP code."
    : "What's your ZIP code?";
}

function buildShiftAvailabilityPrompt() {
  return `What shifts are you available to work?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_SHIFT_OPTIONS
  )}`;
}

function buildStartAvailabilityPrompt() {
  return `How soon could you start?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_START_AVAILABILITY_OPTIONS
  )}`;
}

function buildTransportationPrompt(settings: AiChatCompanySettings) {
  const locationText = settings.companyLocation?.trim()
    ? ` around ${settings.companyLocation}`
    : "";

  return `Do you have reliable transportation${locationText}?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_TRANSPORTATION_OPTIONS
  )}`;
}

function buildExperiencePrompt() {
  return `What relevant experience do you have?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_EXPERIENCE_OPTIONS
  )}`;
}

function buildWorkAuthorizationPrompt() {
  return "What is your work authorization status?";
}

function buildResumeOrWorkHistoryPrompt() {
  return "Could you share a resume link or briefly summarize your recent work history?";
}

function buildLinkedInPrompt() {
  return "Do you have a LinkedIn URL you'd like to share?";
}

function buildCertificationsPrompt() {
  return "What certifications do you have?";
}

function buildPayPrompt(settings: AiChatCompanySettings) {
  return settings.payRange
    ? `What pay range are you looking for? The current hiring range is ${settings.payRange}.`
    : "What pay range are you looking for?";
}

function buildStartDatePrompt() {
  return "What start date works best for you?";
}

function buildPreviousEmployerPrompt() {
  return "Who was your previous employer?";
}

function buildEducationLevelPrompt() {
  return "What's your highest education level?";
}

function buildLanguagesSpokenPrompt() {
  return "What languages do you speak?";
}

function buildVeteranStatusPrompt() {
  return "Would you like to share your veteran status?";
}

function buildReferralSourcePrompt() {
  return "How did you hear about this opportunity?";
}

function buildPreferredContactMethodPrompt() {
  return `What's the best way for a recruiter to contact you?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_CONTACT_METHOD_OPTIONS
  )}`;
}

function buildConsentPrompt() {
  return `Do you consent to be contacted about job opportunities by phone, text, or email?\n\nYou can choose from:\n\n${formatOptionsAsLines(
    ["Yes", "No"]
  )}`;
}

function formatDeterministicIntakeMessage(args: {
  assistantMessage: string;
  leadDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
  latestCandidateMessage: string;
  settings: AiChatCompanySettings;
}) {
  const selectedStep = getStaffingIntakeStep(args.leadDraft, args.missingFields);

  if (selectedStep === "firstName") {
    return {
      assistantMessage: buildFirstNamePrompt(args.latestCandidateMessage),
      selectedStep,
    };
  }

  if (selectedStep === "lastName") {
    return {
      assistantMessage: buildLastNamePrompt(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "email") {
    return {
      assistantMessage: buildEmailPrompt(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "phone") {
    return {
      assistantMessage: buildPhonePrompt(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "city") {
    return {
      assistantMessage: buildCityPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "state") {
    return {
      assistantMessage: buildStatePrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "zipCode") {
    return {
      assistantMessage: buildZipCodePrompt(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "desiredWorkTypes") {
    return {
      assistantMessage: buildDesiredWorkTypesChoiceMessage(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "desiredJobType") {
    return {
      assistantMessage: buildDesiredJobTypeChoiceMessage(args.leadDraft),
      selectedStep,
    };
  }

  if (selectedStep === "shiftAvailability") {
    return {
      assistantMessage: buildShiftAvailabilityPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "startAvailability") {
    return {
      assistantMessage: buildStartAvailabilityPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "desiredPayRange") {
    return {
      assistantMessage: buildPayPrompt(args.settings),
      selectedStep,
    };
  }

  if (selectedStep === "experience") {
    return {
      assistantMessage: buildExperiencePrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "workAuthorizationStatus") {
    return {
      assistantMessage: buildWorkAuthorizationPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "resumeUploadOrWorkHistorySummary") {
    return {
      assistantMessage: buildResumeOrWorkHistoryPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "linkedinUrl") {
    return {
      assistantMessage: buildLinkedInPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "certifications") {
    return {
      assistantMessage: buildCertificationsPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "transportationStatus") {
    return {
      assistantMessage: buildTransportationPrompt(args.settings),
      selectedStep,
    };
  }

  if (selectedStep === "startDate") {
    return {
      assistantMessage: buildStartDatePrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "previousEmployer") {
    return {
      assistantMessage: buildPreviousEmployerPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "educationLevel") {
    return {
      assistantMessage: buildEducationLevelPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "languagesSpoken") {
    return {
      assistantMessage: buildLanguagesSpokenPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "veteranStatus") {
    return {
      assistantMessage: buildVeteranStatusPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "referralSource") {
    return {
      assistantMessage: buildReferralSourcePrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "preferredContactMethod") {
    return {
      assistantMessage: buildPreferredContactMethodPrompt(),
      selectedStep,
    };
  }

  if (selectedStep === "consentToContact") {
    return {
      assistantMessage: buildConsentPrompt(),
      selectedStep,
    };
  }

  return {
    assistantMessage: args.assistantMessage,
    selectedStep,
  };
}

function logNameIntakeDebug(args: {
  conversationId: string;
  currentStep: StaffingIntakeStep;
  selectedStep: StaffingIntakeStep;
  leadDraft: StaffingLeadDraft;
}) {
  if (process.env.NODE_ENV === "production") return;

  logStaffingChatDebug("[demo/staffing-ai-chat] intake step", {
    conversationId: args.conversationId,
    currentStep: args.currentStep,
    detectedFirstName: args.leadDraft.firstName ?? null,
    detectedLastName: args.leadDraft.lastName ?? null,
    nextStep: args.selectedStep,
  });
}

function isGenericIntakeStartMessage(value: string) {
  const normalized = normalizeComparable(value);
  return (
    /^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(
      normalized
    ) ||
    normalized.includes("looking for work") ||
    normalized.includes("looking for a job") ||
    normalized.includes("need work") ||
    normalized.includes("need a job") ||
    normalized.includes("find work") ||
    normalized.includes("find a job")
  );
}

function hasDraftValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length > 0;
  return value != null;
}

function normalizeDraftValueForProgress(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (typeof value === "string") return value.trim().toLowerCase();
  return JSON.stringify(value ?? null);
}

function hasUsefulDraftProgress(
  previousDraft: StaffingLeadDraft,
  nextDraft: StaffingLeadDraft
) {
  const progressFields: Array<keyof StaffingLeadDraft> = [
    "firstName",
    "lastName",
    "fullName",
    "candidateName",
    "email",
    "phone",
    "city",
    "state",
    "zipCode",
    "preferredContactMethod",
    "desiredWorkTypes",
    "desiredJobType",
    "shiftAvailability",
    "startAvailability",
    "transportationStatus",
    "workAuthorizationStatus",
    "workAuthorization",
    "experience",
    "resumeUploadOrWorkHistorySummary",
    "linkedinUrl",
    "certifications",
    "desiredPayRange",
    "desiredPay",
    "startDate",
    "previousEmployer",
    "educationLevel",
    "languagesSpoken",
    "veteranStatus",
    "referralSource",
    "contactConsent",
    "consentToContact",
  ];

  return progressFields.some((field) => {
    const previousValue = previousDraft[field];
    const nextValue = nextDraft[field];

    return (
      hasDraftValue(nextValue) &&
      normalizeDraftValueForProgress(previousValue) !==
        normalizeDraftValueForProgress(nextValue)
    );
  });
}

function shouldUseAiExtraction(args: {
  currentStep: StaffingIntakeStep;
  latestCandidateMessage: string;
  currentDraft: StaffingLeadDraft;
  heuristicDraft: StaffingLeadDraft;
  missingBeforeHeuristics: StaffingRequiredField[];
  missingAfterHeuristics: StaffingRequiredField[];
}) {
  if (args.currentStep === "complete") return false;

  const madeProgress =
    hasUsefulDraftProgress(args.currentDraft, args.heuristicDraft) ||
    args.missingAfterHeuristics.length < args.missingBeforeHeuristics.length;
  if (madeProgress) return false;

  const normalized = normalizeComparable(args.latestCandidateMessage);
  if (!normalized) return false;

  if (
    args.currentStep === "firstName" &&
    isGenericIntakeStartMessage(args.latestCandidateMessage)
  ) {
    return false;
  }

  if (args.currentStep === "email" || args.currentStep === "phone") {
    return false;
  }

  return true;
}

function hasCandidateContactDetails(leadDraft: StaffingLeadDraft) {
  return Boolean(
    leadDraft.candidateName?.trim() &&
      leadDraft.phone?.trim() &&
      leadDraft.email?.trim()
  );
}

function buildDesiredWorkTypesChoiceMessage(leadDraft: StaffingLeadDraft) {
  const candidateName = leadDraft.candidateName?.trim();
  const intro = candidateName
    ? `Thanks for sharing your contact details, ${candidateName}! Next, could you let me know your desired work types?`
    : "Thanks for sharing your contact details! Next, could you let me know your desired work types?";

  return `${intro}\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_WORK_TYPE_OPTIONS
  )}`;
}

function buildDesiredJobTypeChoiceMessage(leadDraft: StaffingLeadDraft) {
  const candidateName = leadDraft.candidateName?.trim();
  const intro = candidateName
    ? `Next up, ${candidateName}! What type of job are you looking for?`
    : "Next up! What type of job are you looking for?";

  return `${intro}\n\nYou can choose from:\n\n${formatOptionsAsLines(
    STAFFING_JOB_TYPE_PROMPT_OPTIONS
  )}`;
}

function shouldFormatDesiredWorkTypesChoiceMessage(args: {
  assistantMessage: string;
  leadDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
}) {
  if (!args.missingFields.includes("desiredWorkTypes")) return false;
  if ((args.leadDraft.desiredWorkTypes ?? []).length > 0) return false;

  const normalizedMessage = normalizeComparable(args.assistantMessage);
  const asksForDesiredWorkTypes =
    normalizedMessage.includes("desired work type") ||
    normalizedMessage.includes("desired work types") ||
    normalizedMessage.includes("what kind of work") ||
    normalizedMessage.includes("work types");

  return Boolean(
    hasCandidateContactDetails(args.leadDraft) &&
      (args.leadDraft.preferredContactMethod || asksForDesiredWorkTypes)
  );
}

function shouldFormatDesiredJobTypeChoiceMessage(args: {
  assistantMessage: string;
  leadDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
}) {
  if (!args.missingFields.includes("desiredJobType")) return false;
  if (args.leadDraft.desiredJobType) return false;
  if ((args.leadDraft.desiredWorkTypes ?? []).length === 0) return false;

  const normalizedMessage = normalizeComparable(args.assistantMessage);
  const asksForJobType =
    normalizedMessage.includes("what type of job") ||
    normalizedMessage.includes("job type") ||
    normalizedMessage.includes("employment type") ||
    normalizedMessage.includes("full time") ||
    normalizedMessage.includes("part time") ||
    normalizedMessage.includes("temporary") ||
    normalizedMessage.includes("seasonal");

  return asksForJobType || Boolean(args.leadDraft.candidateName?.trim());
}

function formatAssistantChoiceLists(args: {
  assistantMessage: string;
  leadDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
}) {
  if (shouldFormatDesiredWorkTypesChoiceMessage(args)) {
    return buildDesiredWorkTypesChoiceMessage(args.leadDraft);
  }

  if (shouldFormatDesiredJobTypeChoiceMessage(args)) {
    return buildDesiredJobTypeChoiceMessage(args.leadDraft);
  }

  return args.assistantMessage;
}

function buildFallbackAssistantMessage(
  missingFields: StaffingRequiredField[],
  settings: AiChatCompanySettings
) {
  const fallbackIntro = settings.fallbackMessage?.trim() || "Thanks.";
  const locationLabel = settings.companyLocation ?? "the hiring area";
  const roleExamples =
    settings.primaryRoles.length > 0
      ? settings.primaryRoles.slice(0, 3).join(", ")
      : "the role";

  if (missingFields.length === 0) {
    return ensureComplianceLine(
      settings.completionMessage?.trim() ||
        "Thanks — I have everything I need for a recruiter to review.",
    );
  }

  const missingSet = new Set(missingFields);

  if (missingSet.has("desiredWorkTypes") || missingSet.has("desiredJobType")) {
    const prompts: string[] = [];
    if (missingSet.has("desiredWorkTypes")) {
      prompts.push("what kind of work you're looking for");
    }
    if (missingSet.has("desiredJobType")) {
      prompts.push(
        "whether you want full-time, part-time, temporary, or seasonal work"
      );
    }
    const optionList = [
      missingSet.has("desiredWorkTypes")
        ? formatOptionsAsLines(STAFFING_WORK_TYPE_OPTIONS)
        : "",
      missingSet.has("desiredJobType")
        ? formatOptionsAsLines(STAFFING_JOB_TYPE_PROMPT_OPTIONS)
        : "",
    ].filter(Boolean);
    const formattedOptionList =
      optionList.length > 0
        ? `\n\nYou can choose from:\n\n${optionList.join("\n")}`
        : "";
    const exampleHint = settings.primaryRoles.length > 0
      ? ` For this demo, common roles include ${roleExamples}.`
      : "";

    return `${fallbackIntro} Tell me ${prompts.join(
      " and "
    )} so I can keep your screening moving.${exampleHint}${formattedOptionList}`;
  }

  if (missingSet.has("shiftAvailability") || missingSet.has("startAvailability")) {
    const prompts: string[] = [];
    if (missingSet.has("shiftAvailability")) {
      prompts.push("what shifts you can work");
    }
    if (missingSet.has("startAvailability")) {
      prompts.push("how soon you can start");
    }
    return `Got it. I still need to know ${prompts.join(" and ")}.`;
  }

  if (missingSet.has("transportationStatus") || missingSet.has("experience")) {
    const prompts: string[] = [];
    if (missingSet.has("transportationStatus")) {
      prompts.push(`whether you have reliable transportation around ${locationLabel}`);
    }
    if (missingSet.has("experience")) {
      prompts.push("what relevant experience you have");
    }
    return `${fallbackIntro} Tell me ${prompts.join(" and ")}.`;
  }

  if (missingSet.has("desiredPayRange")) {
    return settings.payRange
      ? `What pay range are you looking for? The current hiring range is ${settings.payRange}.`
      : "What pay range are you looking for?";
  }

  if (missingSet.has("candidateName") || missingSet.has("phone")) {
    const prompts: string[] = [];
    if (missingSet.has("candidateName")) {
      prompts.push("your name");
    }
    if (missingSet.has("phone")) {
      prompts.push("the best phone number for recruiter follow-up");
    }
    return `I still need ${prompts.join(" and ")}.`;
  }

  if (missingSet.has("email") || missingSet.has("preferredContactMethod")) {
    const prompts: string[] = [];
    if (missingSet.has("email")) {
      prompts.push("your email");
    }
    if (missingSet.has("preferredContactMethod")) {
      prompts.push("whether you prefer text, phone call, email, or any contact method");
    }
    return `Please share ${prompts.join(" and ")}.`;
  }

  if (missingSet.has("consentToContact")) {
    return buildConsentPrompt();
  }

  const nextFields = joinFieldLabels(missingFields.slice(0, 2));
  return `I still need ${nextFields.join(" and ")} before I can complete your screening.`;
}

async function requestAiAssistantResponse(args: {
  latestCandidateMessage: string;
  currentDraft: StaffingLeadDraft;
  currentStep: StaffingIntakeStep;
  missingFields: StaffingRequiredField[];
  conversationId: string;
}) {
  const client = getOpenAIClient();
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  logStaffingChatDebug("[demo/staffing-ai-chat] OpenAI config", {
    hasOpenAIKey,
    model: STAFFING_CHAT_MODEL,
  });

  if (!client) {
    throw new OpenAiDemoChatError(
      "OPENAI_API_KEY is not configured for the staffing demo chat."
    );
  }

  const systemInstruction = [
    "You are a low-token staffing intake extraction helper.",
    "Use only the current candidate message and current intake state.",
    "Extract fields into JSON. Keep assistantMessage empty unless a short clarification is required.",
    "Do not make hiring decisions or guarantees.",
  ].join(" ");

  const userInstruction = [
    `Current step: ${args.currentStep}`,
    `Current candidate message:\n${args.latestCandidateMessage}`,
    `Current intake state:\n${JSON.stringify(args.currentDraft)}`,
    `Missing fields:\n${JSON.stringify(args.missingFields)}`,
    `Allowed work types: ${STAFFING_WORK_TYPE_OPTIONS.join(", ")}`,
    `Allowed job types: ${STAFFING_POSITION_TYPE_OPTIONS.join(", ")}`,
    `Allowed shifts: ${STAFFING_SHIFT_OPTIONS.join(", ")}`,
    `Allowed start availability values: ${STAFFING_START_AVAILABILITY_OPTIONS.join(", ")}`,
    `Allowed transportation values: ${STAFFING_TRANSPORTATION_OPTIONS.join(", ")}`,
    `Allowed experience values: ${STAFFING_EXPERIENCE_OPTIONS.join(", ")}`,
    `Allowed contact methods: ${STAFFING_CONTACT_METHOD_OPTIONS.join(", ")}`,
    "Name rule: firstName and lastName must be separate. Only set candidateName/fullName when both are known.",
    "Consent rule: only set contactConsent and consentToContact when the candidate explicitly answers yes or no to contact consent.",
    "Return JSON only.",
  ].join("\n\n");
  const estimatedPromptTokens = estimateTokenCount(
    `${systemInstruction}\n\n${userInstruction}`
  );

  logStaffingChatDebug("[demo/staffing-ai-chat] OpenAI request starting", {
    conversationId: args.conversationId,
    model: STAFFING_CHAT_MODEL,
    inputMessageCount: 2,
    estimatedPromptTokens,
    currentStep: args.currentStep,
    missingFields: args.missingFields,
  });

  const response = await client.responses.create({
    model: STAFFING_CHAT_MODEL,
    input: [
      {
        role: "system",
        content: systemInstruction,
      },
      {
        role: "user",
        content: userInstruction,
      },
    ],
    max_output_tokens: STAFFING_CHAT_MAX_OUTPUT_TOKENS,
    temperature: STAFFING_CHAT_TEMPERATURE,
    text: {
      format: {
        type: "json_schema",
        name: "StaffingAiChatResponse",
        schema: aiResponseSchema,
        strict: true,
      },
    },
    store: false,
  });

  const responseText = getResponseText(response);
  if (!responseText) {
    throw new OpenAiDemoChatError("OpenAI returned an empty staffing chat response.");
  }

  logStaffingChatDebug("[demo/staffing-ai-chat] OpenAI response received", {
    conversationId: args.conversationId,
    responseTextLength: responseText.length,
  });

  return JSON.parse(responseText) as AiStructuredResponse;
}

function ensureComplianceLine(message: string) {
  return message.trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const requestPresence = getRequestPresence(body);

    logStaffingChatDebug("[demo/staffing-ai-chat] incoming request body", {
      body: sanitizeRequestBodyForLog(body),
      requiredFields: requestPresence,
    });

    const parsedBody = requestSchema.safeParse(body);

    if (!parsedBody.success) {
      const details = formatZodIssues(parsedBody.error);
      const conversationId = createConversationId();

      console.warn("[demo/staffing-ai-chat] validation failed", {
        details,
        requiredFields: requestPresence,
      });

      return NextResponse.json(
        {
          error: "Invalid staffing demo chat request.",
          details,
          fieldErrors: parsedBody.error.flatten().fieldErrors,
          assistantMessage:
            "I’m sorry, something went wrong with this demo chat request. Please try again.",
          reply:
            "I'm sorry, something went wrong with this demo chat request. Please try again.",
          messages: [],
          conversationId,
          leadDraft: {},
          missingFields: [],
          isComplete: false,
        } satisfies StaffingAiChatResponse & {
          error: string;
          details: ReturnType<typeof formatZodIssues>;
          fieldErrors: Record<string, string[] | undefined>;
        },
        { status: 400 }
      );
    }

    const conversationId = parsedBody.data.conversationId ?? createConversationId();
    const conversationMessages = normalizeConversationMessages(parsedBody.data);

    logStaffingChatDebug("[demo/staffing-ai-chat] validated request", {
      conversationId,
      messageCount: conversationMessages.length,
      requiredFields: requestPresence,
    });

    const settings = await resolveCompanySettings(parsedBody.data);
    const requiredFields = getEffectiveRequiredFields(settings);
    const currentDraft = mergeStaffingLeadDraft({}, parsedBody.data.leadDraft);
    const latestCandidateMessage = findLatestMessage(
      conversationMessages,
      "candidate"
    );
    const missingBeforeHeuristics = getMissingStaffingFields(
      currentDraft,
      requiredFields
    );
    const currentIntakeStep = getStaffingIntakeStep(
      currentDraft,
      missingBeforeHeuristics
    );
    const heuristicDraft = inferLeadDraftHeuristically({
      messages: conversationMessages,
      currentDraft,
    });
    const missingBeforeAi = getMissingStaffingFields(heuristicDraft, requiredFields);
    const useAiExtraction = shouldUseAiExtraction({
      currentStep: currentIntakeStep,
      latestCandidateMessage,
      currentDraft,
      heuristicDraft,
      missingBeforeHeuristics,
      missingAfterHeuristics: missingBeforeAi,
    });

    logStaffingChatDebug("[demo/staffing-ai-chat] intake routing", {
      conversationId,
      currentStep: currentIntakeStep,
      usedAiExtraction: useAiExtraction,
      missingBeforeCount: missingBeforeHeuristics.length,
      missingAfterHeuristicsCount: missingBeforeAi.length,
    });

    let nextDraft = heuristicDraft;
    let assistantMessage = "";

    if (useAiExtraction) {
      try {
        const aiResponse = await requestAiAssistantResponse({
          latestCandidateMessage,
          currentDraft: heuristicDraft,
          currentStep: currentIntakeStep,
          missingFields: missingBeforeAi,
          conversationId,
        });

        if (aiResponse) {
          nextDraft = mergeStaffingLeadDraft(
            heuristicDraft,
            aiResponse.extractedLeadDraft
          );
          assistantMessage = aiResponse.assistantMessage.trim();
        }
      } catch (error) {
        console.error("[demo/staffing-ai-chat] optional AI extraction failed", {
          conversationId,
          currentStep: currentIntakeStep,
          error: getErrorMessage(error),
        });
      }
    }

    const missingFields = getMissingStaffingFields(nextDraft, requiredFields);
    const isComplete = missingFields.length === 0;

    if (!assistantMessage) {
      const fallbackSummary = isComplete
        ? buildStaffingLeadSummary(nextDraft, {
            companySlug: settings.companySlug,
            companyName: settings.companyName,
            companyLocation: settings.companyLocation,
            companyIndustry: settings.companyIndustry,
            recruiterEmail: settings.recruiterEmail,
            sourcePage: `/demo/${settings.companySlug}`,
          })
        : null;
      assistantMessage = isComplete
        ? buildCompletionMessage(
            settings,
            nextDraft,
            fallbackSummary!.score,
            fallbackSummary!.tier
          )
        : buildFallbackAssistantMessage(missingFields, settings);
    }

    const deterministicIntakeMessage = formatDeterministicIntakeMessage({
      assistantMessage,
      leadDraft: nextDraft,
      missingFields,
      latestCandidateMessage,
      settings,
    });
    assistantMessage = deterministicIntakeMessage.assistantMessage;

    logNameIntakeDebug({
      conversationId,
      currentStep: currentIntakeStep,
      selectedStep: deterministicIntakeMessage.selectedStep,
      leadDraft: nextDraft,
    });

    assistantMessage = formatAssistantChoiceLists({
      assistantMessage,
      leadDraft: nextDraft,
      missingFields,
    });

    if (!isComplete) {
      return NextResponse.json(
        buildChatResponse({
          assistantMessage,
          conversationId,
          requestMessages: conversationMessages,
          leadDraft: nextDraft,
          missingFields,
          isComplete: false,
        })
      );
    }

    const completionSummary = buildStaffingLeadSummary(nextDraft, {
      companySlug: settings.companySlug,
      companyName: settings.companyName,
      companyLocation: settings.companyLocation,
      companyIndustry: settings.companyIndustry,
      recruiterEmail: settings.recruiterEmail,
      sourcePage: `/demo/${settings.companySlug}`,
    });

    return NextResponse.json(
      buildChatResponse({
        assistantMessage: ensureComplianceLine(
          assistantMessage ||
            buildCompletionMessage(
              settings,
              nextDraft,
              completionSummary.score,
              completionSummary.tier
            )
        ),
        conversationId,
        requestMessages: conversationMessages,
        leadDraft: nextDraft,
        missingFields,
        isComplete: true,
        completionSummary,
      })
    );
  } catch (error) {
    console.error("[demo/staffing-ai-chat] failed", {
      error: getErrorMessage(error),
    });

    const friendlyMessage =
      "I'm sorry, I ran into a problem with the staffing demo chat. Please try again.";

    return NextResponse.json(
      {
        error: `Staffing demo chat failed: ${getErrorMessage(error)}`,
        assistantMessage: friendlyMessage,
        /*
          "I’m sorry, I ran into a problem with the staffing demo chat. Please try again.",
        */
        reply: friendlyMessage,
        messages: [],
        conversationId: createConversationId(),
        leadDraft: {},
        missingFields: [],
        isComplete: false,
      } satisfies StaffingAiChatResponse & { error: string },
      { status: 500 }
    );
  }
}
