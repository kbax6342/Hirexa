import OpenAI from "openai";
import {
  classifyRequiredApplicationField,
  type RequiredApplicationFieldClassification,
} from "@/app/lib/apply/form-field-classifier";

export type GenerateApplicationFieldAnswerInput = {
  questionLabel: string;
  fieldType?: string;
  placeholder?: string;
  required?: boolean;
  jobTitle?: string | null;
  companyName?: string | null;
  jobDescription?: string | null;
  resumeText?: string | null;
  profile?: unknown;
  applicationContext?: unknown;
};

export type GenerateApplicationFieldAnswerResult = {
  answer: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  sourceHints: string[];
  classification?: RequiredApplicationFieldClassification;
  requiresUserConfirmation?: boolean;
};

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function first(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function profileLookup(profile: unknown) {
  const data = record(profile);
  const links = record(data.professionalLinks);
  const city = first(data.city, data.citySearch);
  const state = first(data.state, data.stateSearch);
  const location = first(data.location, [city, state].filter(Boolean).join(", "));

  return {
    firstName: first(data.firstName, data.givenName),
    lastName: first(data.lastName, data.familyName),
    fullName: first(
      data.fullName,
      [data.firstName, data.lastName].map(text).filter(Boolean).join(" "),
    ),
    email: first(data.email),
    phone: first(data.phone),
    city,
    state,
    postalCode: first(data.postalCode, data.postalCodeSearch, data.zip),
    country: first(data.country, data.countryCode),
    location,
    linkedin: first(data.linkedinUrl, links.linkedin, links.linkedIn),
    portfolio: first(data.portfolioUrl, links.portfolio, links.website),
    website: first(data.portfolioUrl, links.website),
    github: first(links.github, links.gitHub),
    salary: first(data.minCompensation),
    workAuthorization: first(data.authorizedUS),
    sponsorship: first(data.sponsorship),
    startDate: first(data.startDate),
    relocate: first(data.relocate),
  };
}

function combinedQuestion(input: GenerateApplicationFieldAnswerInput) {
  return [
    input.questionLabel,
    input.placeholder,
    input.fieldType,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function directProfileAnswer(
  input: GenerateApplicationFieldAnswerInput,
): GenerateApplicationFieldAnswerResult | null {
  const profile = profileLookup(input.profile);
  const question = combinedQuestion(input);
  const sourceHints = ["profile"];

  const answer =
    question.includes("first") ? profile.firstName :
    question.includes("last") ? profile.lastName :
    question.includes("full name") || question === "name" ? profile.fullName :
    question.includes("email") || input.fieldType === "email" ? profile.email :
    question.includes("phone") || input.fieldType === "tel" ? profile.phone :
    question.includes("city") ? profile.city :
    question.includes("state") || question.includes("province") ? profile.state :
    question.includes("zip") || question.includes("postal") ? profile.postalCode :
    question.includes("country") ? profile.country :
    question.includes("linkedin") || question.includes("linked in") ? profile.linkedin :
    question.includes("github") || question.includes("git hub") ? profile.github :
    question.includes("portfolio") ? profile.portfolio :
    question.includes("website") || input.fieldType === "url" ? profile.website :
    question.includes("salary") || question.includes("compensation") ? profile.salary :
    question.includes("start date") || question.includes("availability") ? profile.startDate :
    question.includes("location") || question.includes("located") ? profile.location :
    question.includes("remote") || question.includes("hybrid") || question.includes("onsite") ? profile.relocate :
    question.includes("authori") || question.includes("work authorization") ? profile.workAuthorization :
    question.includes("sponsor") || question.includes("visa") ? profile.sponsorship :
    "";

  if (!answer && (question.includes("location") || question.includes("located"))) {
    return {
      answer:
        "I am based in the United States and open to discussing location or remote work requirements.",
      confidence: "medium",
      reason: "No precise saved location was available, so used a safe broad location answer.",
      sourceHints,
    };
  }

  if (!answer) return null;

  return {
    answer,
    confidence: "high",
    reason: "Answered directly from saved profile data.",
    sourceHints,
  };
}

function sourceAnswer(
  input: GenerateApplicationFieldAnswerInput,
): GenerateApplicationFieldAnswerResult {
  const context = record(input.applicationContext);
  const source = first(context.source, context.applySource);
  return {
    answer: source
      ? `I found this opportunity through ${source}.`
      : "I found this opportunity while researching roles that align with my software development background and interest in AI-driven products.",
    confidence: "high",
    reason: "Used a safe source-aware answer.",
    sourceHints: source ? ["application_source"] : ["safe_default"],
  };
}

function fallbackOpenEndedAnswer(
  input: GenerateApplicationFieldAnswerInput,
): GenerateApplicationFieldAnswerResult {
  const question = combinedQuestion(input);
  const company = text(input.companyName) || "the company";
  const role = text(input.jobTitle) || "this role";
  const resumeBasis = text(input.resumeText).slice(0, 500);
  const descriptionBasis = text(input.jobDescription).slice(0, 500);
  const basis = resumeBasis || descriptionBasis || "my background and interests";
  const sourceHints = [
    input.resumeText ? "resume" : "",
    input.jobDescription ? "job_description" : "",
    input.companyName ? "company_name" : "",
    input.jobTitle ? "job_title" : "",
  ].filter(Boolean);

  if (/hardest|technical problem|challenge|project/i.test(question)) {
    return {
      answer:
        `One of the hardest technical problems I have worked on involved turning an ambiguous workflow into a reliable software system. I had to break the problem into smaller pieces, understand the data and integration constraints, and build a solution that handled real user edge cases. Based on ${basis}, that experience strengthened how I design practical systems, validate behavior, and communicate tradeoffs clearly. I would bring that same approach to ${role}, especially where reliability and user impact matter.`,
      confidence: resumeBasis ? "medium" : "low",
      reason:
        "Generated a conservative technical-project answer without adding unsupported metrics or employer claims.",
      sourceHints,
    };
  }

  if (/tell us about yourself|about yourself/i.test(question)) {
    return {
      answer:
        `I am a software-focused candidate with experience building practical, user-facing solutions and working across product, automation, and application workflows. My background aligns with ${role} because it combines technical execution with attention to reliability and user experience. I am interested in opportunities where I can solve meaningful problems, collaborate well, and keep improving systems that people depend on.`,
      confidence: "medium",
      reason: "Generated a concise professional summary from role and profile context.",
      sourceHints,
    };
  }

  return {
    answer:
      `I am interested in ${company} because ${role} appears to align well with my background and the kind of software work I want to do. Based on ${basis}, I can contribute practical engineering experience, ownership, and a strong focus on reliable execution. I am especially interested in work where useful products, thoughtful automation, and measurable user value come together. This role looks like an opportunity to apply my strengths while continuing to grow with a team building meaningful software.`,
    confidence: "medium",
    reason: "Generated a safe role-interest answer from company, role, resume, and job context.",
    sourceHints,
  };
}

async function aiOpenEndedAnswer(
  input: GenerateApplicationFieldAnswerInput,
): Promise<GenerateApplicationFieldAnswerResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions
    .create({
      model: process.env.OPENAI_FORM_ANSWER_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Answer one job application field as the applicant. Use only provided profile, resume, job, company, and application context. Do not invent jobs, credentials, degrees, employers, citizenship, legal status, salary expectations, demographic data, metrics, or personal attributes. Return JSON: {\"answer\":\"...\",\"confidence\":\"high|medium|low\",\"reason\":\"...\",\"sourceHints\":[\"...\"]}.",
        },
        {
          role: "user",
          content: JSON.stringify({
            questionLabel: input.questionLabel,
            fieldType: input.fieldType,
            placeholder: input.placeholder,
            required: input.required,
            jobTitle: input.jobTitle,
            companyName: input.companyName,
            jobDescription: input.jobDescription?.slice(0, 5000),
            resumeText: input.resumeText?.slice(0, 5000),
            profile: input.profile,
            applicationContext: input.applicationContext,
          }),
        },
      ],
    })
    .catch(() => null);

  const content = completion?.choices[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as Partial<GenerateApplicationFieldAnswerResult>;
    const answer = text(parsed.answer);
    if (!answer || parsed.requiresUserConfirmation) return null;
    return {
      answer,
      confidence:
        parsed.confidence === "high" || parsed.confidence === "low"
          ? parsed.confidence
          : "medium",
      reason: text(parsed.reason) || "Generated by AI from provided application context.",
      sourceHints: Array.isArray(parsed.sourceHints)
        ? parsed.sourceHints.map(text).filter(Boolean)
        : ["ai_context"],
    };
  } catch {
    return null;
  }
}

export async function generateApplicationFieldAnswer(
  input: GenerateApplicationFieldAnswerInput,
): Promise<GenerateApplicationFieldAnswerResult> {
  const classification = classifyRequiredApplicationField({
    questionLabel: input.questionLabel,
    fieldType: input.fieldType,
    placeholder: input.placeholder,
    required: input.required,
  });
  const question = combinedQuestion(input);

  if (
    classification.category === "requires_user_confirmation" ||
    classification.category === "unsupported_field"
  ) {
    const known = directProfileAnswer(input);
    if (known && classification.sensitive && !classification.legal) {
      return {
        ...known,
        classification: classification.category,
      };
    }

    return {
      answer: "",
      confidence: "low",
      reason: classification.reason,
      sourceHints: [],
      classification: classification.category,
      requiresUserConfirmation: true,
    };
  }

  if (/how did you hear|where did you hear|found this opportunity|source/i.test(question)) {
    return {
      ...sourceAnswer(input),
      classification: classification.category,
    };
  }

  const profileAnswer = directProfileAnswer(input);
  if (profileAnswer) {
    return {
      ...profileAnswer,
      classification: classification.category,
    };
  }

  const aiAnswer = await aiOpenEndedAnswer(input);
  if (aiAnswer && aiAnswer.confidence !== "low") {
    return {
      ...aiAnswer,
      classification: classification.category,
    };
  }

  return {
    ...fallbackOpenEndedAnswer(input),
    classification: classification.category,
  };
}
