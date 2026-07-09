import { prisma } from "@/app/lib/prisma";
import { getSafeDefaultCompanyChatSettings } from "@/app/lib/ai-chat/defaultCompanyChatSettings";
import { STAFFING_REQUIRED_FIELDS } from "@/app/lib/staffing/getMissingStaffingFields";
import type { StaffingRequiredField } from "@/app/lib/staffing/getMissingStaffingFields";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import { buildCompanyPrompt } from "@/lib/chatbot/buildCompanyPrompt";
import type {
  ChatbotJobInput,
  ChatbotQuestionInput,
  CompanyChatbotRecord,
} from "@/lib/chatbot/types";

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

type CompanyChatbotWithRelations = NonNullable<
  Awaited<ReturnType<typeof getCompanyChatbotBySlug>>
>;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function readQuestionOptions(value: unknown) {
  return asStringArray(value);
}

function readConditionalLogic(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return String((value as { expression?: unknown }).expression ?? "").trim();
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeCompanyChatbot(
  chatbot: {
    id: string;
    companyName: string;
    companySlug: string;
    websiteUrl: string | null;
    industry: string | null;
    companyDescription: string | null;
    mainContactEmail: string | null;
    recruiterEmail: string | null;
    companyPhone: string | null;
    locationsServed: string[];
    logoUrl: string | null;
    brandColor: string | null;
    chatTitle: string | null;
    chatSubtitle: string | null;
    welcomeMessage: string | null;
    fallbackMessage: string | null;
    tone: string;
    greetingStyle: string | null;
    showAiDisclosure: boolean;
    useEmojis: boolean;
    answerLength: string;
    fallbackBehavior: string | null;
    requiredCandidateFields: string[];
    optionalCandidateFields: string[];
    requiredTransportation: string | null;
    requiredWorkAuthorization: string | null;
    requiredShiftAvailability: string[];
    minimumYearsExperience: number | null;
    requiredCertifications: string[];
    disqualifyingAnswers: unknown;
    candidateScoreThreshold: number | null;
    saveLeadToDashboard: boolean;
    sendEmailNotification: boolean;
    webhookUrl: string | null;
    redirectUrl: string | null;
    completionMessage: string | null;
    isActive: boolean;
    isDemoMode: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
    jobs?: Array<{
      id: string;
      title: string;
      location: string | null;
      payRange: string | null;
      shift: string | null;
      employmentType: string | null;
      requirements: string | null;
      applicationUrl: string | null;
      description: string | null;
      status: string;
    }>;
    questions?: Array<{
      id: string;
      questionText: string;
      questionType: string;
      isRequired: boolean;
      isOptional: boolean;
      isKnockout: boolean;
      options: unknown;
      expectedAnswer: string | null;
      order: number;
      conditionalLogic: unknown;
    }>;
    _count?: {
      leads: number;
      messages: number;
    };
  }
): CompanyChatbotRecord {
  return {
    id: chatbot.id,
    companyName: chatbot.companyName,
    companySlug: chatbot.companySlug,
    websiteUrl: chatbot.websiteUrl ?? "",
    industry: chatbot.industry ?? "",
    companyDescription: chatbot.companyDescription ?? "",
    mainContactEmail: chatbot.mainContactEmail ?? "",
    recruiterEmail: chatbot.recruiterEmail ?? "",
    companyPhone: chatbot.companyPhone ?? "",
    locationsServed: chatbot.locationsServed,
    logoUrl: chatbot.logoUrl ?? "",
    brandColor: chatbot.brandColor ?? "#0284c7",
    chatTitle: chatbot.chatTitle ?? "Hirexa AI",
    chatSubtitle: chatbot.chatSubtitle ?? "Candidate screening assistant",
    welcomeMessage: chatbot.welcomeMessage ?? "",
    fallbackMessage: chatbot.fallbackMessage ?? "",
    tone: chatbot.tone,
    greetingStyle: chatbot.greetingStyle ?? "",
    showAiDisclosure: chatbot.showAiDisclosure,
    useEmojis: chatbot.useEmojis,
    answerLength: chatbot.answerLength,
    fallbackBehavior: chatbot.fallbackBehavior ?? "",
    requiredCandidateFields: chatbot.requiredCandidateFields,
    optionalCandidateFields: chatbot.optionalCandidateFields,
    requiredTransportation: chatbot.requiredTransportation ?? "",
    requiredWorkAuthorization: chatbot.requiredWorkAuthorization ?? "",
    requiredShiftAvailability: chatbot.requiredShiftAvailability,
    minimumYearsExperience: chatbot.minimumYearsExperience,
    requiredCertifications: chatbot.requiredCertifications,
    disqualifyingAnswers: asStringArray(chatbot.disqualifyingAnswers),
    candidateScoreThreshold: chatbot.candidateScoreThreshold,
    saveLeadToDashboard: chatbot.saveLeadToDashboard,
    sendEmailNotification: chatbot.sendEmailNotification,
    webhookUrl: chatbot.webhookUrl ?? "",
    redirectUrl: chatbot.redirectUrl ?? "",
    completionMessage: chatbot.completionMessage ?? "",
    isActive: chatbot.isActive,
    isDemoMode: chatbot.isDemoMode,
    jobs: (chatbot.jobs ?? []).map(
      (job): ChatbotJobInput => ({
        id: job.id,
        title: job.title,
        location: job.location ?? "",
        payRange: job.payRange ?? "",
        shift: job.shift ?? "",
        employmentType: job.employmentType ?? "",
        requirements: job.requirements ?? "",
        applicationUrl: job.applicationUrl ?? "",
        description: job.description ?? "",
        status: job.status,
      })
    ),
    questions: (chatbot.questions ?? []).map(
      (question): ChatbotQuestionInput => ({
        id: question.id,
        questionText: question.questionText,
        questionType: question.questionType,
        isRequired: question.isRequired,
        isOptional: question.isOptional,
        isKnockout: question.isKnockout,
        options: readQuestionOptions(question.options),
        expectedAnswer: question.expectedAnswer ?? "",
        order: question.order,
        conditionalLogic: readConditionalLogic(question.conditionalLogic),
      })
    ),
    createdAt: isoDate(chatbot.createdAt),
    updatedAt: isoDate(chatbot.updatedAt),
    leadCount: chatbot._count?.leads,
    messageCount: chatbot._count?.messages,
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

const requiredFieldMap: Record<string, StaffingRequiredField | null> = {
  firstName: "candidateName",
  lastName: "candidateName",
  email: "email",
  phone: "phone",
  city: "city",
  state: "state",
  zipCode: "zipCode",
  desiredJobType: "desiredJobType",
  availability: "startAvailability",
  workExperience: "experience",
  preferredShift: "shiftAvailability",
  transportationStatus: "transportationStatus",
  workAuthorizationStatus: "workAuthorizationStatus",
  resumeUploadOrWorkHistorySummary: "resumeUploadOrWorkHistorySummary",
  linkedinUrl: "linkedinUrl",
  certifications: "certifications",
  desiredPay: "desiredPayRange",
  startDate: "startDate",
  previousEmployer: "previousEmployer",
  educationLevel: "educationLevel",
  languagesSpoken: "languagesSpoken",
  veteranStatus: "veteranStatus",
  referralSource: "referralSource",
};

function mapRequiredFields(chatbot: CompanyChatbotRecord) {
  const mapped = [
    ...chatbot.requiredCandidateFields,
    ...chatbot.optionalCandidateFields,
  ]
    .map((field) => requiredFieldMap[field] ?? null)
    .filter((field): field is StaffingRequiredField => Boolean(field));

  const fields: StaffingRequiredField[] = [
    ...mapped,
    "preferredContactMethod",
    "consentToContact",
  ];

  return [...new Set(fields)].filter((field) =>
    STAFFING_REQUIRED_FIELDS.includes(field)
  );
}

export function toAiChatCompanySettings(
  chatbot: CompanyChatbotRecord
): AiChatCompanySettings {
  const defaultSettings = getSafeDefaultCompanyChatSettings();
  const jobTitles = unique(chatbot.jobs.map((job) => job.title));
  const locations = unique([
    ...chatbot.locationsServed,
    ...chatbot.jobs.map((job) => job.location ?? ""),
  ]);
  const employmentTypes = unique(
    chatbot.jobs.map((job) => job.employmentType ?? "")
  );
  const shifts = unique([
    ...chatbot.requiredShiftAvailability,
    ...chatbot.jobs.map((job) => job.shift ?? ""),
  ]);
  const payRanges = unique(chatbot.jobs.map((job) => job.payRange ?? ""));
  const customPrompt = buildCompanyPrompt(chatbot);

  return {
    ...defaultSettings,
    id: chatbot.id,
    companyName: chatbot.companyName,
    companySlug: chatbot.companySlug,
    companyWebsite: chatbot.websiteUrl,
    companyDescription: chatbot.companyDescription,
    companyIndustry: chatbot.industry,
    companyLocation: locations[0] ?? defaultSettings.companyLocation,
    companyLogoUrl: chatbot.logoUrl,
    brandPrimaryColor: chatbot.brandColor || defaultSettings.brandPrimaryColor,
    primaryRoles: jobTitles.length ? jobTitles : defaultSettings.primaryRoles,
    industries: chatbot.industry ? [chatbot.industry] : defaultSettings.industries,
    employmentTypes: employmentTypes.length
      ? employmentTypes
      : defaultSettings.employmentTypes,
    shiftOptions: shifts.length ? shifts : defaultSettings.shiftOptions,
    locationCoverage: locations,
    requiredQualifications: unique([
      chatbot.requiredTransportation,
      chatbot.requiredWorkAuthorization,
      ...chatbot.requiredCertifications,
    ].filter((value): value is string => Boolean(value))),
    payRange: payRanges[0] ?? defaultSettings.payRange,
    recruiterEmail: chatbot.recruiterEmail || chatbot.mainContactEmail,
    leadNotificationEmail: chatbot.recruiterEmail || chatbot.mainContactEmail,
    leadDeliveryMethod: chatbot.webhookUrl
      ? "webhook"
      : chatbot.sendEmailNotification
        ? "email"
        : "dashboard",
    chatDisplayName: chatbot.chatTitle || defaultSettings.chatDisplayName,
    chatTitle: chatbot.chatTitle,
    chatSubtitle: chatbot.chatSubtitle,
    welcomeMessage: chatbot.welcomeMessage || defaultSettings.welcomeMessage,
    assistantTone:
      chatbot.tone === "friendly" ||
      chatbot.tone === "professional" ||
      chatbot.tone === "high-energy" ||
      chatbot.tone === "formal" ||
      chatbot.tone === "casual"
        ? chatbot.tone
        : defaultSettings.assistantTone,
    customInstructions: customPrompt,
    fallbackMessage: chatbot.fallbackMessage || defaultSettings.fallbackMessage,
    completionMessage:
      chatbot.completionMessage || defaultSettings.completionMessage,
    complianceDisclaimer: chatbot.showAiDisclosure
      ? defaultSettings.complianceDisclaimer
      : "",
    requiredScreeningFields: mapRequiredFields(chatbot),
    optionalScreeningFields: chatbot.optionalCandidateFields,
    knockoutRules: chatbot.disqualifyingAnswers,
    scoringRules: [
      chatbot.candidateScoreThreshold
        ? `Target candidate score threshold: ${chatbot.candidateScoreThreshold}`
        : "",
    ].filter(Boolean),
    publicChatEnabled: chatbot.isActive,
    demoModeEnabled: chatbot.isDemoMode,
    createdAt: chatbot.createdAt,
    updatedAt: chatbot.updatedAt,
  };
}

export async function listCompanyChatbots() {
  const chatbots = await prisma.companyChatbot.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: chatbotInclude,
  });

  return chatbots.map(serializeCompanyChatbot);
}

export async function getCompanyChatbotBySlug(companySlug: string) {
  const normalizedSlug = companySlug.trim().toLowerCase();
  if (!normalizedSlug) return null;

  const chatbot = await prisma.companyChatbot.findUnique({
    where: { companySlug: normalizedSlug },
    include: chatbotInclude,
  });

  return chatbot ? serializeCompanyChatbot(chatbot) : null;
}

export async function getCompanyChatbotSettingsBySlug(companySlug: string) {
  const chatbot = await getCompanyChatbotBySlug(companySlug);
  if (!chatbot) return null;

  return {
    ...chatbot,
    aiChatSettings: toAiChatCompanySettings(chatbot),
  };
}

export type { CompanyChatbotWithRelations };
