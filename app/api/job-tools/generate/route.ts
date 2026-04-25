import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import { auth } from "@/app/lib/auth";
import { getHirexaAccessForUser } from "@/app/lib/billing/getHirexaAccess";
import { consumeHirePilotCredits } from "@/app/lib/hirepilot/credits";
import { prisma } from "@/app/lib/prisma";
import {
  getSafePrivateProfileFields,
  readRawPrivateProfileFieldsByIds,
} from "@/app/lib/profile/privateProfileFields";
import {
  extractResumeTextFromBuffer,
  extractResumeTextFromStoredFile,
  persistResumeToProfile,
} from "@/app/lib/resume/persistResumeToProfile";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Tone = "professional" | "friendly" | "bold";
type LlmProvider = "auto" | "openai" | "claude" | "gemini";
const SUPPORTED_LLM_PROVIDERS = new Set<LlmProvider>([
  "auto",
  "openai",
  "claude",
  "gemini",
]);

type GeneratePayload = {
  url: string;
  resumeText: string | null;
  tone: Tone;
  focusAreas: string[];
  instructions: string | null;
  pastedJobText: string | null;
  resumeFile: File | null;
  usageKey: string | null;
  llmProvider: LlmProvider;
  modelProvider: LlmProvider;
};

type GeneratedDocumentPayload = {
  job?: {
    title?: string;
    company?: string;
    location?: string;
    summary?: string;
    keyRequirements?: string[];
  };
  coverLetter?: string;
  fullResumeText?: string;
  resumeUpdates?: {
    summaryRewrite?: string;
    skillsToAdd?: string[];
    bulletEdits?: Array<{ section: string; before: string; after: string }>;
    atsKeywords?: string[];
  };
  emails?: {
    beforeInterview?: string;
    afterInterview?: string;
  };
};

const generateProfileSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  linkedinUrl: true,
  portfolioUrl: true,
  startDate: true,
  minCompensation: true,
  compensationType: true,
  includeRemote: true,
  workplaceLocations: true,
  keyQuestions: true,
  skills: true,
  resumeSkills: true,
  jobInterests: {
    orderBy: { id: "asc" },
    take: 6,
    select: {
      title: true,
    },
  },
  benefitSelections: {
    orderBy: { updatedAt: "desc" },
    take: 2,
    select: {
      selectedPlan: true,
      benefits: true,
    },
  },
  resumeFiles: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      blob: true,
    },
  },
  resume: {
    select: {
      filename: true,
      mimeType: true,
      updatedAt: true,
      resumeExperiences: {
        select: {
          experiences: true,
        },
      },
      experiences: {
        orderBy: { order: "asc" },
        select: {
          title: true,
          company: true,
          location: true,
          dateRange: true,
          bullets: {
            orderBy: { order: "asc" },
            take: 5,
            select: {
              text: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserProfileSelect;

type GenerateProfile = Prisma.UserProfileGetPayload<{
  select: typeof generateProfileSelect;
}>;

type CandidateExperienceItem = {
  title: string;
  company: string;
  location: string | null;
  dateRange: string | null;
  bullets: string[];
};

type CandidateContext = {
  candidateProfile: {
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    linkedinUrl: string | null;
    portfolioUrl: string | null;
  };
  candidateResumeSource: {
    uploadedResumeText: string | null;
    savedResumeText: string | null;
    combinedResumeText: string | null;
    savedResumeMetadata: {
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      createdAt: string | null;
    } | null;
  };
  candidateExperience: CandidateExperienceItem[];
  candidateSignals: {
    targetRole: string | null;
    savedTargetRoles: string[];
    preferredLocations: string[];
    compensation: string | null;
    availability: string | null;
    includeRemote: boolean | null;
    skills: string[];
    preferences: string[];
  };
};

function trimText(value: unknown, maxLength = 1200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeLlmProvider(value: unknown): LlmProvider {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase() as LlmProvider;
  return SUPPORTED_LLM_PROVIDERS.has(normalized) ? normalized : "auto";
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = trimText(value);
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeList(value: unknown, maxItems = 8) {
  return Array.isArray(value)
    ? dedupeStrings(value.map((item) => trimText(item))).slice(0, maxItems)
    : [];
}

function readRoleFocus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const roleFocus = trimText((value as { roleFocus?: string | null }).roleFocus);
  return roleFocus || null;
}

function readWorkplaceLocations(value: unknown) {
  if (!Array.isArray(value)) return [];

  return dedupeStrings(
    value.map((item) =>
      item && typeof item === "object"
        ? trimText((item as { label?: string | null }).label)
        : ""
    )
  ).slice(0, 4);
}

function formatCompensation(amount?: number | null, compensationType?: string | null) {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return null;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);

  const suffix =
    compensationType === "hourly"
      ? "/hour"
      : compensationType === "monthly"
        ? "/month"
        : compensationType === "weekly"
          ? "/week"
          : "/year";

  return `${formatted}${suffix}`;
}

function parseResumeExperiencesJson(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const title = trimText(raw.title || raw.role || raw.position) || "Role";
      const company = trimText(raw.company || raw.employer) || "Company";
      const location = trimText(raw.location) || null;
      const dateRange = trimText(raw.dateRange || raw.dates || raw.duration) || null;
      const bullets = normalizeList(raw.bullets || raw.highlights || raw.achievements, 5);

      return {
        title,
        company,
        location,
        dateRange,
        bullets,
      } satisfies CandidateExperienceItem;
    })
    .filter((item): item is CandidateExperienceItem => Boolean(item));
}

function collectCandidateExperience(profile: GenerateProfile | null) {
  const structuredExperiences = (profile?.resume?.experiences ?? []).map((item) => ({
    title: trimText(item.title) || "Role",
    company: trimText(item.company) || "Company",
    location: trimText(item.location) || null,
    dateRange: trimText(item.dateRange) || null,
    bullets: dedupeStrings(item.bullets.map((bullet) => trimText(bullet.text))).slice(0, 5),
  }));

  if (structuredExperiences.length > 0) {
    return structuredExperiences;
  }

  return parseResumeExperiencesJson(profile?.resume?.resumeExperiences?.experiences);
}

function cleanText(s: string) {
  return s
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractJsonLdText($: cheerio.CheerioAPI) {
  const chunks: string[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const title = item?.title || item?.jobTitle || "";
        const description = item?.description || "";
        const company = item?.hiringOrganization?.name || "";
        const location = item?.jobLocation?.address?.addressLocality || item?.jobLocation?.name || "";
        const qualifications = item?.qualifications || "";
        const responsibilities = item?.responsibilities || "";
        const experience = item?.experienceRequirements || "";

        const text = cleanText(
          [title, company, location, description, qualifications, responsibilities, experience]
            .filter(Boolean)
            .join("\n")
        );

        if (text) chunks.push(text);
      }
    } catch {
      // ignore malformed blocks
    }
  });

  return cleanText(chunks.join("\n\n"));
}

function extractReadableText(html: string) {
  const $ = cheerio.load(html);

  $("script:not([type='application/ld+json']), style, noscript, svg, iframe").remove();
  $("nav, footer, header, aside, form").remove();

  const semanticCandidates = [
    "main",
    "article",
    "[role='main']",
    ".job-description",
    ".jobDescription",
    ".description",
    ".posting",
    ".content",
    "#content",
    "body",
  ];

  const attributeCandidates = $(
    "[class*='job'], [class*='description'], [class*='posting'], [class*='requirement'], [id*='job'], [id*='description'], [id*='posting'], [id*='requirement']"
  )
    .map((_, el) => cleanText($(el).text() || ""))
    .get()
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
    .join("\n\n");

  let bestText = "";
  for (const sel of semanticCandidates) {
    const t = cleanText($(sel).text() || "");
    if (t.length > bestText.length) bestText = t;
  }

  const jsonLdText = extractJsonLdText($);
  const metaDescription = cleanText(
    $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || ""
  );

  const merged = cleanText([jsonLdText, metaDescription, attributeCandidates, bestText].filter(Boolean).join("\n\n"));
  const fallback = cleanText($.text());

  let finalText = merged.length >= 250 ? merged : fallback;

  const MAX_CHARS = 12000;
  if (finalText.length > MAX_CHARS) finalText = `${finalText.slice(0, MAX_CHARS)}\n…[truncated]`;
  return finalText;
}

function resolveCandidateName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}) {
  const fullName = input.fullName?.trim();
  if (fullName) return fullName;

  const combined = [input.firstName?.trim(), input.lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  return combined || null;
}

function replaceNamePlaceholders(text: string, candidateName: string | null) {
  if (!candidateName) return cleanText(text);

  return cleanText(
    text
      .replace(/\[your name\]/gi, candidateName)
      .replace(/\[candidate name\]/gi, candidateName)
      .replace(/\bcandidate\b/gi, candidateName)
  );
}

function cleanupDocumentPlaceholders(input: {
  text: string;
  candidateName: string | null;
  company: string | null;
  role: string | null;
}) {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  const replacements: Array<{ pattern: RegExp; replacement: string }> = [
    {
      pattern: /\[(your name|candidate name|name)\]/gi,
      replacement: input.candidateName ?? "",
    },
    {
      pattern: /\[(company|company name)\]/gi,
      replacement: input.company ?? "",
    },
    {
      pattern: /\[(hiring manager|recruiter|interviewer)\]/gi,
      replacement: "Hiring Team",
    },
    {
      pattern: /\[(date)\]/gi,
      replacement: dateLabel,
    },
    {
      pattern: /\[(role|job title|position)\]/gi,
      replacement: input.role ?? "",
    },
  ];

  let normalized = String(input.text ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\b(undefined|null)\b/gi, "");

  for (const { pattern, replacement } of replacements) {
    normalized = normalized.replace(pattern, replacement || "");
  }

  if (input.candidateName) {
    normalized = normalized.replace(/\bcandidate\b/gi, input.candidateName);
  }

  normalized = normalized.replace(/\[(?:[^\]]+)\]/g, "");
  return cleanText(normalized);
}

