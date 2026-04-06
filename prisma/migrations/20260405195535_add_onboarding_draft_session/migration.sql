-- CreateTable
CREATE TABLE "OnboardingDraft" (
    "id" TEXT NOT NULL,
    "draftToken" TEXT NOT NULL,
    "guestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastStep" TEXT,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDraft_draftToken_key" ON "OnboardingDraft"("draftToken");

-- CreateIndex
CREATE INDEX "OnboardingDraft_guestId_idx" ON "OnboardingDraft"("guestId");

-- CreateIndex
CREATE INDEX "OnboardingDraft_status_expiresAt_idx" ON "OnboardingDraft"("status", "expiresAt");
