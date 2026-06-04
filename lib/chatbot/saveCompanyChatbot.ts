import { Prisma } from "@prisma/client";

import { prisma } from "@/app/lib/prisma";
import {
  serializeCompanyChatbot,
} from "@/lib/chatbot/getCompanyChatbot";
import {
  DEFAULT_COMPANY_CHATBOT_INPUT,
  EMPTY_CHATBOT_JOB,
  EMPTY_CHATBOT_QUESTION,
  type ChatbotJobInput,
  type ChatbotQuestionInput,
  type CompanyChatbotInput,
} from "@/lib/chatbot/types";

export class ChatbotValidationError extends Error {
  fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super("Invalid chatbot setup.");
    this.name = "ChatbotValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const chatbotInclude = {
  jobs: {
    orderBy: [{ createdAt: "asc" as const }],
  },
  questions: {
    orderBy: [{ order: "asc" as const }, { createdAt: "asc" as const }],
  },
  _count: {
    select: {
      leads: true,
      messages: true,
    },
  },
};

export function normalizeCompanySlug(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text || undefined;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(true|yes|1|on)$/i.test(value)) return true;
    if (/^(false|no|0|off)$/i.test(value)) return false;
  }
  return fallback;
}

function readOptionalNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readStringList(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[\n,]/g)
        .map((item) => item.trim());

  return [...new Set(source.map((item) => readString(item)).filter(Boolean))];
}

export function normalizeJobInput(value: unknown): ChatbotJobInput {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...EMPTY_CHATBOT_JOB,
    id: readOptionalString(source.id),
    title: readString(source.title),
    location: readString(source.location),
    payRange: readString(source.payRange),
    shift: readString(source.shift),
    employmentType: readString(source.employmentType) || "Full-Time",
    requirements: readString(source.requirements),
    applicationUrl: readString(source.applicationUrl),
    description: readString(source.description),
    status: readString(source.status) || "OPEN",
  };
}

export function normalizeQuestionInput(value: unknown): ChatbotQuestionInput {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...EMPTY_CHATBOT_QUESTION,
    id: readOptionalString(source.id),
    questionText: readString(source.questionText),
    questionType: readString(source.questionType) || "text",
    isRequired: readBoolean(source.isRequired, true),
    isOptional: readBoolean(source.isOptional, false),
    isKnockout: readBoolean(source.isKnockout, false),
    options: readStringList(source.options),
    expectedAnswer: readString(source.expectedAnswer),
    order: readOptionalNumber(source.order) ?? 0,
    conditionalLogic: readString(source.conditionalLogic),
  };
}

export function normalizeCompanyChatbotInput(
  value: unknown
): CompanyChatbotInput {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    ...DEFAULT_COMPANY_CHATBOT_INPUT,
    companyName: readString(source.companyName),
    companySlug: normalizeCompanySlug(source.companySlug),
    websiteUrl: readString(source.websiteUrl),
    industry: readString(source.industry),
    companyDescription: readString(source.companyDescription),
    mainContactEmail: readString(source.mainContactEmail),
    recruiterEmail: readString(source.recruiterEmail),
    companyPhone: readString(source.companyPhone),
    locationsServed: readStringList(source.locationsServed),
    logoUrl: readString(source.logoUrl),
    brandColor: readString(source.brandColor) || "#0284c7",
    chatTitle: readString(source.chatTitle) || "Hirexa AI",
    chatSubtitle: readString(source.chatSubtitle),
    welcomeMessage: readString(source.welcomeMessage),
    fallbackMessage: readString(source.fallbackMessage),
    tone: readString(source.tone) || "professional",
    greetingStyle: readString(source.greetingStyle),
    showAiDisclosure: readBoolean(source.showAiDisclosure, true),
    useEmojis: readBoolean(source.useEmojis, false),
    answerLength: readString(source.answerLength) || "concise",
    fallbackBehavior: readString(source.fallbackBehavior),
    requiredCandidateFields: readStringList(source.requiredCandidateFields),
    optionalCandidateFields: readStringList(source.optionalCandidateFields),
    requiredTransportation: readString(source.requiredTransportation),
    requiredWorkAuthorization: readString(source.requiredWorkAuthorization),
    requiredShiftAvailability: readStringList(source.requiredShiftAvailability),
    minimumYearsExperience: readOptionalNumber(source.minimumYearsExperience),
    requiredCertifications: readStringList(source.requiredCertifications),
    disqualifyingAnswers: readStringList(source.disqualifyingAnswers),
    candidateScoreThreshold: readOptionalNumber(source.candidateScoreThreshold),
    saveLeadToDashboard: readBoolean(source.saveLeadToDashboard, true),
    sendEmailNotification: readBoolean(source.sendEmailNotification, false),
    webhookUrl: readString(source.webhookUrl),
    redirectUrl: readString(source.redirectUrl),
    completionMessage: readString(source.completionMessage),
    isActive: readBoolean(source.isActive, true),
    isDemoMode: readBoolean(source.isDemoMode, false),
    jobs: Array.isArray(source.jobs)
      ? source.jobs.map(normalizeJobInput).filter((job) => job.title)
      : [],
    questions: Array.isArray(source.questions)
      ? source.questions
          .map(normalizeQuestionInput)
          .filter((question) => question.questionText)
      : [],
  };
}

