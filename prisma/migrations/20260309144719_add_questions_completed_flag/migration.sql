-- AlterTable
ALTER TABLE "RecruiterLead" ADD COLUMN     "confidence" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "leadType" TEXT NOT NULL DEFAULT 'recruiter_search';

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "questionsCompleted" BOOLEAN NOT NULL DEFAULT false;
