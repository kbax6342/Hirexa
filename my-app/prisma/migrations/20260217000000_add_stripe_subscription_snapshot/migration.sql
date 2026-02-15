ALTER TABLE "UserProfile"
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripePlanName" TEXT,
ADD COLUMN "stripePriceCents" INTEGER,
ADD COLUMN "stripePriceInterval" TEXT,
ADD COLUMN "stripeStatus" TEXT,
ADD COLUMN "stripeCurrentPeriodEnd" TIMESTAMP(3);
