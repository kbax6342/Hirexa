CREATE TYPE "ResumeSubmissionStatus" AS ENUM (
  'UPLOADED',
  'PARSED',
  'EVALUATED',
  'NEEDS_REVIEW',
  'FAILED'
);

CREATE TYPE "ResumeFitRecommendation" AS ENUM (
  'STRONG_REVIEW',
  'REVIEW',
  'POSSIBLE_FIT',
  'WEAK_FIT',
  'INSUFFICIENT_INFO'
);

CREATE TABLE "JobRequisition" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "recruiterJobOrderId" TEXT,
  "title" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "jobDescription" TEXT NOT NULL,
  "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "experienceLevel" TEXT,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobRequisition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateProfile" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "currentTitle" TEXT,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeSubmission" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "jobRequisitionId" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileUrl" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT NOT NULL,
  "parsedText" TEXT,
  "parsedJson" JSONB,
  "status" "ResumeSubmissionStatus" NOT NULL DEFAULT 'UPLOADED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResumeSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeEvaluation" (
  "id" TEXT NOT NULL,
  "resumeSubmissionId" TEXT NOT NULL,
  "jobRequisitionId" TEXT NOT NULL,
  "overallScore" INTEGER NOT NULL,
  "confidence" TEXT NOT NULL,
  "recommendation" "ResumeFitRecommendation" NOT NULL,
  "summary" TEXT NOT NULL,
  "strengths" JSONB NOT NULL,
  "gaps" JSONB NOT NULL,
  "evidence" JSONB NOT NULL,
  "interviewQuestions" JSONB NOT NULL,
  "missingInformation" JSONB NOT NULL,
  "humanReviewNote" TEXT,
  "humanReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "modelName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResumeEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeEvaluationCriterion" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "weight" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  CONSTRAINT "ResumeEvaluationCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResumeEvaluationAuditLog" (
  "id" TEXT NOT NULL,
  "resumeSubmissionId" TEXT NOT NULL,
  "jobRequisitionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT,
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResumeEvaluationAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobRequisition_recruiterJobOrderId_key" ON "JobRequisition"("recruiterJobOrderId");
CREATE INDEX "JobRequisition_agencyId_idx" ON "JobRequisition"("agencyId");
CREATE INDEX "JobRequisition_agencyId_updatedAt_idx" ON "JobRequisition"("agencyId", "updatedAt");

CREATE UNIQUE INDEX "CandidateProfile_agencyId_email_key" ON "CandidateProfile"("agencyId", "email");
CREATE INDEX "CandidateProfile_agencyId_idx" ON "CandidateProfile"("agencyId");
CREATE INDEX "CandidateProfile_agencyId_createdAt_idx" ON "CandidateProfile"("agencyId", "createdAt");

CREATE INDEX "ResumeSubmission_candidateId_idx" ON "ResumeSubmission"("candidateId");
CREATE INDEX "ResumeSubmission_jobRequisitionId_idx" ON "ResumeSubmission"("jobRequisitionId");
CREATE INDEX "ResumeSubmission_jobRequisitionId_status_idx" ON "ResumeSubmission"("jobRequisitionId", "status");
CREATE INDEX "ResumeSubmission_createdAt_idx" ON "ResumeSubmission"("createdAt");

CREATE INDEX "ResumeEvaluation_resumeSubmissionId_idx" ON "ResumeEvaluation"("resumeSubmissionId");
CREATE INDEX "ResumeEvaluation_resumeSubmissionId_createdAt_idx" ON "ResumeEvaluation"("resumeSubmissionId", "createdAt");
CREATE INDEX "ResumeEvaluation_jobRequisitionId_overallScore_idx" ON "ResumeEvaluation"("jobRequisitionId", "overallScore");

CREATE INDEX "ResumeEvaluationCriterion_evaluationId_idx" ON "ResumeEvaluationCriterion"("evaluationId");

CREATE INDEX "ResumeEvaluationAuditLog_resumeSubmissionId_idx" ON "ResumeEvaluationAuditLog"("resumeSubmissionId");
CREATE INDEX "ResumeEvaluationAuditLog_resumeSubmissionId_createdAt_idx" ON "ResumeEvaluationAuditLog"("resumeSubmissionId", "createdAt");
CREATE INDEX "ResumeEvaluationAuditLog_jobRequisitionId_idx" ON "ResumeEvaluationAuditLog"("jobRequisitionId");

ALTER TABLE "JobRequisition"
ADD CONSTRAINT "JobRequisition_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "RecruiterAgency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobRequisition"
ADD CONSTRAINT "JobRequisition_recruiterJobOrderId_fkey"
FOREIGN KEY ("recruiterJobOrderId") REFERENCES "RecruiterJobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CandidateProfile"
ADD CONSTRAINT "CandidateProfile_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "RecruiterAgency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeSubmission"
ADD CONSTRAINT "ResumeSubmission_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeSubmission"
ADD CONSTRAINT "ResumeSubmission_jobRequisitionId_fkey"
FOREIGN KEY ("jobRequisitionId") REFERENCES "JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluation"
ADD CONSTRAINT "ResumeEvaluation_resumeSubmissionId_fkey"
FOREIGN KEY ("resumeSubmissionId") REFERENCES "ResumeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluation"
ADD CONSTRAINT "ResumeEvaluation_jobRequisitionId_fkey"
FOREIGN KEY ("jobRequisitionId") REFERENCES "JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluationCriterion"
ADD CONSTRAINT "ResumeEvaluationCriterion_evaluationId_fkey"
FOREIGN KEY ("evaluationId") REFERENCES "ResumeEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluationAuditLog"
ADD CONSTRAINT "ResumeEvaluationAuditLog_resumeSubmissionId_fkey"
FOREIGN KEY ("resumeSubmissionId") REFERENCES "ResumeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluationAuditLog"
ADD CONSTRAINT "ResumeEvaluationAuditLog_jobRequisitionId_fkey"
FOREIGN KEY ("jobRequisitionId") REFERENCES "JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeEvaluationAuditLog"
ADD CONSTRAINT "ResumeEvaluationAuditLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
