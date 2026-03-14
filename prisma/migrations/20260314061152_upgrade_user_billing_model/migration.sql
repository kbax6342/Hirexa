/*
  Warnings:

  - A unique constraint covering the columns `[userId,productKey]` on the table `UserBilling` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `productKey` to the `UserBilling` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `UserBilling` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "UserBilling_userId_key";

-- AlterTable
ALTER TABLE "UserBilling" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "lastPaymentReceivedAt" TIMESTAMP(3),
ADD COLUMN     "planType" TEXT,
ADD COLUMN     "productKey" TEXT NOT NULL,
ADD COLUMN     "status" TEXT,
ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripePriceId" TEXT,
ADD COLUMN     "stripeProductId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionPurchasedAt" TIMESTAMP(3),
ADD COLUMN     "trialEnd" TIMESTAMP(3),
ADD COLUMN     "trialStart" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "UserBilling_userId_idx" ON "UserBilling"("userId");

-- CreateIndex
CREATE INDEX "UserBilling_productKey_idx" ON "UserBilling"("productKey");

-- CreateIndex
CREATE INDEX "UserBilling_status_idx" ON "UserBilling"("status");

-- CreateIndex
CREATE INDEX "UserBilling_stripeCustomerId_idx" ON "UserBilling"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "UserBilling_stripeSubscriptionId_idx" ON "UserBilling"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBilling_userId_productKey_key" ON "UserBilling"("userId", "productKey");

-- AddForeignKey
ALTER TABLE "UserBilling" ADD CONSTRAINT "UserBilling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
