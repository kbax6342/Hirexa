import type { RecruiterStage } from "@/app/lib/recruiter/constants";

export type RecruiterCandidateFileRecord = {
  id: string;
  filename: string;
  mimeType: string;
  fileUrl?: string | null;
  createdAt: string | Date;
};

export type RecruiterCandidateRecord = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  headline?: string | null;
  resumeText?: string | null;
  skills: string[];
  yearsExperience?: number | null;
  source?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  files?: RecruiterCandidateFileRecord[];
  _count?: {
    matches?: number;
    submissions?: number;
    files?: number;
  };
};

export type RecruiterJobOrderRecord = {
  id: string;
  title: string;
  companyName: string;
  location?: string | null;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  description: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredYearsExperience?: number | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count?: {
    matches?: number;
    submissions?: number;
  };
};

export type RecruiterMatchRecord = {
  id?: string;
  candidateId: string;
  jobOrderId: string;
  score: number;
  bestFitReasons: string[];
  redFlags: string[];
  missingQualifications: string[];
  summary: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  candidate: RecruiterCandidateRecord;
};

export type RecruiterStageEventRecord = {
  id: string;
  fromStage?: string | null;
  toStage: RecruiterStage | string;
  note?: string | null;
  createdAt: string | Date;
};

export type RecruiterSubmissionRecord = {
  id: string;
  jobOrderId: string;
  candidateId: string;
  stage: RecruiterStage | string;
  notes?: string | null;
  lastOutreachMessage?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  candidate: RecruiterCandidateRecord;
  stageEvents: RecruiterStageEventRecord[];
};

export type RecruiterDashboardSummary = {
  openJobOrders: number;
  totalCandidates: number;
  activeSubmissions: number;
  interviews: number;
  placements: number;
  totalJobOrders?: number;
};

export type RecruiterProfileRecord = {
  id: string;
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  workEmail?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  agencyName?: string | null;
  agencyWebsite?: string | null;
  city?: string | null;
  state?: string | null;
  companyDescription?: string | null;
  hiringIndustries: string[];
  recruitingSpecialties: string[];
  hiringRoles: string[];
  seniorityLevels: string[];
  employmentTypes: string[];
  workModes: string[];
  hiringLocations: string[];
  calendarUrl?: string | null;
  intakeEmail?: string | null;
  resumeSubmissionEmail?: string | null;
  outreachTone?: string | null;
  autoFollowUp: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};
