-- AlterTable
ALTER TABLE "JobApplication"
ADD COLUMN "answersJson" JSONB,
ADD COLUMN "auditJson" JSONB,
ADD COLUMN "submittedAt" TIMESTAMP(3);
