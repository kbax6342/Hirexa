-- AlterTable
ALTER TABLE "HirePilotUsage"
ADD COLUMN "jobTitle" TEXT,
ADD COLUMN "company" TEXT;

-- CreateIndex
CREATE INDEX "HirePilotUsage_userId_createdAt_idx" ON "HirePilotUsage"("userId", "createdAt");
