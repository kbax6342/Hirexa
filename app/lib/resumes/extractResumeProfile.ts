import "server-only";

import OpenAI from "openai";

import {
  estimateYearsExperience,
  extractNormalizedSkills,
} from "@/app/lib/recruiter/matchCandidates";
import { extractPossibleContactInfo } from "@/app/lib/resumes/redactResumeForScoring";

export type StructuredResumeProfile = {
  candidateSummary: string;
  skills: string[];
  tools: string[];
  roles: string[];
  companies: string[];
  yearsOfExperienceEstimate: string;
  projects: string[];
  education: string[];
  certifications: string[];
  achievements: string[];
  possibleContactInfo: {
    email: string | null;
    phone: string | null;
  };
  redactionNotes: string[];
};

const MODEL_NAME = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const MAX_RESUME_TEXT_CHARS = 18_000;
const TOOL_HINTS = [
  "aws",
  "azure",
  "docker",
  "excel",
  "figma",
  "gcp",
  "github",
  "hubspot",
  "jira",
  "kubernetes",
  "node.js",
  "notion",
  "power bi",
  "postgresql",
  "react",
  "salesforce",
  "slack",
  "sql",
  "tableau",
  "typescript",
];

const RESUME_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidateSummary: { type: "string" },
    skills: {
      type: "array",
      items: { type: "string" },
    },
    tools: {
      type: "array",
      items: { type: "string" },
    },
    roles: {
      type: "array",
      items: { type: "string" },
    },
    companies: {
      type: "array",
      items: { type: "string" },
    },
    yearsOfExperienceEstimate: { type: "string" },
    projects: {
      type: "array",
      items: { type: "string" },
    },
    education: {
      type: "array",
      items: { type: "string" },
    },
    certifications: {
      type: "array",
      items: { type: "string" },
    },
    achievements: {
      type: "array",
      items: { type: "string" },
    },
    possibleContactInfo: {
      type: "object",
      additionalProperties: false,
      properties: {
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
      },
      required: ["email", "phone"],
    },
    redactionNotes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "candidateSummary",
    "skills",
    "tools",
    "roles",
    "companies",
    "yearsOfExperienceEstimate",
    "projects",
    "education",
    "certifications",
    "achievements",
    "possibleContactInfo",
    "redactionNotes",
  ],
} as const;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function getResponseText(resp: unknown): string {
  const response = resp as
    | {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      }
    | undefined;

  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeComparable(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s/-]+/g, " ")
    .replace(/\s+/g, " ");
}

function dedupeStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "")
      .replace(/^[\s•*-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalizeComparable(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isLikelyHeading(line: string) {
  const normalized = line.trim();
  if (!normalized) return false;
  if (normalized.length > 60) return false;
  if (/[:|]/.test(normalized)) return true;
  return /^[A-Z][A-Z\s/&-]{2,}$/.test(normalized);
}

function collectSectionItems(text: string, headings: string[]) {
  const lines = normalizeWhitespace(text).split("\n");
  const results: string[] = [];
  let capture = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (capture && results.length > 0) break;
      continue;
    }

    const headingMatch = headings.some((heading) =>
      new RegExp(`^${heading}\\b`, "i").test(trimmed.replace(/:$/, ""))
    );
    if (headingMatch) {
      capture = true;
      continue;
    }

    if (!capture) continue;
    if (isLikelyHeading(trimmed)) break;

    results.push(trimmed.replace(/^[•*-]\s*/, ""));
    if (results.length >= 8) break;
  }

  return dedupeStrings(results);
}

function extractRoleLines(text: string) {
  const rolePattern =
    /\b(architect|analyst|consultant|coordinator|designer|developer|director|engineer|manager|recruiter|scientist|specialist|strategist|lead|administrator|marketer|writer|producer)\b/i;

  return dedupeStrings(
    normalizeWhitespace(text)
      .split("\n")
      .filter((line) => line.length <= 120 && rolePattern.test(line))
      .slice(0, 8)
  );
}

function extractCompanies(text: string) {
  const companies = new Set<string>();
  const matches = text.matchAll(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,' -]{1,60})/g);
  for (const match of matches) {
    const value = match[1]?.trim();
    if (value) companies.add(value);
    if (companies.size >= 8) break;
  }

  return [...companies];
}

function extractAchievements(text: string) {
  const lines = normalizeWhitespace(text).split("\n");
  return dedupeStrings(
    lines
      .filter((line) =>
        /(increased|reduced|improved|launched|delivered|grew|generated|saved|led|built|\d+%|\$\d+)/i.test(
          line
        )
      )
      .slice(0, 8)
  );
}

function buildFallbackProfile(
  parsedText: string,
  possibleContactInfo: { email: string | null; phone: string | null },
  redactionNotes: string[]
): StructuredResumeProfile {
  const normalizedText = normalizeWhitespace(parsedText);
  const skills = dedupeStrings(extractNormalizedSkills(normalizedText).map(titleCase));
  const tools = skills.filter((skill) =>
    TOOL_HINTS.some((hint) => normalizeComparable(hint) === normalizeComparable(skill))
  );
  const roles = extractRoleLines(normalizedText);
  const companies = extractCompanies(normalizedText);
  const projects = collectSectionItems(normalizedText, ["projects?", "project experience", "selected projects"]);
  const education = collectSectionItems(normalizedText, ["education", "academic background"]);
  const certifications = collectSectionItems(normalizedText, ["certifications?", "licenses?"]);
  const achievements = extractAchievements(normalizedText);
  const estimatedYears = estimateYearsExperience(normalizedText);
  const yearsOfExperienceEstimate =
    estimatedYears != null ? `${estimatedYears}+ years` : "Not enough information";

  const summaryParts = [
    roles[0] ? `Most recent role signal: ${roles[0]}` : null,
    companies[0] ? `Recent company signal: ${companies[0]}` : null,
    skills.length ? `Skills surfaced: ${skills.slice(0, 5).join(", ")}` : null,
    estimatedYears != null ? `Estimated experience: ${estimatedYears}+ years` : null,
  ].filter(Boolean);

  return {
    candidateSummary:
      summaryParts.join(". ") || "Structured job-related resume facts were extracted for recruiter review.",
    skills,
    tools,
    roles,
    companies,
    yearsOfExperienceEstimate,
    projects,
    education,
    certifications,
    achievements,
    possibleContactInfo,
    redactionNotes: dedupeStrings(redactionNotes),
  };
}

function normalizeStructuredResumeProfile(
  value: unknown,
  fallback: StructuredResumeProfile
): StructuredResumeProfile {
  const input = (value ?? {}) as Record<string, unknown>;
  const possibleContactInfo = (input.possibleContactInfo ?? {}) as Record<string, unknown>;

  const profile: StructuredResumeProfile = {
    candidateSummary:
      String(input.candidateSummary ?? "").trim() || fallback.candidateSummary,
    skills: dedupeStrings(Array.isArray(input.skills) ? input.skills : fallback.skills),
    tools: dedupeStrings(Array.isArray(input.tools) ? input.tools : fallback.tools),
    roles: dedupeStrings(Array.isArray(input.roles) ? input.roles : fallback.roles),
    companies: dedupeStrings(Array.isArray(input.companies) ? input.companies : fallback.companies),
    yearsOfExperienceEstimate:
      String(input.yearsOfExperienceEstimate ?? "").trim() ||
      fallback.yearsOfExperienceEstimate,
    projects: dedupeStrings(Array.isArray(input.projects) ? input.projects : fallback.projects),
    education: dedupeStrings(Array.isArray(input.education) ? input.education : fallback.education),
    certifications: dedupeStrings(
      Array.isArray(input.certifications) ? input.certifications : fallback.certifications
    ),
    achievements: dedupeStrings(
      Array.isArray(input.achievements) ? input.achievements : fallback.achievements
    ),
    possibleContactInfo: {
      email:
        typeof possibleContactInfo.email === "string" && possibleContactInfo.email.trim()
          ? possibleContactInfo.email.trim()
          : fallback.possibleContactInfo.email,
      phone:
        typeof possibleContactInfo.phone === "string" && possibleContactInfo.phone.trim()
          ? possibleContactInfo.phone.trim()
          : fallback.possibleContactInfo.phone,
    },
    redactionNotes: dedupeStrings(
      Array.isArray(input.redactionNotes) ? input.redactionNotes : fallback.redactionNotes
    ),
  };

  if (!profile.tools.length && profile.skills.length) {
    profile.tools = profile.skills.filter((skill) =>
      TOOL_HINTS.some((hint) => normalizeComparable(hint) === normalizeComparable(skill))
    );
  }

  if (!profile.redactionNotes.length) {
    profile.redactionNotes = fallback.redactionNotes;
  }

  return profile;
}

async function requestResumeProfileFromModel(args: {
  parsedText: string;
  possibleContactInfo: { email: string | null; phone: string | null };
  redactionNotes: string[];
}) {
  const client = getOpenAIClient();
  if (!client) return null;

  const response = await client.responses.create({
    model: MODEL_NAME,
    input: [
      {
        role: "system",
        content: `
Extract structured, job-related resume facts for a recruiter-assist workflow.

Rules:
- Extract job-related facts only.
- Ignore protected characteristics and non-job-related personal traits.
- Do not infer demographic data.
- Do not invent missing facts.
- Keep output grounded in the resume text.
- Use the provided contact info only when the resume clearly contains it.
        `.trim(),
      },
      {
        role: "user",
        content: [
          `Resume text:\n${args.parsedText.slice(0, MAX_RESUME_TEXT_CHARS)}`,
          `Possible contact info detected by regex:\n${JSON.stringify(args.possibleContactInfo, null, 2)}`,
          `Current redaction notes:\n${JSON.stringify(args.redactionNotes, null, 2)}`,
        ].join("\n\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "StructuredResumeProfile",
        schema: RESUME_PROFILE_SCHEMA,
        strict: true,
      },
    },
    store: false,
  });

  const responseText = getResponseText(response);
  if (!responseText) {
    throw new Error("Resume profile extraction returned empty output.");
  }

  return JSON.parse(responseText);
}

export async function extractResumeProfile(args: {
  parsedText: string;
  redactionNotes?: string[];
}): Promise<StructuredResumeProfile> {
  const parsedText = normalizeWhitespace(args.parsedText);
  const possibleContactInfo = extractPossibleContactInfo(parsedText);
  const fallback = buildFallbackProfile(parsedText, possibleContactInfo, args.redactionNotes ?? []);

  if (!parsedText) {
    return fallback;
  }

  try {
    const modelOutput = await requestResumeProfileFromModel({
      parsedText,
      possibleContactInfo,
      redactionNotes: args.redactionNotes ?? [],
    });

    return normalizeStructuredResumeProfile(modelOutput, fallback);
  } catch {
    return fallback;
  }
}
