-- AlterTable
ALTER TABLE "ChatbotCandidateLead"
ADD COLUMN "contactConsent" BOOLEAN;

-- CreateIndex
CREATE INDEX "ChatbotCandidateLead_contactConsent_idx" ON "ChatbotCandidateLead"("contactConsent");
