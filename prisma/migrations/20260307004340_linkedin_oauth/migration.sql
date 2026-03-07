/*
  Warnings:

  - A unique constraint covering the columns `[providerAccountId]` on the table `LinkedInAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "providerAccountId" TEXT,
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenScope" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInAccount_providerAccountId_key" ON "LinkedInAccount"("providerAccountId");
