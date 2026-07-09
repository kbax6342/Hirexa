import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import { STAFFING_REQUIRED_FIELDS } from "@/app/lib/staffing/getMissingStaffingFields";

function timestamp() {
  return new Date().toISOString();
}

function cloneSettings(settings: AiChatCompanySettings): AiChatCompanySettings {
  return JSON.parse(JSON.stringify(settings)) as AiChatCompanySettings;
}

const CHATBOT_PRIVACY_NOTICE =
  "By using this chatbot, you agree that the information you provide may be collected, saved, and reviewed by authorized hiring or staffing agency staff to respond to your inquiry, contact you, and help match you with potential job opportunities. - Privacy Policy";

export const SAFE_DEFAULT_COMPANY_CHAT_SETTINGS: AiChatCompanySettings = {
  id: "hirexa-safe-default-company",
  companyName: "Hirexa AI Demo Company",
  companySlug: "hirexa-ai-demo-company",
  companyWebsite: "https://hirexa.co/",
  companyDescription:
    "A configurable recruiting demo company used to preview Hirexa AI candidate screening experiences.",
  companyIndustry: "Hiring and Recruiting",
  companyLocation: "Metro Detroit",
  companyLogoUrl: "",
  brandPrimaryColor: "#0284c7",
  hiringFocus: "Job-relevant candidate screening for local hiring teams.",
  primaryRoles: ["Warehouse Associate", "Customer Support", "Administrative Assistant"],
  industries: ["Staffing", "Operations", "Support"],
  employmentTypes: ["Full-Time", "Part-Time", "Temporary"],
  shiftOptions: ["1st Shift", "Flexible"],
  locationCoverage: ["Metro Detroit"],
  desiredExperience: ["Customer service", "Operations support"],
  requiredQualifications: [],
  preferredQualifications: [],
  payRange: "$16-$24/hr depending on role",
  startAvailabilityOptions: ["Today", "This Week", "Within 2 Weeks", "Later"],
  transportationQuestionEnabled: true,
  recruiterName: "Hirexa Recruiting Team",
  recruiterEmail: "recruiting-demo@hirexa.co",
  recruiterPhone: "(313) 555-0100",
  leadNotificationEmail: "recruiting-demo@hirexa.co",
  leadDeliveryMethod: "mock",
  leadPriorityRules: ["Prioritize candidates who can start quickly and have complete contact information."],
  chatDisplayName: "Hirexa AI",
  welcomeMessage:
    "Hi, I’m Hirexa AI. I can help screen you for local hiring opportunities. Tell me what kind of work you’re looking for, and I’ll ask a few quick follow-ups.",
  assistantTone: "friendly",
  customInstructions:
    "Keep the conversation concise, helpful, and focused on job-relevant screening details.",
  fallbackMessage:
    "Thanks. I’m still collecting a few job-relevant details so a recruiter can review your information.",
  completionMessage:
    "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions.",
  complianceDisclaimer: CHATBOT_PRIVACY_NOTICE,
  requireConsentToContact: true,
  allowResumeUpload: false,
  allowJobRecommendations: true,
  allowRecruiterEscalation: false,
  requiredScreeningFields: [...STAFFING_REQUIRED_FIELDS],
  optionalScreeningFields: [],
  knockoutRules: [],
  scoringRules: [],
  publicChatEnabled: true,
  demoModeEnabled: true,
  embedScriptEnabled: false,
  allowedDomains: ["hirexa.co", "localhost"],
  createdAt: timestamp(),
  updatedAt: timestamp(),
};

