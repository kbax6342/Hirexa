ALTER TABLE "HirePilotUsage"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'listening',
ADD COLUMN "inputSource" TEXT,
ADD COLUMN "reportEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "transcript" JSONB,
ADD COLUMN "detectedQuestions" JSONB,
ADD COLUMN "suggestedAnswers" JSONB,
ADD COLUMN "report" JSONB;

CREATE INDEX "HirePilotUsage_userId_status_createdAt_idx"
ON "HirePilotUsage"("userId", "status", "createdAt");
