/*
  Warnings:

  - You are about to drop the column `emailVerifiedAt` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `newsletterOptIn` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `newsletterSource` on the `UserProfile` table. All the data in the column will be lost.
  - You are about to drop the column `unsubscribedAt` on the `UserProfile` table. All the data in the column will be lost.
  - Made the column `filename` on table `Resume` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mimeType` on table `Resume` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Resume" ALTER COLUMN "filename" SET NOT NULL,
ALTER COLUMN "mimeType" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "emailVerifiedAt",
DROP COLUMN "newsletterOptIn",
DROP COLUMN "newsletterSource",
DROP COLUMN "unsubscribedAt";

-- CreateTable
CREATE TABLE "ResumeExperience" (
    "resumeId" TEXT NOT NULL,
    "experiences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeExperience_pkey" PRIMARY KEY ("resumeId")
);

-- CreateIndex
CREATE INDEX "Resume_userProfileId_idx" ON "Resume"("userProfileId");

-- AddForeignKey
ALTER TABLE "ResumeExperience" ADD CONSTRAINT "ResumeExperience_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
