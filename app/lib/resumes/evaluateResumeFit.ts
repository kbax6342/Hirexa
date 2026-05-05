import "server-only";

import OpenAI from "openai";

import { extractNormalizedSkills } from "@/app/lib/recruiter/matchCandidates";
import type { StructuredResumeProfile } from "@/app/lib/resumes/extractResumeProfile";
import {
  clampScore,
  MAX_MISSING_RISK_PENALTY,
  RESUME_HUMAN_REVIEW_NOTE,
  RESUME_SCORING_RUBRIC,
} from "@/app/lib/resumes/resumeScoringRubric";

export type ResumeEvaluationCriterionResult = {
  label: string;
  weight: number;
  score: number;
  rationale: string;
  evidence: string[];
};

export type ResumeFitEvaluation = {
  overallScore: number;
  confidence: "high" | "medium" | "low";
  recommendation:
    | "STRONG_REVIEW"
    | "REVIEW"
    | "POSSIBLE_FIT"
    | "WEAK_FIT"
    | "INSUFFICIENT_INFO";
  summary: string;
  criteria: ResumeEvaluationCriterionResult[];
  strengths: string[];
  gaps: string[];
  missingInformation: string[];
  interviewQuestions: string[];
  humanReviewNote: string;
  modelName: string | null;
};

export type ResumeEvaluationJobInput = {
  title: string;
  companyName: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel?: string | null;
  location?: string | null;
};

const MODEL_NAME = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const MAX_JOB_DESCRIPTION_CHARS = 6_000;
const MAX_RESUME_TEXT_CHARS = 16_000;

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallScore: { type: "integer" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    recommendation: {
      type: "string",
      enum: [
        "STRONG_REVIEW",
        "REVIEW",
        "POSSIBLE_FIT",
        "WEAK_FIT",
        "INSUFFICIENT_INFO",
      ],
    },
    summary: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          weight: { type: "integer" },
          score: { type: "integer" },
          rationale: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["label", "weight", "score", "rationale", "evidence"],
      },
    },
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    gaps: {
      type: "array",
      items: { type: "string" },
    },
    missingInformation: {
      type: "array",
      items: { type: "string" },
    },
    interviewQuestions: {
      type: "array",
      items: { type: "string" },
    },
    humanReviewNote: { type: "string" },
  },
  required: [
    "overallScore",
    "confidence",
    "recommendation",
    "summary",
    "criteria",
    "strengths",
    "gaps",
    "missingInformation",
    "interviewQuestions",
    "humanReviewNote",
  ],
} as const;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
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

