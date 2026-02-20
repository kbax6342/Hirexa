-- AlterTable
ALTER TABLE "UserProfile"
ADD COLUMN "subscriptionCheckedAt" TIMESTAMP(3),
ADD COLUMN "subscriptionPurchasedAt" TIMESTAMP(3),
ADD COLUMN "stripeCustomerId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "subscriptionEmail" TEXT;
