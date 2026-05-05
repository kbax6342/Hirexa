import "server-only";

import type { ResumeSubmissionStatus } from "@prisma/client";

import { createResumeEvaluationAuditLog } from "@/app/lib/audit/resumeEvaluationAudit";
import { prisma } from "@/app/lib/prisma";
import {
  evaluateResumeFit,
  type ResumeFitEvaluation,
  type ResumeEvaluationJobInput,
} from "@/app/lib/resumes/evaluateResumeFit";
import {
  extractResumeProfile,
  type StructuredResumeProfile,
} from "@/app/lib/resumes/extractResumeProfile";
import { redactResumeForScoring } from "@/app/lib/resumes/redactResumeForScoring";

export type RecruiterResumeSnapshot = {
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
    createdAt: Date;
    updatedAt: Date;
  };
  submissions: ResumeSubmissionView[];
};

export type ResumeSubmissionView = {
  id: string;
  originalFileName: string;
  mimeType: string;
  status: ResumeSubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
  parsedProfile: StructuredResumeProfile | null;
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
    recommendation: string;
    summary: string;
    strengths: string[];
    gaps: string[];
    evidence: Record<string, unknown>;
    interviewQuestions: string[];
    missingInformation: string[];
    humanReviewNote: string | null;
    humanReviewRequired: boolean;
    modelName: string | null;
    createdAt: Date;
    updatedAt: Date;
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
    createdAt: Date;
  }>;
};

function dedupeStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? dedupeStrings(value) : [];
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function coerceStructuredResumeProfile(value: unknown): StructuredResumeProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  return {
    candidateSummary: String(input.candidateSummary ?? "").trim(),
    skills: readStringArray(input.skills),
    tools: readStringArray(input.tools),
    roles: readStringArray(input.roles),
    companies: readStringArray(input.companies),
    yearsOfExperienceEstimate: String(input.yearsOfExperienceEstimate ?? "").trim(),
    projects: readStringArray(input.projects),
    education: readStringArray(input.education),
    certifications: readStringArray(input.certifications),
    achievements: readStringArray(input.achievements),
    possibleContactInfo: {
      email:
        typeof readRecord(input.possibleContactInfo).email === "string"
          ? String(readRecord(input.possibleContactInfo).email)
          : null,
      phone:
        typeof readRecord(input.possibleContactInfo).phone === "string"
          ? String(readRecord(input.possibleContactInfo).phone)
          : null,
    },
    redactionNotes: readStringArray(input.redactionNotes),
  };
}

function toExperienceLevel(requiredYearsExperience: number | null) {
  if (requiredYearsExperience == null) return null;
  return `${requiredYearsExperience}+ years`;
}

function toEvaluationJobInput(job: {
  title: string;
  companyName: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel: string | null;
  location: string | null;
}): ResumeEvaluationJobInput {
  return {
    title: job.title,
    companyName: job.companyName,
    jobDescription: job.jobDescription,
    requiredSkills: job.requiredSkills,
    preferredSkills: job.preferredSkills,
    experienceLevel: job.experienceLevel,
    location: job.location,
  };
}

function toStoredEvaluationEvidence(
  evaluation: ResumeFitEvaluation,
  profile: StructuredResumeProfile,
  redactionNotes: string[]
) {
  return {
    criteria: evaluation.criteria.map((criterion) => ({
      label: criterion.label,
      evidence: criterion.evidence,
    })),
    strengths: evaluation.strengths,
    gaps: evaluation.gaps,
    missingInformation: evaluation.missingInformation,
    structuredProfileHighlights: {
      roles: profile.roles.slice(0, 5),
      companies: profile.companies.slice(0, 5),
      skills: profile.skills.slice(0, 8),
      projects: profile.projects.slice(0, 5),
    },
    redactionNotes,
  };
}

