-- Alter JobApplication status enum -> text and add audit/apply tracking fields
ALTER TABLE "JobApplication"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE TEXT USING "status"::text,
  ALTER COLUMN "status" SET DEFAULT 'READY_TO_APPLY';

DROP TYPE IF EXISTS "ApplicationStatus";

ALTER TABLE "JobApplication"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT,
  ADD COLUMN IF NOT EXISTS "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "submissionProof" JSONB,
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationRequired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "JobApplication"
SET
  "title" = COALESCE("title", "jobTitle"),
  "source" = COALESCE("source", 'unknown'),
  "status" = CASE
    WHEN "status" IN ('IN_PREPARATION') THEN 'NEEDS_INFO'
    WHEN "status" IN ('READY_TO_SEND') THEN 'READY_TO_APPLY'
    WHEN "status" IN ('IN_PROGRESS') THEN 'APPLYING'
    WHEN "status" IN ('SENT') THEN 'SUBMITTED'
    ELSE COALESCE("status", 'READY_TO_APPLY')
  END;
