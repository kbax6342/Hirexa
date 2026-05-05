export type ResumeScoringCriterion = {
  label: string;
  weight: number;
  description: string;
};

export const RESUME_SCORING_RUBRIC: ResumeScoringCriterion[] = [
  {
    label: "Required skills match",
    weight: 35,
    description: "Alignment between required job skills and resume evidence.",
  },
  {
    label: "Relevant experience",
    weight: 25,
    description: "Comparable experience depth, scope, and years where the resume supports it.",
  },
  {
    label: "Role/project similarity",
    weight: 15,
    description: "Similarity between prior roles or projects and the target position.",
  },
  {
    label: "Preferred skills",
    weight: 10,
    description: "Additional preferred or differentiating skills called out by the job.",
  },
  {
    label: "Certifications/education",
    weight: 5,
    description: "Relevant certifications, training, or education that support the role.",
  },
  {
    label: "Communication/resume clarity",
    weight: 5,
    description: "Clarity and specificity of the resume evidence provided.",
  },
  {
    label: "Missing-risk penalty",
    weight: -5,
    description: "Penalty for missing or ambiguous job-relevant information.",
  },
];

export const MAX_RESUME_FIT_SCORE = 100;
export const MAX_MISSING_RISK_PENALTY = 5;
export const RESUME_HUMAN_REVIEW_COPY =
  "This AI score is a recruiter-assist signal, not a final employment decision. Review the resume, job requirements, and candidate context before taking action.";
export const RESUME_HUMAN_REVIEW_NOTE =
  "Human review is required before advancing or declining any candidate. Use this evaluation as a screening aid only.";

export function clampScore(value: number, min = 0, max = MAX_RESUME_FIT_SCORE) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function getResumeScoringRubricSummary() {
  return RESUME_SCORING_RUBRIC.map(
    (criterion) => `${criterion.label}: ${criterion.weight}`
  ).join("; ");
}
