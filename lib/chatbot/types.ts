import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";

export const REQUIRED_CANDIDATE_FIELD_OPTIONS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "state",
  "zipCode",
  "desiredJobType",
  "availability",
  "workExperience",
  "preferredShift",
  "transportationStatus",
  "workAuthorizationStatus",
  "resumeUploadOrWorkHistorySummary",
] as const;

export const OPTIONAL_CANDIDATE_FIELD_OPTIONS = [
  "linkedinUrl",
  "certifications",
  "desiredPay",
  "startDate",
  "previousEmployer",
  "educationLevel",
  "languagesSpoken",
  "veteranStatus",
  "referralSource",
] as const;

export const DEFAULT_REQUIRED_CANDIDATE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "desiredJobType",
  "availability",
  "workExperience",
  "preferredShift",
  "transportationStatus",
  "workAuthorizationStatus",
] as const;

export type ChatbotJobInput = {
  id?: string;
  title: string;
  location?: string;
  payRange?: string;
  shift?: string;
  employmentType?: string;
  requirements?: string;
  applicationUrl?: string;
  description?: string;
  status?: string;
};

export type ChatbotQuestionInput = {
  id?: string;
  questionText: string;
  questionType: string;
  isRequired: boolean;
  isKnockout: boolean;
  isOptional?: boolean;
  options: string[];
  expectedAnswer?: string;
  order: number;
  conditionalLogic?: string;
};

export type CompanyChatbotInput = {
  companyName: string;
  companySlug: string;
  websiteUrl?: string;
  industry?: string;
  companyDescription?: string;
  mainContactEmail?: string;
  recruiterEmail?: string;
  companyPhone?: string;
  locationsServed: string[];
  logoUrl?: string;
  brandColor?: string;
  chatTitle?: string;
  chatSubtitle?: string;
  welcomeMessage?: string;
  fallbackMessage?: string;
  tone: string;
  greetingStyle?: string;
  showAiDisclosure: boolean;
  useEmojis: boolean;
  answerLength: string;
  fallbackBehavior?: string;
  requiredCandidateFields: string[];
  optionalCandidateFields: string[];
  requiredTransportation?: string;
  requiredWorkAuthorization?: string;
  requiredShiftAvailability: string[];
  minimumYearsExperience?: number | null;
  requiredCertifications: string[];
  disqualifyingAnswers: string[];
  candidateScoreThreshold?: number | null;
  saveLeadToDashboard: boolean;
  sendEmailNotification: boolean;
  webhookUrl?: string;
  redirectUrl?: string;
  completionMessage?: string;
  isActive: boolean;
  isDemoMode: boolean;
  jobs: ChatbotJobInput[];
  questions: ChatbotQuestionInput[];
};

export type CompanyChatbotRecord = CompanyChatbotInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  leadCount?: number;
  messageCount?: number;
};

export type CompanyChatbotWithSettings = CompanyChatbotRecord & {
  aiChatSettings: AiChatCompanySettings;
};

export const EMPTY_CHATBOT_JOB: ChatbotJobInput = {
  title: "",
  location: "",
  payRange: "",
  shift: "",
  employmentType: "Full-Time",
  requirements: "",
  applicationUrl: "",
  description: "",
  status: "OPEN",
};

export const EMPTY_CHATBOT_QUESTION: ChatbotQuestionInput = {
  questionText: "",
  questionType: "text",
  isRequired: true,
  isKnockout: false,
  isOptional: false,
  options: [],
  expectedAnswer: "",
  order: 1,
  conditionalLogic: "",
};

export const DEFAULT_COMPANY_CHATBOT_INPUT: CompanyChatbotInput = {
  companyName: "",
  companySlug: "",
  websiteUrl: "",
  industry: "",
  companyDescription: "",
  mainContactEmail: "",
  recruiterEmail: "",
  companyPhone: "",
  locationsServed: [],
  logoUrl: "",
  brandColor: "#0284c7",
  chatTitle: "Hirexa AI",
  chatSubtitle: "Candidate screening assistant",
  welcomeMessage:
    "Hi, I’m Hirexa AI. I can help screen you for open roles. Tell me what kind of work you’re looking for.",
  fallbackMessage:
    "Thanks. I’m still collecting a few job-relevant details so a recruiter can review your information.",
  tone: "friendly",
  greetingStyle: "warm",
  showAiDisclosure: true,
  useEmojis: false,
  answerLength: "concise",
  fallbackBehavior: "ask_one_follow_up",
  requiredCandidateFields: [...DEFAULT_REQUIRED_CANDIDATE_FIELDS],
  optionalCandidateFields: ["linkedinUrl", "certifications", "desiredPay"],
  requiredTransportation: "",
  requiredWorkAuthorization: "Authorized to work in the United States",
  requiredShiftAvailability: [],
  minimumYearsExperience: null,
  requiredCertifications: [],
  disqualifyingAnswers: [],
  candidateScoreThreshold: 70,
  saveLeadToDashboard: true,
  sendEmailNotification: false,
  webhookUrl: "",
  redirectUrl: "",
  completionMessage:
    "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions.",
  isActive: true,
  isDemoMode: true,
  jobs: [],
  questions: [],
};
