-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "planStatus" TEXT,
ADD COLUMN     "planType" TEXT,
ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "UserProfile_stripeCustomerId_idx" ON "UserProfile"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "UserProfile_stripeSubscriptionId_idx" ON "UserProfile"("stripeSubscriptionId");
