-- AlterTable
ALTER TABLE "JobApplication"
ADD COLUMN "location" TEXT,
ADD COLUMN "jobUrl" TEXT,
ADD COLUMN "sourceJobId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_userProfileId_sourceJobId_key"
ON "JobApplication"("userProfileId", "sourceJobId");