function validateCompanyChatbotInput(input: CompanyChatbotInput) {
  const fieldErrors: Record<string, string> = {};

  if (!input.companyName) {
    fieldErrors.companyName = "Company name is required.";
  }
  if (!input.companySlug) {
    fieldErrors.companySlug = "Company slug is required.";
  }
  if (!input.chatTitle) {
    fieldErrors.chatTitle = "Chat title is required.";
  }
  if (!input.welcomeMessage) {
    fieldErrors.welcomeMessage = "Welcome message is required.";
  }
  if (input.requiredCandidateFields.length === 0) {
    fieldErrors.requiredCandidateFields =
      "Select at least one required candidate field.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ChatbotValidationError(fieldErrors);
  }
}

function chatbotData(input: CompanyChatbotInput) {
  return {
    companyName: input.companyName,
    companySlug: input.companySlug,
    websiteUrl: readOptionalString(input.websiteUrl),
    industry: readOptionalString(input.industry),
    companyDescription: readOptionalString(input.companyDescription),
    mainContactEmail: readOptionalString(input.mainContactEmail),
    recruiterEmail: readOptionalString(input.recruiterEmail),
    companyPhone: readOptionalString(input.companyPhone),
    locationsServed: input.locationsServed,
    logoUrl: readOptionalString(input.logoUrl),
    brandColor: readOptionalString(input.brandColor),
    chatTitle: readOptionalString(input.chatTitle),
    chatSubtitle: readOptionalString(input.chatSubtitle),
    welcomeMessage: readOptionalString(input.welcomeMessage),
    fallbackMessage: readOptionalString(input.fallbackMessage),
    tone: input.tone,
    greetingStyle: readOptionalString(input.greetingStyle),
    showAiDisclosure: input.showAiDisclosure,
    useEmojis: input.useEmojis,
    answerLength: input.answerLength,
    fallbackBehavior: readOptionalString(input.fallbackBehavior),
    requiredCandidateFields: input.requiredCandidateFields,
    optionalCandidateFields: input.optionalCandidateFields,
    requiredTransportation: readOptionalString(input.requiredTransportation),
    requiredWorkAuthorization: readOptionalString(input.requiredWorkAuthorization),
    requiredShiftAvailability: input.requiredShiftAvailability,
    minimumYearsExperience: input.minimumYearsExperience,
    requiredCertifications: input.requiredCertifications,
    disqualifyingAnswers:
      input.disqualifyingAnswers as Prisma.InputJsonValue,
    candidateScoreThreshold: input.candidateScoreThreshold,
    saveLeadToDashboard: input.saveLeadToDashboard,
    sendEmailNotification: input.sendEmailNotification,
    webhookUrl: readOptionalString(input.webhookUrl),
    redirectUrl: readOptionalString(input.redirectUrl),
    completionMessage: readOptionalString(input.completionMessage),
    isActive: input.isActive,
    isDemoMode: input.isDemoMode,
  };
}

function jobData(job: ChatbotJobInput) {
  return {
    title: job.title,
    location: readOptionalString(job.location),
    payRange: readOptionalString(job.payRange),
    shift: readOptionalString(job.shift),
    employmentType: readOptionalString(job.employmentType),
    requirements: readOptionalString(job.requirements),
    applicationUrl: readOptionalString(job.applicationUrl),
    description: readOptionalString(job.description),
    status: job.status || "OPEN",
  };
}

function questionData(question: ChatbotQuestionInput) {
  return {
    questionText: question.questionText,
    questionType: question.questionType || "text",
    isRequired: question.isRequired,
    isOptional: question.isOptional ?? !question.isRequired,
    isKnockout: question.isKnockout,
    options: question.options as Prisma.InputJsonValue,
    order: question.order,
    expectedAnswer: readOptionalString(question.expectedAnswer),
    conditionalLogic: question.conditionalLogic
      ? ({ expression: question.conditionalLogic } as Prisma.InputJsonValue)
      : Prisma.DbNull,
  };
}

export async function createCompanyChatbot(value: unknown) {
  const input = normalizeCompanyChatbotInput(value);
  validateCompanyChatbotInput(input);

  const chatbot = await prisma.companyChatbot.create({
    data: {
      ...chatbotData(input),
      jobs: {
        create: input.jobs.map(jobData),
      },
      questions: {
        create: input.questions.map(questionData),
      },
    },
    include: chatbotInclude,
  });

  return serializeCompanyChatbot(chatbot);
}

export async function updateCompanyChatbot(companySlug: string, value: unknown) {
  const input = normalizeCompanyChatbotInput(value);
  validateCompanyChatbotInput(input);

  const existing = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizeCompanySlug(companySlug) },
    select: { id: true },
  });

  if (!existing) return null;

  const chatbot = await prisma.$transaction(async (tx) => {
    await tx.chatbotCandidateAnswer.deleteMany({
      where: {
        question: {
          companyChatbotId: existing.id,
        },
      },
    });
    await tx.chatbotJobOpening.deleteMany({
      where: { companyChatbotId: existing.id },
    });
    await tx.chatbotScreeningQuestion.deleteMany({
      where: { companyChatbotId: existing.id },
    });

    return tx.companyChatbot.update({
      where: { id: existing.id },
      data: {
        ...chatbotData(input),
        jobs: {
          create: input.jobs.map(jobData),
        },
        questions: {
          create: input.questions.map(questionData),
        },
      },
      include: chatbotInclude,
    });
  });

  return serializeCompanyChatbot(chatbot);
}

export async function deleteCompanyChatbot(companySlug: string) {
  const existing = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizeCompanySlug(companySlug) },
    select: { id: true },
  });

  if (!existing) return false;

  await prisma.companyChatbot.delete({ where: { id: existing.id } });
  return true;
}
