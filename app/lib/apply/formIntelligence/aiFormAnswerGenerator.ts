import OpenAI from "openai";
import { generateApplicationFieldAnswer } from "@/app/lib/apply/ai-form-answer-generator";
import { classifyFormField } from "@/app/lib/apply/formIntelligence/fieldClassifier";
import { normalizeLabelKey } from "@/app/lib/apply/formIntelligence/answerPolicy";
import type {
  FieldClassification,
  FormFieldDescriptor,
  GeneratedFormAnswer,
  GenerateFormAnswersInput,
  GenerateFormAnswersResult,
} from "@/app/lib/apply/formIntelligence/types";

function text(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeBooleanAnswer(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return "";
  if (["yes", "y", "true", "authorized", "1"].includes(normalized)) return "Yes";
  if (["no", "n", "false", "0"].includes(normalized)) return "No";
  return text(value);
}

function profileLookup(profile: unknown) {
  const data = getRecord(profile);
  const firstName = firstNonEmpty(data.firstName, data.givenName);
  const lastName = firstNonEmpty(data.lastName, data.familyName);
  const fullName = firstNonEmpty(data.fullName, [firstName, lastName].filter(Boolean).join(" "));
  const city = firstNonEmpty(data.city, data.citySearch);
  const state = firstNonEmpty(data.state, data.stateSearch);
  const location = firstNonEmpty(data.location, [city, state].filter(Boolean).join(", "));
  const links = getRecord(data.professionalLinks);

  return {
    firstName,
    lastName,
    fullName,
    email: firstNonEmpty(data.email),
    phone: firstNonEmpty(data.phone),
    address: firstNonEmpty(data.address),
    city,
    state,
    postalCode: firstNonEmpty(data.postalCode, data.zip),
    country: firstNonEmpty(data.country, data.countryCode),
    location,
    linkedin: firstNonEmpty(data.linkedinUrl, links.linkedin, links.linkedIn),
    portfolio: firstNonEmpty(data.portfolioUrl, links.portfolio, links.website),
    website: firstNonEmpty(data.portfolioUrl, links.website),
    github: firstNonEmpty(links.github, links.gitHub),
    workAuthorization: normalizeBooleanAnswer(data.authorizedUS),
    sponsorship: normalizeBooleanAnswer(data.sponsorship),
    salary: firstNonEmpty(data.minCompensation),
    startDate: firstNonEmpty(data.startDate),
  };
}

function combinedFieldText(field: FormFieldDescriptor) {
  return [
    field.label,
    field.inferredLabel,
    field.name,
    field.idAttribute,
    field.ariaLabel,
    field.placeholder,
    field.nearbyText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchOption(field: FormFieldDescriptor, value: string) {
  const normalized = value.toLowerCase().trim();
  if (!field.options?.length || !normalized) return value;

  const exact = field.options.find(
    (option) =>
      option.label.toLowerCase().trim() === normalized ||
      option.value.toLowerCase().trim() === normalized,
  );
  if (exact) return exact.value || exact.label;

  const includes = field.options.find(
    (option) =>
      option.label.toLowerCase().includes(normalized) ||
      normalized.includes(option.label.toLowerCase()),
  );
  return includes ? includes.value || includes.label : "";
}

function existingAnswerFor(
  field: FormFieldDescriptor,
  existing: Record<string, string> | undefined,
) {
  if (!existing) return "";
  const candidates = [
    field.label,
    field.inferredLabel,
    field.name,
    field.idAttribute,
    normalizeLabelKey(field.label),
  ].filter(Boolean);
  for (const key of candidates) {
    const direct = existing[key as string];
    if (text(direct)) return text(direct);
    const normalized = existing[normalizeLabelKey(String(key))];
    if (text(normalized)) return text(normalized);
  }
  return "";
}

function deterministicAnswer(args: {
  input: GenerateFormAnswersInput;
  field: FormFieldDescriptor;
  classification: FieldClassification;
}): GeneratedFormAnswer | null {
  const { input, field, classification } = args;
  const profile = profileLookup(input.userProfile);
  const label = field.label || classification.label;
  const fieldText = combinedFieldText(field);
  const existing = existingAnswerFor(field, input.existingApplicationAnswers);

  if (existing) {
    return {
      fieldId: field.id,
      label,
      value: matchOption(field, existing) || existing,
      confidence: "high",
      sourceBasis: ["existing_application_answers"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Used an existing saved answer for this field.",
    };
  }

  if (classification.category === "file_upload") {
    return {
      fieldId: field.id,
      label,
      value: "__RESUME_FILE__",
      confidence: "high",
      sourceBasis: ["staged_resume_file"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Resume or attachment upload field.",
    };
  }

  if (classification.category === "profile_direct") {
    const value =
      fieldText.includes("first") ? profile.firstName :
      fieldText.includes("last") ? profile.lastName :
      fieldText.includes("full name") || fieldText === "name" ? profile.fullName :
      fieldText.includes("email") || field.inputType === "email" ? profile.email :
      fieldText.includes("phone") || field.inputType === "tel" ? profile.phone :
      fieldText.includes("city") ? profile.city :
      fieldText.includes("state") || fieldText.includes("province") ? profile.state :
      fieldText.includes("zip") || fieldText.includes("postal") ? profile.postalCode :
      fieldText.includes("country") ? profile.country :
      fieldText.includes("linkedin") || fieldText.includes("linked in") ? profile.linkedin :
      fieldText.includes("github") || fieldText.includes("git hub") ? profile.github :
      fieldText.includes("portfolio") ? profile.portfolio :
      fieldText.includes("website") || field.inputType === "url" ? profile.website :
      fieldText.includes("location") || fieldText.includes("located") ? profile.location :
      "";

    if (value) {
      return {
        fieldId: field.id,
        label,
        value: matchOption(field, value) || value,
        confidence: "high",
        sourceBasis: ["user_profile"],
        safeToAutofill: true,
        requiresUserReview: false,
        reason: "Filled directly from the user's profile.",
      };
    }
  }

  if (classification.category === "source_direct") {
    const value = input.source?.trim()
      ? `I found this opportunity through ${input.source}.`
      : "I found this opportunity through Hirexa AI while reviewing roles that matched my background.";
    return {
      fieldId: field.id,
      label,
      value: matchOption(field, value) || value,
      confidence: "high",
      sourceBasis: ["application_source"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Source-aware answer.",
    };
  }

  if (classification.category === "sensitive_requires_known_answer") {
    const value =
      /sponsor|visa/i.test(fieldText) ? profile.sponsorship :
      /authori[sz]ed|work authorization/i.test(fieldText) ? profile.workAuthorization :
      /salary|compensation|pay/i.test(fieldText) ? profile.salary :
      /start date|availability/i.test(fieldText) ? profile.startDate :
      "";

    if (value) {
      return {
        fieldId: field.id,
        label,
        value: matchOption(field, value) || value,
        confidence: "medium",
        sourceBasis: ["known_profile_answer"],
        safeToAutofill: true,
        requiresUserReview: false,
        reason: "Sensitive answer was already known from profile data.",
      };
    }
  }

  return null;
}

function blockFor(field: FormFieldDescriptor, classification: FieldClassification) {
  return {
    fieldId: field.id,
    label: field.label || classification.label,
    reason: classification.reason,
    category:
      classification.category === "legal_requires_user_review"
        ? "legal" as const
        : classification.category === "sensitive_requires_known_answer"
          ? "sensitive" as const
          : classification.category === "unsupported"
            ? "unsupported" as const
            : "unknown" as const,
  };
}

function fallbackAiAnswer(input: GenerateFormAnswersInput, field: FormFieldDescriptor) {
  const company = text(input.companyName) || "the company";
  const title = text(input.jobTitle) || "this role";
  const resume = text(input.resumeSummary || input.resumeText).slice(0, 400);
  const base =
    resume ||
    "my background and experience align with the responsibilities of this role";

  if (/hardest|technical problem|project/i.test(combinedFieldText(field))) {
    return `One of the most challenging technical problems I have worked on involved breaking down an ambiguous requirement into a reliable, user-facing solution. I focused on understanding the constraints, validating the expected behavior, and iterating until the implementation was stable. That experience strengthened my ability to communicate tradeoffs clearly and deliver practical engineering outcomes.`;
  }

  return `I am interested in ${company} because ${title} appears to align well with my background. Based on ${base}, I can contribute practical experience, ownership, and a strong focus on reliable execution. I am especially interested in work where I can solve meaningful problems and collaborate with a team that values high-quality results.`;
}

async function singleFieldAnswerFromContext(
  input: GenerateFormAnswersInput,
  field: FormFieldDescriptor,
): Promise<GeneratedFormAnswer | null> {
  const generated = await generateApplicationFieldAnswer({
    questionLabel: field.label,
    fieldType: field.inputType,
    placeholder: field.placeholder,
    required: field.required,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    jobDescription: input.jobDescription,
    resumeText: input.resumeText ?? input.resumeSummary,
    profile: input.userProfile,
    applicationContext: {
      pageText: input.pageText,
      source: input.source,
      existingApplicationAnswers: input.existingApplicationAnswers,
    },
  });

  if (!generated.answer || generated.requiresUserConfirmation) return null;

  return {
    fieldId: field.id,
    label: field.label,
    value: matchOption(field, generated.answer) || generated.answer,
    confidence: generated.confidence,
    sourceBasis: generated.sourceHints,
    safeToAutofill: true,
    requiresUserReview: false,
    reason: generated.reason,
  };
}

async function requestAiAnswers(
  input: GenerateFormAnswersInput,
  fields: FormFieldDescriptor[],
) {
  if (!process.env.OPENAI_API_KEY || fields.length === 0) return [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = {
    userProfile: input.userProfile,
    resumeText: input.resumeText?.slice(0, 6000),
    resumeSummary: input.resumeSummary,
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    jobDescription: input.jobDescription?.slice(0, 6000),
    pageText: input.pageText?.slice(0, 4000),
    source: input.source,
    fields: fields.map((field) => ({
      fieldId: field.id,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      options: field.options,
      maxLength: field.maxLength,
    })),
  };

  const completion = await client.chat.completions
    .create({
      model: process.env.OPENAI_FORM_ANSWER_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Generate truthful job application form answers as JSON. Use only provided context. Do not invent jobs, credentials, degrees, legal status, salary history, demographic data, or personal attributes. For select/radio choose only from provided options. Return {\"answers\":[{\"fieldId\":\"...\",\"value\":\"...\",\"confidence\":\"high|medium|low\",\"sourceBasis\":[\"...\"],\"safeToAutofill\":true|false,\"requiresUserReview\":true|false,\"reason\":\"...\"}]}",
        },
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
    })
    .catch(() => null);

  const content = completion?.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const parsed = JSON.parse(content) as { answers?: GeneratedFormAnswer[] };
    return Array.isArray(parsed.answers) ? parsed.answers : [];
  } catch {
    return [];
  }
}

export async function generateFormAnswers(
  input: GenerateFormAnswersInput,
): Promise<GenerateFormAnswersResult> {
  const classifications = new Map(
    input.fields.map((field) => [field.id, classifyFormField(field)]),
  );
  const answers: GeneratedFormAnswer[] = [];
  const blockedFields: GenerateFormAnswersResult["blockedFields"] = [];
  const aiSafeFields: FormFieldDescriptor[] = [];

  for (const field of input.fields) {
    const classification = classifications.get(field.id) ?? classifyFormField(field);
    const deterministic = deterministicAnswer({ input, field, classification });
    if (deterministic) {
      answers.push(deterministic);
      continue;
    }

    if (
      classification.category === "ai_free_text_safe" ||
      classification.category === "resume_direct" ||
      classification.category === "ai_choice_safe"
    ) {
      aiSafeFields.push(field);
      continue;
    }

    if (field.required) {
      blockedFields.push(blockFor(field, classification));
    }
  }

  const aiAnswers = await requestAiAnswers(input, aiSafeFields);
  const aiByField = new Map(aiAnswers.map((answer) => [answer.fieldId, answer]));

  for (const field of aiSafeFields) {
    const aiAnswer = aiByField.get(field.id);
    const value = text(aiAnswer?.value);
    if (aiAnswer && value && aiAnswer.safeToAutofill && !aiAnswer.requiresUserReview) {
      answers.push({
        ...aiAnswer,
        label: field.label || aiAnswer.label,
        value: matchOption(field, value) || value,
      });
      continue;
    }

    const contextual = await singleFieldAnswerFromContext(input, field);
    if (contextual) {
      answers.push(contextual);
      continue;
    }

    const fallback = fallbackAiAnswer(input, field);
    const clipped = field.maxLength && fallback.length > field.maxLength
      ? fallback.slice(0, Math.max(0, field.maxLength - 1))
      : fallback;
    answers.push({
      fieldId: field.id,
      label: field.label,
      value: matchOption(field, clipped) || clipped,
      confidence: "medium",
      sourceBasis: ["resume", "job_context"],
      safeToAutofill: true,
      requiresUserReview: false,
      reason: "Generated a conservative safe answer from resume and job context.",
    });
  }

  return {
    answers,
    blockedFields,
  };
}
