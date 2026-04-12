-- CreateTable
CREATE TABLE "ApplySiteStrategy" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "finalUrl" TEXT,
    "lastAction" TEXT,
    "stopReason" TEXT,
    "instructions" TEXT,
    "selectors" TEXT,
    "stepsJson" JSONB,
    "trainingSource" TEXT,
    "lastTrainedUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastReplaySucceeded" BOOLEAN,
    "lastFailureReason" TEXT,
    "lastReplayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplySiteStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplySiteStrategy_userProfileId_idx" ON "ApplySiteStrategy"("userProfileId");

-- CreateIndex
CREATE INDEX "ApplySiteStrategy_hostname_idx" ON "ApplySiteStrategy"("hostname");

-- CreateIndex
CREATE INDEX "ApplySiteStrategy_userProfileId_status_idx" ON "ApplySiteStrategy"("userProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplySiteStrategy_userProfileId_hostname_key" ON "ApplySiteStrategy"("userProfileId", "hostname");

-- AddForeignKey
ALTER TABLE "ApplySiteStrategy" ADD CONSTRAINT "ApplySiteStrategy_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