function tokenize(value: string) {
  return normalizeComparable(value)
    .split(/[^a-z0-9+.#/-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

function fuzzyIncludes(candidates: string[], target: string) {
  const normalizedTarget = normalizeComparable(target);
  return candidates.some((candidate) => {
    const normalizedCandidate = normalizeComparable(candidate);
    return (
      normalizedCandidate === normalizedTarget ||
      normalizedCandidate.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedCandidate)
    );
  });
}

function parseEstimatedYears(value: string) {
  const matched = String(value ?? "").match(/(\d{1,2})/);
  if (!matched) return null;
  const numeric = Number(matched[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

function expectedYearsFromExperienceLevel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const numeric = parseEstimatedYears(normalized);
  if (numeric != null) return numeric;
  if (normalized.includes("entry") || normalized.includes("junior")) return 1;
  if (normalized.includes("mid")) return 3;
  if (normalized.includes("senior")) return 5;
  if (normalized.includes("lead") || normalized.includes("staff")) return 7;
  if (normalized.includes("principal") || normalized.includes("director")) return 9;
  return null;
}

function roundCriterionScore(value: number, maxWeight: number) {
  return Math.max(0, Math.min(maxWeight, Math.round(value)));
}

function buildRecommendation(args: {
  overallScore: number;
  missingInformation: string[];
  evidenceCount: number;
}) {
  if (args.evidenceCount < 2 || args.missingInformation.length >= 4) {
    return "INSUFFICIENT_INFO" as const;
  }
  if (args.overallScore >= 85) return "STRONG_REVIEW" as const;
  if (args.overallScore >= 70) return "REVIEW" as const;
  if (args.overallScore >= 55) return "POSSIBLE_FIT" as const;
  return "WEAK_FIT" as const;
}

function buildConfidence(args: {
  evidenceCount: number;
  missingInformation: string[];
  resumeLength: number;
}) {
  if (args.evidenceCount >= 8 && args.missingInformation.length <= 1 && args.resumeLength >= 1200) {
    return "high" as const;
  }
  if (args.evidenceCount >= 4 && args.resumeLength >= 500) {
    return "medium" as const;
  }
  return "low" as const;
}

function buildFallbackEvaluation(args: {
  job: ResumeEvaluationJobInput;
  profile: StructuredResumeProfile;
  redactedResumeText: string;
}): ResumeFitEvaluation {
  const candidateSkills = dedupeStrings([
    ...args.profile.skills,
    ...args.profile.tools,
    ...extractNormalizedSkills(args.redactedResumeText),
  ]);
  const requiredSkills = dedupeStrings(args.job.requiredSkills);
  const preferredSkills = dedupeStrings(args.job.preferredSkills);
  const matchedRequiredSkills = requiredSkills.filter((skill) =>
    fuzzyIncludes(candidateSkills, skill)
  );
  const missingRequiredSkills = requiredSkills.filter(
    (skill) => !matchedRequiredSkills.includes(skill)
  );
  const matchedPreferredSkills = preferredSkills.filter((skill) =>
    fuzzyIncludes(candidateSkills, skill)
  );

  const expectedYears = expectedYearsFromExperienceLevel(args.job.experienceLevel);
  const candidateYears = parseEstimatedYears(args.profile.yearsOfExperienceEstimate);
  const roleSimilarity = tokenOverlap(
    [args.job.title, args.job.jobDescription].join(" "),
    [...args.profile.roles, ...args.profile.projects].join(" ")
  );

  const certOrEducationEvidence = dedupeStrings([
    ...args.profile.certifications,
    ...args.profile.education,
  ]);
  const jobNeedsCertification = /\b(certification|license|degree|bachelor|master|phd)\b/i.test(
    args.job.jobDescription
  );
  const claritySignals = dedupeStrings(
    args.redactedResumeText
      .split("\n")
      .filter((line) => /^[•*-]\s+/.test(line) || line.length > 40)
      .slice(0, 6)
  );

  const requiredSkillCriterion: ResumeEvaluationCriterionResult = {
    label: "Required skills match",
    weight: 35,
    score:
      requiredSkills.length > 0
        ? roundCriterionScore((matchedRequiredSkills.length / requiredSkills.length) * 35, 35)
        : 20,
    rationale:
      requiredSkills.length > 0
        ? `${matchedRequiredSkills.length} of ${requiredSkills.length} required skills were supported by resume evidence.`
        : "The job did not list explicit required skills, so only a partial baseline score was used.",
    evidence: matchedRequiredSkills.slice(0, 5),
  };

  let experienceScore = 12;
  if (expectedYears != null && candidateYears != null) {
    if (candidateYears >= expectedYears) {
      experienceScore = 25;
    } else {
      const gap = expectedYears - candidateYears;
      experienceScore = roundCriterionScore(25 - gap * 4, 25);
    }
  } else if (candidateYears != null) {
    experienceScore = 18;
  } else if (args.profile.roles.length) {
    experienceScore = 14;
  }

  const experienceCriterion: ResumeEvaluationCriterionResult = {
    label: "Relevant experience",
    weight: 25,
    score: experienceScore,
    rationale:
      candidateYears != null
        ? `Estimated experience signal: ${candidateYears}+ years${expectedYears != null ? ` against an expected ${expectedYears}+ years` : ""}.`
        : "Years of experience were not explicit, so experience was estimated from role evidence only.",
    evidence: dedupeStrings([
      args.profile.yearsOfExperienceEstimate,
      ...args.profile.roles.slice(0, 3),
      ...args.profile.companies.slice(0, 2),
    ]).slice(0, 5),
  };

  const roleProjectCriterion: ResumeEvaluationCriterionResult = {
    label: "Role/project similarity",
    weight: 15,
    score: roundCriterionScore(roleSimilarity * 15, 15),
    rationale:
      roleSimilarity > 0
        ? "Prior roles or projects share overlapping job-title and responsibility language with the target role."
        : "Role and project overlap was limited in the submitted resume evidence.",
    evidence: dedupeStrings([...args.profile.roles, ...args.profile.projects]).slice(0, 5),
  };

  const preferredSkillCriterion: ResumeEvaluationCriterionResult = {
    label: "Preferred skills",
    weight: 10,
    score:
      preferredSkills.length > 0
        ? roundCriterionScore((matchedPreferredSkills.length / preferredSkills.length) * 10, 10)
        : 5,
    rationale:
      preferredSkills.length > 0
        ? `${matchedPreferredSkills.length} preferred skills appeared in the resume evidence.`
        : "The job did not list explicit preferred skills, so a neutral baseline score was used.",
    evidence: matchedPreferredSkills.slice(0, 4),
  };

  const certificationCriterion: ResumeEvaluationCriterionResult = {
    label: "Certifications/education",
    weight: 5,
    score: jobNeedsCertification
      ? certOrEducationEvidence.length
        ? 5
        : 1
      : certOrEducationEvidence.length
        ? 4
        : 2,
    rationale: jobNeedsCertification
      ? certOrEducationEvidence.length
        ? "Relevant education or certifications were present where the job description mentions them."
        : "The job description references education or certification requirements, but the resume evidence was limited."
      : certOrEducationEvidence.length
        ? "Supporting education or certifications were present."
        : "Education or certification details were limited, but the job did not heavily emphasize them.",
    evidence: certOrEducationEvidence.slice(0, 4),
  };

  const clarityCriterion: ResumeEvaluationCriterionResult = {
    label: "Communication/resume clarity",
    weight: 5,
    score: roundCriterionScore(
      Math.min(args.redactedResumeText.length / 400, 5) + (claritySignals.length >= 3 ? 1 : 0),
      5
    ),
    rationale:
      args.redactedResumeText.length >= 400
        ? "The resume included enough readable job-related detail to support recruiter review."
        : "The resume text was brief or sparse, which reduced scoring confidence.",
    evidence: claritySignals.slice(0, 4),
  };

  const missingInformation = dedupeStrings([
    !candidateYears ? "Exact years of relevant experience were not clearly stated." : null,
    !args.profile.roles.length ? "Recent role titles were not clearly identifiable." : null,
    !args.profile.projects.length ? "Project examples were limited or absent." : null,
    jobNeedsCertification && !certOrEducationEvidence.length
      ? "Education or certification details were missing for a job that appears to call for them."
      : null,
    missingRequiredSkills.length ? `Missing evidence for: ${missingRequiredSkills.slice(0, 4).join(", ")}` : null,
  ]);

  const missingRiskPenaltyValue = Math.min(
    MAX_MISSING_RISK_PENALTY,
    Math.max(0, missingInformation.length)
  );
  const missingRiskCriterion: ResumeEvaluationCriterionResult = {
    label: "Missing-risk penalty",
    weight: -5,
    score: -missingRiskPenaltyValue,
    rationale:
      missingRiskPenaltyValue > 0
        ? "Some job-relevant information was missing or ambiguous, so confidence should remain with a recruiter."
        : "No material missing-information penalty was applied.",
    evidence: missingInformation.slice(0, 4),
  };

  const criteria = [
    requiredSkillCriterion,
    experienceCriterion,
    roleProjectCriterion,
    preferredSkillCriterion,
    certificationCriterion,
    clarityCriterion,
    missingRiskCriterion,
  ];

  const positiveScore = criteria
    .filter((criterion) => criterion.weight > 0)
    .reduce((sum, criterion) => sum + criterion.score, 0);
  const overallScore = clampScore(positiveScore + missingRiskCriterion.score);
  const strengths = dedupeStrings([
    matchedRequiredSkills.length
      ? `Matched required skills: ${matchedRequiredSkills.slice(0, 4).join(", ")}`
      : null,
    matchedPreferredSkills.length
      ? `Preferred skills surfaced: ${matchedPreferredSkills.slice(0, 3).join(", ")}`
      : null,
    args.profile.roles[0] ? `Relevant role signal: ${args.profile.roles[0]}` : null,
    args.profile.projects[0] ? `Project signal: ${args.profile.projects[0]}` : null,
    certOrEducationEvidence[0] ? `Credential signal: ${certOrEducationEvidence[0]}` : null,
  ]);
  const gaps = dedupeStrings([
    missingRequiredSkills.length
      ? `Missing evidence for required skills: ${missingRequiredSkills.slice(0, 4).join(", ")}`
      : null,
    !args.profile.projects.length ? "Limited project evidence tied to the target role." : null,
    candidateYears == null ? "Years of experience estimate remains uncertain." : null,
  ]);

  const interviewQuestions = dedupeStrings([
    missingRequiredSkills[0]
      ? `Can you walk through your experience with ${missingRequiredSkills[0]} and where you used it most recently?`
      : null,
    args.profile.projects[0]
      ? `What was your direct impact on ${args.profile.projects[0]}?`
      : "Which recent project best reflects the responsibilities in this role?",
    candidateYears == null
      ? "How many years have you spent in directly comparable roles?"
      : null,
    preferredSkills[0] && !matchedPreferredSkills.includes(preferredSkills[0])
      ? `Have you used ${preferredSkills[0]} in production or client-facing work?`
      : null,
  ]).slice(0, 5);

  const evidenceCount = criteria.reduce((sum, criterion) => sum + criterion.evidence.length, 0);
  const confidence = buildConfidence({
    evidenceCount,
    missingInformation,
    resumeLength: args.redactedResumeText.length,
  });
  const recommendation = buildRecommendation({
    overallScore,
    missingInformation,
    evidenceCount,
  });

  return {
    overallScore,
    confidence,
    recommendation,
    summary:
      strengths.length > 0
        ? `The resume shows ${strengths[0].charAt(0).toLowerCase() + strengths[0].slice(1)}. Review gaps around ${gaps[0]?.toLowerCase() ?? "missing job-specific evidence"} before making any decision.`
        : "The resume provided limited job-specific evidence, so recruiter review should focus on clarifying missing requirements.",
    criteria,
    strengths,
    gaps,
    missingInformation,
    interviewQuestions,
    humanReviewNote: RESUME_HUMAN_REVIEW_NOTE,
    modelName: null,
  };
}

function normalizeCriteria(
  value: unknown,
  fallback: ResumeEvaluationCriterionResult[]
): ResumeEvaluationCriterionResult[] {
  const criteria = Array.isArray(value) ? value : [];
  const byLabel = new Map(
    fallback.map((criterion) => [normalizeComparable(criterion.label), criterion])
  );
  const normalized: ResumeEvaluationCriterionResult[] = [];

  for (const item of criteria) {
    const input = item as Record<string, unknown>;
    const label = String(input.label ?? "").trim();
    const fallbackCriterion = byLabel.get(normalizeComparable(label));
    if (!fallbackCriterion) continue;

    const score = Number(input.score);
    normalized.push({
      label: fallbackCriterion.label,
      weight: fallbackCriterion.weight,
      score:
        fallbackCriterion.weight >= 0
          ? roundCriterionScore(Number.isFinite(score) ? score : fallbackCriterion.score, fallbackCriterion.weight)
          : -Math.min(
              MAX_MISSING_RISK_PENALTY,
              Math.abs(Number.isFinite(score) ? score : fallbackCriterion.score)
            ),
      rationale: String(input.rationale ?? "").trim() || fallbackCriterion.rationale,
      evidence: dedupeStrings(Array.isArray(input.evidence) ? input.evidence : fallbackCriterion.evidence),
    });
  }

  for (const criterion of fallback) {
    if (!normalized.some((item) => item.label === criterion.label)) {
      normalized.push(criterion);
    }
  }

  return normalized;
}

function normalizeModelEvaluation(
  value: unknown,
  fallback: ResumeFitEvaluation
): ResumeFitEvaluation {
  const input = (value ?? {}) as Record<string, unknown>;
  const criteria = normalizeCriteria(input.criteria, fallback.criteria);
  const positiveScore = criteria
    .filter((criterion) => criterion.weight > 0)
    .reduce((sum, criterion) => sum + criterion.score, 0);
  const penalty = criteria
    .filter((criterion) => criterion.weight < 0)
    .reduce((sum, criterion) => sum + criterion.score, 0);
  const overallScore = clampScore(
    Number.isFinite(Number(input.overallScore))
      ? Number(input.overallScore)
      : positiveScore + penalty
  );
  const confidence =
    input.confidence === "high" || input.confidence === "medium" || input.confidence === "low"
      ? input.confidence
      : fallback.confidence;
  const recommendationOptions = new Set([
    "STRONG_REVIEW",
    "REVIEW",
    "POSSIBLE_FIT",
    "WEAK_FIT",
    "INSUFFICIENT_INFO",
  ]);
  const recommendation = recommendationOptions.has(String(input.recommendation))
    ? (String(input.recommendation) as ResumeFitEvaluation["recommendation"])
    : fallback.recommendation;

  return {
    overallScore,
    confidence,
    recommendation,
    summary: String(input.summary ?? "").trim() || fallback.summary,
    criteria,
    strengths: dedupeStrings(Array.isArray(input.strengths) ? input.strengths : fallback.strengths),
    gaps: dedupeStrings(Array.isArray(input.gaps) ? input.gaps : fallback.gaps),
    missingInformation: dedupeStrings(
      Array.isArray(input.missingInformation)
        ? input.missingInformation
        : fallback.missingInformation
    ),
    interviewQuestions: dedupeStrings(
      Array.isArray(input.interviewQuestions)
        ? input.interviewQuestions
        : fallback.interviewQuestions
    ).slice(0, 5),
    humanReviewNote:
      String(input.humanReviewNote ?? "").trim() || fallback.humanReviewNote,
    modelName: fallback.modelName,
  };
}

async function requestModelEvaluation(args: {
  job: ResumeEvaluationJobInput;
  profile: StructuredResumeProfile;
  redactedResumeText: string;
  fallback: ResumeFitEvaluation;
}) {
  const client = getOpenAIClient();
  if (!client) return null;

  const response = await client.responses.create({
    model: MODEL_NAME,
    input: [
      {
        role: "system",
        content: `
You evaluate resume-to-job fit for recruiters.

Rules:
- Score only job-related criteria.
- Use evidence from the resume.
- Do not infer protected characteristics.
- Do not penalize employment gaps unless the job explicitly requires continuous experience and the resume evidence supports that concern.
- Do not penalize nontraditional education if equivalent experience is present.
- If the resume lacks enough information, use INSUFFICIENT_INFO instead of guessing.
- Final decision must be human reviewed.
- Keep explanations concise and grounded in resume evidence and job requirements.
        `.trim(),
      },
      {
        role: "user",
        content: [
          `Scoring rubric:\n${RESUME_SCORING_RUBRIC.map((item) => `${item.label}: ${item.weight}`).join("\n")}`,
          `Job requisition:\n${JSON.stringify(
            {
              ...args.job,
              jobDescription: args.job.jobDescription.slice(0, MAX_JOB_DESCRIPTION_CHARS),
            },
            null,
            2
          )}`,
          `Structured resume profile:\n${JSON.stringify(args.profile, null, 2)}`,
          `Redacted resume text:\n${args.redactedResumeText.slice(0, MAX_RESUME_TEXT_CHARS)}`,
          `Heuristic baseline (use only if supported by resume evidence):\n${JSON.stringify(args.fallback, null, 2)}`,
        ].join("\n\n"),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "ResumeFitEvaluation",
        schema: EVALUATION_SCHEMA,
        strict: true,
      },
    },
    store: false,
  });

  const responseText = getResponseText(response);
  if (!responseText) {
    throw new Error("Resume fit evaluation returned empty output.");
  }

  return JSON.parse(responseText);
}

export async function evaluateResumeFit(args: {
  job: ResumeEvaluationJobInput;
  profile: StructuredResumeProfile;
  redactedResumeText: string;
}): Promise<ResumeFitEvaluation> {
  const fallback = buildFallbackEvaluation(args);

  if (!args.redactedResumeText.trim()) {
    return {
      ...fallback,
      recommendation: "INSUFFICIENT_INFO",
      confidence: "low",
      modelName: "heuristic-fallback",
    };
  }

  try {
    const modelEvaluation = await requestModelEvaluation({
      ...args,
      fallback,
    });

    return {
      ...normalizeModelEvaluation(modelEvaluation, fallback),
      modelName: MODEL_NAME,
    };
  } catch {
    return {
      ...fallback,
      modelName: "heuristic-fallback",
    };
  }
}