function sortSubmissions(submissions: ResumeSubmissionView[]) {
  return [...submissions].sort((left, right) => {
    const leftScore = left.latestEvaluation?.overallScore ?? -1;
    const rightScore = right.latestEvaluation?.overallScore ?? -1;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export async function ensureJobRequisitionForJobOrder(args: {
  agencyId: string;
  jobOrderId: string;
}) {
  const jobOrder = await prisma.recruiterJobOrder.findFirst({
    where: {
      id: args.jobOrderId,
      agencyId: args.agencyId,
    },
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      description: true,
      requiredSkills: true,
      preferredSkills: true,
      requiredYearsExperience: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!jobOrder) {
    return null;
  }

  const jobRequisition = await prisma.jobRequisition.upsert({
    where: {
      recruiterJobOrderId: jobOrder.id,
    },
    create: {
      agencyId: args.agencyId,
      recruiterJobOrderId: jobOrder.id,
      title: jobOrder.title,
      companyName: jobOrder.companyName,
      jobDescription: jobOrder.description,
      requiredSkills: jobOrder.requiredSkills,
      preferredSkills: jobOrder.preferredSkills,
      experienceLevel: toExperienceLevel(jobOrder.requiredYearsExperience),
      location: jobOrder.location,
    },
    update: {
      title: jobOrder.title,
      companyName: jobOrder.companyName,
      jobDescription: jobOrder.description,
      requiredSkills: jobOrder.requiredSkills,
      preferredSkills: jobOrder.preferredSkills,
      experienceLevel: toExperienceLevel(jobOrder.requiredYearsExperience),
      location: jobOrder.location,
    },
  });

  return {
    jobOrder,
    jobRequisition,
  };
}

function serializeSubmission(submission: {
  id: string;
  originalFileName: string;
  mimeType: string;
  status: ResumeSubmissionStatus;
  createdAt: Date;
  updatedAt: Date;
  parsedJson: unknown;
  candidate: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    currentTitle: string | null;
    location: string | null;
  };
  evaluations: Array<{
    id: string;
    overallScore: number;
    confidence: string;
    recommendation: string;
    summary: string;
    strengths: unknown;
    gaps: unknown;
    evidence: unknown;
    interviewQuestions: unknown;
    missingInformation: unknown;
    humanReviewNote: string | null;
    humanReviewRequired: boolean;
    modelName: string | null;
    createdAt: Date;
    updatedAt: Date;
    criteria: Array<{
      id: string;
      label: string;
      weight: number;
      score: number;
      rationale: string;
      evidence: unknown;
    }>;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    actorId: string | null;
    metadata: unknown;
    createdAt: Date;
  }>;
}): ResumeSubmissionView {
  const latestEvaluation = submission.evaluations[0] ?? null;

  return {
    id: submission.id,
    originalFileName: submission.originalFileName,
    mimeType: submission.mimeType,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    parsedProfile: coerceStructuredResumeProfile(submission.parsedJson),
    candidate: submission.candidate,
    latestEvaluation: latestEvaluation
      ? {
          id: latestEvaluation.id,
          overallScore: latestEvaluation.overallScore,
          confidence: latestEvaluation.confidence,
          recommendation: latestEvaluation.recommendation,
          summary: latestEvaluation.summary,
          strengths: readStringArray(latestEvaluation.strengths),
          gaps: readStringArray(latestEvaluation.gaps),
          evidence: readRecord(latestEvaluation.evidence),
          interviewQuestions: readStringArray(latestEvaluation.interviewQuestions),
          missingInformation: readStringArray(latestEvaluation.missingInformation),
          humanReviewNote: latestEvaluation.humanReviewNote,
          humanReviewRequired: latestEvaluation.humanReviewRequired,
          modelName: latestEvaluation.modelName,
          createdAt: latestEvaluation.createdAt,
          updatedAt: latestEvaluation.updatedAt,
          criteria: latestEvaluation.criteria.map((criterion) => ({
            id: criterion.id,
            label: criterion.label,
            weight: criterion.weight,
            score: criterion.score,
            rationale: criterion.rationale,
            evidence: readStringArray(criterion.evidence),
          })),
        }
      : null,
    auditLogs: submission.auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      metadata: readRecord(log.metadata),
      createdAt: log.createdAt,
    })),
  };
}

export async function getRecruiterResumeSnapshot(args: {
  agencyId: string;
  jobOrderId: string;
}): Promise<RecruiterResumeSnapshot | null> {
  const ensured = await ensureJobRequisitionForJobOrder(args);
  if (!ensured) {
    return null;
  }

  const submissions = await prisma.resumeSubmission.findMany({
    where: {
      jobRequisitionId: ensured.jobRequisition.id,
      jobRequisition: {
        is: { agencyId: args.agencyId },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      parsedJson: true,
      candidate: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          currentTitle: true,
          location: true,
        },
      },
      evaluations: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: {
          id: true,
          overallScore: true,
          confidence: true,
          recommendation: true,
          summary: true,
          strengths: true,
          gaps: true,
          evidence: true,
          interviewQuestions: true,
          missingInformation: true,
          humanReviewNote: true,
          humanReviewRequired: true,
          modelName: true,
          createdAt: true,
          updatedAt: true,
          criteria: {
            orderBy: [{ weight: "desc" }],
            select: {
              id: true,
              label: true,
              weight: true,
              score: true,
              rationale: true,
              evidence: true,
            },
          },
        },
      },
      auditLogs: {
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          action: true,
          actorId: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    job: {
      jobOrderId: ensured.jobOrder.id,
      jobRequisitionId: ensured.jobRequisition.id,
      title: ensured.jobRequisition.title,
      companyName: ensured.jobRequisition.companyName,
      location: ensured.jobRequisition.location,
      experienceLevel: ensured.jobRequisition.experienceLevel,
      requiredSkills: ensured.jobRequisition.requiredSkills,
      preferredSkills: ensured.jobRequisition.preferredSkills,
      jobDescription: ensured.jobRequisition.jobDescription,
      createdAt: ensured.jobOrder.createdAt,
      updatedAt: ensured.jobOrder.updatedAt,
    },
    submissions: sortSubmissions(submissions.map(serializeSubmission)),
  };
}

async function getSubmissionForEvaluation(args: {
  agencyId: string;
  resumeSubmissionId: string;
}) {
  return prisma.resumeSubmission.findFirst({
    where: {
      id: args.resumeSubmissionId,
      jobRequisition: {
        is: { agencyId: args.agencyId },
      },
    },
    select: {
      id: true,
      jobRequisitionId: true,
      parsedText: true,
      parsedJson: true,
      originalFileName: true,
      candidate: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          currentTitle: true,
          location: true,
        },
      },
      jobRequisition: {
        select: {
          id: true,
          title: true,
          companyName: true,
          jobDescription: true,
          requiredSkills: true,
          preferredSkills: true,
          experienceLevel: true,
          location: true,
        },
      },
      evaluations: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
    },
  });
}

