import { getSafeDefaultCompanyChatSettings } from "@/app/lib/ai-chat/defaultCompanyChatSettings";
import type { AiChatCompanySettings } from "@/app/types/ai-chat-settings";
import {
  DEFAULT_COMPANY_CHATBOT_INPUT,
  type CompanyChatbotInput,
  type CompanyChatbotRecord,
} from "@/lib/chatbot/types";

export const HOMEPAGE_COMPANY_CHATBOT_SLUG = "hirexa-ai-homepage";

export function getHomepageAiChatCompanySettings(): AiChatCompanySettings {
  return {
    ...getSafeDefaultCompanyChatSettings(),
    id: "hirexa-ai-homepage-chat",
    companyName: "Hirexa AI",
    companySlug: HOMEPAGE_COMPANY_CHATBOT_SLUG,
    companyWebsite: "https://hirexa.co/",
    companyDescription:
      "Hirexa AI helps job seekers discover better-fit roles, strengthen application materials, and move through the job search with practical AI support.",
    companyIndustry: "AI job search",
    companyLocation: "United States",
    companyLogoUrl: "/branding/staffing-chat-avatar.png",
    brandPrimaryColor: "#0284c7",
    chatDisplayName: "Hirexa AI",
    chatTitle: "Hirexa AI",
    chatSubtitle: "Hirexa AI",
    welcomeMessage:
      "Hi, I'm Hirexa AI. Tell me what kind of role you're looking for, and I'll help collect the key details.",
    fallbackMessage:
      "Thanks. I'm still gathering a few job-search details so Hirexa can better understand what you need.",
    completionMessage:
      "Thanks - Hirexa can use this information to guide the next step in your job search.",
  };
}

export function getHomepageCompanyChatbotInput(): CompanyChatbotInput {
  const settings = getHomepageAiChatCompanySettings();

  return {
    ...DEFAULT_COMPANY_CHATBOT_INPUT,
    companyName: settings.companyName,
    companySlug: settings.companySlug,
    websiteUrl: settings.companyWebsite,
    industry: settings.companyIndustry,
    companyDescription: settings.companyDescription,
    mainContactEmail: "support@hirexa.co",
    recruiterEmail: settings.recruiterEmail,
    companyPhone: settings.recruiterPhone,
    locationsServed: settings.locationCoverage ?? ["United States"],
    logoUrl: settings.companyLogoUrl,
    brandColor: settings.brandPrimaryColor,
    chatTitle: settings.chatTitle,
    chatSubtitle: settings.chatSubtitle,
    welcomeMessage: settings.welcomeMessage,
    fallbackMessage: settings.fallbackMessage,
    tone: settings.assistantTone ?? "friendly",
    greetingStyle: "warm",
    answerLength: "concise",
    fallbackBehavior: "ask_one_follow_up",
    requiredCandidateFields: [
      "firstName",
      "lastName",
      "email",
      "desiredJobType",
      "availability",
      "workExperience",
    ],
    optionalCandidateFields: ["linkedinUrl", "desiredPay", "startDate"],
    completionMessage: settings.completionMessage,
    isActive: true,
    isDemoMode: true,
  };
}

export function getHomepageCompanyChatbotRecord(): CompanyChatbotRecord {
  const timestamp = new Date().toISOString();

  return {
    ...getHomepageCompanyChatbotInput(),
    id: "homepage-company-chatbot-draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    leadCount: 0,
    messageCount: 0,
  };
}
