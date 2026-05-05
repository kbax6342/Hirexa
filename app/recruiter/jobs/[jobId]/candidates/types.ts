export type RecruiterResumeSnapshotRecord = {
  job: {
    jobOrderId: string;
    jobRequisitionId: string;
    title: string;
    companyName: string;
    location: string | null;
    experienceLevel: string | null;
    requiredSkills: string[];
    preferredSkills: string[];
    jobDescription: string;
    createdAt: string | Date;
    updatedAt: string | Date;
  };
  submissions: ResumeSubmissionRecord[];
};

export type ResumeSubmissionRecord = {
  id: string;
  originalFileName: string;
  mimeType: string;
  status: "UPLOADED" | "PARSED" | "EVALUATED" | "NEEDS_REVIEW" | "FAILED";
  createdAt: string | Date;
  updatedAt: string | Date;
  parsedProfile: {
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
  } | null;
  candidate: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    currentTitle: string | null;
    location: string | null;
  };
  latestEvaluation: {
    id: string;
    overallScore: number;
    confidence: string;
    recommendation:
      | "STRONG_REVIEW"
      | "REVIEW"
      | "POSSIBLE_FIT"
      | "WEAK_FIT"
      | "INSUFFICIENT_INFO";
    summary: string;
    strengths: string[];
    gaps: string[];
    evidence: Record<string, unknown>;
    interviewQuestions: string[];
    missingInformation: string[];
    humanReviewNote: string | null;
    humanReviewRequired: boolean;
    modelName: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    criteria: Array<{
      id: string;
      label: string;
      weight: number;
      score: number;
      rationale: string;
      evidence: string[];
    }>;
  } | null;
  auditLogs: Array<{
    id: string;
    action: string;
    actorId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string | Date;
  }>;
};
