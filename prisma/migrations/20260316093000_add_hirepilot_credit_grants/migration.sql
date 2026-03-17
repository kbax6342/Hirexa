-- CreateTable
CREATE TABLE "HirePilotCreditGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "remainingCredits" INTEGER NOT NULL,
    "grantKey" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleStart" TIMESTAMP(3),
    "cycleEnd" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "stripeCheckoutSessionId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeSubscriptionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HirePilotCreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HirePilotCreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantId" TEXT,
    "usageKey" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "sourceType" TEXT,
    "hirePilotUsageId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HirePilotCreditUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HirePilotCreditGrant_grantKey_key" ON "HirePilotCreditGrant"("grantKey");

-- CreateIndex
CREATE INDEX "HirePilotCreditGrant_userId_sourceType_idx" ON "HirePilotCreditGrant"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "HirePilotCreditGrant_userId_expiresAt_idx" ON "HirePilotCreditGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "HirePilotCreditGrant_stripeCheckoutSessionId_idx" ON "HirePilotCreditGrant"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "HirePilotCreditGrant_stripeInvoiceId_idx" ON "HirePilotCreditGrant"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "HirePilotCreditGrant_stripeSubscriptionId_idx" ON "HirePilotCreditGrant"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "HirePilotCreditUsage_usageKey_key" ON "HirePilotCreditUsage"("usageKey");

-- CreateIndex
CREATE INDEX "HirePilotCreditUsage_userId_createdAt_idx" ON "HirePilotCreditUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HirePilotCreditUsage_grantId_idx" ON "HirePilotCreditUsage"("grantId");

-- CreateIndex
CREATE INDEX "HirePilotCreditUsage_hirePilotUsageId_idx" ON "HirePilotCreditUsage"("hirePilotUsageId");

-- AddForeignKey
ALTER TABLE "HirePilotCreditGrant" ADD CONSTRAINT "HirePilotCreditGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePilotCreditUsage" ADD CONSTRAINT "HirePilotCreditUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HirePilotCreditUsage" ADD CONSTRAINT "HirePilotCreditUsage_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "HirePilotCreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
