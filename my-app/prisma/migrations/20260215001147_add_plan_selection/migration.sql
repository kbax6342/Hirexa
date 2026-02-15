-- CreateTable
CREATE TABLE "BenefitSelection" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT,
    "guestId" TEXT,
    "selectedPlan" TEXT NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSelection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestId" TEXT,
    "plan" TEXT NOT NULL,
    "perks" JSONB,
    "source" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenefitSelection_userProfileId_idx" ON "BenefitSelection"("userProfileId");

-- CreateIndex
CREATE INDEX "BenefitSelection_guestId_idx" ON "BenefitSelection"("guestId");

-- CreateIndex
CREATE INDEX "PlanSelection_userId_idx" ON "PlanSelection"("userId");

-- CreateIndex
CREATE INDEX "PlanSelection_guestId_idx" ON "PlanSelection"("guestId");

-- AddForeignKey
ALTER TABLE "BenefitSelection" ADD CONSTRAINT "BenefitSelection_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
