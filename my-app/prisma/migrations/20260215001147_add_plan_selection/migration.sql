-- Create BenefitSelection table (already present in the target DB; placeholder for history alignment)
CREATE TABLE IF NOT EXISTS "BenefitSelection" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT,
    "guestId" TEXT,
    "selectedPlan" TEXT NOT NULL,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BenefitSelection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BenefitSelection_userProfileId_idx" ON "BenefitSelection"("userProfileId");
CREATE INDEX IF NOT EXISTS "BenefitSelection_guestId_idx" ON "BenefitSelection"("guestId");

ALTER TABLE "BenefitSelection"
  ADD CONSTRAINT "BenefitSelection_userProfileId_fkey"
  FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