function ensureSignedDocument(
  text: string,
  candidateName: string | null,
  defaultSignoff: "Sincerely" | "Best"
) {
  const normalized = replaceNamePlaceholders(text, candidateName);
  if (!candidateName) return normalized;
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const candidateNameLower = candidateName.toLowerCase();
  const trailingLines = lines.slice(-3).map((line) => line.toLowerCase());
  if (trailingLines.includes(candidateNameLower)) return normalized;

  if (/(sincerely|best regards|kind regards|regards|best|thank you|thanks),?\s*$/i.test(normalized)) {
    return `${normalized}\n${candidateName}`;
  }

  return `${normalized}\n\n${defaultSignoff},\n${candidateName}`;
}

function buildCandidateContext(args: {
  profile: GenerateProfile | null;
  candidateName: string | null;
  sessionEmail: string | null;
  privateFields: ReturnType<typeof getSafePrivateProfileFields>;
  uploadedResumeText: string | null;
  savedResumeText: string | null;
}): CandidateContext {
  const { profile, privateFields, uploadedResumeText, savedResumeText, candidateName } = args;
  const savedTargetRoles = dedupeStrings((profile?.jobInterests ?? []).map((item) => item.title));
  const roleFocus = readRoleFocus(profile?.keyQuestions) ?? savedTargetRoles[0] ?? null;
  const preferredLocations = dedupeStrings([
    ...readWorkplaceLocations(profile?.workplaceLocations),
    [trimText(privateFields.city), trimText(privateFields.state)].filter(Boolean).join(", "),
  ]);
  const keyQuestionExpertise =
    profile?.keyQuestions &&
    typeof profile.keyQuestions === "object" &&
    !Array.isArray(profile.keyQuestions)
      ? normalizeList((profile.keyQuestions as Record<string, unknown>).expertise, 10)
      : [];
  const preferences = dedupeStrings([
    ...(profile?.benefitSelections ?? []).flatMap((selection) => [
      trimText(selection.selectedPlan),
      ...normalizeList(selection.benefits, 6),
    ]),
  ]).slice(0, 8);
  const skills = dedupeStrings([
    ...(profile?.skills ?? []),
    ...(profile?.resumeSkills ?? []),
    ...keyQuestionExpertise,
  ]).slice(0, 14);
  const combinedResumeText = cleanText([uploadedResumeText, savedResumeText].filter(Boolean).join("\n\n"));

  return {
    candidateProfile: {
      fullName: candidateName,
      firstName: trimText(profile?.firstName) || null,
      lastName: trimText(profile?.lastName) || null,
      email: trimText(profile?.email) || trimText(args.sessionEmail) || null,
      phone: trimText(profile?.phone) || null,
      address: trimText(privateFields.address) || null,
      city: trimText(privateFields.city) || null,
      state: trimText(privateFields.state) || null,
      postalCode: trimText(privateFields.postalCode) || null,
      linkedinUrl: trimText(profile?.linkedinUrl) || null,
      portfolioUrl: trimText(profile?.portfolioUrl) || null,
    },
    candidateResumeSource: {
      uploadedResumeText: uploadedResumeText || null,
      savedResumeText: savedResumeText || null,
      combinedResumeText: combinedResumeText || null,
      savedResumeMetadata: profile?.resumeFiles?.[0]
        ? {
            fileName: profile.resumeFiles[0].fileName ?? null,
            mimeType: profile.resumeFiles[0].mimeType ?? null,
            sizeBytes: profile.resumeFiles[0].sizeBytes ?? null,
            createdAt: profile.resumeFiles[0].createdAt?.toISOString?.() ?? null,
          }
        : null,
    },
    candidateExperience: collectCandidateExperience(profile),
    candidateSignals: {
      targetRole: roleFocus,
      savedTargetRoles,
      preferredLocations,
      compensation: formatCompensation(
        profile?.minCompensation ?? null,
        profile?.compensationType ?? null
      ),
      availability: trimText(profile?.startDate) || null,
      includeRemote:
        typeof profile?.includeRemote === "boolean" ? profile.includeRemote : null,
      skills,
      preferences,
    },
  };
}

