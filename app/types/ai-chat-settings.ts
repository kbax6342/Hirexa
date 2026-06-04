import { z } from "zod";

export const AI_CHAT_ASSISTANT_TONES = [
  "friendly",
  "professional",
  "high-energy",
  "formal",
  "casual",
] as const;

export const AI_CHAT_LEAD_DELIVERY_METHODS = [
  "dashboard",
  "email",
  "webhook",
  "mock",
] as const;

export type AiChatCompanySettings = {
  id: string;
  companyName: string;
  companySlug: string;
  companyWebsite?: string;
  companyDescription?: string;
  companyIndustry?: string;
  companyLocation?: string;
  companyLogoUrl?: string;
  brandPrimaryColor?: string;
  hiringFocus?: string;
  primaryRoles: string[];
  industries: string[];
  employmentTypes: string[];
  shiftOptions: string[];
  locationCoverage?: string[];
  desiredExperience?: string[];
  requiredQualifications?: string[];
  preferredQualifications?: string[];
  payRange?: string;
  startAvailabilityOptions?: string[];
  transportationQuestionEnabled: boolean;
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  leadNotificationEmail?: string;
  leadDeliveryMethod?: "dashboard" | "email" | "webhook" | "mock";
  leadPriorityRules?: string[];
  chatDisplayName: string;
  chatTitle?: string;
  chatSubtitle?: string;
  welcomeMessage?: string;
  assistantTone?: "friendly" | "professional" | "high-energy" | "formal" | "casual";
  customInstructions?: string;
  fallbackMessage?: string;
  completionMessage?: string;
  complianceDisclaimer?: string;
  requireConsentToContact: boolean;
  allowResumeUpload: boolean;
  allowJobRecommendations: boolean;
  allowRecruiterEscalation: boolean;
  requiredScreeningFields: string[];
  optionalScreeningFields?: string[];
  knockoutRules?: string[];
  scoringRules?: string[];
  publicChatEnabled: boolean;
  demoModeEnabled: boolean;
  embedScriptEnabled: boolean;
  allowedDomains?: string[];
  createdAt?: string;
  updatedAt?: string;
};

const optionalTrimmedString = z.string().trim().optional();

export const aiChatCompanySettingsSchema = z
  .object({
    id: z.string().trim().min(1),
    companyName: z.string().trim().min(1),
    companySlug: z.string().trim().min(1),
    companyWebsite: optionalTrimmedString,
    companyDescription: optionalTrimmedString,
    companyIndustry: optionalTrimmedString,
    companyLocation: optionalTrimmedString,
    companyLogoUrl: optionalTrimmedString,
    brandPrimaryColor: optionalTrimmedString,
    hiringFocus: optionalTrimmedString,
    primaryRoles: z.array(z.string().trim()).default([]),
    industries: z.array(z.string().trim()).default([]),
    employmentTypes: z.array(z.string().trim()).default([]),
    shiftOptions: z.array(z.string().trim()).default([]),
    locationCoverage: z.array(z.string().trim()).optional(),
    desiredExperience: z.array(z.string().trim()).optional(),
    requiredQualifications: z.array(z.string().trim()).optional(),
    preferredQualifications: z.array(z.string().trim()).optional(),
    payRange: optionalTrimmedString,
    startAvailabilityOptions: z.array(z.string().trim()).optional(),
    transportationQuestionEnabled: z.boolean().default(true),
    recruiterName: optionalTrimmedString,
    recruiterEmail: optionalTrimmedString,
    recruiterPhone: optionalTrimmedString,
    leadNotificationEmail: optionalTrimmedString,
    leadDeliveryMethod: z.enum(AI_CHAT_LEAD_DELIVERY_METHODS).optional(),
    leadPriorityRules: z.array(z.string().trim()).optional(),
    chatDisplayName: z.string().trim().min(1),
    chatTitle: optionalTrimmedString,
    chatSubtitle: optionalTrimmedString,
    welcomeMessage: optionalTrimmedString,
    assistantTone: z.enum(AI_CHAT_ASSISTANT_TONES).optional(),
    customInstructions: optionalTrimmedString,
    fallbackMessage: optionalTrimmedString,
    completionMessage: optionalTrimmedString,
    complianceDisclaimer: optionalTrimmedString,
    requireConsentToContact: z.boolean().default(true),
    allowResumeUpload: z.boolean().default(false),
    allowJobRecommendations: z.boolean().default(false),
    allowRecruiterEscalation: z.boolean().default(false),
    requiredScreeningFields: z.array(z.string().trim()).default([]),
    optionalScreeningFields: z.array(z.string().trim()).optional(),
    knockoutRules: z.array(z.string().trim()).optional(),
    scoringRules: z.array(z.string().trim()).optional(),
    publicChatEnabled: z.boolean().default(true),
    demoModeEnabled: z.boolean().default(true),
    embedScriptEnabled: z.boolean().default(false),
    allowedDomains: z.array(z.string().trim()).optional(),
    createdAt: optionalTrimmedString,
    updatedAt: optionalTrimmedString,
  })
  .strict();

export type AiChatAssistantTone = (typeof AI_CHAT_ASSISTANT_TONES)[number];
export type AiChatLeadDeliveryMethod =
  (typeof AI_CHAT_LEAD_DELIVERY_METHODS)[number];