export async function evaluateResumeSubmission(args: {
  agencyId: string;
  resumeSubmissionId: string;
  actorId?: string | null;
  force?: boolean;
}): Promise<ResumeFitEvaluation | null> {
  const submission = await getSubmissionForEvaluation(args);
  if (!submission) {
    throw new Error("Resume submission not found.");
  }

  if (!args.force && submission.evaluations.length > 0) {
    return null;
  }

  await createResumeEvaluationAuditLog({
    resumeSubmissionId: submission.id,
    jobRequisitionId: submission.jobRequisitionId,
    action: "resume_evaluation_started",
    actorId: args.actorId ?? null,
    metadata: {
      originalFileName: submission.originalFileName,
    },
  });

  try {
    if (!submission.parsedText?.trim()) {
      throw new Error("Parsed resume text is missing for this submission.");
    }

    const redaction = redactResumeForScoring(submission.parsedText);
    const structuredProfile =
      coerceStructuredResumeProfile(submission.parsedJson) ??
      (await extractResumeProfile({
        parsedText: submission.parsedText,
        redactionNotes: redaction.redactionNotes,
      }));

    const evaluation = await evaluateResumeFit({
      job: toEvaluationJobInput(submission.jobRequisition),
      profile: structuredProfile,
      redactedResumeText: redaction.redactedText,
    });

    await prisma.$transaction(async (tx) => {
      await tx.resumeSubmission.update({
        where: { id: submission.id },
        data: {
          parsedJson: structuredProfile,
          status: "EVALUATED",
        },
      });

      await tx.resumeEvaluation.create({
        data: {
          resumeSubmissionId: submission.id,
          jobRequisitionId: submission.jobRequisitionId,
          overallScore: evaluation.overallScore,
          confidence: evaluation.confidence,
          recommendation: evaluation.recommendation,
          summary: evaluation.summary,
          strengths: evaluation.strengths,
          gaps: evaluation.gaps,
          evidence: toStoredEvaluationEvidence(
            evaluation,
            structuredProfile,
            redaction.redactionNotes
          ),
          interviewQuestions: evaluation.interviewQuestions,
          missingInformation: evaluation.missingInformation,
          humanReviewNote: evaluation.humanReviewNote,
          humanReviewRequired: true,
          modelName: evaluation.modelName,
          criteria: {
            create: evaluation.criteria.map((criterion) => ({
              label: criterion.label,
              weight: criterion.weight,
              score: criterion.score,
              rationale: criterion.rationale,
              evidence: criterion.evidence,
            })),
          },
        },
      });
    });

    await createResumeEvaluationAuditLog({
      resumeSubmissionId: submission.id,
      jobRequisitionId: submission.jobRequisitionId,
      action: "resume_evaluation_completed",
      actorId: args.actorId ?? null,
      metadata: {
        overallScore: evaluation.overallScore,
        confidence: evaluation.confidence,
        recommendation: evaluation.recommendation,
        modelName: evaluation.modelName,
        humanReviewRequired: true,
      },
    });

    return evaluation;
  } catch (error) {
    await prisma.resumeSubmission.update({
      where: { id: submission.id },
      data: {
        status: "FAILED",
      },
    });

    await createResumeEvaluationAuditLog({
      resumeSubmissionId: submission.id,
      jobRequisitionId: submission.jobRequisitionId,
      action: "resume_evaluation_failed",
      actorId: args.actorId ?? null,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

export async function evaluatePendingResumesForJob(args: {
  agencyId: string;
  jobOrderId: string;
  actorId?: string | null;
}) {
  const snapshot = await getRecruiterResumeSnapshot({
    agencyId: args.agencyId,
    jobOrderId: args.jobOrderId,
  });

  if (!snapshot) {
    throw new Error("Job requisition not found.");
  }

  const pending = snapshot.submissions.filter(
    (submission) =>
      (submission.status === "PARSED" || submission.status === "NEEDS_REVIEW") &&
      !submission.latestEvaluation
  );

  const results = await Promise.allSettled(
    pending.map((submission) =>
      evaluateResumeSubmission({
        agencyId: args.agencyId,
        resumeSubmissionId: submission.id,
        actorId: args.actorId ?? null,
      })
    )
  );

  const refreshed = await getRecruiterResumeSnapshot({
    agencyId: args.agencyId,
    jobOrderId: args.jobOrderId,
  });

  return {
    snapshot: refreshed,
    processed: pending.length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