function buildFallbackResumeText(
  context: CandidateContext,
  generated: GeneratedDocumentPayload,
  candidateName: string | null
) {
  const profile = context.candidateProfile;
  const addressLine = dedupeStrings([
    [
      profile.address,
      [profile.city, [profile.state, profile.postalCode].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
    ]
      .filter(Boolean)
      .join(", "),
  ]).join("");
  const emailPhoneLine = dedupeStrings([
    profile.email ? `Email: ${profile.email}` : "",
    profile.phone ? `Phone: ${profile.phone}` : "",
  ]).join(" | ");
  const linksLine = dedupeStrings([
    profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : "",
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : "",
  ]).join(" | ");

  const ensureSummarySentenceMinimum = (value: string, minimum = 4) => {
    const sentences = cleanText(value)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => cleanText(sentence))
      .filter(Boolean);
    const fallbackSentences = [
      "Skilled at collaborating across teams to deliver reliable outcomes.",
      "Known for clear communication, strong ownership, and consistent execution.",
      "Focused on process improvements that increase quality and efficiency.",
    ];
    let fallbackIndex = 0;
    while (sentences.length < minimum) {
      sentences.push(fallbackSentences[fallbackIndex % fallbackSentences.length]);
      fallbackIndex += 1;
    }
    return cleanText(sentences.join(" "));
  };

  const ensureMinimumBullets = (bullets: string[], minimum = 5) => {
    const normalized = dedupeStrings(bullets).slice(0, 8);
    const fallbackBullets = [
      "Collaborated with cross-functional partners to deliver prioritized work on schedule.",
      "Maintained quality standards through testing, documentation, and process consistency.",
      "Communicated status, risks, and next steps to keep stakeholders aligned.",
      "Supported process improvements that increased reliability and operational efficiency.",
      "Applied security, compliance, and data-quality best practices in daily execution.",
    ];
    let fallbackIndex = 0;
    while (normalized.length < minimum) {
      normalized.push(fallbackBullets[fallbackIndex % fallbackBullets.length]);
      fallbackIndex += 1;
    }
    return normalized;
  };

  const summary = cleanText(
    ensureSummarySentenceMinimum(
      generated.resumeUpdates?.summaryRewrite ||
        generated.job?.summary ||
        [
          context.candidateSignals.targetRole
            ? `Targeting ${context.candidateSignals.targetRole} opportunities`
            : null,
          context.candidateExperience[0]
            ? `with experience as ${context.candidateExperience[0].title} at ${context.candidateExperience[0].company}`
            : null,
          context.candidateSignals.skills.length
            ? `bringing strengths in ${context.candidateSignals.skills.slice(0, 5).join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" ")
    )
  );
  const skills = dedupeStrings([
    ...context.candidateSignals.skills,
    ...(generated.resumeUpdates?.skillsToAdd ?? []),
    ...(generated.resumeUpdates?.atsKeywords ?? []),
  ]).slice(0, 16);

  const experienceSections = context.candidateExperience
    .map((experience) => {
      const header = [
        `${experience.title} | ${experience.company}`,
        experience.location || null,
        experience.dateRange || null,
      ]
        .filter(Boolean)
        .join(" | ");
      const bullets = experience.bullets.length
        ? experience.bullets
        : generated.resumeUpdates?.bulletEdits
            ?.filter((edit) =>
              edit.section.toLowerCase().includes(experience.title.toLowerCase()) ||
              edit.section.toLowerCase().includes(experience.company.toLowerCase())
            )
            .map((edit) => edit.after)
            .filter(Boolean) ?? [];

      return cleanText([header, ...ensureMinimumBullets(bullets).map((bullet) => `- ${bullet}`)].join("\n"));
    })
    .filter(Boolean);

  const sections = [
    candidateName || "Candidate",
    addressLine,
    emailPhoneLine,
    linksLine,
    summary ? `PROFESSIONAL SUMMARY\n${summary}` : "",
    skills.length ? `SKILLS\n${skills.map((skill) => `- ${skill}`).join("\n")}` : "",
    experienceSections.length
      ? `PROFESSIONAL EXPERIENCE\n${experienceSections.join("\n\n")}`
      : "",
  ].filter(Boolean);

  return cleanText(sections.join("\n\n"));
}

async function readPayload(req: Request): Promise<GeneratePayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const toneValue = String(form.get("tone") ?? "professional") as Tone;
    const focusRaw = String(form.get("focusAreas") ?? "[]");
    let focusAreas: string[] = [];

    try {
      const parsed = JSON.parse(focusRaw);
      if (Array.isArray(parsed)) focusAreas = parsed.map(String);
    } catch {
      focusAreas = [];
    }

    const resumeFile = form.get("resumeFile");

    return {
      url: String(form.get("url") ?? "").trim(),
      resumeText: form.get("resumeText") ? String(form.get("resumeText")) : null,
      tone: toneValue,
      focusAreas,
      instructions: form.get("instructions") ? String(form.get("instructions")) : null,
      pastedJobText: form.get("pastedJobText") ? String(form.get("pastedJobText")) : null,
      resumeFile: resumeFile instanceof File ? resumeFile : null,
      usageKey: form.get("usageKey") ? String(form.get("usageKey")).trim() : null,
      llmProvider: normalizeLlmProvider(form.get("llmProvider") ?? form.get("modelProvider")),
      modelProvider: normalizeLlmProvider(form.get("modelProvider") ?? form.get("llmProvider")),
    };
  }

  const body = await req.json();
  return {
    url: String(body?.url ?? "").trim(),
    resumeText: body?.resumeText ? String(body.resumeText) : null,
    tone: (String(body?.tone ?? "professional") as Tone) ?? "professional",
    focusAreas: Array.isArray(body?.focusAreas) ? body.focusAreas.map(String) : [],
    instructions: body?.instructions ? String(body.instructions) : null,
    pastedJobText: body?.pastedJobText ? String(body.pastedJobText) : null,
    resumeFile: null,
    usageKey: body?.usageKey ? String(body.usageKey).trim() : null,
    llmProvider: normalizeLlmProvider(body?.llmProvider ?? body?.modelProvider),
    modelProvider: normalizeLlmProvider(body?.modelProvider ?? body?.llmProvider),
  };
}

export async function POST(req: Request) {
  try {
    const payload = await readPayload(req);
    const requestedLlmProvider = normalizeLlmProvider(
      payload.llmProvider ?? payload.modelProvider
    );
    const resolvedLlmProvider =
      requestedLlmProvider === "auto" ? "openai" : requestedLlmProvider;
    // Future-safe routing point for alternate providers; preserve existing provider by default.
    if (resolvedLlmProvider !== "openai") {
      console.info(
        `[JOB_TOOLS_GENERATE] llmProvider="${requestedLlmProvider}" requested; using OpenAI until provider routing is implemented.`
      );
    }
    const tone = payload.tone ?? "professional";
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    let profile = userId
      ? await prisma.userProfile.findUnique({
          where: { userId },
          select: generateProfileSelect,
        })
      : null;
    let rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(
      prisma,
      profile?.id ? [profile.id] : []
    );
    let rawPrivateFields =
      profile?.id && rawPrivateFieldsById.get(profile.id)
        ? (rawPrivateFieldsById.get(profile.id) as Record<string, unknown>)
        : {};
    let privateFields = getSafePrivateProfileFields({
      ...rawPrivateFields,
      ...(profile ?? {}),
    });
    let candidateName = resolveCandidateName({
      firstName: profile?.firstName ?? null,
      lastName: profile?.lastName ?? null,
      fullName: session?.user?.name ?? null,
    });

    let uploadedResumeText = cleanText(payload.resumeText ?? "");
    let savedResume:
      | {
          id: string;
          fileName: string | null;
        }
      | undefined;
    let profileSync:
      | {
          updatedFields: string[];
          skippedFields: string[];
        }
      | undefined;

    if (payload.resumeFile) {
      const resumeFileInput = {
        buffer: Buffer.from(await payload.resumeFile.arrayBuffer()),
        fileName: payload.resumeFile.name,
        mimeType: payload.resumeFile.type || "application/pdf",
        sizeBytes: payload.resumeFile.size,
      };

      if (userId && profile?.id) {
        try {
          const persistedResume = await persistResumeToProfile({
            profileId: profile.id,
            resumeFile: resumeFileInput,
          });

          uploadedResumeText = persistedResume.extractedResumeText;
          savedResume = persistedResume.savedResume
            ? {
                id: persistedResume.savedResume.id,
                fileName: persistedResume.savedResume.fileName,
              }
            : undefined;
          profileSync = persistedResume.profileSync;

          profile = await prisma.userProfile.findUnique({
            where: { userId },
            select: generateProfileSelect,
          });
          rawPrivateFieldsById = await readRawPrivateProfileFieldsByIds(
            prisma,
            profile?.id ? [profile.id] : []
          );
          rawPrivateFields =
            profile?.id && rawPrivateFieldsById.get(profile.id)
              ? (rawPrivateFieldsById.get(profile.id) as Record<string, unknown>)
              : {};
          privateFields = getSafePrivateProfileFields({
            ...rawPrivateFields,
            ...(profile ?? {}),
          });
          candidateName = resolveCandidateName({
            firstName: profile?.firstName ?? null,
            lastName: profile?.lastName ?? null,
            fullName: session?.user?.name ?? null,
          });
        } catch (persistError) {
          console.warn("[job-tools/generate] resume persistence failed; using transient upload", {
            userId,
            profileId: profile?.id ?? null,
            error: persistError instanceof Error ? persistError.message : String(persistError),
          });
        }
      }

      if (!uploadedResumeText) {
        uploadedResumeText = await extractResumeTextFromBuffer(
          resumeFileInput.buffer,
          resumeFileInput.mimeType,
          resumeFileInput.fileName
        );
      }
    }
    const savedResumeText = savedResume
      ? ""
      : profile?.resumeFiles?.[0]
      ? await extractResumeTextFromStoredFile(profile.resumeFiles[0])
      : "";
    const candidateContext = buildCandidateContext({
      profile,
      candidateName,
      sessionEmail: session?.user?.email ?? null,
      privateFields,
      uploadedResumeText: uploadedResumeText || null,
      savedResumeText: savedResumeText || null,
    });

    let jobText = cleanText(payload.pastedJobText ?? "");

    if (!jobText) {
      if (!payload.url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

      let u: URL;
      try {
        u = new URL(payload.url);
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }

      const res = await fetch(u.toString(), {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Could not read that page (HTTP ${res.status}). Some sites block automated access.` },
          { status: 400 }
        );
      }

      const html = await res.text();
      jobText = extractReadableText(html);
    }

    if (!jobText || jobText.length < 150) {
      return NextResponse.json(
        { error: "Could not extract enough text from that page. Paste the job description in the fallback field and try again." },
        { status: 400 }
      );
    }

    let creditStatus:
      | {
          remaining: number;
          starterRemaining: number;
          starterGranted: boolean;
          consumed: boolean;
        }
      | undefined;

    if (userId) {
      const hirexaAccess = await getHirexaAccessForUser({
        userId,
        sessionEmail: session?.user?.email ?? null,
      });

      if (!hirexaAccess.active) {
        if (hirexaAccess.pending) {
          return NextResponse.json(
            {
              error:
                "We're still syncing your subscription. Refresh once or revisit your billing confirmation page, then try Generate again.",
            },
            { status: 403 }
          );
        }

        const creditConsumption = await consumeHirePilotCredits({
          userId,
          amount: 1,
          usageKey:
            payload.usageKey?.trim() ||
            `ai-assistant-apply:${userId}:${Date.now()}`,
          sourceType: "ai_assistant_apply",
          metadata: {
            jobUrl: payload.url || null,
            usedPastedJobText: Boolean(payload.pastedJobText?.trim()),
            uploadedResumeFileName: payload.resumeFile?.name ?? null,
          },
        });

        if (!creditConsumption.ok) {
          return NextResponse.json(
            {
              error:
                "You've used all 5 free credits. Upgrade to continue using HirePilot and AI Assistant Apply.",
              credits: {
                remaining: creditConsumption.summary.totalAvailable,
                starterRemaining: creditConsumption.summary.starterCredits,
                starterGranted: creditConsumption.summary.starterCreditsGranted,
                consumed: false,
              },
            },
            { status: 403 }
          );
        }

        creditStatus = {
          remaining: creditConsumption.summary.totalAvailable,
          starterRemaining: creditConsumption.summary.starterCredits,
          starterGranted: creditConsumption.summary.starterCreditsGranted,
          consumed: true,
        };
      }
    }

    const selectedFocus = payload.focusAreas.length ? payload.focusAreas.join(", ") : "none provided";
    const promptResumeText =
      candidateContext.candidateResumeSource.combinedResumeText?.slice(0, 12000) ??
      "[not provided]";

    const system = `
You are an expert career coach + recruiter. Produce concise, high-quality, ATS-friendly writing.
Return ONLY valid JSON matching the schema I give you. No markdown.
Tone: ${tone}.
${candidateName ? `Use the candidate name exactly as provided: ${candidateName}. Never use placeholders like "Candidate" or "[Your Name]".` : ""}
Use real saved profile details, saved resume context, and saved work experience whenever available.
Write final user-ready documents that can be copied or exported as-is.
Do not return template language, patch notes, before/after notes, JSON fragments, or bracketed placeholders.
Do not include placeholders such as [Your Name], [Company Name], [Hiring Manager], or [Date].
Prefer omission over fabrication. If data is missing, do not invent employers, dates, degrees, certifications, addresses, or metrics.
Every resume bullet must read like a polished final resume bullet, not a note to the candidate.
Start most bullets with strong action verbs such as Delivered, Prepared, Processed, Maintained, Supported, Resolved, Improved, Coordinated, Streamlined, or Strengthened.
Avoid weak phrasing like "helped with", "responsible for", or "worked on".
When exact metrics are unavailable, do not invent numbers; instead make bullets outcome-focused, credible, and ATS-friendly.
For customer service, barista, cashier, retail, and hospitality roles, emphasize speed, accuracy, customer satisfaction, cleanliness, safety, cash handling, POS use, upselling, shift support, multitasking, teamwork, reliability, and high-volume service where supported by the context.
`.trim();

    const schema = {
      job: {
        title: "string?",
        company: "string?",
        location: "string?",
        summary: "string?",
        keyRequirements: ["string"],
      },
      coverLetter: "string",
      fullResumeText: "string",
      resumeUpdates: {
        summaryRewrite: "string?",
        skillsToAdd: ["string"],
        bulletEdits: [{ section: "string", before: "string", after: "string" }],
        atsKeywords: ["string"],
      },
      emails: {
        beforeInterview: "string",
        afterInterview: "string",
      },
    };

    const userPrompt = `
JOB POSTING TEXT:
${jobText}

CANDIDATE PROFILE JSON:
${JSON.stringify(candidateContext.candidateProfile, null, 2)}

CANDIDATE SIGNALS JSON:
${JSON.stringify(candidateContext.candidateSignals, null, 2)}

SAVED EXPERIENCE JSON:
${JSON.stringify(candidateContext.candidateExperience, null, 2)}

RESUME SOURCE SUMMARY JSON:
${JSON.stringify(
  {
    ...candidateContext.candidateResumeSource,
    uploadedResumeText: candidateContext.candidateResumeSource.uploadedResumeText
      ? "[provided]"
      : null,
    savedResumeText: candidateContext.candidateResumeSource.savedResumeText
      ? "[available from database]"
      : null,
    combinedResumeText: candidateContext.candidateResumeSource.combinedResumeText
      ? "[merged source available]"
      : null,
  },
  null,
  2
)}

MERGED RESUME SOURCE TEXT:
${promptResumeText}

FOCUS AREAS: ${selectedFocus}
EXTRA INSTRUCTIONS: ${payload.instructions ?? "none"}
CANDIDATE NAME: ${candidateName ?? "[not provided]"}

TASK:
1) Infer job title/company/location if possible.
2) Generate a tailored cover letter (1 page max) as a complete professional letter with:
   - candidate name/contact line when available
   - current date
   - hiring team/company block when available
   - greeting
   - 3-5 short paragraphs
   - professional close and candidate name
3) Generate a complete final resume in plain text that is ready to export directly. It must be a full developed resume, not patch notes or suggestions.
   Resume format requirements:
   - Start with candidate name.
   - Then contact block in this order when data exists:
     1) full address line
     2) Email + Phone on one line
     3) LinkedIn + Portfolio on one line
   - Use ALL CAPS headings:
     PROFESSIONAL SUMMARY
     SKILLS
     PROFESSIONAL EXPERIENCE
     EDUCATION
     CERTIFICATIONS
     SOCIAL MEDIA LINKS (only when links are available)
   - PROFESSIONAL SUMMARY must be at least 4 sentences.
   - SKILLS must be bullet points only.
   - PROFESSIONAL EXPERIENCE: each job must include title line, company/location line, date range line, and at least 5 bullet points.
     Include every role present in SAVED EXPERIENCE JSON when that data is available. Do not arbitrarily omit older roles.
     If the source has fewer than 5 bullets, generate additional truthful, conservative bullets based on known context without inventing metrics.
   - EDUCATION lines should preserve credential and school naming clearly (for example M.S., B.S., B.A., A.A., C.).
   - Do not output markdown tables.
   - Do not include placeholder tokens like [Your Name], [Company], [Hiring Manager], [Date], or spacing markers like "<-- Add Space Here -->".
   Use the real saved profile details and saved experience where available. Tailor the summary, skills, and bullet phrasing to the job posting.
   Rewrite the experience bullets so they are noticeably stronger, more specific, and more hireable than the source wording.
4) Propose resume updates:
   - optional new summary
   - skills to add
   - 4-8 bullet edits: if real resume/experience context exists, rewrite based on that context; if not, keep them conservative and generic instead of inventing unsupported facts.
   - ATS keyword list
5) Write two final professional emails that reference the revised resume points where relevant:
   - before interview email must include: subject line, greeting, short body, 1-2 smart questions, and close
   - after interview email must include: subject line, greeting, thank-you body, reaffirmed interest, and close
If a candidate name is provided, make sure each document includes it. The cover letter and both emails must end with the candidate's name. The full resume must start with the candidate's name when provided.
The full resume should be strong enough to use as the final exported resume document.
Return JSON ONLY matching this schema shape:
${JSON.stringify(schema, null, 2)}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          error: "Model did not return valid JSON. Try again, or add a server-side JSON repair step.",
          raw,
        },
        { status: 500 }
      );
    }

    const generated = (parsed ?? {}) as GeneratedDocumentPayload;
    const inferredCompany = trimText(generated.job?.company) || null;
    const inferredRole = trimText(generated.job?.title) || null;
    const cleanedCoverLetter = cleanupDocumentPlaceholders({
      text: generated.coverLetter ?? "",
      candidateName,
      company: inferredCompany,
      role: inferredRole,
    });
    const cleanedBeforeInterviewEmail = cleanupDocumentPlaceholders({
      text: generated.emails?.beforeInterview ?? "",
      candidateName,
      company: inferredCompany,
      role: inferredRole,
    });
    const cleanedAfterInterviewEmail = cleanupDocumentPlaceholders({
      text: generated.emails?.afterInterview ?? "",
      candidateName,
      company: inferredCompany,
      role: inferredRole,
    });
    const fullResumeText = replaceNamePlaceholders(
      cleanupDocumentPlaceholders({
        text:
          generated.fullResumeText ||
          buildFallbackResumeText(candidateContext, generated, candidateName),
        candidateName,
        company: inferredCompany,
        role: inferredRole,
      }),
      candidateName
    );

    return NextResponse.json(
      {
        ...generated,
        llmProvider: requestedLlmProvider,
        llmProviderResolved: resolvedLlmProvider,
        candidateName,
        candidateFirstName: candidateContext.candidateProfile.firstName,
        candidateLastName: candidateContext.candidateProfile.lastName,
        candidateEmail: candidateContext.candidateProfile.email,
        candidatePhone: candidateContext.candidateProfile.phone,
        candidateAddress: candidateContext.candidateProfile.address,
        candidateCity: candidateContext.candidateProfile.city,
        candidateState: candidateContext.candidateProfile.state,
        candidatePostalCode: candidateContext.candidateProfile.postalCode,
        candidateLinkedinUrl: candidateContext.candidateProfile.linkedinUrl,
        candidatePortfolioUrl: candidateContext.candidateProfile.portfolioUrl,
        fullResumeText,
        savedResume,
        profileSync,
        credits: creditStatus,
        coverLetter: ensureSignedDocument(
          cleanedCoverLetter,
          candidateName,
          "Sincerely"
        ),
        emails: {
          beforeInterview: ensureSignedDocument(
            cleanedBeforeInterviewEmail,
            candidateName,
            "Best"
          ),
          afterInterview: ensureSignedDocument(
            cleanedAfterInterviewEmail,
            candidateName,
            "Best"
          ),
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
