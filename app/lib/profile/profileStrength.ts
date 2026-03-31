type JsonRecord = Record<string, unknown>;

export type ProfileStrengthInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
  profileImageUrl?: string | null;
  emailVerifiedAt?: string | null;
  newsletterOptIn?: boolean;
  includeRemote?: boolean;
  minCompensation?: number | null;
  workplaceLocations?: unknown;
  skills?: string[];
  resumeSkills?: string[];
  keyQuestions?: unknown;
  jobInterests?: unknown[];
  resumeFiles?: unknown[];
  resume?: {
    experiences?: Array<unknown>;
  } | null;
};

export type ProfileStrengthChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  impact: "high" | "medium";
};

export type ProfileStrengthResult = {
  score: number;
  checklist: ProfileStrengthChecklistItem[];
  missingItems: ProfileStrengthChecklistItem[];
  combinedSkills: string[];
  experienceCount: number;
  hasResume: boolean;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function toRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function countFilled(values: unknown[]) {
  return values.filter(hasText).length;
}

function uniqueText(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function readLocationCount(value: unknown) {
  if (!Array.isArray(value)) return 0;

  return value.reduce((count, item) => {
    if (!item || typeof item !== "object") return count;
    const label = String((item as { label?: unknown }).label ?? "").trim();
    return label ? count + 1 : count;
  }, 0);
}

function scoreFraction(weight: number, completed: number, total: number) {
  if (total <= 0) return 0;
  return (completed / total) * weight;
}

export function calculateProfileStrength(
  profile: ProfileStrengthInput | null | undefined
): ProfileStrengthResult {
  const keyQuestions = toRecord(profile?.keyQuestions);
  const combinedSkills = uniqueText([
    ...(profile?.skills ?? []),
    ...(profile?.resumeSkills ?? []),
  ]);
  const experienceCount = Array.isArray(profile?.resume?.experiences)
    ? profile.resume.experiences.length
    : 0;
  const hasResume = Boolean(profile?.resume) || (profile?.resumeFiles?.length ?? 0) > 0;
  const jobPreferenceSignals = [
    hasText(keyQuestions?.roleFocus) || (profile?.jobInterests?.length ?? 0) > 0,
    hasText(keyQuestions?.availability),
    hasText(keyQuestions?.employmentType),
    hasText(keyQuestions?.seniorityLevel),
    typeof profile?.minCompensation === "number" && profile.minCompensation > 0,
    readLocationCount(profile?.workplaceLocations) > 0 || Boolean(profile?.includeRemote),
  ].filter(Boolean).length;

  const personalScore = scoreFraction(
    20,
    countFilled([
      profile?.firstName,
      profile?.lastName,
      profile?.email,
      profile?.phone,
      profile?.city,
      profile?.state,
    ]),
    6
  );
  const linksScore = scoreFraction(
    10,
    countFilled([profile?.linkedinUrl, profile?.portfolioUrl]),
    2
  );
  const resumeScore = hasResume ? 15 : 0;
  const skillsScore = scoreFraction(15, Math.min(combinedSkills.length, 3), 3);
  const experienceScore = scoreFraction(15, Math.min(experienceCount, 2), 2);
  const preferencesScore = scoreFraction(15, jobPreferenceSignals, 6);
  const photoScore = hasText(profile?.profileImageUrl) ? 5 : 0;
  const verificationScore = hasText(profile?.emailVerifiedAt) ? 5 : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        personalScore +
          linksScore +
          resumeScore +
          skillsScore +
          experienceScore +
          preferencesScore +
          photoScore +
          verificationScore
      )
    )
  );

  const checklist: ProfileStrengthChecklistItem[] = [
    {
      id: "linkedin",
      label: "Add your LinkedIn profile",
      done: hasText(profile?.linkedinUrl),
      impact: "high",
    },
    {
      id: "resume",
      label: "Upload your resume",
      done: hasResume,
      impact: "high",
    },
    {
      id: "skills",
      label: "Add at least 3 skills",
      done: combinedSkills.length >= 3,
      impact: "high",
    },
    {
      id: "experience",
      label: "Add work experience",
      done: experienceCount > 0,
      impact: "high",
    },
    {
      id: "preferences",
      label: "Complete job preferences",
      done: jobPreferenceSignals >= 4,
      impact: "high",
    },
    {
      id: "photo",
      label: "Add a profile photo",
      done: hasText(profile?.profileImageUrl),
      impact: "medium",
    },
    {
      id: "verification",
      label: "Verify your email",
      done: hasText(profile?.emailVerifiedAt),
      impact: "medium",
    },
    {
      id: "portfolio",
      label: "Add a portfolio or website",
      done: hasText(profile?.portfolioUrl),
      impact: "medium",
    },
  ];

  return {
    score,
    checklist,
    missingItems: checklist.filter((item) => !item.done),
    combinedSkills,
    experienceCount,
    hasResume,
  };
}