export const DEFAULT_MINUTEMEN_CHAT_SETTINGS: AiChatCompanySettings = {
  id: "minutemen-staffing-demo",
  companyName: "Minutemen Staffing Demo",
  companySlug: "minutemen-staffing-demo",
  companyWebsite: "https://minutemenstaffing.com/",
  companyDescription:
    "A staffing company demo focused on helping job seekers connect with warehouse, manufacturing, light industrial, and general labor opportunities.",
  companyIndustry: "Staffing and Recruiting",
  companyLocation: "Dearborn / Metro Detroit",
  companyLogoUrl: "",
  brandPrimaryColor: "#dc2626",
  hiringFocus:
    "High-volume staffing screening for warehouse, manufacturing, and light industrial roles across Metro Detroit.",
  primaryRoles: [
    "Warehouse Associate",
    "Forklift Operator",
    "General Laborer",
    "Assembler",
    "Picker / Packer",
    "Shipping & Receiving",
  ],
  industries: [
    "Warehouse",
    "Manufacturing",
    "Light Industrial",
    "Distribution",
    "General Labor",
  ],
  employmentTypes: [
    "Temporary",
    "Temp-to-Hire",
    "Full-Time",
    "Part-Time",
    "Direct Hire",
  ],
  shiftOptions: [
    "1st Shift",
    "2nd Shift",
    "3rd Shift",
    "Weekends",
    "Overtime",
    "Flexible",
  ],
  locationCoverage: ["Dearborn", "Detroit", "Livonia", "Romulus", "Taylor", "Wayne"],
  desiredExperience: [
    "Forklift",
    "Assembly Line",
    "Picking / Packing",
    "Shipping / Receiving",
    "Machine Operation",
    "General Labor",
  ],
  requiredQualifications: ["Reliable transportation to Metro Detroit jobs."],
  preferredQualifications: ["Forklift certification", "Manufacturing or warehouse experience"],
  payRange: "$15-$22/hr depending on role and experience",
  startAvailabilityOptions: ["Today", "This Week", "Within 2 Weeks", "Later"],
  transportationQuestionEnabled: true,
  recruiterName: "Metro Detroit Branch Recruiting Team",
  recruiterEmail: "dearborn-demo@hirexa.co",
  recruiterPhone: "(313) 555-0111",
  leadNotificationEmail: "dearborn-demo@hirexa.co",
  leadDeliveryMethod: "mock",
  leadPriorityRules: [
    "Prioritize candidates who can start this week.",
    "Move forklift and shipping/receiving experience to the top of the queue.",
  ],
  chatDisplayName: "Hirexa AI",
  welcomeMessage:
    "Hi, I’m Hirexa AI. I can help screen you for staffing opportunities in the Dearborn and Metro Detroit area. Tell me what kind of work you’re looking for.",
  assistantTone: "friendly",
  customInstructions:
    "Reference staffing opportunities in Dearborn and Metro Detroit and keep the conversation recruiter-friendly.",
  fallbackMessage:
    "Thanks. I’m collecting a few more job-relevant details so a recruiter can review your staffing fit.",
  completionMessage:
    "Thanks — a recruiter can review this information and follow up. This AI chat does not make hiring decisions.",
  complianceDisclaimer: CHATBOT_PRIVACY_NOTICE,
  requireConsentToContact: true,
  allowResumeUpload: false,
  allowJobRecommendations: true,
  allowRecruiterEscalation: false,
  requiredScreeningFields: [...STAFFING_REQUIRED_FIELDS],
  optionalScreeningFields: [],
  knockoutRules: [],
  scoringRules: [],
  publicChatEnabled: true,
  demoModeEnabled: true,
  embedScriptEnabled: true,
  allowedDomains: ["hirexa.co", "localhost", "minutemenstaffing.com"],
  createdAt: timestamp(),
  updatedAt: timestamp(),
};

