-- AlterTable
ALTER TABLE "ChatbotCandidateLead"
ADD COLUMN "captureStatus" TEXT NOT NULL DEFAULT 'New Lead';

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_captureStatus_idx" ON "ChatbotCandidateLead"("captureStatus");
