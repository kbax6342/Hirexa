-- CreateTable
CREATE TABLE "StripePayment" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT,
    "stripeEventId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripePaymentIntentId" TEXT,
    "planType" TEXT,
    "status" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "paidAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripePayment_stripeEventId_key" ON "StripePayment"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripePayment_userProfileId_idx" ON "StripePayment"("userProfileId");

-- CreateIndex
CREATE INDEX "StripePayment_stripeSubscriptionId_idx" ON "StripePayment"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "StripePayment_stripeCheckoutSessionId_idx" ON "StripePayment"("stripeCheckoutSessionId");

-- AddForeignKey
ALTER TABLE "StripePayment" ADD CONSTRAINT "StripePayment_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
