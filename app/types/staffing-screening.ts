import { z } from "zod";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";

export const STAFFING_WORK_TYPE_OPTIONS = [
  "Warehouse",
  "Manufacturing",
  "Forklift",
  "General Labor",
  "Assembly",
  "Packing / Shipping",
  "Office / Administrative",
  "Other",
] as const;

export const STAFFING_POSITION_TYPE_OPTIONS = [
  "Temporary",
  "Temp-to-Hire",
  "Full-Time",
  "Part-Time",
  "Direct Hire",
  "Open to Anything",
] as const;

export const STAFFING_SHIFT_OPTIONS = [
  "1st Shift",
  "2nd Shift",
  "3rd Shift",
  "Weekends",
  "Overtime",
  "Flexible",
] as const;

export const STAFFING_START_AVAILABILITY_OPTIONS = [
  "Today",
  "This Week",
  "Within 2 Weeks",
  "Later",
] as const;

export const STAFFING_TRANSPORTATION_OPTIONS = [
  "Yes",
  "No",
  "Depends on location",
] as const;

export const STAFFING_EXPERIENCE_OPTIONS = [
  "Forklift",
  "Assembly Line",
  "Picking / Packing",
  "Shipping / Receiving",
  "Machine Operation",
  "Quality Inspection",
  "General Labor",
  "None Yet",
] as const;

export const STAFFING_CONTACT_METHOD_OPTIONS = [
  "Text",
  "Phone Call",
  "Email",
  "Any",
] as const;

export type StaffingWorkType = (typeof STAFFING_WORK_TYPE_OPTIONS)[number];
export type StaffingPositionType = (typeof STAFFING_POSITION_TYPE_OPTIONS)[number];
export type StaffingShift = (typeof STAFFING_SHIFT_OPTIONS)[number];
export type StaffingStartAvailability =
  (typeof STAFFING_START_AVAILABILITY_OPTIONS)[number];
export type StaffingTransportation =
  (typeof STAFFING_TRANSPORTATION_OPTIONS)[number];
export type StaffingExperience = (typeof STAFFING_EXPERIENCE_OPTIONS)[number];
export type StaffingContactMethod =
  (typeof STAFFING_CONTACT_METHOD_OPTIONS)[number];
export type StaffingLeadTier = "Hot Lead" | "Good Lead" | "Needs Review" | "Low Fit";

export const staffingLeadDraftSchema = z
  .object({
    candidateName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(7).optional(),
    email: z.string().trim().email().optional(),
    preferredContactMethod: z.enum(STAFFING_CONTACT_METHOD_OPTIONS).optional(),
    desiredWorkTypes: z
      .array(z.enum(STAFFING_WORK_TYPE_OPTIONS))
      .min(1)
      .optional(),
    desiredJobType: z.enum(STAFFING_POSITION_TYPE_OPTIONS).optional(),
    shiftAvailability: z.array(z.enum(STAFFING_SHIFT_OPTIONS)).min(1).optional(),
    startAvailability: z.enum(STAFFING_START_AVAILABILITY_OPTIONS).optional(),
    transportationStatus: z.enum(STAFFING_TRANSPORTATION_OPTIONS).optional(),
    experience: z.array(z.enum(STAFFING_EXPERIENCE_OPTIONS)).min(1).optional(),
    desiredPayRange: z.string().trim().min(1).optional(),
    consentToContact: z.boolean().optional(),
  })
  .strict();

export const staffingScreeningLeadSchema = z
  .object({
    candidateName: z.string().trim().min(1, "Enter your name."),
    phone: z.string().trim().min(7, "Enter a phone number."),
    email: z.string().trim().email("Enter a valid email address."),
    preferredContactMethod: z.enum(STAFFING_CONTACT_METHOD_OPTIONS),
    desiredWorkTypes: z
      .array(z.enum(STAFFING_WORK_TYPE_OPTIONS))
      .min(1, "Select at least one work type."),
    desiredJobType: z.enum(STAFFING_POSITION_TYPE_OPTIONS),
    shiftAvailability: z
      .array(z.enum(STAFFING_SHIFT_OPTIONS))
      .min(1, "Select at least one shift."),
    startAvailability: z.enum(STAFFING_START_AVAILABILITY_OPTIONS),
    transportationStatus: z.enum(STAFFING_TRANSPORTATION_OPTIONS),
    experience: z
      .array(z.enum(STAFFING_EXPERIENCE_OPTIONS))
      .min(1, "Select at least one experience option."),
    desiredPayRange: z.string().trim().min(1, "Enter a pay range."),
    consentToContact: z.boolean(),
  })
  .strict();

export const staffingChatMessageSchema = z.object({
  role: z.enum(["assistant", "candidate"]),
  content: z.string().trim().min(1),
});

export const staffingLeadSubmissionSchema = staffingLeadDraftSchema
  .extend({
    companySlug: z.string().trim().min(1, "Company slug is required."),
    companyName: z.string().trim().min(1, "Company name is required."),
    companyLocation: z.string().trim().min(1).optional(),
    companyIndustry: z.string().trim().min(1).optional(),
    recruiterEmail: z.string().trim().email().optional(),
    sourcePage: z.string().trim().min(1).optional(),
    score: z.number().int().min(0).max(100).optional(),
    tier: z.string().trim().min(1).optional(),
    recommendedAction: z.string().trim().min(1).optional(),
    chatMessages: z.array(staffingChatMessageSchema).optional(),
  })
  .strict();

export type StaffingScreeningLeadInput = z.infer<
  typeof staffingScreeningLeadSchema
>;
export type StaffingLeadDraft = z.infer<typeof staffingLeadDraftSchema>;
export type StaffingChatMessage = z.infer<typeof staffingChatMessageSchema>;
export type StaffingLeadSubmissionInput = z.infer<
  typeof staffingLeadSubmissionSchema
>;

export type StaffingLeadScoreResult = {
  score: number;
  tier: StaffingLeadTier;
  recommendedAction: string;
};

export type StaffingLeadCompanyContext = {
  companySlug?: string;
  companyName?: string;
  companyLocation?: string;
  companyIndustry?: string;
  recruiterEmail?: string;
  sourcePage?: string;
};

export type StaffingLeadSummary = StaffingLeadDraft &
  StaffingLeadCompanyContext &
  StaffingLeadScoreResult;

export type StaffingLeadApiSuccess = StaffingLeadScoreResult & {
  ok: true;
  leadId: string;
  companySlug?: string;
  companyName?: string;
  sourcePage?: string;
};

export type StaffingLeadApiError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type StaffingAiChatResponse = {
  assistantMessage: string;
  leadDraft: StaffingLeadDraft;
  missingFields: string[];
  isComplete: boolean;
  completionSummary?: StaffingLeadSummary;
};

export type StaffingAiChatRequest = {
  messages: StaffingChatMessage[];
  leadDraft: StaffingLeadDraft;
  companySlug?: string;
  companySettings?: AiChatCompanySettings;
};