export const GREAT_LAKES_LOGISTICS_CHAT_SETTINGS: AiChatCompanySettings = {
  id: "great-lakes-logistics-demo",
  companyName: "Great Lakes Logistics Demo",
  companySlug: "great-lakes-logistics-demo",
  companyWebsite: "https://example.com/great-lakes-logistics-demo",
  companyDescription:
    "A logistics and distribution hiring demo focused on dependable warehouse, shipping, and forklift talent across Southeast Michigan.",
  companyIndustry: "Logistics and Distribution",
  companyLocation: "Romulus / Southeast Michigan",
  companyLogoUrl: "",
  brandPrimaryColor: "#0f766e",
  hiringFocus:
    "Distribution center screening for forklift, picking, shipping, and weekend warehouse coverage.",
  primaryRoles: [
    "Forklift Operator",
    "Order Picker",
    "Shipping Clerk",
    "Inventory Associate",
    "Warehouse Loader",
  ],
  industries: ["Logistics", "Warehouse", "Distribution", "Transportation Support"],
  employmentTypes: ["Full-Time", "Temp-to-Hire", "Part-Time"],
  shiftOptions: ["1st Shift", "2nd Shift", "Weekends", "Overtime", "Flexible"],
  locationCoverage: ["Romulus", "Taylor", "Belleville", "Ypsilanti"],
  desiredExperience: ["Forklift", "Shipping / Receiving", "Picking / Packing"],
  requiredQualifications: ["Able to work weekends or overtime when needed."],
  preferredQualifications: ["Forklift certification", "RF scanner experience"],
  payRange: "$18-$24/hr depending on certification and shift",
  startAvailabilityOptions: ["Today", "This Week", "Within 2 Weeks"],
  transportationQuestionEnabled: true,
  recruiterName: "Great Lakes Logistics Recruiting",
  recruiterEmail: "logistics-demo@hirexa.co",
  recruiterPhone: "(734) 555-0122",
  leadNotificationEmail: "logistics-demo@hirexa.co",
  leadDeliveryMethod: "mock",
  leadPriorityRules: [
    "Prioritize weekend and overtime availability.",
    "Forklift and shipping/receiving experience should increase urgency.",
  ],
  chatDisplayName: "Hirexa Logistics AI",
  welcomeMessage:
    "Hi, I’m Hirexa Logistics AI. I can help screen you for warehouse and distribution opportunities around Romulus and Southeast Michigan. Tell me what kind of work you want.",
  assistantTone: "professional",
  customInstructions:
    "Speak like a professional logistics recruiting coordinator and focus on reliability, shift flexibility, and warehouse readiness.",
  fallbackMessage:
    "Thanks. I’m still collecting a few logistics-related screening details for the recruiter.",
  completionMessage:
    "Thanks — our recruiting team can review this information and follow up. This AI chat does not make hiring decisions.",
  complianceDisclaimer:
    "This AI chat collects job-relevant screening details only. A recruiter reviews every lead before any hiring decision is made.",
  requireConsentToContact: true,
  allowResumeUpload: true,
  allowJobRecommendations: true,
  allowRecruiterEscalation: true,
  requiredScreeningFields: [...STAFFING_REQUIRED_FIELDS],
  optionalScreeningFields: [],
  knockoutRules: ["Candidates without transportation may need alternate location review."],
  scoringRules: ["Weekend and overtime availability should improve lead priority."],
  publicChatEnabled: true,
  demoModeEnabled: true,
  embedScriptEnabled: true,
  allowedDomains: ["hirexa.co", "localhost", "example.com"],
  createdAt: timestamp(),
  updatedAt: timestamp(),
};

export const SEEDED_COMPANY_CHAT_SETTINGS = [
  DEFAULT_MINUTEMEN_CHAT_SETTINGS,
  GREAT_LAKES_LOGISTICS_CHAT_SETTINGS,
] as const;

export function getDefaultCompanyChatSettings() {
  return cloneSettings(DEFAULT_MINUTEMEN_CHAT_SETTINGS);
}

export function getSafeDefaultCompanyChatSettings() {
  return cloneSettings(SAFE_DEFAULT_COMPANY_CHAT_SETTINGS);
}

export function getSeedCompanyChatSettings() {
  return SEEDED_COMPANY_CHAT_SETTINGS.map((settings) => cloneSettings(settings));
}
