-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "trialSubscriber" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "monthlySubscriber" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "yearlySubscriber" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trialPlanStatus" TEXT,
ADD COLUMN "monthlyPlanStatus" TEXT,
ADD COLUMN "yearlyPlanStatus" TEXT,
ADD COLUMN "lastPaymentReceivedAt" TIMESTAMP(3);
