import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";

import { buildCompanyChatSystemPrompt } from "@/app/lib/ai-chat/buildCompanyChatSystemPrompt";
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
  StaffingAiChatRequest,
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
  staffingLeadDraftSchema,
} from "@/app/types/staffing-screening";
import { aiChatCompanySettingsSchema } from "@/app/types/ai-chat-settings";
import { getCompanyChatbotSettingsBySlug } from "@/lib/chatbot/getCompanyChatbot";

export const runtime = "nodejs";

const MODEL_NAME = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const requestSchema = z.object({
  messages: z.array(staffingChatMessageSchema).min(1),
  leadDraft: staffingLeadDraftSchema.default({}),
  companySlug: z.string().trim().optional(),
  companySettings: aiChatCompanySettingsSchema.optional(),
});

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
        "candidateName",
        "phone",
        "email",
        "preferredContactMethod",
        "desiredWorkTypes",
        "desiredJobType",
        "shiftAvailability",
        "startAvailability",
        "transportationStatus",
        "experience",
        "desiredPayRange",
        "consentToContact",
      ],
      properties: {
        candidateName: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
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
        experience: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: [...STAFFING_EXPERIENCE_OPTIONS],
          },
        },
        desiredPayRange: { type: ["string", "null"] },
        consentToContact: { type: ["boolean", "null"] },
      },
    },
  },
} as const;

type AiExtractedLeadDraft = {
  candidateName: string | null;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
  desiredWorkTypes: string[] | null;
  desiredJobType: string | null;
  shiftAvailability: string[] | null;
  startAvailability: string | null;
  transportationStatus: string | null;
  experience: string[] | null;
  desiredPayRange: string | null;
  consentToContact: boolean | null;
};

type AiStructuredResponse = {
  assistantMessage: string;
  extractedLeadDraft: AiExtractedLeadDraft;
};

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

function findLatestMessage(
  messages: StaffingChatMessage[],
  role: StaffingChatMessage["role"]
) {
  return [...messages].reverse().find((message) => message.role === role)?.content ?? "";
}

function getWordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function getHintedFieldsFromAssistantMessage(message: string) {
  const normalized = normalizeComparable(message);
  const hinted = new Set<StaffingRequiredField>();

  if (normalized.includes("name")) hinted.add("candidateName");
  if (normalized.includes("phone")) hinted.add("phone");
  if (normalized.includes("email")) hinted.add("email");
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
  if (normalized.includes("experience")) hinted.add("experience");
  if (normalized.includes("pay")) hinted.add("desiredPayRange");
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

  const payMatch = latestCandidateMessage.match(
    /(\$?\d{2,3}(?:\.\d{1,2})?\s*(?:-|to)\s*\$?\d{2,3}(?:\.\d{1,2})?\s*(?:\/?\s*(?:hr|hour))?|\$?\d{2,3}(?:\.\d{1,2})?\s*(?:\/?\s*(?:hr|hour)|an hour))/i
  );
  if (payMatch) {
    inferred.desiredPayRange = payMatch[0];
  }

  const nameMatch = latestCandidateMessage.match(
    /(?:my name is|this is|it(?:')?s)\s+([a-z]+(?:\s+[a-z]+){0,2})/i
  );
  if (nameMatch) {
    inferred.candidateName = titleCase(nameMatch[1]);
  } else if (
    hintedFields.includes("candidateName") &&
    !/\d/.test(latestCandidateMessage) &&
    !latestCandidateMessage.includes("@") &&
    latestCandidateMessage.split(/\s+/).filter(Boolean).length <= 4
  ) {
    inferred.candidateName = titleCase(latestCandidateMessage);
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
    inferred.consentToContact = true;
  } else if (
    hintedFields.includes("consentToContact") &&
    (/\bdo not agree\b|\bdon t agree\b|\bdo not contact\b|\bdon t contact\b/i.test(
      normalized
    ) ||
      (isShortResponse && /^(no|nope)$/i.test(normalized)))
  ) {
    inferred.consentToContact = false;
  }

  return mergeStaffingLeadDraft(args.currentDraft, inferred);
}

function getEffectiveRequiredFields(settings: AiChatCompanySettings) {
  const requiredFields = normalizeRequiredStaffingFields(
    settings.requiredScreeningFields
  );

  return settings.transportationQuestionEnabled
    ? requiredFields
    : requiredFields.filter((field) => field !== "transportationStatus");
}

async function resolveCompanySettings(body: StaffingAiChatRequest) {
  if (body.companySettings) {
    return normalizeCompanyChatSettings(body.companySettings);
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
  summaryScore: number,
  tier: string
) {
  const completionMessage =
    settings.completionMessage?.trim() ||
    "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions.";

  return `${completionMessage} Your screening summary is ready with a ${summaryScore}/100 lead score (${tier}).`;
}

function joinFieldLabels(fields: StaffingRequiredField[]) {
  return fields.map((field) => STAFFING_FIELD_LABELS[field].toLowerCase());
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
      settings
    );
  }

  const missingSet = new Set(missingFields);

  if (missingSet.has("desiredWorkTypes") || missingSet.has("desiredJobType")) {
    const prompts: string[] = [];
    if (missingSet.has("desiredWorkTypes")) {
      prompts.push(`what kind of work you're looking for, such as ${roleExamples}`);
    }
    if (missingSet.has("desiredJobType")) {
      prompts.push(
        "whether you want temporary, temp-to-hire, full-time, part-time, direct hire, or you're open to anything"
      );
    }
    return `${fallbackIntro} Tell me ${prompts.join(" and ")} so I can keep your screening moving.`;
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
    return "Do you consent to be contacted about job opportunities by phone, text, or email?";
  }

  const nextFields = joinFieldLabels(missingFields.slice(0, 2));
  return `I still need ${nextFields.join(" and ")} before I can complete your screening.`;
}

async function requestAiAssistantResponse(args: {
  messages: StaffingChatMessage[];
  currentDraft: StaffingLeadDraft;
  missingFields: StaffingRequiredField[];
  requiredFields: StaffingRequiredField[];
  settings: AiChatCompanySettings;
}) {
  const client = getOpenAIClient();
  if (!client) return null;

  const transcript = args.messages
    .slice(-12)
    .map((message) => `${message.role === "candidate" ? "Candidate" : "Assistant"}: ${message.content}`)
    .join("\n");

  const response = await client.responses.create({
    model: MODEL_NAME,
    input: [
      {
        role: "system",
        content: buildCompanyChatSystemPrompt({
          settings: args.settings,
          requiredFields: args.requiredFields,
        }),
      },
      {
        role: "user",
        content: [
          `Current lead draft:\n${JSON.stringify(args.currentDraft, null, 2)}`,
          `Missing fields:\n${JSON.stringify(args.missingFields, null, 2)}`,
          `Allowed work types: ${STAFFING_WORK_TYPE_OPTIONS.join(", ")}`,
          `Allowed job types: ${STAFFING_POSITION_TYPE_OPTIONS.join(", ")}`,
          `Allowed shifts: ${STAFFING_SHIFT_OPTIONS.join(", ")}`,
          `Allowed start availability values: ${STAFFING_START_AVAILABILITY_OPTIONS.join(", ")}`,
          `Allowed transportation values: ${STAFFING_TRANSPORTATION_OPTIONS.join(", ")}`,
          `Allowed experience values: ${STAFFING_EXPERIENCE_OPTIONS.join(", ")}`,
          `Allowed contact methods: ${STAFFING_CONTACT_METHOD_OPTIONS.join(", ")}`,
          `Conversation transcript:\n${transcript}`,
          "Return JSON only.",
        ].join("\n\n"),
      },
    ],
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
    return null;
  }

  return JSON.parse(responseText) as AiStructuredResponse;
}

function ensureComplianceLine(
  message: string,
  settings: AiChatCompanySettings
) {
  const disclaimer =
    settings.complianceDisclaimer?.trim() ||
    "A recruiter will review your information. This AI chat does not make hiring decisions.";

  if (message.includes(disclaimer)) {
    return message;
  }

  return `${message.trim()} ${disclaimer}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsedBody = requestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          assistantMessage:
            "I’m sorry, something went wrong with this demo chat request. Please try again.",
          leadDraft: {},
          missingFields: [],
          isComplete: false,
        } satisfies StaffingAiChatResponse,
        { status: 400 }
      );
    }

    const settings = await resolveCompanySettings(parsedBody.data);
    const requiredFields = getEffectiveRequiredFields(settings);
    const currentDraft = mergeStaffingLeadDraft({}, parsedBody.data.leadDraft);
    const heuristicDraft = inferLeadDraftHeuristically({
      messages: parsedBody.data.messages,
      currentDraft,
    });
    const missingBeforeAi = getMissingStaffingFields(heuristicDraft, requiredFields);

    let nextDraft = heuristicDraft;
    let assistantMessage = "";

    try {
      const aiResponse = await requestAiAssistantResponse({
        messages: parsedBody.data.messages,
        currentDraft: heuristicDraft,
        missingFields: missingBeforeAi,
        requiredFields,
        settings,
      });

      if (aiResponse) {
        nextDraft = mergeStaffingLeadDraft(heuristicDraft, aiResponse.extractedLeadDraft);
        assistantMessage = aiResponse.assistantMessage.trim();
      }
    } catch (error) {
      console.error("[demo/staffing-ai-chat] AI request failed", {
        error: error instanceof Error ? error.message : String(error),
      });
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
            fallbackSummary!.score,
            fallbackSummary!.tier
          )
        : buildFallbackAssistantMessage(missingFields, settings);
    }

    if (!isComplete) {
      return NextResponse.json({
        assistantMessage,
        leadDraft: nextDraft,
        missingFields,
        isComplete: false,
      } satisfies StaffingAiChatResponse);
    }

    const completionSummary = buildStaffingLeadSummary(nextDraft, {
      companySlug: settings.companySlug,
      companyName: settings.companyName,
      companyLocation: settings.companyLocation,
      companyIndustry: settings.companyIndustry,
      recruiterEmail: settings.recruiterEmail,
      sourcePage: `/demo/${settings.companySlug}`,
    });

    return NextResponse.json({
      assistantMessage: ensureComplianceLine(
        assistantMessage ||
          buildCompletionMessage(settings, completionSummary.score, completionSummary.tier),
        settings
      ),
      leadDraft: nextDraft,
      missingFields,
      isComplete: true,
      completionSummary,
    } satisfies StaffingAiChatResponse);
  } catch (error) {
    console.error("[demo/staffing-ai-chat] failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        assistantMessage:
          "I’m sorry, I ran into a problem with the staffing demo chat. Please try again.",
        leadDraft: {},
        missingFields: [],
        isComplete: false,
      } satisfies StaffingAiChatResponse,
      { status: 500 }
    );
  }
}
