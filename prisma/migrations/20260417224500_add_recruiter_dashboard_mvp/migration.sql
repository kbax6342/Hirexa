CREATE TABLE "RecruiterAgency" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterAgency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterJobOrder" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "location" TEXT,
  "employmentType" TEXT,
  "salaryMin" INTEGER,
  "salaryMax" INTEGER,
  "description" TEXT NOT NULL,
  "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "preferredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requiredYearsExperience" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterJobOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterCandidate" (
  "id" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "location" TEXT,
  "headline" TEXT,
  "resumeText" TEXT,
  "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "yearsExperience" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'UPLOAD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterCandidateFile" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileUrl" TEXT,
  "rawText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecruiterCandidateFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterMatch" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "bestFitReasons" JSONB NOT NULL,
  "redFlags" JSONB NOT NULL,
  "missingQualifications" JSONB NOT NULL,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterSubmission" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'SCREENED',
  "notes" TEXT,
  "lastOutreachMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruiterSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruiterStageEvent" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecruiterStageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterAgency_ownerUserId_key" ON "RecruiterAgency"("ownerUserId");
CREATE UNIQUE INDEX "RecruiterAgency_slug_key" ON "RecruiterAgency"("slug");
CREATE INDEX "RecruiterAgency_slug_idx" ON "RecruiterAgency"("slug");

CREATE INDEX "RecruiterJobOrder_agencyId_idx" ON "RecruiterJobOrder"("agencyId");
CREATE INDEX "RecruiterJobOrder_agencyId_status_idx" ON "RecruiterJobOrder"("agencyId", "status");
CREATE INDEX "RecruiterJobOrder_updatedAt_idx" ON "RecruiterJobOrder"("updatedAt");

CREATE INDEX "RecruiterCandidate_agencyId_idx" ON "RecruiterCandidate"("agencyId");
CREATE INDEX "RecruiterCandidate_agencyId_email_idx" ON "RecruiterCandidate"("agencyId", "email");
CREATE INDEX "RecruiterCandidate_updatedAt_idx" ON "RecruiterCandidate"("updatedAt");

CREATE INDEX "RecruiterCandidateFile_candidateId_idx" ON "RecruiterCandidateFile"("candidateId");

CREATE UNIQUE INDEX "RecruiterMatch_jobOrderId_candidateId_key" ON "RecruiterMatch"("jobOrderId", "candidateId");
CREATE INDEX "RecruiterMatch_jobOrderId_score_idx" ON "RecruiterMatch"("jobOrderId", "score");
CREATE INDEX "RecruiterMatch_candidateId_idx" ON "RecruiterMatch"("candidateId");

CREATE UNIQUE INDEX "RecruiterSubmission_jobOrderId_candidateId_key" ON "RecruiterSubmission"("jobOrderId", "candidateId");
CREATE INDEX "RecruiterSubmission_jobOrderId_idx" ON "RecruiterSubmission"("jobOrderId");
CREATE INDEX "RecruiterSubmission_candidateId_idx" ON "RecruiterSubmission"("candidateId");
CREATE INDEX "RecruiterSubmission_jobOrderId_stage_idx" ON "RecruiterSubmission"("jobOrderId", "stage");

CREATE INDEX "RecruiterStageEvent_submissionId_idx" ON "RecruiterStageEvent"("submissionId");
CREATE INDEX "RecruiterStageEvent_createdAt_idx" ON "RecruiterStageEvent"("createdAt");

ALTER TABLE "RecruiterAgency"
ADD CONSTRAINT "RecruiterAgency_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterJobOrder"
ADD CONSTRAINT "RecruiterJobOrder_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "RecruiterAgency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterCandidate"
ADD CONSTRAINT "RecruiterCandidate_agencyId_fkey"
FOREIGN KEY ("agencyId") REFERENCES "RecruiterAgency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterCandidateFile"
ADD CONSTRAINT "RecruiterCandidateFile_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "RecruiterCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterMatch"
ADD CONSTRAINT "RecruiterMatch_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "RecruiterJobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterMatch"
ADD CONSTRAINT "RecruiterMatch_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "RecruiterCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterSubmission"
ADD CONSTRAINT "RecruiterSubmission_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "RecruiterJobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterSubmission"
ADD CONSTRAINT "RecruiterSubmission_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "RecruiterCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterStageEvent"
ADD CONSTRAINT "RecruiterStageEvent_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "RecruiterSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
