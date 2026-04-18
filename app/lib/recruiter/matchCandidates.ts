export type RecruiterJobOrderMatchInput = {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  description: string;
  employmentType: string | null;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredYearsExperience: number | null;
};

export type RecruiterCandidateMatchInput = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  location: string | null;
  headline: string | null;
  resumeText: string | null;
  skills: string[];
  yearsExperience: number | null;
  source: string | null;
};

export type RecruiterMatchResult = {
  candidateId: string;
  score: number;
  bestFitReasons: string[];
  redFlags: string[];
  missingQualifications: string[];
  summary: string;
  debug: {
    matchedRequiredSkills: string[];
    matchedPreferredSkills: string[];
    missingRequiredSkills: string[];
    titleSimilarityScore: number;
    locationBonus: number;
  };
};

const KNOWN_SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "javascript", pattern: /\bjavascript\b/i },
  { label: "typescript", pattern: /\btypescript\b/i },
  { label: "react", pattern: /\breact(?:\.js)?\b/i },
  { label: "next.js", pattern: /\bnext(?:\.js)?\b/i },
  { label: "node.js", pattern: /\bnode(?:\.js)?\b/i },
  { label: "python", pattern: /\bpython\b/i },
  { label: "java", pattern: /\bjava\b/i },
  { label: "sql", pattern: /\bsql\b/i },
  { label: "postgresql", pattern: /\bpostgres(?:ql)?\b/i },
  { label: "mysql", pattern: /\bmysql\b/i },
  { label: "aws", pattern: /\baws\b|\bamazon web services\b/i },
  { label: "azure", pattern: /\bazure\b/i },
  { label: "gcp", pattern: /\bgcp\b|\bgoogle cloud\b/i },
  { label: "docker", pattern: /\bdocker\b/i },
  { label: "kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i },
  { label: "graphql", pattern: /\bgraphql\b/i },
  { label: "rest api", pattern: /\brest(?:ful)? api\b|\bapi integration\b/i },
  { label: "figma", pattern: /\bfigma\b/i },
  { label: "salesforce", pattern: /\bsalesforce\b/i },
  { label: "hubspot", pattern: /\bhubspot\b/i },
  { label: "excel", pattern: /\bexcel\b|\bspreadsheets?\b/i },
  { label: "power bi", pattern: /\bpower bi\b/i },
  { label: "tableau", pattern: /\btableau\b/i },
  { label: "project management", pattern: /\bproject management\b/i },
  { label: "agile", pattern: /\bagile\b/i },
  { label: "scrum", pattern: /\bscrum\b/i },
  { label: "recruiting", pattern: /\brecruit(?:ing|er)\b/i },
  { label: "staffing", pattern: /\bstaffing\b/i },
  { label: "sourcing", pattern: /\bsourcing\b/i },
  { label: "ats", pattern: /\bats\b|\bapplicant tracking system\b/i },
  { label: "boolean search", pattern: /\bboolean search\b/i },
  { label: "screening", pattern: /\bscreening\b/i },
  { label: "interviewing", pattern: /\binterview(?:ing)?\b/i },
  { label: "negotiation", pattern: /\bnegotiation\b/i },
  { label: "account management", pattern: /\baccount management\b/i },
  { label: "business development", pattern: /\bbusiness development\b/i },
  { label: "customer success", pattern: /\bcustomer success\b/i },
  { label: "sales", pattern: /\bsales\b/i },
  { label: "marketing", pattern: /\bmarketing\b/i },
  { label: "content strategy", pattern: /\bcontent strategy\b/i },
  { label: "seo", pattern: /\bseo\b/i },
  { label: "copywriting", pattern: /\bcopywriting\b/i },
  { label: "financial modeling", pattern: /\bfinancial modeling\b/i },
  { label: "accounting", pattern: /\baccounting\b/i },
  { label: "bookkeeping", pattern: /\bbookkeeping\b/i },
  { label: "payroll", pattern: /\bpayroll\b/i },
  { label: "customer support", pattern: /\bcustomer support\b/i },
  { label: "zendesk", pattern: /\bzendesk\b/i },
  { label: "jira", pattern: /\bjira\b/i },
  { label: "notion", pattern: /\bnotion\b/i },
  { label: "slack", pattern: /\bslack\b/i },
  { label: "communication", pattern: /\bcommunication\b/i },
  { label: "leadership", pattern: /\bleadership\b/i },
  { label: "stakeholder management", pattern: /\bstakeholder management\b/i },
  { label: "machine learning", pattern: /\bmachine learning\b/i },
  { label: "data analysis", pattern: /\bdata analysis\b/i },
  { label: "qa", pattern: /\bqa\b|\bquality assurance\b/i },
  { label: "testing", pattern: /\btesting\b|\btest automation\b/i },
];

function dedupeNormalizedStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function normalizeSkill(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function titleCaseLabel(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+.#]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

function calculateTokenOverlap(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }

  return shared / Math.max(aTokens.size, bTokens.size);
}

function stringsIncludeEachOther(a: string | null | undefined, b: string | null | undefined) {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function buildCandidateDisplayName(candidate: RecruiterCandidateMatchInput) {
  const parts = [candidate.firstName, candidate.lastName]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  if (candidate.email) return candidate.email;
  if (candidate.headline) return candidate.headline;
  return "This candidate";
}

function normalizeLocation(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function extractNormalizedSkills(text: string): string[] {
  const normalizedText = String(text ?? "").trim();
  if (!normalizedText) return [];

  const matches = KNOWN_SKILL_PATTERNS.filter((item) => item.pattern.test(normalizedText)).map(
    (item) => item.label
  );

  return dedupeNormalizedStrings(matches).map(normalizeSkill);
}

export function estimateYearsExperience(resumeText: string): number | null {
  const text = String(resumeText ?? "");
  if (!text.trim()) return null;

  const explicitMatches = [...text.matchAll(/(\d{1,2})\+?\s+years?/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50);
  if (explicitMatches.length) {
    return Math.max(...explicitMatches);
  }

  const yearMatches = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1980 && year <= new Date().getFullYear() + 1);
  if (!yearMatches.length) return null;

  const earliestYear = Math.min(...yearMatches);
  const estimated = new Date().getFullYear() - earliestYear;
  if (estimated < 0 || estimated > 45) return null;
  return estimated;
}

export function scoreCandidateForJob(
  jobOrder: RecruiterJobOrderMatchInput,
  candidate: RecruiterCandidateMatchInput
): RecruiterMatchResult {
  const requiredSkills = dedupeNormalizedStrings(jobOrder.requiredSkills).map(normalizeSkill);
  const preferredSkills = dedupeNormalizedStrings(jobOrder.preferredSkills).map(normalizeSkill);
  const candidateSkills = dedupeNormalizedStrings([
    ...candidate.skills,
    ...extractNormalizedSkills(candidate.resumeText ?? ""),
  ]).map(normalizeSkill);

  const candidateSkillSet = new Set(candidateSkills);
  const matchedRequiredSkills = requiredSkills.filter((skill) =>
    [...candidateSkillSet].some(
      (candidateSkill) => candidateSkill === skill || candidateSkill.includes(skill) || skill.includes(candidateSkill)
    )
  );
  const matchedPreferredSkills = preferredSkills.filter((skill) =>
    [...candidateSkillSet].some(
      (candidateSkill) => candidateSkill === skill || candidateSkill.includes(skill) || skill.includes(candidateSkill)
    )
  );
  const missingRequiredSkills = requiredSkills.filter(
    (skill) => !matchedRequiredSkills.includes(skill)
  );

  const requiredSkillScore =
    requiredSkills.length > 0
      ? Math.round((matchedRequiredSkills.length / requiredSkills.length) * 55)
      : 25;
  const preferredSkillScore =
    preferredSkills.length > 0
      ? Math.round((matchedPreferredSkills.length / preferredSkills.length) * 15)
      : 5;

  const candidateYears =
    candidate.yearsExperience ?? estimateYearsExperience(candidate.resumeText ?? "");
  let experienceScore = 8;
  if (jobOrder.requiredYearsExperience != null && candidateYears != null) {
    if (candidateYears >= jobOrder.requiredYearsExperience) {
      experienceScore = 15;
    } else {
      const gap = jobOrder.requiredYearsExperience - candidateYears;
      experienceScore = Math.max(0, 15 - gap * 4);
    }
  } else if (jobOrder.requiredYearsExperience == null && candidateYears != null) {
    experienceScore = 12;
  }

  const titleSimilarity = Math.max(
    calculateTokenOverlap(jobOrder.title, candidate.headline ?? ""),
    calculateTokenOverlap(jobOrder.title, candidate.resumeText?.slice(0, 180) ?? "")
  );
  const titleSimilarityScore = Math.round(titleSimilarity * 10);

  const normalizedJobLocation = normalizeLocation(jobOrder.location);
  const normalizedCandidateLocation = normalizeLocation(candidate.location);
  let locationBonus = 0;
  if (
    normalizedJobLocation &&
    normalizedCandidateLocation &&
    (stringsIncludeEachOther(normalizedJobLocation, normalizedCandidateLocation) ||
      stringsIncludeEachOther(normalizedCandidateLocation, normalizedJobLocation))
  ) {
    locationBonus = 5;
  } else if (
    normalizedJobLocation.includes("remote") ||
    normalizedCandidateLocation.includes("remote")
  ) {
    locationBonus = 3;
  }

  const rawScore =
    requiredSkillScore +
    preferredSkillScore +
    experienceScore +
    titleSimilarityScore +
    locationBonus;
  const score = Math.max(0, Math.min(100, rawScore));

  const reasons: string[] = [];
  if (matchedRequiredSkills.length > 0) {
    reasons.push(
      `Covers ${matchedRequiredSkills.length} core skill${matchedRequiredSkills.length === 1 ? "" : "s"} including ${matchedRequiredSkills
        .slice(0, 3)
        .map(titleCaseLabel)
        .join(", ")}.`
    );
  }
  if (matchedPreferredSkills.length > 0) {
    reasons.push(
      `Brings preferred experience in ${matchedPreferredSkills
        .slice(0, 3)
        .map(titleCaseLabel)
        .join(", ")}.`
    );
  }
  if (candidateYears != null && jobOrder.requiredYearsExperience != null) {
    if (candidateYears >= jobOrder.requiredYearsExperience) {
      reasons.push(
        `Estimated ${candidateYears}+ years of experience, aligned to the ${jobOrder.requiredYearsExperience}-year requirement.`
      );
    }
  }
  if (titleSimilarity >= 0.3 && candidate.headline) {
    reasons.push(`Recent title context is closely aligned with ${jobOrder.title}.`);
  }
  if (locationBonus >= 3 && candidate.location) {
    reasons.push(`Location fit looks workable for ${candidate.location}.`);
  }
  if (!reasons.length) {
    reasons.push("Resume context shows some overlap with the role requirements.");
  }

  const redFlags: string[] = [];
  if (missingRequiredSkills.length > 0) {
    redFlags.push(
      `Missing ${missingRequiredSkills.length} required skill${missingRequiredSkills.length === 1 ? "" : "s"}, including ${missingRequiredSkills
        .slice(0, 3)
        .map(titleCaseLabel)
        .join(", ")}.`
    );
  }
  if (
    jobOrder.requiredYearsExperience != null &&
    candidateYears != null &&
    candidateYears < jobOrder.requiredYearsExperience
  ) {
    redFlags.push(
      `Experience estimate is below target by ${jobOrder.requiredYearsExperience - candidateYears} year${jobOrder.requiredYearsExperience - candidateYears === 1 ? "" : "s"}.`
    );
  }
  if (jobOrder.location && candidate.location && locationBonus === 0) {
    redFlags.push("Location alignment is unclear and may need recruiter review.");
  }
  if (!candidate.resumeText?.trim()) {
    redFlags.push("Resume text extraction was limited, so ranking confidence is lower.");
  }
  if (!redFlags.length && score < 70) {
    redFlags.push("Overall fit is decent, but not yet a clear top-tier match.");
  }

  const missingQualifications = [
    ...missingRequiredSkills.map((skill) => titleCaseLabel(skill)),
    ...(jobOrder.requiredYearsExperience != null &&
    candidateYears != null &&
    candidateYears < jobOrder.requiredYearsExperience
      ? [`${jobOrder.requiredYearsExperience}+ years of experience`]
      : []),
  ];

  const summary = `${buildCandidateDisplayName(candidate)} scores ${score}/100 for ${jobOrder.title} based on skill overlap, experience alignment, and role relevance.`;

  return {
    candidateId: candidate.id,
    score,
    bestFitReasons: reasons.slice(0, 5),
    redFlags: redFlags.slice(0, 4),
    missingQualifications: missingQualifications.slice(0, 6),
    summary,
    debug: {
      matchedRequiredSkills,
      matchedPreferredSkills,
      missingRequiredSkills,
      titleSimilarityScore,
      locationBonus,
    },
  };
}

export function rankCandidatesForJob(
  jobOrder: RecruiterJobOrderMatchInput,
  candidates: RecruiterCandidateMatchInput[]
) {
  return candidates
    .map((candidate) => ({
      candidate,
      match: scoreCandidateForJob(jobOrder, candidate),
    }))
    .sort((left, right) => {
      if (right.match.score !== left.match.score) {
        return right.match.score - left.match.score;
      }

      return (
        (right.candidate.yearsExperience ?? 0) - (left.candidate.yearsExperience ?? 0)
      );
    });
}
